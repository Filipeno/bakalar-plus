import { settings, user, useData } from "./store";
import type { Target, Term, Week } from "./model";
import { addDays, mondayOf, today } from "./model";
import { fetchDirectory, fetchPublicWeek, type Directory } from "./public";
import * as bk from "./bakalari";
import { fold } from "./schools";
import { cloudAvailable, listCabinets } from "./cloud";

export type Source = { kind: "my" } | Target;

const school = () => settings.value.school?.url ?? "";

export function sourceKey(src: Source): string {
  if (src.kind === "my") return user.value ? `my:${user.value.uid}` : `pub:${settings.value.myTarget?.kind}:${settings.value.myTarget?.id}`;
  return `pub:${src.kind}:${src.id}`;
}

export async function loadWeek(src: Source, term: Term): Promise<Week> {
  if (src.kind === "my") {
    if (user.value) return bk.getWeek(term, term === "next" ? addDays(mondayOf(today()), 7) : undefined);
    const mt = settings.value.myTarget;
    if (!mt) throw new Error("no class selected");
    return fetchPublicWeek(school(), mt, term);
  }
  return fetchPublicWeek(school(), src, term);
}

/** `term` "actual" is cached per week, so Monday morning never shows last week's data. */
export function weekCacheKey(src: Source, term: Term) {
  const wk = term === "permanent" ? "perm" : term === "next" ? addDays(mondayOf(today()), 7) : mondayOf(today());
  return `wk:${school()}:${sourceKey(src)}:${wk}`;
}

export function useWeek(src: Source | null, term: Term) {
  const hasMy = !!user.value || !!settings.value.myTarget;
  const key = src && (src.kind !== "my" || hasMy) && school() ? weekCacheKey(src, term) : null;
  return useData<Week>(key, () => loadWeek(src!, term), term === "permanent" ? 24 * 3600_000 : 15 * 60_000);
}

export function useDirectory() {
  const s = school();
  return useData<Directory>(s && settings.value.publicOk ? `dir:${s}` : null, () => fetchDirectory(s), 24 * 3600_000);
}

/** Teachers' cabinets (shared by the school's students; needs a login to read and edit). */
export function useCabinets() {
  const s = school();
  return useData(user.value && s && cloudAvailable() ? `cab:${s}` : null, () => listCabinets(s).then((r) => r.cabinets), 60 * 60_000);
}

const uk = (name: string) => (user.value ? `${name}:${user.value.uid}` : null);

export const useMarks = () => useData(uk("marks"), bk.getMarks, 10 * 60_000);
export const useHomework = () => useData(uk("hw"), () => bk.getHomework(addDays(today(), -21)), 15 * 60_000);
export const useMessages = () => useData(uk("msg"), bk.getMessages, 15 * 60_000);
export const useEvents = () => useData(uk("ev"), bk.getEvents, 60 * 60_000);
export const useAbsence = () => useData(uk("abs"), bk.getAbsence, 60 * 60_000);

// ---- linking a lesson's teacher / room / class to the public directory ----

export function findTeacher(dir: Directory | undefined, abbrev: string, fullName: string): Target | undefined {
  if (!dir || !fullName) return undefined;
  // Directory names are "SURNAME Firstname"; lesson names are "Mgr. Firstname SURNAME Ph.D."
  const words = fold(fullName).replace(/[.,]/g, " ").split(/\s+/).filter((w) => w.length > 2);
  const hits = dir.teachers.filter((tt) => {
    const n = fold(tt.name).split(/\s+/);
    return n.length >= 2 && words.includes(n[0]) && words.includes(n[1]);
  });
  if (hits.length === 1) return hits[0];
  return hits[0] ?? dir.teachers.find((tt) => tt.id.trim() === abbrev.trim());
}

export function findRoom(dir: Directory | undefined, room: string): Target | undefined {
  if (!dir || !room) return undefined;
  const r = fold(room);
  return dir.rooms.find((x) => fold(x.name) === r) ?? dir.rooms.find((x) => fold(x.name).split(/[\s-]+/)[0] === r);
}

export function findClass(dir: Directory | undefined, group: string): Target | undefined {
  if (!dir || !group) return undefined;
  const g = fold(group).split(/[\s,]+/)[0];
  return dir.classes.find((c) => fold(c.name) === g) ?? dir.classes.find((c) => fold(c.name).split(/\s+/)[0] === g);
}
