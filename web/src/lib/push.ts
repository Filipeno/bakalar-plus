// Web Push for the web version (iPhone PWA, desktop browsers). The Android app has native notifications instead.
//
// Turning it on signs in to the school a SECOND time: the Worker gets that second refresh token only (the
// password goes straight to the school, same as a normal sign-in), so the app's own sign-in keeps working
// while the server checks for new grades and timetable changes.

import { http } from "./net";
import { CLOUD_URL } from "./net";
import { cloudSession } from "./cloud";
import { lang } from "./i18n";

const KEY = "bp.push";
const base = () => CLOUD_URL || location.origin;

export interface PushPrefs { grades: boolean; changes: boolean }
interface Saved { token: string; endpoint: string; school: string }

export const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isStandalone = () => matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export function saved(): Saved | null {
  try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
}

async function api(method: string, path: string, token?: string, body?: unknown): Promise<Response> {
  return fetch(`${base()}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

let vapidKey: Promise<string> | null = null;
/** Fetch early (when the settings open), so the click handler doesn't wait before asking for permission. */
export const prefetchVapid = () => (vapidKey ??= api("GET", "/push/vapid").then((r) => r.json()).then((j) => j.publicKey as string).catch(() => ""));

const b64uToBytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export class PushError extends Error { constructor(public code: "denied" | "unsupported" | "bad_login" | "server" | "no_key") { super(code); } }

/** Call straight from a click/submit handler: iOS only shows the permission prompt for a user gesture. */
export async function enablePush(school: string, username: string, password: string, prefs: PushPrefs): Promise<void> {
  if (!pushSupported()) throw new PushError("unsupported");
  const perm = await Notification.requestPermission();          // first await: still inside the user gesture
  if (perm !== "granted") throw new PushError("denied");
  const key = await prefetchVapid();
  if (!key) throw new PushError("no_key");

  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(key) }));

  // The server's own sign-in (not the one this app uses).
  const r = await http({
    url: `${school}/api/login`, method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: "ANDR", grant_type: "password", username, password }).toString(),
  });
  if (r.status === 400 || r.status === 401) throw new PushError("bad_login");
  if (r.status !== 200) throw new PushError("server");
  const refreshToken = JSON.parse(r.text).refresh_token as string;

  const reg2 = await api("POST", "/push/register", undefined, { school, refreshToken, subscription: sub.toJSON(), prefs, lang: lang.value });
  if (!reg2.ok) throw new PushError(reg2.status === 401 ? "bad_login" : "server");
  const j = await reg2.json();
  localStorage.setItem(KEY, JSON.stringify({ token: j.token, endpoint: sub.endpoint, school } satisfies Saved));
}

export async function pushStatus(): Promise<{ registered: boolean; status?: string; prefs?: PushPrefs } | null> {
  const s = saved();
  if (!s) return null;
  const r = await api("GET", "/push/status", s.token).catch(() => null);
  if (!r) return null;                       // offline: unknown
  if (r.status === 401) { localStorage.removeItem(KEY); return { registered: false }; }
  const j = await r.json();
  if (!j.registered) localStorage.removeItem(KEY);
  return j;
}

export async function setPushPrefs(p: PushPrefs) {
  const s = saved();
  if (s) await api("POST", "/push/prefs", s.token, p);
}

export async function sendTestPush(): Promise<number> {
  const s = saved();
  if (!s) return 0;
  const r = await api("POST", "/push/test", s.token);
  return r.ok ? (await r.json()).sent : 0;
}

export async function disablePush() {
  const s = saved();
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  await sub?.unsubscribe().catch(() => {});
  if (s) await api("POST", "/push/unsubscribe", s.token, { endpoint: s.endpoint }).catch(() => {});
  localStorage.removeItem(KEY);
}

/** DELETE /me: the server forgets the push sign-in, devices, saved state and my class-calendar entries. */
export async function deleteServerData(school: string): Promise<void> {
  const token = saved()?.token ?? (await cloudSession(school).catch(() => null))?.token;
  if (token) {
    const r = await api("DELETE", "/me", token);
    if (!r.ok && r.status !== 401) throw new Error(`HTTP ${r.status}`);
  }
  await disablePush().catch(() => {});
}
