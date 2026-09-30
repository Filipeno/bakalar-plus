import { effect, signal } from "@preact/signals";
import { settings } from "../lib/store";
import { isAndroid } from "../lib/native";
import { isIos } from "../lib/push";

// Look-and-feel choices from Nastavení → Přizpůsobení. They only change the UI, so they live here and not in
// lib/store.ts `settings` (which is shared with the Android side).

export type Section = "today" | "timetable" | "grades" | "calendar" | "homework" | "messages" | "where" | "compare";
export type CardKey = "changes" | "hw" | "events" | "grades";
export type Accent = "violet" | "teal" | "green" | "amber" | "coral";

export interface UiPrefs {
  tabs: Section[];                          // up to 4, "More" is always added last
  cards: { k: CardKey; on: boolean }[];     // Today cards, in order
  accent: Accent;
  density: "comfort" | "compact";
  start: Section;
}

export const SECTIONS: Section[] = ["today", "timetable", "grades", "calendar", "homework", "messages", "where", "compare"];
export const MAX_TABS = 4;
export const ACCENTS: { k: Accent; h: number }[] = [
  { k: "violet", h: 289 }, { k: "teal", h: 200 }, { k: "green", h: 150 }, { k: "amber", h: 70 }, { k: "coral", h: 20 },
];

const DEFAULTS: UiPrefs = {
  tabs: ["today", "timetable", "grades", "calendar"],
  cards: [{ k: "changes", on: true }, { k: "hw", on: true }, { k: "events", on: true }, { k: "grades", on: true }],
  accent: "violet", density: "comfort", start: "today",
};

function load(): UiPrefs {
  try {
    const p = { ...DEFAULTS, ...JSON.parse(localStorage.getItem("bp.ui") || "{}") } as UiPrefs;
    p.tabs = p.tabs.filter((x) => SECTIONS.includes(x)).slice(0, MAX_TABS);
    if (!p.tabs.length) p.tabs = DEFAULTS.tabs;
    // keep cards added in later versions
    p.cards = [...p.cards.filter((c) => DEFAULTS.cards.some((d) => d.k === c.k)), ...DEFAULTS.cards.filter((d) => !p.cards.some((c) => c.k === d.k))];
    return p;
  } catch { return DEFAULTS; }
}

export const prefs = signal<UiPrefs>(load());
export const patchPrefs = (p: Partial<UiPrefs>) => { prefs.value = { ...prefs.value, ...p }; };

export const sectionPath = (s: Section) => `/${s}`;

/** Where each section lives and what it needs. */
export const SECTION_NEEDS: Record<Section, "login" | "public" | null> = {
  today: null, timetable: null, grades: "login", calendar: "login", homework: "login", messages: "login", where: "public", compare: "public",
};

// iPhone (Safari or home-screen app) gets the iOS look: system font, large titles, "Back" text, blurred tab bar.
export const platform = isAndroid ? "android" : isIos() ? "ios" : "web";

effect(() => {
  const p = prefs.value;
  try { localStorage.setItem("bp.ui", JSON.stringify(p)); } catch { /* storage full: keep in memory */ }
  const h = document.documentElement;
  h.dataset.accent = p.accent;
  h.dataset.density = p.density;
  h.dataset.platform = platform;
});

// Status-bar colour to match the Nocturne background (store.ts sets a generic one first).
effect(() => {
  void settings.value;
  queueMicrotask(() => {   // after the store's effect has set data-theme
    const dark = document.documentElement.dataset.theme === "dark";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#161826" : "#f4f5fa");
  });
});
