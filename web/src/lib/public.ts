// Public timetable (Bakaláři web "Rozvrh" without login): every class, teacher and room of a school.
// Pages: {school}/Timetable/Public and {school}/Timetable/Public/{Actual|Next|Permanent}/{Class|Teacher|Room}/{id}.
// Each timetable page embeds its data as `const timetableData = {...};`, which is what we read.

import { http, NetError } from "./net";
import type { Change, ChangeKind, Day, Hour, Target, TargetKind, Term, Week } from "./model";
import { hhmm, isoDate, toMin } from "./model";

export interface Directory { classes: Target[]; teachers: Target[]; rooms: Target[] }

const KIND_PATH: Record<TargetKind, string> = { class: "Class", teacher: "Teacher", room: "Room" };
const TERM_PATH: Record<Term, string> = { actual: "Actual", next: "Next", permanent: "Permanent" };

export class PublicDisabled extends Error { constructor() { super("public timetable disabled"); } }

export async function fetchDirectory(school: string): Promise<Directory> {
  const r = await http({ url: `${school}/Timetable/Public`, headers: { Accept: "text/html" } });
  if (r.status !== 200) throw r.status === 404 || r.status === 302 ? new PublicDisabled() : new NetError(`HTTP ${r.status}`, r.status, "http");
  const doc = new DOMParser().parseFromString(r.text, "text/html");
  const read = (id: string, kind: TargetKind): Target[] =>
    [...doc.querySelectorAll<HTMLOptionElement>(`#${id} option`)]
      .filter((o) => o.getAttribute("value"))
      .map((o) => ({ kind, id: o.getAttribute("value")!, name: o.textContent!.replace(/\s+/g, " ").trim() }));
  const dir = { classes: read("selectedClass", "class"), teachers: read("selectedTeacher", "teacher"), rooms: read("selectedRoom", "room") };
  if (!dir.classes.length && !dir.teachers.length) throw new PublicDisabled();
  dir.teachers.sort((a, b) => a.name.localeCompare(b.name, "cs"));
  return dir;
}

export async function fetchPublicWeek(school: string, target: Pick<Target, "kind" | "id">, term: Term): Promise<Week> {
  const url = `${school}/Timetable/Public/${TERM_PATH[term]}/${KIND_PATH[target.kind]}/${encodeURIComponent(target.id)}`;
  const r = await http({ url, headers: { Accept: "text/html" } });
  if (r.status !== 200) throw new NetError(`HTTP ${r.status}`, r.status, "http");
  const data = extractJson(r.text, "const timetableData = ");
  if (!data) throw new PublicDisabled();
  return normalizePublic(data, term);
}

/** Cut the object literal that follows `marker` (brace matching that respects strings). */
export function extractJson(html: string, marker: string): any | null {
  const at = html.indexOf(marker);
  if (at < 0) return null;
  const start = html.indexOf("{", at);
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return JSON.parse(html.slice(start, i + 1));
  }
  return null;
}

const DAY_ABBR = ["po", "út", "st", "čt", "pá", "so", "ne"];

/** "29.9.2026 (úterý)" -> "2026-09-29" */
function dateFromText(s: string | undefined | null): string | null {
  const m = /(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/.exec(s ?? "");
  return m ? isoDate(new Date(+m[3], +m[2] - 1, +m[1], 12)) : null;
}

/** "29.9." -> ISO, picking the year that puts the date closest to today. */
function dateFromShort(s: string): string | null {
  const m = /(\d{1,2})\.\s*(\d{1,2})\./.exec(s);
  if (!m) return null;
  const now = new Date();
  let best: Date | null = null;
  for (const y of [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]) {
    const d = new Date(y, +m[2] - 1, +m[1], 12);
    if (!best || Math.abs(+d - +now) < Math.abs(+best - +now)) best = d;
  }
  return isoDate(best!);
}

export function classifyChange(code: string, text: string, badge: string): ChangeKind {
  const s = `${code} ${text}`.toLowerCase();
  if (/removed|cancel|odpad|zrušen|volno/.test(s)) return "removed";
  if (/roomchang|místnost/.test(s)) return "room";
  if (/join|spojen/.test(s)) return "joined";
  if (/added|přidán|přespočet|navíc/.test(s) && !/supl/.test(s)) return "added";
  if (/subst|supl/.test(s) || badge === "S") return "substitution";
  if (/absen/.test(s)) return "absence";
  return "other";
}

function normalizePublic(data: any, term: Term): Week {
  const hours: Hour[] = (data.Hours ?? []).map((h: any) => ({ caption: String(h.Caption ?? ""), begin: hhmm(h.BeginTime), end: hhmm(h.EndTime) }));
  const captionAt = (begin: string) => hours.find((h) => toMin(h.begin) === toMin(begin))?.caption ?? "";

  const days: Day[] = (data.Days ?? []).map((d: any, i: number) => {
    const dowIdx = DAY_ABBR.indexOf(String(d.DayAbbrev ?? "").toLowerCase());
    const day: Day = {
      date: term === "permanent" ? null : dateFromShort(String(d.Date ?? "")),
      dow: dowIdx >= 0 ? dowIdx + 1 : i + 1,
      lessons: [],
    };
    if (d.DayOff) day.off = d.DayOffName || "Volno";
    const notes = new Set<string>();
    for (const a of d.Absences ?? []) {
      const k = a.AbsentKind;
      if (k?.Name) notes.add(k.Name);
    }
    for (const h of d.Hours ?? []) {
      if (h.InfoRemoved || h.InfoAbsent) {
        day.lessons.push({
          hour: captionAt(hhmm(h.Begin)), begin: hhmm(h.Begin), end: hhmm(h.End),
          subject: "", subjectName: "", teacher: "", teacherName: "", room: "", roomName: "", group: "",
          removed: true, change: { kind: "removed", text: String(h.InfoRemoved || h.InfoAbsentName || h.InfoAbsent) },
        });
      }
      for (const a of h.Atoms ?? []) {
        let tip: any = {};
        try { tip = JSON.parse(a.TooltipDetails || "{}"); } catch { /* keep empty */ }
        if (!day.date && term !== "permanent") day.date = dateFromText(a.Day ?? tip.day);
        const begin = hhmm(a.Begin ?? h.Begin), end = hhmm(a.End ?? h.End);
        const text = String(a.ChangeInfo || "").trim();
        const code = String(tip.infoChangeCode ?? "");
        let change: Change | undefined;
        if (a.HasChanged || text || (code && code !== "NoChange")) {
          change = { kind: classifyChange(code, text, String(a.BadgeChar ?? tip.changeBadgeChar ?? "")), text };
        }
        if (a.HasAbsent && a.AtomAbsenceText) change = { kind: "absence", text: String(a.AtomAbsenceText) };
        day.lessons.push({
          hour: captionAt(begin), begin, end,
          subject: a.SubjectAbbrev || "", subjectName: a.SubjectText || a.SubjectName || a.SubjectAbbrev || "",
          teacher: a.Teacher || "", teacherName: a.TeacherFullname || a.Teacher || "",
          room: a.Room || "", roomName: a.RoomFullName || a.Room || "",
          group: a.GroupsNames || "",
          theme: a.Theme || undefined,
          change,
          removed: a.Type === "removed" || change?.kind === "removed" || undefined,
          color: a.SubjectColor || undefined,
        });
      }
    }
    if (notes.size) day.note = [...notes].join(" · ");
    day.lessons.sort((x, y) => toMin(x.begin) - toMin(y.begin));
    return day;
  });

  return { term, hours, days, fetchedAt: Date.now() };
}
