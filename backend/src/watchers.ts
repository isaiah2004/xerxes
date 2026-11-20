import { env } from "./env.js";
import { findGameDeals } from "./integrations/games.js";
import { searchHardware, SourceUnavailable } from "./integrations/hardware.js";
import { upcoming } from "./occasions.js";
import { mutate, notify, readDb } from "./store.js";
import { pretty } from "./dates.js";

// Background automations: occasion nudges, game sales, second-hand hardware. Results land in the Today feed.

async function checkOccasions() {
  const db = await readDb();
  for (const o of upcoming(db, 60).filter((x) => x.inReminderWindow)) {
    const who = o.people.length === 1 ? o.people[0].name : "the family";
    await notify({
      kind: "occasion",
      title: o.turningAge ? `${who} turns ${o.turningAge} in ${o.daysLeft} days` : `${o.label} in ${o.daysLeft} days`,
      body: `Gift should arrive by ${pretty(o.arriveBy)}. Budget ${o.budget.currency} ${o.budget.amount}.`,
      dedupeKey: `occ:${o.id}:${o.nextDate}`,
    });
  }
}

async function checkWatches() {
  const db = await readDb();
  for (const w of db.watches.filter((x) => x.active)) {
    try {
      if (w.kind === "game") {
        // only the game itself (or an edition of it), never a soundtrack/DLC/sequel that happens to match the search
        const deals = await findGameDeals(w.query, { maxPrice: w.maxPrice?.amount, limit: 10, onSaleOnly: true });
        const best = deals.find((d) => d.savingsPct > 0 && (d.match === "game" || d.match === "edition"));
        if (best)
          await notify({
            kind: "game",
            title: `${best.title} · ${best.store}`,
            body: `$${best.salePrice} (was $${best.normalPrice}) — ${best.savingsPct}% off${w.maxPrice ? `, under your $${w.maxPrice.amount} target` : ""}.`,
            url: best.dealUrl,
            imageUrl: best.imageUrl,
            price: `$${best.salePrice}`,
            dedupeKey: `game:${best.title}:${best.store}:${best.salePrice}`,
          });
      } else if (w.kind === "hardware") {
        const terms = w.query.split(/\s+OR\s+/i);
        for (const term of terms) {
          const listings = await searchHardware(term);
          for (const l of listings.slice(0, 2)) {
            const price = l.prices.length ? Math.min(...l.prices) : undefined;
            if (w.maxPrice && price !== undefined && price > w.maxPrice.amount) continue;
            await notify({
              kind: "hardware",
              title: l.title.replace(/^\s*\[[^\]]+\]\s*/, "").slice(0, 90),
              body: `r/${l.subreddit}${l.location ? ` · ${l.location}` : ""}${w.notes ? ` · ${w.notes}` : ""}`,
              url: l.url,
              price: price !== undefined ? `$${price}` : undefined,
              dedupeKey: `hw:${l.url}`,
            });
          }
        }
      }
      await mutate((d) => {
        const x = d.watches.find((y) => y.id === w.id);
        if (!x) return;
        x.lastCheckedAt = new Date().toISOString();
        delete x.lastError;
      });
    } catch (e) {
      const msg = (e as Error).message;
      console.warn(`watch ${w.query} failed:`, msg);
      // the Radar shows this instead of pretending it looked and found nothing
      await mutate((d) => {
        const x = d.watches.find((y) => y.id === w.id);
        if (x) x.lastError = e instanceof SourceUnavailable ? msg : "couldn't reach the store";
      });
    }
  }
}

export async function runWatchersOnce() {
  await checkOccasions();
  await checkWatches();
}

export function startWatchers() {
  const tick = () => runWatchersOnce().catch((e) => console.warn("watchers:", e.message));
  setTimeout(tick, 3000);
  setInterval(tick, env.watchIntervalMin * 60_000);
}
