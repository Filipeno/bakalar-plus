import type { TKey } from "../lib/i18n";
import { settings, user } from "../lib/store";
import type { IconName } from "./icons";
import { prefs, SECTION_NEEDS, SECTIONS, type Section } from "./prefs";

export const SECTION_META: Record<Section, { icon: IconName; label: TKey }> = {
  today: { icon: "house", label: "tabToday" },
  timetable: { icon: "calendar-blank", label: "tabTimetable" },
  grades: { icon: "chart-line-up", label: "tabGrades" },
  calendar: { icon: "calendar-dots", label: "tabCalendar" },
  homework: { icon: "notebook", label: "homework" },
  messages: { icon: "envelope-simple", label: "messages" },
  where: { icon: "map-pin", label: "whereNow" },
  compare: { icon: "users-three", label: "compare" },
};

/** Sections usable right now: login-only ones need a user, public-timetable tools need a school that publishes it. */
export function available(): Section[] {
  return SECTIONS.filter((s) => {
    const need = SECTION_NEEDS[s];
    return need === "login" ? !!user.value : need === "public" ? settings.value.publicOk : true;
  });
}

/** The customised tab bar, without sections that aren't available (More is added by the caller). */
export function tabSections(): Section[] {
  const av = available();
  return prefs.value.tabs.filter((s) => av.includes(s));
}
