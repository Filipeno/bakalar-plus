import { b64u, fromB64u } from "./webpush";

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  SESSION_SECRET: string;
  TOKEN_KEY: string;            // base64url, 32 bytes: encrypts stored Bakaláři refresh tokens
  VAPID_PUBLIC: string;         // base64url raw P-256 public key
  VAPID_PRIVATE_JWK: string;    // JSON Web Key of the private key
  VAPID_SUBJECT: string;        // "mailto:…" (push services contact this if something misbehaves)
  CHECK_INTERVAL_MIN?: string;  // how often each user is checked (default 10)
  CHECK_BATCH?: string;         // users per cron run (default 6; each costs ~5 subrequests)
  GATEWAY?: Fetcher;            // Workers VPC service -> gateway/gateway.py on a machine with a Czech connection
  GATEWAY_SECRET?: string;
  SELF?: Fetcher;               // service binding to this Worker: each user's check runs as its own invocation
}

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, X-BP-Cookie",
  "Access-Control-Max-Age": "86400",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS } });
export const fail = (error: string, status: number) => json({ error }, status);
export const noContent = () => new Response(null, { status: 204, headers: CORS });

const enc = new TextEncoder();

export async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export async function sha(s: string): Promise<string> {
  return b64u(await crypto.subtle.digest("SHA-256", enc.encode(s))).slice(0, 32);
}

// ---- sessions: one signed token format for the class calendar and push ----

/**
 * k = class key (hash of school + class), u = user key (hash of secret + school + Bakaláři user id), n = "Jan N.", c = class label,
 * sk = school key (hash of the school address; missing in sessions signed before teacher cabinets existed).
 */
export interface Session { k: string; u: string; n: string; c: string; exp: number; sk?: string }

export async function signSession(env: Env, s: Session): Promise<string> {
  const body = b64u(enc.encode(JSON.stringify(s)));
  return `${body}.${await hmac(env.SESSION_SECRET, body)}`;
}

export async function readSession(env: Env, req: Request): Promise<Session | null> {
  const m = /^Bearer (.+)\.(.+)$/.exec(req.headers.get("authorization") ?? "");
  if (!m || (await hmac(env.SESSION_SECRET, m[1])) !== m[2]) return null;
  const s = JSON.parse(new TextDecoder().decode(fromB64u(m[1]))) as Session;
  return s.exp > Date.now() / 1000 ? s : null;
}

/** "Novák Jan, 2.A" -> "Jan N." (Bakaláři writes surname first). */
export function shortName(full: string): string {
  const words = full.split(",")[0].trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return words[0] ?? "?";
  return `${words[words.length - 1]} ${words[0][0]}.`;
}

/** "https://x.cz/bakaweb/" -> "https://x.cz/bakaweb", or null if it isn't https. */
export function schoolBase(input: string): string | null {
  try {
    const u = new URL(input);
    return u.protocol === "https:" && !u.username ? `${u.origin}${u.pathname.replace(/\/+$/, "")}` : null;
  } catch { return null; }
}

// ---- reaching schools: some school firewalls drop Cloudflare's traffic; those go through the gateway ----

const GW_CACHE = (host: string) => new Request(`https://bp-cache.invalid/gateway?h=${encodeURIComponent(host)}`);

async function gatewayFetch(env: Env, url: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("X-BP-Gateway", env.GATEWAY_SECRET ?? "");
  return env.GATEWAY!.fetch(`http://127.0.0.1:8770/fetch?u=${encodeURIComponent(url)}`, {
    method: init.method, headers, body: init.body, signal: AbortSignal.timeout(30_000),
  });
}

/**
 * fetch() to a school. Direct first; if the school doesn't answer Cloudflare at all (timeout / connection
 * refused), use the gateway and remember that for a day, so later calls go straight there.
 */
export async function schoolFetch(env: Env, url: string, init: RequestInit = {}): Promise<Response> {
  const host = new URL(url).host;
  const hasGw = !!env.GATEWAY && !!env.GATEWAY_SECRET;
  if (hasGw && (await caches.default.match(GW_CACHE(host)))) return gatewayFetch(env, url, init);
  try {
    return await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(8_000) });
  } catch (e) {
    if (!hasGw) throw e;
    const r = await gatewayFetch(env, url, init);
    if (r.status !== 502) await caches.default.put(GW_CACHE(host), new Response("1", { headers: { "Cache-Control": "max-age=86400" } }));
    return r;
  }
}

/** Ask the school who owns this access token; build the session identity from it. */
export async function identify(env: Env, base: string, accessToken: string): Promise<{ s: Session; hasClass: boolean } | { error: string; status: number }> {
  const r = await schoolFetch(env, `${base}/api/3/user`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }, redirect: "manual",
  });
  if (r.status === 401) return { error: "expired", status: 401 };
  if (r.status !== 200) return { error: "school unreachable", status: 502 };
  const u = (await r.json()) as any;
  if (!u.UserUID) return { error: "no user", status: 403 };
  const cls = u.Class ?? u.Students?.[0]?.Class;
  const lower = base.toLowerCase();
  return {
    hasClass: !!cls?.Id,
    s: {
      k: cls?.Id ? await sha(`${lower}|${String(cls.Id).trim()}`) : "",
      u: await sha(`${env.SESSION_SECRET}|${lower}|${u.UserUID}`),
      n: shortName(String(u.FullName ?? "")),
      c: String(cls?.Abbrev ?? "").trim(),
      sk: await sha(lower),
      exp: Math.floor(Date.now() / 1000) + 30 * 86400,
    },
  };
}

// ---- refresh tokens at rest: AES-256-GCM with TOKEN_KEY (a Worker secret, never in the repo) ----

async function tokenKey(env: Env): Promise<CryptoKey> {
  const raw = fromB64u(env.TOKEN_KEY);
  if (raw.length !== 32) throw new Error("TOKEN_KEY must be 32 bytes (base64url)");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function sealToken(env: Env, plain: string, aad: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad) }, await tokenKey(env), enc.encode(plain));
  return `${b64u(iv)}.${b64u(ct)}`;
}

export async function openToken(env: Env, sealed: string, aad: string): Promise<string> {
  const [iv, ct] = sealed.split(".");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64u(iv), additionalData: enc.encode(aad) }, await tokenKey(env), fromB64u(ct));
  return new TextDecoder().decode(pt);
}
