// Official Bakaláři school directory (the same one the official app uses): towns, then schools in a town.

import { getJson } from "./net";

export interface School { id: string; name: string; url: string }

const DIR = "https://sluzby.bakalari.cz/api/v1/municipality";
let towns: { name: string; count: number }[] | null = null;

export async function searchTowns(q: string): Promise<{ name: string; count: number }[]> {
  towns ??= (await getJson<any[]>(DIR)).filter((t) => t.name).map((t) => ({ name: t.name as string, count: t.schoolCount as number }));
  const n = fold(q);
  if (!n) return [];
  return towns.filter((t) => fold(t.name).includes(n))
    .sort((a, b) => Number(!fold(a.name).startsWith(n)) - Number(!fold(b.name).startsWith(n)) || a.name.localeCompare(b.name, "cs"))
    .slice(0, 30);
}

export async function schoolsIn(town: string): Promise<School[]> {
  const j = await getJson<any>(`${DIR}/${encodeURIComponent(town)}`);
  return (j.schools ?? [])
    .filter((s: any) => s.schoolUrl && !/licence pro školení|testovací/i.test(s.name))
    .map((s: any) => ({ id: s.id, name: s.name.trim(), url: normalizeSchoolUrl(s.schoolUrl) }))
    .sort((a: School, b: School) => a.name.localeCompare(b.name, "cs"));
}

/** "bakalar.skola.cz/" or "https://x/bakaweb/login" -> "https://x/bakaweb" */
export function normalizeSchoolUrl(input: string): string {
  let s = input.trim();
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  const u = new URL(s);
  let path = u.pathname.replace(/\/(login|dashboard|next\/.*|Timetable\/.*)$/i, "").replace(/\/+$/, "");
  return `${u.protocol}//${u.host}${path}`;
}

/** Lowercase without diacritics, for search. */
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
