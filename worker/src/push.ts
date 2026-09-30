// Web Push for the web/iPhone version: the server keeps its OWN Bakaláři sign-in (a refresh token, encrypted),
// checks grades and timetable changes on a schedule and pushes what's new. It never sees a password: the app
// signs in to the school a second time and hands over only that second refresh token.

import { fail, json, noContent, openToken, readSession, schoolBase, sealToken, signSession, identify, type Env } from "./util";
import { sendPush, type PushSubscriptionJSON, type Vapid } from "./webpush";

const vapid = (env: Env): Vapid => ({ publicKey: env.VAPID_PUBLIC, privateJwk: JSON.parse(env.VAPID_PRIVATE_JWK), subject: env.VAPID_SUBJECT });

interface Prefs { grades: boolean; changes: boolean }
interface UserRow { id: string; school: string; enc_refresh: string; status: string; prefs: string; lang: string; last_check: number; fails: number }

async function bakaToken(base: string, refresh: string): Promise<{ access: string; refresh: string } | "rejected"> {
  const r = await fetch(`${base}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: "ANDR", grant_type: "refresh_token", refresh_token: refresh }).toString(),
    signal: AbortSignal.timeout(15000),
  });
  if (r.status === 400 || r.status === 401) return "rejected";
  if (!r.ok) throw new Error(`login HTTP ${r.status}`);
  const t = (await r.json()) as any;
  return { access: t.access_token, refresh: t.refresh_token };
}

function cleanPrefs(p: any): Prefs {
  return { grades: p?.grades !== false, changes: p?.changes !== false };
}

// ---------------- HTTP API ----------------

export async function pushApi(req: Request, url: URL, env: Env): Promise<Response> {
  if (url.pathname === "/push/vapid") return json({ publicKey: env.VAPID_PUBLIC ?? "" });

  if (url.pathname === "/push/register" && req.method === "POST") {
    const b = (await req.json().catch(() => null)) as any;
    const base = schoolBase(b?.school ?? "");
    const sub = b?.subscription as PushSubscriptionJSON | undefined;
    if (!base || !b?.refreshToken || !sub?.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) return fail("bad request", 400);
    // Use the handed-over refresh token right away: proves it works and gives the server its own fresh pair.
    const t = await bakaToken(base, String(b.refreshToken));
    if (t === "rejected") return fail("expired", 401);
    const who = await identify(env, base, t.access);
    if ("error" in who) return fail(who.error, who.status);
    const u = who.s.u, now = Date.now();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO push_users (id, school, enc_refresh, status, prefs, lang, last_check, fails, created) VALUES (?, ?, ?, 'active', ?, ?, 0, 0, ?)
         ON CONFLICT(id) DO UPDATE SET school = excluded.school, enc_refresh = excluded.enc_refresh, status = 'active', prefs = excluded.prefs,
         lang = excluded.lang, last_check = 0, fails = 0`,
      ).bind(u, base, await sealToken(env, t.refresh, u), JSON.stringify(cleanPrefs(b.prefs)), b.lang === "en" ? "en" : "cs", now),
      env.DB.prepare(
        `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, created) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
      ).bind(sub.endpoint, u, sub.keys.p256dh, sub.keys.auth, now),
    ]);
    const s = { ...who.s, exp: Math.floor(now / 1000) + 365 * 86400 };
    return json({ token: await signSession(env, s), classLabel: s.c, exp: s.exp }, 201);
  }

  const s = await readSession(env, req);
  if (!s) return fail("unauthorized", 401);

  if (url.pathname === "/push/status" && req.method === "GET") {
    const row = await env.DB.prepare("SELECT status, prefs FROM push_users WHERE id = ?").bind(s.u).first<UserRow>();
    const subs = await env.DB.prepare("SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?").bind(s.u).first<{ n: number }>();
    return json(row ? { registered: true, status: row.status, prefs: JSON.parse(row.prefs), devices: subs?.n ?? 0 } : { registered: false });
  }
  if (url.pathname === "/push/prefs" && req.method === "POST") {
    const p = cleanPrefs(await req.json().catch(() => ({})));
    await env.DB.prepare("UPDATE push_users SET prefs = ? WHERE id = ?").bind(JSON.stringify(p), s.u).run();
    return json({ prefs: p });
  }
  if (url.pathname === "/push/unsubscribe" && req.method === "POST") {
    const b = (await req.json().catch(() => null)) as any;
    await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?").bind(String(b?.endpoint ?? ""), s.u).run();
    await dropIfNoDevices(env, s.u);
    return noContent();
  }
  if (url.pathname === "/push/test" && req.method === "POST") {
    const row = await env.DB.prepare("SELECT lang FROM push_users WHERE id = ?").bind(s.u).first<UserRow>();
    const sent = await notify(env, s.u, row?.lang === "en"
      ? { title: "Bakaláři+", body: "Notifications work 🎉", url: "/#/settings", tag: "test" }
      : { title: "Bakaláři+", body: "Upozornění fungují 🎉", url: "/#/settings", tag: "test" });
    return json({ sent });
  }
  return fail("not found", 404);
}

/** "Sign out and delete my data": push sign-in, devices, saved state, and my entries in the class calendar. */
export async function deleteMe(req: Request, env: Env): Promise<Response> {
  const s = await readSession(env, req);
  if (!s) return fail("unauthorized", 401);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM push_subscriptions WHERE user_id = ?").bind(s.u),
    env.DB.prepare("DELETE FROM push_state WHERE user_id = ?").bind(s.u),
    env.DB.prepare("DELETE FROM push_users WHERE id = ?").bind(s.u),
    env.DB.prepare("DELETE FROM reports WHERE user_hash = ? OR entry_id IN (SELECT id FROM entries WHERE author_hash = ?)").bind(s.u, s.u),
    env.DB.prepare("DELETE FROM entries WHERE author_hash = ?").bind(s.u),
  ]);
  return noContent();
}

async function dropIfNoDevices(env: Env, u: string) {
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?").bind(u).first<{ n: number }>();
  if ((n?.n ?? 0) === 0) {
    // Nobody to notify any more: forget the sign-in instead of keeping it around.
    await env.DB.batch([
      env.DB.prepare("DELETE FROM push_state WHERE user_id = ?").bind(u),
      env.DB.prepare("DELETE FROM push_users WHERE id = ?").bind(u),
    ]);
  }
}

/** Push to every device of a user; forget devices the push service says are gone. Returns how many got it. */
async function notify(env: Env, u: string, data: { title: string; body: string; url: string; tag: string }): Promise<number> {
  const { results } = await env.DB.prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?").bind(u).all<any>();
  let ok = 0;
  for (const r of results) {
    try {
      const status = await sendPush({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, data, vapid(env));
      if (status === 404 || status === 410) await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(r.endpoint).run();
      else if (status < 300) ok++;
      else console.warn(`push ${status} for ${new URL(r.endpoint).host}`);
    } catch (e) { console.warn("push failed", e); }
  }
  if (results.length) await dropIfNoDevices(env, u);
  return ok;
}

// ---------------- the check loop (cron) ----------------

const TEXT = {
  cs: {
    grade: "Nová známka", grades: "Nové známky", change: "Změna v rozvrhu", changes: "Změny v rozvrhu",
    relogin: "Přihlášení pro upozornění vypršelo", reloginBody: "Otevři Bakaláři+ → Nastavení a zapni upozornění znovu.",
    days: ["ne", "po", "út", "st", "čt", "pá", "so"], period: (n: string) => `${n}. hod`,
  },
  en: {
    grade: "New grade", grades: "New grades", change: "Timetable change", changes: "Timetable changes",
    relogin: "Notifications sign-in expired", reloginBody: "Open Bakaláři+ → Settings and turn notifications on again.",
    days: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], period: (n: string) => `period ${n}`,
  },
};

const iso = (d: Date) => d.toISOString().slice(0, 10);   // UTC date is fine for "is this change still ahead"
const pragueToday = () => new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 10);

async function bakaGet(base: string, access: string, path: string): Promise<any> {
  const r = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${access}`, Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${path} HTTP ${r.status}`);
  return r.json();
}

/** Grades as "id:mark" -> readable line. */
function marksOf(j: any): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of j?.Subjects ?? []) {
    for (const m of s.Marks ?? []) {
      const text = String(m.MarkText || m.PointsText || m.VerbalEvaluation || "?").trim();
      out.set(`${m.Id}:${text}`, `${text} · ${s.Subject?.Name ?? ""}${m.Caption ? ` – ${m.Caption}` : ""}`);
    }
  }
  return out;
}

/** Timetable changes from today on, as signature -> readable line. */
function changesOf(weeks: any[], lang: "cs" | "en", today: string): Map<string, string> {
  const T = TEXT[lang];
  const out = new Map<string, string>();
  for (const j of weeks) {
    const hours = new Map((j?.Hours ?? []).map((h: any) => [h.Id, String(h.Caption)]));
    const subj = new Map((j?.Subjects ?? []).map((s: any) => [String(s.Id).trim(), String(s.Abbrev).trim()]));
    for (const d of j?.Days ?? []) {
      const date = String(d.Date).slice(0, 10);
      if (date < today) continue;
      for (const a of d.Atoms ?? []) {
        if (!a.Change) continue;
        const text = String(a.Change.Description || a.Change.TypeName || a.Change.ChangeType || "").trim();
        const s = subj.get(String(a.SubjectId ?? "").trim()) || a.Change.ChangeSubject || "";
        const hour = hours.get(a.HourId) ?? "";
        const dt = new Date(`${date}T12:00:00Z`);
        const label = `${T.days[dt.getUTCDay()]} ${dt.getUTCDate()}. ${dt.getUTCMonth() + 1}.${hour ? ` ${T.period(String(hour))}` : ""}`;
        out.set(`${date}|${a.HourId}|${s}|${text}`, `${label}${s ? ` ${s}` : ""}: ${text}`);
      }
    }
  }
  return out;
}

const lines = (xs: string[], max = 4) => xs.slice(0, max).join("\n") + (xs.length > max ? `\n+${xs.length - max}` : "");

async function checkUser(env: Env, row: UserRow): Promise<void> {
  const lang = row.lang === "en" ? "en" : "cs";
  const T = TEXT[lang];
  const prefs = cleanPrefs(JSON.parse(row.prefs || "{}"));
  const refresh = await openToken(env, row.enc_refresh, row.id);
  const t = await bakaToken(row.school, refresh);
  if (t === "rejected") {
    await env.DB.prepare("UPDATE push_users SET status = 'relogin', last_check = ? WHERE id = ?").bind(Date.now(), row.id).run();
    await notify(env, row.id, { title: T.relogin, body: T.reloginBody, url: "/#/settings", tag: "relogin" });
    return;
  }
  // The refresh token rotates: save the new one before anything else can fail.
  await env.DB.prepare("UPDATE push_users SET enc_refresh = ? WHERE id = ?").bind(await sealToken(env, t.refresh, row.id), row.id).run();

  const today = pragueToday();
  const next = new Date(`${today}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 7);
  const [marks, cur, nxt] = await Promise.all([
    prefs.grades ? bakaGet(row.school, t.access, "/api/3/marks") : Promise.resolve(null),
    prefs.changes ? bakaGet(row.school, t.access, "/api/3/timetable/actual") : Promise.resolve(null),
    prefs.changes ? bakaGet(row.school, t.access, `/api/3/timetable/actual?date=${iso(next)}`) : Promise.resolve(null),
  ]);

  const st = await env.DB.prepare("SELECT marks, changes FROM push_state WHERE user_id = ?").bind(row.id).first<{ marks: string; changes: string }>();
  const oldMarks = new Set<string>(JSON.parse(st?.marks ?? "null") ?? []);
  const oldChanges = new Set<string>(JSON.parse(st?.changes ?? "null") ?? []);
  const nowMarks = marks ? marksOf(marks) : null;
  const nowChanges = cur ? changesOf([cur, nxt], lang, today) : null;

  // First look (or a newly enabled kind): only remember what exists, don't announce it.
  if (nowMarks && st?.marks) {
    const fresh = [...nowMarks].filter(([k]) => !oldMarks.has(k)).map(([, v]) => v);
    if (fresh.length) await notify(env, row.id, { title: fresh.length === 1 ? T.grade : T.grades, body: lines(fresh), url: "/#/grades", tag: `marks-${Date.now()}` });
  }
  if (nowChanges && st?.changes) {
    const fresh = [...nowChanges].filter(([k]) => !oldChanges.has(k)).map(([, v]) => v);
    if (fresh.length) await notify(env, row.id, { title: fresh.length === 1 ? T.change : T.changes, body: lines(fresh), url: "/#/today", tag: `tt-${Date.now()}` });
  }

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO push_state (user_id, marks, changes, updated) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET marks = excluded.marks, changes = excluded.changes, updated = excluded.updated`,
    ).bind(row.id,
      nowMarks ? JSON.stringify([...nowMarks.keys()]) : st?.marks ?? null,
      nowChanges ? JSON.stringify([...nowChanges.keys()]) : st?.changes ?? null, Date.now()),
    env.DB.prepare("UPDATE push_users SET last_check = ?, fails = 0 WHERE id = ?").bind(Date.now(), row.id),
  ]);
}

/**
 * One cron run: the users whose last check is oldest, a small batch at a time (Workers limit how many requests one
 * run may make), one after another with a short gap. One user's failure never stops the others.
 */
export async function runChecks(env: Env): Promise<{ checked: number; failed: number }> {
  if (!env.VAPID_PUBLIC || !env.TOKEN_KEY) return { checked: 0, failed: 0 };
  const every = Math.max(2, Number(env.CHECK_INTERVAL_MIN ?? 10)) * 60_000;
  const batch = Math.max(1, Number(env.CHECK_BATCH ?? 6));
  const { results } = await env.DB.prepare(
    "SELECT * FROM push_users WHERE status = 'active' AND last_check < ? ORDER BY last_check LIMIT ?",
  ).bind(Date.now() - every, batch).all<UserRow>();
  let failed = 0;
  for (const row of results) {
    try {
      await checkUser(env, row);
    } catch (e) {
      failed++;
      console.warn(`check failed (${new URL(row.school).host}):`, (e as Error).message);
      // Back off: a school that's down is retried later, not every run.
      await env.DB.prepare("UPDATE push_users SET last_check = ?, fails = fails + 1 WHERE id = ?").bind(Date.now(), row.id).run();
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return { checked: results.length, failed };
}
