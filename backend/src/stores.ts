import { mutate, readDb } from "./store.js";

// Shops near the user, for when it has to be today. OpenStreetMap data through Nominatim's search:
// "[shop=books]" over a box around them finds every bookshop in it, with opening hours, phone and street
// where they're tagged. Nominatim asks for one request a second and a named client, so requests queue up and
// results are cached (places for good, searches for half an hour).

const NOMINATIM = "https://nominatim.openstreetmap.org";
const CLIENT = "Xerxes/0.1 (shopping assistant prototype)";

export type Place = { lat: number; lon: number; label: string };
export type OpenState = { now: boolean; until?: string; opens?: string };
export type Store = {
  id: string; // "node/123"
  name: string;
  kind: string; // "Bookshop"
  lat: number;
  lon: number;
  distanceKm: number; // from `from`
  address?: string;
  hours?: string; // OpenStreetMap opening_hours, as tagged
  open?: OpenState; // when the hours could be read
  phone?: string;
  website?: string;
  from: Place;
};

// ---------------------------------------------------------------- Nominatim, politely
let last = 0;
let chain: Promise<unknown> = Promise.resolve();

/** One request at a time, at most one a second (Nominatim's usage policy). */
function nominatim(path: string, params: Record<string, string>): Promise<NominatimRow[]> {
  const job = chain.then(async () => {
    const wait = last + 1050 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    const r = await fetch(`${NOMINATIM}${path}?${new URLSearchParams({ format: "jsonv2", ...params })}`, {
      headers: { "User-Agent": CLIENT, "Accept-Language": "en" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) throw new Error(`the map search failed (${r.status})`);
    return (await r.json()) as NominatimRow[];
  });
  chain = job.catch(() => undefined);
  return job;
}

type NominatimRow = {
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  category?: string;
  type?: string;
  name?: string;
  address?: Record<string, string>;
  extratags?: Record<string, string> | null;
};

// ---------------------------------------------------------------- where "near you" is
/** Home (their postal code) or a named area ("Indiranagar"), looked up once and remembered. */
export async function locate(near?: string): Promise<Place> {
  const db = await readDb();
  const p = db.profile;
  const area = near?.trim();
  const q = area ? `${area}, ${p.city}` : `${p.postalCode} ${p.city}`;
  const key = q.toLowerCase();
  const hit = db.places?.[key];
  if (hit) return hit;
  const [r] = await nominatim("/search", { q, countrycodes: p.country.toLowerCase(), limit: "1" });
  if (!r) throw new Error(`Couldn't find ${area ? `"${area}"` : p.postalCode} on the map`);
  const place = { lat: Number(r.lat), lon: Number(r.lon), label: area ?? "Home" };
  await mutate((d) => {
    (d.places ??= {})[key] = place;
  });
  return place;
}

// ---------------------------------------------------------------- opening hours
const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/** The user's weekday (Mo = 0) and minutes past midnight, in their timezone (the server may run in UTC). */
function localNow(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: process.env.XERXES_TZ?.trim() || "Asia/Kolkata",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  return { day: DAYS.indexOf(get("weekday").slice(0, 2)), mins: Number(get("hour")) * 60 + Number(get("minute")) };
}

/** "Mo-Fr,Su" → {0,1,2,3,4,6}. Holidays (PH/SH) are skipped; anything else unreadable → undefined. */
function daysOf(spec: string): Set<number> | undefined {
  const out = new Set<number>();
  for (const part of spec.split(",").map((s) => s.trim()).filter(Boolean)) {
    if (/^(PH|SH)$/.test(part)) continue;
    const m = part.match(/^(Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*-\s*(Mo|Tu|We|Th|Fr|Sa|Su))?$/);
    if (!m) return undefined;
    const a = DAYS.indexOf(m[1]);
    const b = m[2] ? DAYS.indexOf(m[2]) : a;
    for (let i = a; ; i = (i + 1) % 7) {
      out.add(i);
      if (i === b) break;
    }
  }
  return out;
}

const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Open right now, and until when (or when it opens later today), from the common opening_hours forms:
 *  "Mo-Sa 10:00-21:00; Su 11:00-20:00", "10:30-14:00,15:00-21:30", "24/7", "Su off". Undefined when unsure. */
export function openState(hours: string, now = new Date()): OpenState | undefined {
  const h = hours.trim();
  if (h === "24/7") return { now: true };
  const { day, mins } = localNow(now);
  if (day < 0) return undefined;
  let spans: Array<[number, number]> | undefined; // today's, once a rule covers today
  for (const rule of h.split(";").map((s) => s.trim()).filter(Boolean)) {
    const m = rule.match(/^([A-Za-z,\s-]*?)\s*((?:\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\+?\s*,?\s*)+|off|closed)$/i);
    if (!m) return undefined;
    const days = m[1].trim() ? daysOf(m[1].trim()) : new Set([0, 1, 2, 3, 4, 5, 6]);
    if (!days) return undefined;
    if (!days.has(day)) continue;
    if (/^(off|closed)$/i.test(m[2])) {
      spans = []; // later rules override earlier ones for the days they name
      continue;
    }
    spans = [];
    for (const t of m[2].split(",").map((s) => s.trim()).filter(Boolean)) {
      const r = t.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\+?$/);
      if (!r) return undefined;
      const a = Number(r[1]) * 60 + Number(r[2]);
      let b = Number(r[3]) * 60 + Number(r[4]);
      if (b <= a) b += 24 * 60; // closes after midnight
      spans.push([a, b]);
    }
  }
  if (!spans?.length) return { now: false }; // no rule for today: closed today
  const cur = spans.find(([a, b]) => mins >= a && mins < b);
  if (cur) return { now: true, until: hhmm(cur[1]) };
  const next = spans.filter(([a]) => a > mins).sort((x, y) => x[0] - y[0])[0];
  return next ? { now: false, opens: hhmm(next[0]) } : { now: false };
}

/** For the agent: "open now, till 21:30" / "closed now, opens 11:00" / "closed today". */
export const openText = (o?: OpenState) =>
  !o ? undefined : o.now ? (o.until ? `open now, till ${o.until}` : "open now") : o.opens ? `closed now, opens ${o.opens}` : "closed today";

// ---------------------------------------------------------------- the search
const KIND: Record<string, string> = {
  books: "Bookshop", toys: "Toy store", games: "Games store", video_games: "Video games", gift: "Gift shop",
  electronics: "Electronics", computer: "Computer store", mobile_phone: "Phone store", stationery: "Stationery",
  art: "Art supplies", craft: "Craft store", hobby: "Hobby store", music: "Music store", musical_instrument: "Music instruments",
  sports: "Sports store", outdoor: "Outdoor store", clothes: "Clothing", shoes: "Shoes", jewelry: "Jeweller", watches: "Watches",
  cosmetics: "Cosmetics", perfumery: "Perfumes", florist: "Florist", bakery: "Bakery", pastry: "Cake shop", confectionery: "Sweets",
  chocolate: "Chocolates", department_store: "Department store", mall: "Mall", variety_store: "Variety store", photo: "Camera store",
  kitchen: "Kitchenware", houseware: "Homeware", furniture: "Furniture", garden_centre: "Garden centre", pet: "Pet store",
  bicycle: "Bicycle shop", supermarket: "Supermarket", tea: "Tea shop", coffee: "Coffee shop", bag: "Bags", fabric: "Fabrics",
};
export const kindLabel = (v = "") => KIND[v] ?? (v ? v.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "Shop");

/** Great-circle distance in km. */
function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const rad = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Nominatim's viewbox for a square `r` km either side of `c`. */
function box(c: Place, r: number) {
  const dLat = r / 111.32;
  const dLon = r / (111.32 * Math.cos((c.lat * Math.PI) / 180));
  return [c.lon - dLon, c.lat + dLat, c.lon + dLon, c.lat - dLat].map((n) => n.toFixed(5)).join(",");
}

function addressOf(a?: Record<string, string>) {
  if (!a) return undefined;
  const road = a.road ? (a.house_number ? `${a.house_number}, ${a.road}` : a.road) : undefined;
  const area = a.neighbourhood ?? a.suburb ?? a.quarter;
  return [road, area].filter(Boolean).join(", ") || undefined;
}

const first = (v?: string) => v?.split(";")[0]?.trim() || undefined;

const searches = new Map<string, { at: number; stores: Store[] }>();
const known = new Map<string, Store>(); // every shop found lately, by id: show_stores takes these ids

/** Remembered for show_stores (the agent picks by id, so the pins can't be made up). */
function remember(s: Store) {
  known.delete(s.id);
  known.set(s.id, s);
  if (known.size > 1000) known.delete(known.keys().next().value!);
}
export const storeById = (id: string) => known.get(id.trim());

/** Open or closed as of now (a search from twenty minutes ago may have said otherwise). */
export const fresh = (s: Store): Store => (s.hours ? { ...s, open: openState(s.hours) } : s);

export async function findStores(o: { kinds: string[]; names?: string[]; near?: string; radiusKm?: number }) {
  const from = await locate(o.near);
  const kinds = [...new Set(o.kinds.map((k) => k.trim().toLowerCase()).filter((k) => /^[a-z_]+$/.test(k)))];
  const names = [...new Set((o.names ?? []).map((n) => n.trim()).filter(Boolean))];
  if (!kinds.length && !names.length) throw new Error("Say what kind of shop (kinds) or which shops (names)");
  let radius = Math.min(Math.max(o.radiusKm ?? 3, 0.5), 10);
  const key = JSON.stringify([from.lat, from.lon, radius, kinds.sort(), names.sort()]);
  const hit = searches.get(key);
  if (hit && Date.now() - hit.at < 30 * 60_000) return { from, radiusKm: radius, stores: hit.stores.map(fresh) };

  const search = async (r: number) => {
    const rows: Array<NominatimRow & { byName: boolean }> = [];
    for (const [q, byName] of [...kinds.map((k) => [`[shop=${k}]`, false] as const), ...names.map((n) => [n, true] as const)]) {
      const found = await nominatim("/search", { q, viewbox: box(from, r), bounded: "1", limit: "40", extratags: "1", addressdetails: "1" }).catch(
        (e: Error) => (console.warn(`[stores] ${q}: ${e.message}`), [] as NominatimRow[]),
      );
      rows.push(...found.map((x) => ({ ...x, byName })));
    }
    const byId = new Map<string, Store>();
    for (const x of rows) {
      // a shop type finds shops; a name can also be a café-bookshop or the like, but not a road named after it
      if (!x.name || !(x.category === "shop" || (x.byName && x.category === "amenity"))) continue;
      const id = `${x.osm_type}/${x.osm_id}`;
      const at = { lat: Number(x.lat), lon: Number(x.lon) };
      const d = km(from, at);
      if (d > r || byId.has(id)) continue;
      const t = x.extratags ?? {};
      const hours = t.opening_hours?.trim() || undefined; // ";" separates its rules, so it's kept whole
      byId.set(id, {
        id,
        name: x.name,
        kind: kindLabel(x.category === "shop" ? x.type : undefined),
        ...at,
        distanceKm: Math.round(d * 10) / 10,
        address: addressOf(x.address),
        ...(hours ? { hours, open: openState(hours) } : {}),
        phone: first(t.phone ?? t["contact:phone"]),
        website: first(t.website ?? t["contact:website"]),
        from,
      });
    }
    // the same shop mapped twice (a point and a building): keep the better-described one
    const out: Store[] = [];
    for (const s of [...byId.values()].sort((a, b) => a.distanceKm - b.distanceKm)) {
      const twin = out.find((t) => t.name.toLowerCase() === s.name.toLowerCase() && km(t, s) < 0.08);
      if (!twin) out.push(s);
      else if (!twin.hours && s.hours) out.splice(out.indexOf(twin), 1, s);
    }
    return out;
  };

  let stores = await search(radius);
  if (stores.length < 3 && radius < 10) {
    radius = Math.min(radius * 2, 10); // nothing much close by: look a little further
    stores = await search(radius);
  }
  stores = stores.slice(0, 15);
  stores.forEach(remember);
  searches.set(key, { at: Date.now(), stores });
  return { from, radiusKm: radius, stores };
}

/** Google Maps directions to a shop: opens the Maps app on a phone. */
export const directionsUrl = (s: { lat: number; lon: number }) => `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}`;
