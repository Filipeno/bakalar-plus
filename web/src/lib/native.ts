// Bridge to the Android app (android/src/.../Bridge.java). In a browser `native` is null and the
// web fallbacks in net.ts / auth.ts are used instead.

interface RawBridge {
  call(id: number, method: string, argsJson: string): void;
  sync(method: string, argsJson: string): string;
}

declare global {
  interface Window {
    BPNative?: RawBridge;
    __bpResolve?: (id: number, ok: boolean, payload: string) => void;
  }
}

const raw = typeof window !== "undefined" ? window.BPNative : undefined;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
let nextId = 1;

if (raw) {
  window.__bpResolve = (id, ok, payload) => {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (ok) p.resolve(payload ? JSON.parse(payload) : null);
    else {
      const err = new Error(payload || "native error") as Error & { code?: string };
      try { const j = JSON.parse(payload); err.message = j.message; err.code = j.code; } catch { /* plain text */ }
      p.reject(err);
    }
  };
}

export const native = raw
  ? {
      /** Asynchronous call, answered by Java through window.__bpResolve. */
      call<T = any>(method: string, args: unknown = {}): Promise<T> {
        return new Promise((resolve, reject) => {
          const id = nextId++;
          pending.set(id, { resolve, reject });
          raw.call(id, method, JSON.stringify(args));
        });
      },
      /** Quick synchronous call (settings, state). */
      sync<T = any>(method: string, args: unknown = {}): T {
        const out = raw.sync(method, JSON.stringify(args));
        return out ? JSON.parse(out) : (null as T);
      },
    }
  : null;

export const isAndroid = native !== null;
