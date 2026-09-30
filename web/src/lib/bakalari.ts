// Logged-in Bakaláři API v3 (community docs: github.com/bakalari-api/bakalari-api-v3; field names checked
// against a live 3.5x server). On Android the Java side owns the login (it needs it for background checks);
// in a browser the tokens live in localStorage and every request goes through the Worker relay.

import { native } from "./native";
import { http, NetError } from "./net";
import type { Change, Day, Hour, Lesson, Term, Week } from "./model";
import { classifyChange, } from "./public";
import { hhmm, toMin } from "./model";

export interface UserInfo {
  uid: string;
  name: string;
  type: string;          // "student", "parents", "teacher"
  schoolName: string;
  classId: string;
  classAbbrev: string;
  className: string;
  modules: string[];
  semesterFrom?: string;
  yearFrom?: string;
}

export class AuthError extends Error { constructor(msg: string, public code: "bad_login" | "expired" | "offline" | "other") { super(msg); } }

// ---------------- backends ----------------

interface Backend {
  login(school: string, username: string, password: string): Promise<void>;
  request(method: string, path: string, body?: unknown): Promise<{ status: number; text: string }>;
  accessToken(): Promise<string>;
  logout(): Promise<void>;
}

interface WebAuth { school: string; access: string; refresh: string; exp: number }
const AUTH_KEY = "bp.auth";

const webBackend: Backend = (() => {
  let refreshing: Promise<WebAuth> | null = null;
  const load = (): WebAuth | null => { try { return JSON.parse(localStorage.getItem(AUTH_KEY) || "null"); } catch { return null; } };
  const save = (a: WebAuth | null) => (a ? localStorage.setItem(AUTH_KEY, JSON.stringify(a)) : localStorage.removeItem(AUTH_KEY));

  async function token(school: string, form: Record<string, string>): Promise<WebAuth> {
    const body = new URLSearchParams({ client_id: "ANDR", ...form }).toString();
    const r = await http({ url: `${school}/api/login`, method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    if (r.status === 400 || r.status === 401) {
      throw new AuthError("bad login", form.grant_type === "password" ? "bad_login" : "expired");
    }
    if (r.status !== 200) throw new AuthError(`HTTP ${r.status}`, "other");
    const j = JSON.parse(r.text);
    return { school, access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in ?? 3000) * 1000 };
  }

  async function fresh(force = false): Promise<WebAuth> {
    const a = load();
    if (!a) throw new AuthError("not logged in", "expired");
    if (!force && a.exp > Date.now() + 60_000) return a;
    refreshing ??= token(a.school, { grant_type: "refresh_token", refresh_token: a.refresh })
      .then((n) => { save(n); return n; })
      .catch((e) => { if (e instanceof AuthError && e.code === "expired") save(null); throw e; })
      .finally(() => { refreshing = null; });
    return refreshing;
  }

  return {
    async login(school, username, password) { save(await token(school, { grant_type: "password", username, password })); },
    async request(method, path, body) {
      let a = await fresh();
      const send = (t: string) => http({
        url: `${a.school}${path}`, method: method as any,
        headers: { Authorization: `Bearer ${t}`, Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      let r = await send(a.access);
      if (r.status === 401) { a = await fresh(true); r = await send(a.access); }
      return r;
    },
    async accessToken() { return (await fresh()).access; },
    async logout() { save(null); },
  };
})();

const nativeBackend: Backend = {
  async login(school, username, password) {
    try { await native!.call("login", { school, username, password }); }
    catch (e: any) { throw new AuthError(e.message, e.code === "bad_login" ? "bad_login" : e.code === "offline" ? "offline" : "other"); }
  },
  async request(method, path, body) {
    try { return await native!.call("api", { method, path, body: body !== undefined ? JSON.stringify(body) : undefined }); }
    catch (e: any) { throw e.code === "expired" ? new AuthError(e.message, "expired") : new NetError(e.message, 0, e.code === "offline" && navigator.onLine ? "unreachable" : e.code || "offline"); }
  },
  async accessToken() { return (await native!.call<{ token: string }>("accessToken")).token; },
  async logout() { await native!.call("logout"); },
};

const backend = native ? nativeBackend : webBackend;

export const login = (school: string, username: string, password: string) => backend.login(school.replace(/\/+$/, ""), username, password);
export const logout = () => backend.logout();
export const accessToken = () => backend.accessToken();

async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const r = await backend.request(method, path, body);
  if (r.status === 401) throw new AuthError("expired", "expired");
  if (r.status !== 200) throw new NetError(`HTTP ${r.status}`, r.status, "http");
  return (r.text ? JSON.parse(r.text) : null) as T;
}

// ---------------- endpoints ----------------

export async function getUser(): Promise<UserInfo> {
  const u = await api<any>("/api/3/user");
  const cls = u.Class ?? u.Students?.[0]?.Class ?? {};
  const common = u.SettingModules?.Common;
  return {
    uid: u.UserUID, name: u.FullName ?? u.FullUserName ?? "", type: String(u.UserType ?? "").toLowerCase(),
    schoolName: u.SchoolOrganizationName ?? "",
    classId: cls.Id ?? "", classAbbrev: (cls.Abbrev ?? "").trim(), className: cls.Name ?? "",
    modules: (u.EnabledModules ?? []).map((m: any) => m.Module),
    semesterFrom: common?.ActualSemester?.From?.slice(0, 10),
    yearFrom: common?.ActualSchoolYear?.EffectiveStartDate?.slice(0, 10),
  };
}

export async function getWeek(term: Term, date?: string): Promise<Week> {
  const j = term === "permanent"
    ? await api<any>("/api/3/timetable/permanent")
    : await api<any>(`/api/3/timetable/actual${date ? `?date=${date}` : ""}`);
  return normalizeApiWeek(j, term);
}

function normalizeApiWeek(j: any, term: Term): Week {
  const byId = (list: any[] | undefined) => new Map((list ?? []).map((x: any) => [String(x.Id).trim(), x]));
  const subjects = byId(j.Subjects), teachers = byId(j.Teachers), rooms = byId(j.Rooms), groups = byId(j.Groups), cycles = byId(j.Cycles);
  const hourById = new Map<number, Hour>();
  const hours: Hour[] = (j.Hours ?? []).map((h: any) => {
    const hour = { caption: String(h.Caption), begin: hhmm(h.BeginTime), end: hhmm(h.EndTime) };
    hourById.set(h.Id, hour);
    return hour;
  });

  const days: Day[] = (j.Days ?? []).map((d: any) => {
    const date = term === "permanent" ? null : String(d.Date).slice(0, 10);
    const day: Day = { date, dow: d.DayOfWeek, lessons: [] };
    if (d.DayType && d.DayType !== "WorkDay") day.off = d.DayDescription || d.DayType;
    else if (d.DayDescription) day.note = d.DayDescription;
    for (const a of d.Atoms ?? []) {
      const h = hourById.get(a.HourId);
      if (!h) continue;
      const s = subjects.get(String(a.SubjectId ?? "").trim());
      const t = teachers.get(String(a.TeacherId ?? "").trim());
      const r = rooms.get(String(a.RoomId ?? "").trim());
      const g = [...new Set((a.GroupIds ?? []).map((id: string) => groups.get(String(id).trim())?.Abbrev?.trim()).filter(Boolean))].join(", ");
      const cyc = (a.CycleIds ?? []).map((id: string) => cycles.get(String(id).trim())?.Abbrev).filter(Boolean).join("/");
      let change: Change | undefined;
      let removed = false;
      if (a.Change) {
        const ct = String(a.Change.ChangeType ?? "");
        const text = String(a.Change.Description || a.Change.TypeName || "").trim();
        const kind = ct === "Added" ? "added" : ct === "Removed" || ct === "Canceled" ? "removed"
          : ct === "RoomChanged" ? "room" : ct === "Substitution" ? "substitution" : classifyChange(ct, text, a.Change.TypeAbbrev ?? "");
        change = { kind, text };
        removed = kind === "removed";
      }
      const lesson: Lesson = {
        hour: h.caption, begin: h.begin, end: h.end,
        subject: s?.Abbrev?.trim() ?? "", subjectName: s?.Name ?? s?.Abbrev ?? "",
        teacher: t?.Abbrev?.trim() ?? "", teacherName: t?.Name ?? "",
        room: r?.Abbrev?.trim() ?? "", roomName: r?.Name ?? r?.Abbrev ?? "",
        group: [g, cyc].filter(Boolean).join(" · "),
        theme: a.Theme || undefined,
        change, removed: removed || undefined,
      };
      if (!lesson.subject && change) { lesson.subjectName = a.Change.ChangeSubject || ""; }
      day.lessons.push(lesson);
    }
    day.lessons.sort((x, y) => toMin(x.begin) - toMin(y.begin));
    return day;
  });
  return { term, hours, days, fetchedAt: Date.now() };
}

// ---- grades ----

export interface Mark {
  id: string;
  text: string;          // what to show: "1", "2-", "8/10", "A"
  value: number | null;  // numeric value for averages (1-5), null if it doesn't count
  weight: number;
  caption: string;
  theme: string;
  date: string;          // ISO
  isNew: boolean;
  points?: { got: number; max: number };
}
export interface SubjectMarks { id: string; abbrev: string; name: string; average: string; marks: Mark[]; pointsOnly: boolean; temporary: string }

export function markValue(text: string): number | null {
  const m = /^([1-5])(-)?$/.exec(text.trim());
  return m ? +m[1] + (m[2] ? 0.5 : 0) : null;
}

export async function getMarks(): Promise<SubjectMarks[]> {
  const j = await api<any>("/api/3/marks");
  return (j.Subjects ?? []).map((s: any) => ({
    id: s.Subject?.Id?.trim() ?? "", abbrev: s.Subject?.Abbrev?.trim() ?? "", name: s.Subject?.Name ?? "",
    average: String(s.AverageText ?? "").trim(), pointsOnly: !!s.PointsOnly, temporary: s.TemporaryMark ?? "",
    marks: (s.Marks ?? []).map((m: any): Mark => {
      const text = String(m.MarkText || m.PointsText || m.VerbalEvaluation || "?").trim();
      const got = parseFloat(m.PointsText), max = parseFloat(m.MaxPoints);
      return {
        id: String(m.Id), text: m.MaxPoints && !m.MarkText ? `${m.PointsText}/${m.MaxPoints}` : text,
        value: markValue(m.MarkText ?? ""), weight: Number(m.Weight) || 1,
        caption: m.Caption ?? "", theme: m.Theme ?? "", date: String(m.MarkDate ?? m.EditDate ?? "").slice(0, 10),
        isNew: !!m.IsNew, points: !isNaN(got) && !isNaN(max) && max > 0 ? { got, max } : undefined,
      };
    }).sort((a: Mark, b: Mark) => b.date.localeCompare(a.date)),
  }));
}

// ---- homework ----

export interface Homework { id: string; subject: string; subjectName: string; teacher: string; from: string; due: string; text: string; done: boolean; closed: boolean }

export async function getHomework(from: string): Promise<Homework[]> {
  const j = await api<any>(`/api/3/homeworks?from=${from}`);
  return (j.Homeworks ?? []).map((h: any) => ({
    id: String(h.ID), subject: h.Subject?.Abbrev?.trim() ?? "", subjectName: h.Subject?.Name ?? "", teacher: h.Teacher?.Name ?? "",
    from: String(h.DateStart ?? "").slice(0, 10), due: String(h.DateEnd ?? "").slice(0, 10),
    text: htmlToText(h.Content ?? ""), done: !!h.Done, closed: !!(h.Closed || h.Finished),
  }));
}

// ---- messages (Komens) ----

export interface Message { id: string; title: string; text: string; sender: string; date: string; read: boolean; board: boolean }

export async function getMessages(): Promise<Message[]> {
  const map = (board: boolean) => (m: any): Message => ({
    id: String(m.Id), title: m.Title || "", text: htmlToText(m.Text ?? ""), sender: m.Sender?.Name ?? "",
    date: String(m.SentDate ?? ""), read: !!m.Read, board,
  });
  const [inbox, board] = await Promise.all([
    api<any>("/api/3/komens/messages/received", "POST", {}),
    api<any>("/api/3/komens/messages/noticeboard", "POST", {}).catch(() => ({ Messages: [] })),
  ]);
  return [...(inbox.Messages ?? []).map(map(false)), ...(board.Messages ?? []).map(map(true))].sort((a, b) => b.date.localeCompare(a.date));
}

// ---- events (tests, trips, school events) ----

export interface SchoolEvent { id: string; title: string; description: string; type: string; start: string; end: string; wholeDay: boolean; source: "school" }

export async function getEvents(): Promise<SchoolEvent[]> {
  const [my, pub] = await Promise.all([
    api<any>("/api/3/events/my"),
    api<any>("/api/3/events/public").catch(() => ({ Events: [] })),
  ]);
  const seen = new Set<string>();
  const out: SchoolEvent[] = [];
  for (const e of [...(my.Events ?? []), ...(pub.Events ?? [])]) {
    for (const t of e.Times ?? []) {
      const key = `${e.Id}|${t.StartTime}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: String(e.Id), title: e.Title ?? "", description: htmlToText(e.Description ?? ""), type: e.EventType?.Name ?? "",
        start: String(t.StartTime ?? ""), end: String(t.EndTime ?? t.StartTime ?? ""), wholeDay: !!t.WholeDay, source: "school",
      });
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

// ---- absence ----

export interface AbsenceSummary { threshold: number; perSubject: { subject: string; lessons: number; missed: number; late: number; percent: number }[]; unsolved: number }

export async function getAbsence(): Promise<AbsenceSummary> {
  const j = await api<any>("/api/3/absence/student");
  const perSubject = (j.AbsencesPerSubject ?? []).map((s: any) => {
    const missed = (s.Base ?? 0);
    return { subject: s.SubjectName ?? "", lessons: s.LessonsCount ?? 0, missed, late: s.Late ?? 0, percent: s.LessonsCount ? (missed / s.LessonsCount) * 100 : 0 };
  });
  const unsolved = (j.Absences ?? []).reduce((n: number, a: any) => n + (a.Unsolved ?? 0), 0);
  return { threshold: (j.PercentageThreshold ?? 0) * (j.PercentageThreshold <= 1 ? 100 : 1), perSubject, unsolved };
}

// ---------------- helpers ----------------

/** Bakaláři sends HTML in messages and homework; show it as plain text with line breaks (never inject it). */
export function htmlToText(html: string): string {
  if (!/[<&]/.test(html)) return html.trim();
  const doc = new DOMParser().parseFromString(html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h\d)>/gi, "\n"), "text/html");
  return (doc.body.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}
