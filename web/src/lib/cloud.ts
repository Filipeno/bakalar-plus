// Shared class calendar, stored by the Worker (worker/src/index.ts). You prove you are in a class by handing
// the Worker a short-lived Bakaláři access token once: it asks the school who you are and which class you're in,
// then gives back its own session token. Your password never goes there.

import { accessToken } from "./bakalari";
import { CLOUD_URL } from "./net";
import { native } from "./native";

export type EntryKind = "test" | "homework" | "event" | "other";

export interface ClassEntry {
  id: string;
  date: string;          // ISO
  time: string;          // "08:00" or ""
  kind: EntryKind;
  title: string;
  note: string;
  author: string;        // first name + initial
  mine: boolean;
  updated: number;
}

export interface CloudSession { token: string; classLabel: string; exp: number; key: string }

const KEY = "bp.cloud";
/** The Android build and the Worker-hosted web app have a Worker; `npm run dev` on its own doesn't. */
export const cloudAvailable = () => CLOUD_URL !== "" || !/^(localhost|127\.|192\.168\.|appassets)/.test(location.hostname);
const base = () => CLOUD_URL || location.origin;

function load(school: string): CloudSession | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    return s && s.key === school && s.exp > Date.now() / 1000 + 300 ? s : null;
  } catch { return null; }
}

export async function cloudSession(school: string): Promise<CloudSession> {
  const cached = load(school);
  if (cached) return cached;
  const r = await fetch(`${base()}/cal/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ school, token: await accessToken() }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || `HTTP ${r.status}`);
  const j = await r.json();
  const s: CloudSession = { token: j.token, classLabel: j.classLabel, exp: j.exp, key: school };
  localStorage.setItem(KEY, JSON.stringify(s));
  native?.sync("setCloud", { url: base(), token: s.token, exp: s.exp });   // for the evening reminder
  return s;
}

async function call<T>(school: string, method: string, path: string, body?: unknown): Promise<T> {
  let s = await cloudSession(school);
  const send = () => fetch(`${base()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${s.token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let r = await send();
  if (r.status === 401) { localStorage.removeItem(KEY); s = await cloudSession(school); r = await send(); }
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || `HTTP ${r.status}`);
  return r.status === 204 ? (null as T) : r.json();
}

export const classLabel = (school: string) => load(school)?.classLabel;
export const listEntries = (school: string, from: string, to: string) =>
  call<{ entries: ClassEntry[]; classLabel: string }>(school, "GET", `/cal/entries?from=${from}&to=${to}`);
export const addEntry = (school: string, e: Omit<ClassEntry, "id" | "author" | "mine" | "updated">) =>
  call<ClassEntry>(school, "POST", "/cal/entries", e);
export const updateEntry = (school: string, id: string, e: Omit<ClassEntry, "id" | "author" | "mine" | "updated">) =>
  call<ClassEntry>(school, "PUT", `/cal/entries/${id}`, e);
export const deleteEntry = (school: string, id: string) => call<null>(school, "DELETE", `/cal/entries/${id}`);
export const reportEntry = (school: string, id: string) => call<null>(school, "POST", `/cal/entries/${id}/report`);

/** Where a teacher's cabinet is, filled in by the school's students. Keyed by the teacher's id in the public timetable. */
export interface Cabinet { room: string; by: string; updated: number; hours?: string }
export const listCabinets = (school: string) => call<{ cabinets: Record<string, Cabinet> }>(school, "GET", "/cal/cabinets");
export const setCabinet = (school: string, teacher: string, room: string) =>
  call<Cabinet>(school, "PUT", `/cal/cabinets/${encodeURIComponent(teacher)}`, { room });

export const forgetCloud = () => { localStorage.removeItem(KEY); native?.sync("setCloud", {}); };
