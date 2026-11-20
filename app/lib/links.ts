import * as WebBrowser from "expo-web-browser";
import { color } from "@/lib/theme";

/** Opens a page in the in-app browser. On Android it stays in Xerxes' own task, so closing it comes back to the
 *  app (a separate task drops you on the launcher, or Expo Go's home screen in development). */
export function openLink(url?: string) {
  if (!url) return Promise.resolve(undefined);
  return WebBrowser.openBrowserAsync(url, { createTask: false, toolbarColor: color.paper, controlsColor: color.primary, showTitle: true });
}
