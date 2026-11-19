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

// net.ts reads localStorage when loaded
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const { fold, normalizeSchoolUrl } = await import("../src/lib/schools.ts");

// normalizeSchoolUrl: scheme added, login/dashboard suffixes and trailing slashes dropped
assert.equal(normalizeSchoolUrl("bakalar.skola.cz/"), "https://bakalar.skola.cz");
assert.equal(normalizeSchoolUrl("  https://x.cz/bakaweb/login "), "https://x.cz/bakaweb");
assert.equal(normalizeSchoolUrl("https://x.cz/bakaweb/dashboard"), "https://x.cz/bakaweb");
assert.equal(normalizeSchoolUrl("https://x.cz/bakaweb/next/zkousky.aspx"), "https://x.cz/bakaweb");
assert.equal(normalizeSchoolUrl("http://x.cz:8080/Timetable/Public/Actual/Class/AB"), "http://x.cz:8080");
assert.equal(normalizeSchoolUrl("HTTPS://X.cz/bakaweb///"), "https://x.cz/bakaweb");
assert.throws(() => normalizeSchoolUrl("http://"), "invalid URL throws");

// fold: lowercase, no diacritics, trimmed (used for search)
assert.equal(fold("  Příbram "), "pribram");
assert.equal(fold("Ústí nad Labem"), "usti nad labem");
assert.equal(fold("ŘEPORYJE"), "reporyje");
assert.equal(fold(""), "");
assert.ok(fold("Český Těšín").includes(fold("tesin")));
console.log("schools ok");
