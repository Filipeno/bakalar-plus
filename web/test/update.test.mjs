// The lib imports siblings without ".ts" (Vite style) and uses TS syntax node cannot strip,
// so a loader hook resolves them and transpiles .ts with the repo's Vite.
import { register } from "node:module";
import assert from "node:assert/strict";
const hook = `
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const { transformWithOxc } = await import(${JSON.stringify(import.meta.resolve("vite"))});
export async function resolve(s, c, n) {
  try { return await n(s, c); }
  catch (e) { if (s.startsWith(".") && !s.endsWith(".ts")) return n(s + ".ts", c); throw e; }
}
export async function load(url, c, n) {
  if (!url.endsWith(".ts")) return n(url, c);
  const f = fileURLToPath(url);
  const r = await transformWithOxc(readFileSync(f, "utf8"), f, { lang: "ts" });
  return { format: "module", source: "import.meta.env ??= {}; " + r.code, shortCircuit: true };
}`;
register("data:text/javascript," + encodeURIComponent(hook));

// update.ts only works inside the Android app: fake the BPNative bridge (native.ts reads window.BPNative on load).
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const listeners = {};
globalThis.document = { visibilityState: "visible", addEventListener: (t, f) => { listeners[t] = f; } };
globalThis.window = globalThis;
const calls = [];
let reply = () => ({ ok: true, payload: "null" }); // set per test: (method, args) => { ok, payload }
window.BPNative = {
  call(id, method, argsJson) {
    const args = JSON.parse(argsJson);
    calls.push({ method, args });
    const r = reply(method, args);
    setTimeout(() => window.__bpResolve(id, r.ok, r.payload), 0);
  },
  sync: () => "",
};

const { update, updating, checkForUpdate, promptKey, wasPrompted, markPrompted, installUpdate } = await import("../src/lib/update.ts");
const info = { current: "1.0.0", latest: "1.1.0", newer: true, url: "https://example.invalid/app.apk", sha256: "ab12", notes: "x" };

// checkForUpdate(force): asks the bridge, stores the time, publishes a newer version
reply = () => ({ ok: true, payload: JSON.stringify(info) });
assert.deepEqual(await checkForUpdate(true), info);
assert.equal(calls.at(-1).method, "updateCheck");
assert.deepEqual(update.value, info, "newer version is published");
assert.ok(Math.abs(Number(localStorage.getItem("bp.updateChecked")) - Date.now()) < 5000, "check time stored");

// not forced and checked < 6 h ago: no bridge call, cached value returned
const n = calls.length;
assert.deepEqual(await checkForUpdate(), info);
assert.equal(calls.length, n, "throttled: bridge not called");

// not forced but last check > 6 h ago: asks again; not newer -> update cleared, info still returned
localStorage.setItem("bp.updateChecked", String(Date.now() - 7 * 3600_000));
reply = () => ({ ok: true, payload: JSON.stringify({ ...info, latest: "1.0.0", newer: false }) });
assert.equal((await checkForUpdate()).newer, false);
assert.equal(calls.length, n + 1);
assert.equal(update.value, null, "same version -> nothing to offer");

// bridge error -> null, state kept
update.value = info;
reply = () => ({ ok: false, payload: JSON.stringify({ message: "offline", code: "net" }) });
assert.equal(await checkForUpdate(true), null);
assert.deepEqual(update.value, info);

// coming back to the foreground re-checks once the 6 h passed
assert.equal(typeof listeners.visibilitychange, "function", "visibility listener registered");
localStorage.setItem("bp.updateChecked", "0");
reply = () => ({ ok: true, payload: JSON.stringify(info) });
const before = calls.length;
listeners.visibilitychange();
await new Promise((r) => setTimeout(r, 10));
assert.equal(calls.length, before + 1, "foreground triggers a check");

// startup prompt: once per version and day
mem.delete("bp.updatePrompted");
assert.equal(promptKey(info), `1.1.0:${new Date().toDateString()}`);
assert.equal(wasPrompted(info), false);
markPrompted(info);
assert.equal(wasPrompted(info), true);
assert.equal(wasPrompted({ ...info, latest: "1.2.0" }), false, "a newer version prompts again");
localStorage.setItem("bp.updatePrompted", `1.1.0:${new Date(Date.now() - 86400_000).toDateString()}`);
assert.equal(wasPrompted(info), false, "yesterday's 'later' expires");

// installUpdate: nothing to install -> no call
update.value = null;
updating.value = "idle";
const k = calls.length;
await installUpdate();
assert.equal(calls.length, k);
assert.equal(updating.value, "idle");

// install passes url + sha256; maps the result to the state
update.value = info;
reply = () => ({ ok: true, payload: JSON.stringify("permission") });
await installUpdate();
assert.deepEqual(calls.at(-1), { method: "updateInstall", args: { url: info.url, sha256: info.sha256 } });
assert.equal(updating.value, "permission", "needs 'install unknown apps' permission");
reply = () => ({ ok: true, payload: JSON.stringify("ok") });
await installUpdate();
assert.equal(updating.value, "idle");
reply = () => ({ ok: false, payload: "boom" });
await installUpdate();
assert.equal(updating.value, "error");
console.log("update ok");
