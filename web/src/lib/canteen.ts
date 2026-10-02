// School canteen (iCanteen by Z-WARE, e.g. jidelna.trebesin.cz): menu, credit, ordering and the meal exchange
// ("burza"). iCanteen has no API, so this reads its web pages. Page structure and flows follow Autojídelna's
// icanteenlib (MIT, github.com/Autojidelna/icanteenlib), written for iCanteen 2.18.03.
//
// Separate login from Bakaláři. The password goes to the canteen once (directly from Android, through the Worker's
// /canteen relay in a browser) and is never stored; the session and iCanteen's "remember me" cookie are kept on
// this device only (localStorage "bp.canteen").

import { signal } from "@preact/signals";
import { native } from "./native";
import { CLOUD_URL, NetError } from "./net";

export interface CanteenState { url: string; cookies: Record<string, string>; loggedIn: boolean; user?: string }

const KEY = "bp.canteen";
export const canteen = signal<CanteenState | null>((() => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } })());
const save = (s: CanteenState | null) => { canteen.value = s; if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); };

export class CanteenAuthError extends Error { constructor() { super("canteen login needed"); } }

/** "https://bakalar.trebesin.cz" -> "https://jidelna.trebesin.cz" (a guess the user can change). */
export const guessCanteenUrl = (school: string) => {
  try { const u = new URL(school); const p = u.hostname.split("."); return p.length > 2 ? `https://jidelna.${p.slice(1).join(".")}` : `https://jidelna.${u.hostname}`; }
  catch { return ""; }
};
export const cleanUrl = (u: string) => { const s = u.trim().replace(/\/+$/, ""); return /^https?:\/\//i.test(s) ? s.replace(/^http:/i, "https:") : `https://${s}`; };

// ---------------- transport: no redirects followed, cookies handled here ----------------

interface Raw { status: number; text: string; setCookies: string[]; location: string }

async function raw(url: string, method: "GET" | "POST" = "GET", form?: Record<string, string>, cookies: Record<string, string> = {}): Promise<Raw> {
  const cookie = Object.entries(cookies).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join("; ");
  const body = form ? new URLSearchParams(form).toString() : undefined;
  const headers: Record<string, string> = { Accept: "text/html" };
  if (body) headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (native) {
    if (cookie) headers.Cookie = cookie;
    try {
      const r = await native.call<{ status: number; text: string; setCookies?: string[]; location?: string }>("http", { url, method, headers, body, raw: true });
      return { status: r.status, text: r.text, setCookies: r.setCookies ?? [], location: r.location ?? "" };
    } catch (e) { throw new NetError((e as Error).message || "offline", 0, navigator.onLine ? "unreachable" : "offline"); }
  }
  if (cookie) headers["X-BP-Cookie"] = cookie;
  let r: Response;
  try { r = await fetch(`${CLOUD_URL}/canteen?u=${encodeURIComponent(url)}`, { method, headers, body }); }
  catch { throw new NetError("offline", 0, navigator.onLine ? "unreachable" : "offline"); }
  if (r.status === 403 && r.headers.get("x-relay") === "denied") throw new NetError(await r.text(), 403, "relay");
  let setCookies: string[] = [];
  try { setCookies = JSON.parse(r.headers.get("X-BP-Set-Cookie") || "[]"); } catch { /* none */ }
  return { status: r.status, text: await r.text(), setCookies, location: r.headers.get("X-BP-Location") ?? "" };
}

/** Apply Set-Cookie headers to the jar ("name=; ..." or Max-Age=0 deletes). */
function merge(jar: Record<string, string>, setCookies: string[]) {
  for (const sc of setCookies) {
    const [pair, ...attrs] = sc.split(";");
    const i = pair.indexOf("=");
    if (i < 1) continue;
    const name = pair.slice(0, i).trim(), value = pair.slice(i + 1).trim();
    if (!value || attrs.some((a) => /^\s*max-age\s*=\s*0\s*$/i.test(a))) delete jar[name]; else jar[name] = value;
  }
}

const isLoginPage = (r: Raw) => (r.status >= 300 && /\/login/i.test(r.location)) || /přihlášení uživatele|name="j_password"/i.test(r.text);

/**
 * A page of the logged-in canteen; throws CanteenAuthError when the session (and "remember me") ran out.
 * `expect` must appear in the page: when iCanteen drops a session it doesn't always send the login page, it can
 * answer with some other page (or redirect to its home page) - that must not be read as "no menu".
 */
/**
 * One canteen request at a time, each with the newest cookies. iCanteen replaces the "remember me" cookie whenever
 * it is used; two requests sent together with the same old one look like a stolen cookie to it, and it signs the
 * user out everywhere (that is what happened when the menu, credit and exchange loaded in parallel).
 */
let queue: Promise<unknown> = Promise.resolve();
function page(path: string, expect: RegExp): Promise<string> {
  const run = queue.then(() => pageNow(path, expect));
  queue = run.catch(() => {});
  return run;
}

async function pageNow(path: string, expect: RegExp): Promise<string> {
  const s = canteen.value;
  if (!s?.loggedIn) throw new CanteenAuthError();
  const jar = { ...s.cookies };
  const get = async (url: string) => { const r = await raw(url, "GET", undefined, jar); merge(jar, r.setCookies); return r; };
  let r = await get(s.url + path);
  // "Remember me" signs in again and redirects, sometimes to the home page: follow, then ask for the page again.
  for (let hops = 0; r.status >= 300 && r.status < 400 && r.location && !/\/login/i.test(r.location) && hops < 3; hops++) {
    r = await get(new URL(r.location, s.url).toString());
    if (r.status === 200 && !expect.test(r.text)) r = await get(s.url + path);
  }
  if (isLoginPage(r) || (r.status >= 300 && r.status < 400) || (r.status === 200 && !expect.test(r.text))) {
    save({ ...s, cookies: jar, loggedIn: false });
    throw new CanteenAuthError();
  }
  save({ ...s, cookies: jar });
  if (r.status !== 200) throw new NetError(`HTTP ${r.status}`, r.status, "http");
  return r.text;
}

// ---------------- login ----------------

/** Returns false for a wrong name or password. */
export async function canteenLogin(url: string, user: string, password: string): Promise<boolean> {
  const base = cleanUrl(url);
  const jar: Record<string, string> = {};
  const first = await raw(`${base}/login`, "GET", undefined, jar);
  if (first.status !== 200 || !/iCanteen/i.test(first.text)) throw new NetError("not iCanteen", first.status, "notcanteen");
  merge(jar, first.setCookies);
  const doc = new DOMParser().parseFromString(first.text, "text/html");
  const csrf = doc.querySelector<HTMLInputElement>('input[name="_csrf"]')?.value || jar["XSRF-TOKEN"] || "";
  const r = await raw(`${base}/j_spring_security_check`, "POST", {
    j_username: user, j_password: password, terminal: "false", _csrf: csrf,
    _spring_security_remember_me: "on", targetUrl: "/faces/secured/main.jsp?terminal=false&status=true&printer=false&keyboard=false",
  }, jar);
  const bad = r.setCookies.some((c) => /^remember-me=\s*;/i.test(c)) || /\/login/i.test(r.location) || isLoginPage(r);
  if (bad) return false;
  merge(jar, r.setCookies);
  save({ url: base, cookies: jar, loggedIn: true, user });
  return true;
}

export function canteenLogout() {
  const s = canteen.value;
  if (s?.loggedIn) void raw(`${s.url}/logout`, "GET", undefined, s.cookies).catch(() => {});
  save(s ? { url: s.url, cookies: {}, loggedIn: false } : null);
}

export const setCanteenUrl = (url: string) => save({ url: cleanUrl(url), cookies: {}, loggedIn: false });

// ---------------- parsing ----------------

export interface Meal {
  date: string;               // ISO
  variant: string;            // "Oběd 1"
  name: string;
  allergens: string[];        // ["1", "3", "7"]
  price?: number;
  ordered: boolean;
  canChange: boolean;         // false = "nelze objednat / zrušit"
  orderUrl?: string;          // make | delete | reorder
  orderType?: "make" | "delete" | "reorder";
  burzaUrl?: string;          // plusburza (put in) | minusburza (take back) | multiburza
  onBurza: boolean;           // I put it into the exchange
}
export interface MenuDay { date: string; meals: Meal[] }

const text = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const tidy = (s: string) => s.replace(/\s*\*\s*/g, " ").replace(/\s+,/g, ",").replace(/\s{2,}/g, " ").replace(/^[\s,–-]+|[\s,–-]+$/g, "").trim();
const unamp = (s: string) => s.replace(/&amp;/g, "&");
const czDate = (s: string) => { const m = /(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/.exec(s); return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : ""; };
const num = (s: string) => { const n = parseFloat(s.replace(/[^\d,.-]/g, "").replace(",", ".")); return Number.isFinite(n) ? n : undefined; };

function allergensOf(el: Element): string[] {
  const out = new Set<string>();
  for (const g of el.querySelectorAll(".textGrey")) for (const m of (g.textContent ?? "").matchAll(/\d+/g)) out.add(m[0]);
  return [...out].sort((a, b) => +a - +b);
}

/** The public menu on the login page (no login needed). */
export function parsePublicMenu(html: string): MenuDay[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const days: MenuDay[] = [];
  for (const day of doc.querySelectorAll(".jidelnicekDen")) {
    const date = /day-(\d{4}-\d{2}-\d{2})/.exec(day.innerHTML)?.[1];
    if (!date) continue;
    const meals: Meal[] = [];
    for (const row of day.querySelectorAll(".container")) {
      const variant = text(row.querySelector(".smallBoldTitle"));
      const item = row.querySelector(".column.jidelnicekItem") ?? row.querySelector(".jidelnicekItem:not(.smallBoldTitle)");
      if (!variant || !item) continue;
      const c = item.cloneNode(true) as Element;
      c.querySelectorAll(".textGrey, sub").forEach((x) => x.remove());
      meals.push({ date, variant, name: tidy(text(c)), allergens: allergensOf(item), ordered: false, canChange: false, onBurza: false });
    }
    if (meals.length) days.push({ date, meals });
  }
  return days;
}

/** The logged-in menu (mobile.jsp lists every day you can order). */
export function parseMenu(html: string): MenuDay[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const byDate = new Map<string, Meal[]>();
  for (const el of doc.querySelectorAll(".jidelnicekItemWrapper")) {
    const h = el.innerHTML;
    const date = /day-(\d{4}-\d{2}-\d{2})/.exec(h)?.[1] ?? /day=(\d{4}-\d{2}-\d{2})/.exec(h)?.[1];
    if (!date) continue;
    const center = el.querySelector(".jidWrapCenter");
    const c = center?.cloneNode(true) as Element | undefined;
    c?.querySelectorAll(".textGrey, sub").forEach((x) => x.remove());
    const orderUrl = /ajaxOrder\(this,\s*'([^']+)'/.exec(h)?.[1];
    const burzaUrl = /(db\/dbProcessOrder\.jsp[^']*type=(?:plusburza|minusburza|multiburza)[^']*)/.exec(h)?.[1];
    const canChange = !/nelze zrušit|nelze objednat|nelze změnit/i.test(text(el));
    const meal: Meal = {
      date,
      variant: text(el.querySelector(".smallBoldTitle.button-link-align") ?? el.querySelector(".smallBoldTitle")),
      name: tidy(text(c ?? null)),
      allergens: center ? allergensOf(center) : [],
      price: num(/Cena (?:objednaného jídla|při objednání jídla)"?\s*>?\s*(?::|&nbsp;)?\s*([\d\s,.]+)/i.exec(h)?.[1] ?? ""),
      ordered: /Máte objednáno/i.test(h),
      canChange,
      orderUrl: canChange && orderUrl ? unamp(orderUrl) : undefined,
      orderType: (/type=(make|delete|reorder)/.exec(orderUrl ?? "")?.[1] as Meal["orderType"]) ?? undefined,
      burzaUrl: burzaUrl ? unamp(burzaUrl) : undefined,
      onBurza: !!burzaUrl && /minusburza/.test(burzaUrl),
    };
    byDate.set(date, [...(byDate.get(date) ?? []), meal]);
  }
  return [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, meals]) => ({ date, meals }));
}

export interface Account { credit?: number; orderedUntil?: string }

export function parseAccount(html: string): Account {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return { credit: num(text(doc.getElementById("Kredit"))), orderedUntil: czDate(text(doc.getElementById("PoslObj"))) || undefined };
}

export interface BurzaItem { date: string; variant: string; name: string; place: string; count: number; url: string }

export function parseBurza(html: string): BurzaItem[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out: BurzaItem[] = [];
  for (const tr of doc.querySelectorAll("tr.mouseOutRow")) {
    const td = [...tr.querySelectorAll("td")].map((x) => text(x));
    const url = /'(db\/[^']+)'/.exec(tr.innerHTML)?.[1];
    if (!url || td.length < 5) continue;
    out.push({ variant: td[0], date: czDate(td[1]), name: tidy(td[2]), place: td[3], count: parseInt(td[4]) || 1, url: unamp(url) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------- reading and actions ----------------

export async function getPublicMenu(url: string): Promise<MenuDay[]> {
  const r = await raw(`${cleanUrl(url)}/login`);
  if (r.status !== 200) throw new NetError(`HTTP ${r.status}`, r.status, "http");
  return parsePublicMenu(r.text);
}
// What each page must contain to count as "signed in" (see page()).
export const getMenu = async () => parseMenu(await page("/faces/secured/mobile.jsp?terminal=false&keyboard=&printer=", /jidelnicek|orderContent|Litujeme/i));
export const getAccount = async () => parseAccount(await page("/web/setting", /id="Kredit"|Kredit/));
export const getBurza = async () => parseBurza(await page("/faces/secured/burza.jsp", /tableDataShow|burz/i));

/**
 * Order, cancel, re-order, put into / take from the exchange: iCanteen does all of it with a GET to the link the
 * page gave (it carries its own token). Spends or returns real credit, so the UI asks first.
 */
export async function canteenAction(link: string) {
  const path = link.endsWith("amount=") ? `${link}1` : link;
  const res = await page(`/faces/secured/${path.replace(/^\/+/, "")}`, /[\s\S]/);
  if (/(^|\W)(fail|Chyba)(\W|$)/i.test(res.slice(0, 400))) throw new NetError(res.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) || "error", 0, "canteen");
}
