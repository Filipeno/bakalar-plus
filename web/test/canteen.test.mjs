// The lib imports siblings without ".ts" (Vite style) and uses TS syntax node cannot strip
// (parameter properties, import.meta.env), so a loader hook resolves them and transpiles .ts with the repo's Vite.
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

// canteen.ts reads localStorage when loaded; only its pure exports are tested here (the parsers need DOMParser)
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const { CanteenAuthError, guessCanteenUrl, cleanUrl } = await import("../src/lib/canteen.ts");

// cleanUrl: trims, drops trailing slashes, forces https, adds a scheme
assert.equal(cleanUrl("  https://jidelna.skola.cz/// "), "https://jidelna.skola.cz");
assert.equal(cleanUrl("http://jidelna.skola.cz/"), "https://jidelna.skola.cz");
assert.equal(cleanUrl("HTTP://x.cz"), "https://x.cz");
assert.equal(cleanUrl("jidelna.skola.cz"), "https://jidelna.skola.cz");
assert.equal(cleanUrl("https://x.cz/app/"), "https://x.cz/app");

// guessCanteenUrl: replaces the first host label with "jidelna"
assert.equal(guessCanteenUrl("https://bakalar.trebesin.cz"), "https://jidelna.trebesin.cz");
assert.equal(guessCanteenUrl("https://bakalari.gym.skola.cz/bakaweb"), "https://jidelna.gym.skola.cz");
assert.equal(guessCanteenUrl("https://skola.cz"), "https://jidelna.skola.cz");
assert.equal(guessCanteenUrl("not a url"), "");
assert.equal(guessCanteenUrl(""), "");

// CanteenAuthError
const e = new CanteenAuthError();
assert.ok(e instanceof Error);
assert.equal(e.message, "canteen login needed");
console.log("canteen ok");
