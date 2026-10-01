// One timetable shape for everything: the public pages (any class / teacher / room) and the logged-in API.

export type ChangeKind = "substitution" | "room" | "removed" | "added" | "joined" | "absence" | "other";

export interface Change { kind: ChangeKind; text: string }

export interface Lesson {
  hour: string;          // caption of the period, "1", "2", ... ("" if unknown)
  begin: string;         // "08:00"
  end: string;           // "08:45"
  subject: string;       // abbreviation, "MAT"
  subjectName: string;   // "Matematika"
  teacher: string;       // abbreviation
  teacherName: string;
  room: string;
  roomName: string;
  group: string;         // "AJ_1" or the class on a teacher's/room's timetable
  theme?: string;
  change?: Change;
  removed?: boolean;
  color?: string;
}

export interface Day {
  date: string | null;   // ISO "2026-09-29"; null in the permanent timetable
  dow: number;           // 1 = Monday ... 7 = Sunday
  off?: string;          // holiday / day off name
  note?: string;         // whole-day event, class absence...
  lessons: Lesson[];
}

export interface Hour { caption: string; begin: string; end: string }

export type Term = "actual" | "next" | "permanent";

export interface Week {
  term: Term;
  hours: Hour[];
  days: Day[];
  fetchedAt: number;
}

export type TargetKind = "class" | "teacher" | "room";
export interface Target { kind: TargetKind; id: string; name: string }

export const targetKey = (t: Pick<Target, "kind" | "id">) => `${t.kind}:${t.id}`;

// ---------- dates ----------

export const pad = (n: number) => String(n).padStart(2, "0");
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => isoDate(new Date());
export const parseIso = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d, 12); };
export const addDays = (iso: string, n: number) => { const d = parseIso(iso); d.setDate(d.getDate() + n); return isoDate(d); };
/** The date `n` school days (Mon–Fri) after `iso`, so a Thursday "next 3 days" reaches Tuesday, not Sunday. */
export function addSchoolDays(iso: string, n: number): string {
  let d = iso;
  while (n > 0) { d = addDays(d, 1); const w = parseIso(d).getDay(); if (w !== 0 && w !== 6) n--; }
  return d;
}
/** Monday of the week containing `iso`. */
export const mondayOf = (iso: string) => { const d = parseIso(iso); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return isoDate(d); };
export const dowOf = (iso: string) => ((parseIso(iso).getDay() + 6) % 7) + 1;

/** "8:00" / "08:00:00" -> minutes after midnight. */
export const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
export const hhmm = (t: string) => { const [h, m] = t.split(":"); return `${Number(h)}:${m ?? "00"}`; };
export const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

/** Lessons that actually take place (not cancelled). */
export const liveLessons = (d: Day) => d.lessons.filter((l) => !l.removed);

/** The day in `week` with the given date, or (permanent timetable) with the same weekday. */
export function dayFor(week: Week | undefined, iso: string): Day | undefined {
  if (!week) return undefined;
  return week.days.find((d) => d.date === iso) ?? (week.term === "permanent" ? week.days.find((d) => d.dow === dowOf(iso)) : undefined);
}

/** Collapse a day's lessons into periods: several groups can share one period. */
export function byPeriod(day: Day): { key: string; begin: string; end: string; hour: string; lessons: Lesson[] }[] {
  const map = new Map<string, { key: string; begin: string; end: string; hour: string; lessons: Lesson[] }>();
  for (const l of day.lessons) {
    const key = `${l.begin}-${l.end}`;
    let p = map.get(key);
    if (!p) map.set(key, (p = { key, begin: l.begin, end: l.end, hour: l.hour, lessons: [] }));
    p.lessons.push(l);
  }
  return [...map.values()].sort((a, b) => toMin(a.begin) - toMin(b.begin));
}

// ---------- class groups (a class split for some subjects: AJ_1 / AJ_2, 1K / 2K...) ----------

/** "AJ_1, NJ_2 · lichý týden" -> ["AJ_1", "NJ_2"] (the logged-in timetable appends the week cycle). */
export const lessonGroups = (l: Lesson) => l.group.split(" · ")[0].split(/\s*,\s*/).filter(Boolean);

export interface GroupFamily { groups: string[]; subjects: string[] }

/**
 * How a class is split: sets of alternative groups (you're in exactly one group of each set), each with the
 * subjects taught in it. Read from the timetable itself, so it fits any class and any number of groups:
 * - groups that differ only in their number are one set: AJ_1 / AJ_2 / AJ_3, 1K / 2K;
 * - other groups taught at the same time are one set too (NJ / RJ), unless they already belong to a numbered set:
 *   half the class can have AJ_1 while the other half has 2K, and that doesn't make AJ and K one choice.
 */
export function groupFamilies(week: Week | undefined): GroupFamily[] {
  const parent = new Map<string, string>();
  const find = (g: string): string => { const p = parent.get(g) ?? g; return p === g ? g : find(p); };
  const join = (a: string, b: string) => { const x = find(a), y = find(b); if (x !== y) parent.set(x, y); };
  const subjects = new Map<string, Map<string, number>>();
  const byStem = new Map<string, string[]>();
  const slots: string[][] = [];
  for (const d of week?.days ?? []) {
    const at = new Map<string, Set<string>>();
    for (const l of d.lessons) {
      for (const g of lessonGroups(l)) {
        if (!parent.has(g)) parent.set(g, g);
        const stem = g.replace(/[\d_\s.-]+/g, "").toLowerCase() || g;
        const sib = byStem.get(stem) ?? [];
        if (!sib.includes(g)) byStem.set(stem, [...sib, g]);
        if (!at.has(l.begin)) at.set(l.begin, new Set());
        at.get(l.begin)!.add(g);
        const name = l.subjectName || l.subject;
        if (name) { const m = subjects.get(g) ?? new Map(); m.set(name, (m.get(name) ?? 0) + 1); subjects.set(g, m); }
      }
    }
    slots.push(...[...at.values()].map((s) => [...s]));
  }
  for (const sib of byStem.values()) for (const g of sib.slice(1)) join(g, sib[0]);
  const numbered = new Set([...byStem.values()].filter((s) => s.length > 1).flat());
  for (const slot of slots) {
    const loose = slot.filter((g) => !numbered.has(g));
    for (const g of loose.slice(1)) join(g, loose[0]);
  }
  const fams = new Map<string, string[]>();
  for (const g of parent.keys()) { const r = find(g); fams.set(r, [...(fams.get(r) ?? []), g]); }
  const cmp = (a: string, b: string) => a.localeCompare(b, "cs", { numeric: true });
  return [...fams.values()].filter((f) => f.length > 1).map((f) => {
    const count = new Map<string, number>();
    for (const g of f) for (const [n, c] of subjects.get(g) ?? []) count.set(n, (count.get(n) ?? 0) + c);
    return { groups: f.sort(cmp), subjects: [...count.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n) };
  }).sort((a, b) => cmp(a.subjects[0] ?? a.groups[0], b.subjects[0] ?? b.groups[0]));
}

/** Two timetables as one, for reading the class's groups (this week alone may miss a split). */
export const mergeWeeks = (a: Week | undefined, b: Week | undefined): Week | undefined =>
  a && b ? { ...a, days: [...a.days, ...b.days] } : a ?? b;

/** Drop the lessons of the other groups in every set where one group is picked. `also`: the permanent timetable. */
export function filterGroups(week: Week, picked: string[], also?: Week): Week {
  if (!picked.length) return week;
  const fams = groupFamilies(mergeWeeks(week, also)).filter((f) => f.groups.some((g) => picked.includes(g)));
  const hidden = new Set(fams.flatMap((f) => f.groups).filter((g) => !picked.includes(g)));
  if (!hidden.size) return week;
  const keep = (l: Lesson) => { const gs = lessonGroups(l); return !gs.length || gs.some((g) => !hidden.has(g)); };
  return { ...week, days: week.days.map((d) => ({ ...d, lessons: d.lessons.filter(keep) })) };
}

/** The room a teacher (or class) is in most often: a hint where to look for them between lessons. */
export function usualRoom(week: Week | undefined): string | undefined {
  const count = new Map<string, number>();
  for (const d of week?.days ?? []) for (const l of liveLessons(d)) if (l.room) count.set(l.room, (count.get(l.room) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}
