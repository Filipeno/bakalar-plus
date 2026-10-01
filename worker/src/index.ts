// Bakaláři+ Worker: serves the web app, relays requests to schools that block browsers (no CORS), stores the
// shared class calendars, and sends Web Push notifications (push.ts, checked by a cron trigger).
//
// Passwords never reach it. The relay forwards and forgets; /cal/session uses a short-lived access token once to
// ask the school "who is this and which class". Only users who turn on web notifications leave a Bakaláři refresh
// token here, encrypted (TOKEN_KEY), and "delete my data" (DELETE /me) removes it.

import { CORS, fail, identify, json, noContent, readSession, schoolBase, schoolFetch, signSession, type Env, type Session } from "./util";
import { deleteMe, pushApi, runChecks } from "./push";

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return noContent();
    try {
      if (url.pathname === "/relay") return await relay(req, url, env, ctx);
      if (url.pathname.startsWith("/cal/")) return await calendar(req, url, env);
      if (url.pathname.startsWith("/push/")) return await pushApi(req, url, env);
      if (url.pathname === "/me" && req.method === "DELETE") return await deleteMe(req, env);
    } catch (e) {
      console.error(e);
      return fail("server error", 500);
    }
    return env.ASSETS.fetch(req);
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runChecks(env).then((r) => r.checked && console.log(`push checks: ${r.checked} users, ${r.failed} failed`)));
  },
};

// ---------------- relay ----------------

const DIRECTORY_HOST = "sluzby.bakalari.cz";
// Only Bakaláři's own paths, optionally under a sub-folder like /bakaweb.
const SCHOOL_PATH = /^(\/[\w.-]+)?\/(api(\/.*)?|Timetable\/Public(\/.*)?)$/i;

/** Is `origin`+`prefix` a real Bakaláři server? Asks its /api (answers with ApiVersion); cached for a day. */
async function isBakalari(env: Env, base: string, ctx: ExecutionContext): Promise<boolean> {
  const cache = caches.default;
  const key = new Request(`https://bp-cache.invalid/is-bakalari?u=${encodeURIComponent(base)}`);
  const hit = await cache.match(key);
  if (hit) return (await hit.text()) === "1";
  let ok = false;
  try {
    const r = await schoolFetch(env, `${base}/api`, { headers: { Accept: "application/json" }, redirect: "manual" });
    ok = r.status === 200 && /"ApiVersion"/i.test(await r.text());
  } catch { ok = false; }
  ctx.waitUntil(cache.put(key, new Response(ok ? "1" : "0", { headers: { "Cache-Control": `max-age=${ok ? 86400 : 600}` } })));
  return ok;
}

async function relay(req: Request, url: URL, env: Env, ctx: ExecutionContext): Promise<Response> {
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
    if (!(await isBakalari(env, base, ctx))) return denied("not a Bakaláři server");
  }
  if (!["GET", "POST", "PUT"].includes(req.method)) return denied("method");

  const headers = new Headers({ "User-Agent": "BakalariPlus/1.0 (+https://github.com/Filipeno/bakalar-plus)" });
  for (const h of ["authorization", "content-type", "accept"]) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  const body = req.method === "GET" ? undefined : await req.arrayBuffer();
  if (body && body.byteLength > 64 * 1024) return denied("too big");
  const r = target.hostname === DIRECTORY_HOST
    ? await fetch(target.toString(), { method: req.method, headers, body, redirect: "manual" })
    : await schoolFetch(env, target.toString(), { method: req.method, headers, body, redirect: "manual" });
  const out = new Headers({ ...CORS, "x-relay": "ok", "Cache-Control": "no-store" });
  out.set("Content-Type", r.headers.get("content-type") ?? "text/plain");
  return new Response(r.body, { status: r.status, headers: out });
}

// ---------------- shared class calendar ----------------

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
    const base = schoolBase(b?.school ?? "");
    if (!base || !b?.token) return fail("bad request", 400);
    // Ask the school who this is. A fake server could claim any class, but only of its own "school":
    // the class key includes the school address.
    const who = await identify(env, base, b.token);
    if ("error" in who) return fail(who.error, who.status);
    if (!who.hasClass) return fail("no class", 403);
    return json({ token: await signSession(env, who.s), classLabel: who.s.c, exp: who.s.exp });
  }

  const s = await readSession(env, req);
  if (!s) return fail("unauthorized", 401);
  if (url.pathname.startsWith("/cal/cabinets")) return await cabinets(req, url, env, s);
  if (!s.k) return fail("no class", 403);

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
    return noContent();
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
    return noContent();
  }
  return fail("method", 405);
}

// ---------------- teachers' cabinets ----------------
// Bakaláři doesn't publish where a teacher's cabinet (staff room) is, so students of the school fill it in for everyone.

const MAX_CABINET_EDITS = 60;

async function cabinets(req: Request, url: URL, env: Env, s: Session): Promise<Response> {
  if (!s.sk) return fail("unauthorized", 401);   // a session from before cabinets: the app gets a new one and retries
  if (url.pathname === "/cal/cabinets" && req.method === "GET") {
    const [cab, con] = await env.DB.batch([
      env.DB.prepare("SELECT teacher, room, author_name, updated FROM cabinets WHERE school_key = ?").bind(s.sk),
      env.DB.prepare("SELECT teacher, hours FROM consultations WHERE school_key = ?").bind(s.sk),
    ]);
    const out: Record<string, { room: string; by: string; updated: number; hours?: string }> = {};
    for (const r of cab.results as any[]) out[r.teacher] = { room: r.room, by: r.author_name, updated: r.updated };
    for (const r of con.results as any[]) out[r.teacher] = { ...(out[r.teacher] ?? { room: "", by: "", updated: 0 }), hours: r.hours };
    return json({ cabinets: out });
  }
  const m = /^\/cal\/cabinets\/([^/]{1,120})$/.exec(url.pathname);
  if (!m || req.method !== "PUT") return fail("not found", 404);
  let teacher: string;
  try { teacher = decodeURIComponent(m[1]).trim(); } catch { return fail("bad teacher", 400); }
  const b = (await req.json().catch(() => null)) as { room?: string } | null;
  const room = String(b?.room ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (!teacher || teacher.length > 40) return fail("bad teacher", 400);
  const since = Date.now() - 86400_000;
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM cabinets WHERE author_hash = ? AND updated > ?").bind(s.u, since).first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_CABINET_EDITS) return fail("too many edits today", 429);
  const now = Date.now();
  if (!room) await env.DB.prepare("DELETE FROM cabinets WHERE school_key = ? AND teacher = ?").bind(s.sk, teacher).run();
  else await env.DB.prepare(
    "INSERT INTO cabinets (school_key, teacher, room, author_hash, author_name, updated) VALUES (?, ?, ?, ?, ?, ?) " +
    "ON CONFLICT (school_key, teacher) DO UPDATE SET room = excluded.room, author_hash = excluded.author_hash, author_name = excluded.author_name, updated = excluded.updated",
  ).bind(s.sk, teacher, room, s.u, s.n, now).run();
  return json({ room, by: s.n, updated: now });
}
