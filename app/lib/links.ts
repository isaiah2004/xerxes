import * as WebBrowser from "expo-web-browser";
import { color } from "@/lib/theme";

/** Where a link goes, for showing next to it: "amazon.in" from "https://www.amazon.in/dp/…". */
export const site = (url: string) => url.replace(/^[a-z]+:\/\/(www\.)?/i, "").split(/[/?#:]/)[0];

/** Opens a page in the in-app browser. On Android it stays in Xerxes' own task, so closing it comes back to the
 *  app (a separate task drops you on the launcher, or Expo Go's home screen in development). */
export function openLink(url?: string) {
  if (!url) return Promise.resolve(undefined);
  return WebBrowser.openBrowserAsync(url, { createTask: false, toolbarColor: color.paper, controlsColor: color.primary, showTitle: true });
}

// ---------------------------------------------------------------- links in a message
const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi;
const TAIL = /[.,!?;:'"’”]+$/;

/** Drops what ends the sentence rather than the link: "…/dp/B0X." → "…/dp/B0X", "(see https://x.in/a)" → "https://x.in/a". */
function trimLink(raw: string) {
  let u = raw.replace(TAIL, "");
  for (const [open, close] of [["(", ")"], ["[", "]"]]) {
    while (u.endsWith(close) && u.split(open).length < u.split(close).length) u = u.slice(0, -1).replace(TAIL, "");
  }
  return u;
}

/** A finished address, so "https://ama" halfway through typing isn't a link yet. */
const hasHost = (url: string) => {
  const host = site(url);
  return host === "localhost" || /\.[a-z]{2,}$/i.test(host) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
};

function* matches(text: string) {
  for (const m of text.matchAll(URL_RE)) {
    const url = trimLink(m[0]);
    if (hasHost(url)) yield { url, start: m.index ?? 0 };
  }
}

/** The http(s) links in a message, in order, each once. */
export function linksIn(text: string): string[] {
  const out: string[] = [];
  for (const { url } of matches(text)) if (!out.includes(url)) out.push(url);
  return out;
}

export type TextPart = { text: string; url?: string };

/**
 * A message ready to read, with its links shortened: a link at the start or end goes (the preview card under the
 * bubble shows it), one mid-sentence becomes its site ("Compare amazon.in and flipkart.com"). Nothing left means the
 * message was only links.
 */
export function splitLinks(text: string): { parts: TextPart[]; links: string[] } {
  const parts: TextPart[] = [];
  let last = 0;
  for (const { url, start } of matches(text)) {
    parts.push({ text: text.slice(last, start) }, { text: site(url), url });
    last = start + url.length;
  }
  parts.push({ text: text.slice(last) });
  const edge = (p?: TextPart) => !!p && (!!p.url || !p.text.trim());
  while (edge(parts[0])) parts.shift();
  while (edge(parts[parts.length - 1])) parts.pop();
  if (parts.length) {
    parts[0] = { ...parts[0], text: parts[0].text.trimStart() };
    const end = parts.length - 1;
    parts[end] = { ...parts[end], text: parts[end].text.trimEnd() };
  }
  return { parts, links: linksIn(text) };
}
