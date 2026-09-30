import { native } from "./native";

export interface HttpRequest {
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: string;
}
export interface HttpResponse { status: number; text: string }

/** Where the Worker lives (relay + shared calendar). Empty = same origin (the web app is served by the Worker). */
export const CLOUD_URL: string = (import.meta.env.VITE_CLOUD_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export class NetError extends Error {
  constructor(message: string, public status = 0, public code = "net") { super(message); }
}

// Origins that refused a direct browser request (no CORS headers): use the relay for them from then on.
const RELAYED_KEY = "bp.relayed";
const relayed = new Set<string>(JSON.parse(localStorage.getItem(RELAYED_KEY) || "[]"));

/**
 * Plain HTTP to a school's Bakaláři server. Android sends it natively (no CORS there). In a browser most
 * schools answer directly (their server sends CORS headers); the few that don't go through the Worker's
 * /relay, which only forwards to schools in the official Bakaláři directory.
 */
export async function http(req: HttpRequest): Promise<HttpResponse> {
  if (native) {
    try {
      return await native.call<HttpResponse>("http", req);
    } catch (e) {
      throw new NetError((e as Error).message || "offline", 0, "offline");
    }
  }
  const origin = new URL(req.url).origin;
  if (!relayed.has(origin)) {
    try {
      const r = await fetch(req.url, { method: req.method ?? "GET", headers: req.headers, body: req.body, credentials: "omit" });
      return { status: r.status, text: await r.text() };
    } catch {
      if (!navigator.onLine) throw new NetError("offline", 0, "offline");
      // Blocked by CORS (or the school is down): try the relay, and remember it only if the relay works.
    }
  }
  const res = await viaRelay(req);
  if (!relayed.has(origin) && res.status !== 502) {
    relayed.add(origin);
    localStorage.setItem(RELAYED_KEY, JSON.stringify([...relayed]));
  }
  return res;
}

export const usesRelay = (school: string) => !native && relayed.has(new URL(school).origin);

async function viaRelay(req: HttpRequest): Promise<HttpResponse> {
  let r: Response;
  try {
    r = await fetch(`${CLOUD_URL}/relay?u=${encodeURIComponent(req.url)}`, {
      method: req.method ?? "GET",
      headers: req.headers,
      body: req.body,
    });
  } catch {
    throw new NetError("offline", 0, "offline");
  }
  if (r.status === 403 && r.headers.get("x-relay") === "denied") throw new NetError("school not allowed", 403, "relay");
  return { status: r.status, text: await r.text() };
}

export async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const r = await http({ url, headers: { Accept: "application/json", ...headers } });
  if (r.status !== 200) throw new NetError(`HTTP ${r.status}`, r.status, "http");
  return JSON.parse(r.text) as T;
}
