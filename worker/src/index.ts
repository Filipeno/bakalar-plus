// Bakaláři+ Worker: serves the web app, relays requests to schools that block browsers (no CORS), and stores
// the shared class calendars.
//
// Nothing here stores a Bakaláři password or token. The relay forwards and forgets; /cal/session uses a
// short-lived access token once to ask the school "who is this and which class", then issues its own token.

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  SESSION_SECRET: string;
}

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept",
  "Access-Control-Max-Age": "86400",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...CORS } });
const fail = (error: string, status: number) => json({ error }, status);

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    try {
      if (url.pathname === "/relay") return await relay(req, url, ctx);
      if (url.pathname.startsWith("/cal/")) return await calendar(req, url, env);
    } catch (e) {
      console.error(e);
      return fail("server error", 500);
    }
    return env.ASSETS.fetch(req);
  },
};

// ---------------- relay ----------------

const DIRECTORY_HOST = "sluzby.bakalari.cz";
// Only Bakaláři's own paths, optionally under a sub-folder like /bakaweb.
const SCHOOL_PATH = /^(\/[\w.-]+)?\/(api(\/.*)?|Timetable\/Public(\/.*)?)$/i;

/** Is `origin`+`prefix` a real Bakaláři server? Asks its /api (answers with ApiVersion); cached for a day. */
async function isBakalari(base: string, ctx: ExecutionContext): Promise<boolean> {
  const cache = caches.default;
  const key = new Request(`https://bp-cache.invalid/is-bakalari?u=${encodeURIComponent(base)}`);
  const hit = await cache.match(key);
  if (hit) return (await hit.text()) === "1";
  let ok = false;
  try {
    const r = await fetch(`${base}/api`, { headers: { Accept: "application/json" }, redirect: "manual", cf: { cacheTtl: 0 } });
    ok = r.status === 200 && /"ApiVersion"/i.test(await r.text());
  } catch { ok = false; }
  ctx.waitUntil(cache.put(key, new Response(ok ? "1" : "0", { headers: { "Cache-Control": `max-age=${ok ? 86400 : 600}` } })));
  return ok;
}

async function relay(req: Request, url: URL, ctx: ExecutionContext): Promise<Response> {
  const denied = (why: string) => new Response(why, { status: 403, headers: { ...CORS, "x-relay": "denied" } });
  let target: URL;
  try { target = new URL(url.searchParams.get("u") ?? ""); } catch { return denied("bad url"); }
  if (target.protocol !== "https:" || target.username || target.password) return denied("https only");

  if (target.hostname === DIRECTORY_HOST) {
    if (req.method !== "GET" || !target.pathname.startsWith("/api/v1/municipality")) return denied("path");
  } else {
    const m = SCHOOL_PATH.exec(target.pathname);
    if (!m) return denied("path");
    const base = `${target.origin}${m[1] ?? ""}`;
    if (!(await isBakalari(base, ctx))) return denied("not a Bakaláři server");
  }
  if (!["GET", "POST", "PUT"].includes(req.method)) return denied("method");

  const headers = new Headers({ "User-Agent": "BakalariPlus/1.0 (+https://github.com/Filipeno/bakalar-plus)" });
  for (const h of ["authorization", "content-type", "accept"]) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  const body = req.method === "GET" ? undefined : await req.arrayBuffer();
  if (body && body.byteLength > 64 * 1024) return denied("too big");
  const r = await fetch(target.toString(), { method: req.method, headers, body, redirect: "manual" });
  const out = new Headers({ ...CORS, "x-relay": "ok", "Cache-Control": "no-store" });
  out.set("Content-Type", r.headers.get("content-type") ?? "text/plain");
  return new Response(r.body, { status: r.status, headers: out });
}

// ---------------- shared class calendar ----------------

interface Session { k: string; u: string; n: string; c: string; exp: number }

const b64u = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
}

async function sha(s: string): Promise<string> {
  return b64u(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))).slice(0, 32);
}

async function signSession(env: Env, s: Session): Promise<string> {
  const body = b64u(new TextEncoder().encode(JSON.stringify(s)));
  return `${body}.${await hmac(env.SESSION_SECRET, body)}`;
}

async function readSession(env: Env, req: Request): Promise<Session | null> {
  const m = /^Bearer (.+)\.(.+)$/.exec(req.headers.get("authorization") ?? "");
  if (!m || (await hmac(env.SESSION_SECRET, m[1])) !== m[2]) return null;
  const s = JSON.parse(new TextDecoder().decode(fromB64u(m[1]))) as Session;
  return s.exp > Date.now() / 1000 ? s : null;
}

/** "Novák Jan, 2.A" -> "Jan N." (Bakaláři writes surname first). */
function shortName(full: string): string {
  const words = full.split(",")[0].trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return words[0] ?? "?";
  return `${words[words.length - 1]} ${words[0][0]}.`;
}

const KINDS = new Set(["test", "homework", "event", "other"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^(\d{2}:\d{2})?$/;
const REPORTS_TO_HIDE = 3;
const MAX_PER_DAY = 40;

function cleanEntry(b: any): { date: string; time: string; kind: string; title: string; note: string } | string {
  if (!b || typeof b !== "object") return "bad body";
  const title = String(b.title ?? "").trim().slice(0, 120);
  const note = String(b.note ?? "").trim().slice(0, 1000);
  const date = String(b.date ?? ""), time = String(b.time ?? ""), kind = String(b.kind ?? "other");
  if (!title) return "title required";
  if (!DATE.test(date) || !TIME.test(time) || !KINDS.has(kind)) return "bad fields";
  return { date, time, kind, title, note };
}

const rowToEntry = (r: any, me: string) => ({
  id: r.id, date: r.date, time: r.time, kind: r.kind, title: r.title, note: r.note,
  author: r.author_name, mine: r.author_hash === me, updated: r.updated,
});

async function calendar(req: Request, url: URL, env: Env): Promise<Response> {
  if (url.pathname === "/cal/session" && req.method === "POST") {
    const b = (await req.json().catch(() => null)) as { school?: string; token?: string } | null;
    if (!b?.school || !b.token) return fail("bad request", 400);
    let school: URL;
    try { school = new URL(b.school); } catch { return fail("bad school", 400); }
    if (school.protocol !== "https:") return fail("bad school", 400);
    const base = `${school.origin}${school.pathname.replace(/\/+$/, "")}`;
    // Ask the school who this is. A fake server could claim any class, but only of its own "school":
    // the calendar key includes the school address.
    const r = await fetch(`${base}/api/3/user`, { headers: { Authorization: `Bearer ${b.token}`, Accept: "application/json" }, redirect: "manual" });
    if (r.status === 401) return fail("expired", 401);
    if (r.status !== 200) return fail("school unreachable", 502);
    const u = (await r.json()) as any;
    const cls = u.Class ?? u.Students?.[0]?.Class;
    if (!cls?.Id || !u.UserUID) return fail("no class", 403);
    const s: Session = {
      k: await sha(`${base.toLowerCase()}|${String(cls.Id).trim()}`),
      u: await sha(`${env.SESSION_SECRET}|${base.toLowerCase()}|${u.UserUID}`),
      n: shortName(String(u.FullName ?? "")),
      c: String(cls.Abbrev ?? "").trim(),
      exp: Math.floor(Date.now() / 1000) + 30 * 86400,
    };
    return json({ token: await signSession(env, s), classLabel: s.c, exp: s.exp });
  }

  const s = await readSession(env, req);
  if (!s) return fail("unauthorized", 401);

  if (url.pathname === "/cal/entries" && req.method === "GET") {
    const from = url.searchParams.get("from") ?? "", to = url.searchParams.get("to") ?? "";
    if (!DATE.test(from) || !DATE.test(to)) return fail("bad range", 400);
    const { results } = await env.DB.prepare(
      "SELECT * FROM entries WHERE class_key = ? AND date BETWEEN ? AND ? AND hidden = 0 ORDER BY date, time LIMIT 500",
    ).bind(s.k, from, to).all();
    return json({ entries: results.map((r) => rowToEntry(r, s.u)), classLabel: s.c });
  }

  if (url.pathname === "/cal/entries" && req.method === "POST") {
    const e = cleanEntry(await req.json().catch(() => null));
    if (typeof e === "string") return fail(e, 400);
    const since = Date.now() - 86400_000;
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM entries WHERE author_hash = ? AND created > ?").bind(s.u, since).first<{ n: number }>();
    if ((count?.n ?? 0) >= MAX_PER_DAY) return fail("too many entries today", 429);
    const id = crypto.randomUUID(), now = Date.now();
    await env.DB.prepare(
      "INSERT INTO entries (id, class_key, date, time, kind, title, note, author_hash, author_name, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(id, s.k, e.date, e.time, e.kind, e.title, e.note, s.u, s.n, now, now).run();
    return json({ id, ...e, author: s.n, mine: true, updated: now }, 201);
  }

  const m = /^\/cal\/entries\/([\w-]{36})(\/report)?$/.exec(url.pathname);
  if (!m) return fail("not found", 404);
  const row = await env.DB.prepare("SELECT * FROM entries WHERE id = ? AND class_key = ?").bind(m[1], s.k).first<any>();
  if (!row) return fail("not found", 404);

  if (m[2] && req.method === "POST") {
    if (row.author_hash === s.u) return fail("own entry", 400);
    await env.DB.prepare("INSERT OR IGNORE INTO reports (entry_id, user_hash, created) VALUES (?, ?, ?)").bind(row.id, s.u, Date.now()).run();
    await env.DB.prepare("UPDATE entries SET hidden = 1 WHERE id = ? AND (SELECT COUNT(*) FROM reports WHERE entry_id = ?) >= ?")
      .bind(row.id, row.id, REPORTS_TO_HIDE).run();
    return new Response(null, { status: 204, headers: CORS });
  }
  if (row.author_hash !== s.u) return fail("not yours", 403);

  if (req.method === "PUT") {
    const e = cleanEntry(await req.json().catch(() => null));
    if (typeof e === "string") return fail(e, 400);
    const now = Date.now();
    await env.DB.prepare("UPDATE entries SET date = ?, time = ?, kind = ?, title = ?, note = ?, updated = ? WHERE id = ?")
      .bind(e.date, e.time, e.kind, e.title, e.note, now, row.id).run();
    return json({ id: row.id, ...e, author: s.n, mine: true, updated: now });
  }
  if (req.method === "DELETE") {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM reports WHERE entry_id = ?").bind(row.id),
      env.DB.prepare("DELETE FROM entries WHERE id = ?").bind(row.id),
    ]);
    return new Response(null, { status: 204, headers: CORS });
  }
  return fail("method", 405);
}
