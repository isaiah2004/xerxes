import { useEffect, useState } from "react";
import { api, type Unfurl } from "./api";
import { site } from "./links";

// One look per link, shared by the message box (while you type) and the sent bubble (which then shows it at once).
const known = new Map<string, Unfurl>();
const asking = new Map<string, Promise<Unfurl>>();

/** What a link is about. Never fails: if the backend can't be reached it's just the site, and the next look asks again. */
export function unfurl(url: string): Promise<Unfurl> {
  const hit = known.get(url);
  if (hit) return Promise.resolve(hit);
  let p = asking.get(url);
  if (!p) {
    p = api
      .unfurl(url)
      .then((u) => {
        const ok: Unfurl = { ...u, url, site: u.site || site(url) };
        known.set(url, ok);
        return ok;
      })
      .catch((): Unfurl => ({ url, site: site(url) }))
      .finally(() => asking.delete(url));
    asking.set(url, p);
  }
  return p;
}

/**
 * The preview for a link; undefined while it's being read. wait: how long the link has to stay put before asking
 * (the message box passes ~400 ms, so a link being typed isn't looked up letter by letter). Known links show at once.
 */
export function useUnfurl(url: string | undefined, wait = 0): Unfurl | undefined {
  const [got, setGot] = useState<Unfurl | undefined>(() => (url ? known.get(url) : undefined));
  useEffect(() => {
    if (!url) return;
    let live = true;
    const timer = setTimeout(() => void unfurl(url).then((u) => live && setGot(u)), known.has(url) ? 0 : wait);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [url, wait]);
  return url && got?.url === url ? got : url ? known.get(url) : undefined;
}
