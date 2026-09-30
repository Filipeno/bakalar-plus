import { signal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";

// Hash routes: "#/timetable?k=class&id=30". Android's back button walks the WebView history.
export interface Route { path: string; q: Record<string, string> }

function parse(): Route {
  const h = location.hash.replace(/^#/, "") || "/today";
  const [path, qs = ""] = h.split("?");
  return { path, q: Object.fromEntries(new URLSearchParams(qs)) };
}

export const route = signal<Route>(parse());
addEventListener("hashchange", () => { route.value = parse(); window.scrollTo(0, 0); });

export function go(path: string, q?: Record<string, string | undefined>, replace = false) {
  const clean = Object.fromEntries(Object.entries(q ?? {}).filter(([, v]) => v !== undefined && v !== "")) as Record<string, string>;
  const qs = new URLSearchParams(clean).toString();
  const h = `#${path}${qs ? `?${qs}` : ""}`;
  if (replace) { history.replaceState(null, "", h); route.value = parse(); }
  else location.hash = h;
}

export const TABS = ["/today", "/timetable", "/grades", "/calendar", "/more"];

/** Back inside the app: sub-pages return to their tab, tabs stay. */
export function back() {
  if (history.length > 1 && !TABS.includes(route.value.path)) history.back();
  else go("/today", undefined, true);
}

// Sheets register a closer so the Android back button closes them first.
const closers: (() => void)[] = [];
export function pushCloser(fn: () => void) { closers.push(fn); return () => { const i = closers.indexOf(fn); if (i >= 0) closers.splice(i, 1); }; }

/** Steps inside one screen (onboarding, sub-views): while `active`, the back button calls `fn`. Re-registers when `key` changes. */
export function useBack(active: boolean, fn: () => void, key?: unknown) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => (active ? pushCloser(() => ref.current()) : undefined), [active, key]);
}

declare global { interface Window { __bpBack?: () => boolean } }
window.__bpBack = () => {
  const c = closers.pop();
  if (c) { c(); return true; }
  if (!TABS.includes(route.value.path)) { history.back(); return true; }
  if (route.value.path !== "/today") { go("/today", undefined, true); return true; }
  return false;   // let Android leave the app
};
