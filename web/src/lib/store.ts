import { effect, signal } from "@preact/signals";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { Target } from "./model";
import type { UserInfo } from "./bakalari";
import { AuthError } from "./bakalari";
import { langSetting } from "./i18n";
import { native } from "./native";

export interface Settings {
  school: { url: string; name: string } | null;
  publicOk: boolean;              // the school publishes its timetable
  myTarget: Target | null;        // "my class" when not signed in
  favourites: Target[];
  lang: "auto" | "cs" | "en";
  theme: "auto" | "light" | "dark";
  notify: { changes: boolean; grades: boolean; homework: boolean; messages: boolean; evening: boolean; eveningHour: number };
  onboarded: boolean;
  view: "day" | "week";
  compare: Target[];
}

const DEFAULTS: Settings = {
  school: null, publicOk: true, myTarget: null, favourites: [], lang: "auto", theme: "auto",
  notify: { changes: true, grades: true, homework: true, messages: true, evening: true, eveningHour: 19 },
  onboarded: false, view: "day", compare: [],
};

const read = <T,>(key: string, fallback: T): T => {
  try { const v = localStorage.getItem(key); return v ? { ...fallback, ...JSON.parse(v) } : fallback; } catch { return fallback; }
};

export const settings = signal<Settings>(read("bp.settings", DEFAULTS));
export const user = signal<UserInfo | null>((() => { try { return JSON.parse(localStorage.getItem("bp.user") || "null"); } catch { return null; } })());
export const online = signal(navigator.onLine);
export const expired = signal(false);

// On Android the Java side is the source of truth for the login.
if (native && user.value && !native.sync<{ loggedIn: boolean }>("authState")?.loggedIn) user.value = null;

export function patchSettings(p: Partial<Settings>) { settings.value = { ...settings.value, ...p }; }

effect(() => {
  const s = settings.value;
  localStorage.setItem("bp.settings", JSON.stringify(s));
  langSetting.value = s.lang;
  const dark = s.theme === "dark" || (s.theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0f1115" : "#f5f6fa");
  native?.sync("setPrefs", {
    school: s.school?.url ?? "", lang: s.lang, notify: s.notify, dark,
    myTarget: s.myTarget, loggedIn: !!user.value,
  });
});
effect(() => { localStorage.setItem("bp.user", JSON.stringify(user.value)); });

matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { settings.value = { ...settings.value }; });
addEventListener("online", () => (online.value = true));
addEventListener("offline", () => (online.value = false));

// ---------------- cached data ----------------

interface Cached<T> { t: number; v: T }
const mem = new Map<string, Cached<unknown>>();

export function readCache<T>(key: string): Cached<T> | null {
  if (mem.has(key)) return mem.get(key) as Cached<T>;
  try {
    const raw = localStorage.getItem(`bp.c.${key}`);
    if (!raw) return null;
    const c = JSON.parse(raw) as Cached<T>;
    mem.set(key, c);
    return c;
  } catch { return null; }
}

export function writeCache<T>(key: string, v: T) {
  const c = { t: Date.now(), v };
  mem.set(key, c);
  try { localStorage.setItem(`bp.c.${key}`, JSON.stringify(c)); }
  catch { clearCache(); try { localStorage.setItem(`bp.c.${key}`, JSON.stringify(c)); } catch { /* too big: memory only */ } }
}

export function clearCache() {
  mem.clear();
  for (const k of Object.keys(localStorage)) if (k.startsWith("bp.c.")) localStorage.removeItem(k);
}

/** Bumped when the app comes back to the foreground: stale data reloads. */
export const resumeTick = signal(0);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") resumeTick.value++; });

export interface DataState<T> { data?: T; error?: unknown; loading: boolean; at?: number; reload: () => void }

/**
 * Stale-while-revalidate: shows the saved copy at once (also offline), fetches when it is older than `ttl`.
 * `key` = null means "don't load" (e.g. not signed in).
 */
export function useData<T>(key: string | null, fetcher: () => Promise<T>, ttl = 10 * 60_000): DataState<T> {
  const [st, setSt] = useState<{ data?: T; error?: unknown; loading: boolean; at?: number }>(() => {
    const c = key ? readCache<T>(key) : null;
    return { data: c?.v, at: c?.t, loading: !!key && (!c || Date.now() - c.t > ttl) };
  });
  const cur = useRef(key);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;

  const run = useCallback(async (k: string) => {
    setSt((s) => ({ ...s, loading: true, error: undefined }));
    try {
      const v = await fetchRef.current();
      writeCache(k, v);
      if (cur.current === k) setSt({ data: v, at: Date.now(), loading: false });
    } catch (e) {
      if (e instanceof AuthError && e.code === "expired") expired.value = true;
      if (cur.current === k) setSt((s) => ({ ...s, error: e, loading: false }));
    }
  }, []);

  useEffect(() => {
    cur.current = key;
    if (!key) { setSt({ loading: false }); return; }
    const c = readCache<T>(key);
    setSt({ data: c?.v, at: c?.t, loading: false });
    if (!c || Date.now() - c.t > ttl) run(key);
  }, [key, resumeTick.value]);

  return { ...st, reload: () => key && run(key) };
}
