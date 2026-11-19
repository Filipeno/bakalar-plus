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

// store.ts (imported by data.ts) touches localStorage, matchMedia and document when loaded
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.addEventListener = () => {};
globalThis.document = { documentElement: { dataset: {} }, querySelector: () => null, addEventListener() {} };

const { sourceKey, weekCacheKey, findTeacher, findRoom, findClass } = await import("../src/lib/data.ts");
const { patchSettings, user } = await import("../src/lib/store.ts");
const { mondayOf, addDays, today } = await import("../src/lib/model.ts");

// sourceKey
assert.equal(sourceKey({ kind: "class", id: "AB" }), "pub:class:AB");
assert.equal(sourceKey({ kind: "teacher", id: "XY", name: "x" }), "pub:teacher:XY");
user.value = null;
patchSettings({ myTarget: { kind: "class", id: "3A", name: "3.A" } });
assert.equal(sourceKey({ kind: "my" }), "pub:class:3A", "signed out: my = chosen class");
user.value = { uid: "u42" };
assert.equal(sourceKey({ kind: "my" }), "my:u42", "signed in: my = the account");
user.value = null;

// weekCacheKey: per school, source and week
patchSettings({ school: { url: "https://s.cz", name: "S" } });
const src = { kind: "class", id: "AB", name: "AB" };
const mon = mondayOf(today());
assert.equal(weekCacheKey(src, "actual"), `wk:https://s.cz:pub:class:AB:${mon}`);
assert.equal(weekCacheKey(src, "next"), `wk:https://s.cz:pub:class:AB:${addDays(mon, 7)}`);
assert.equal(weekCacheKey(src, "permanent"), "wk:https://s.cz:pub:class:AB:perm");

// directory lookups
const dir = {
  classes: [{ kind: "class", id: "c1", name: "3.A" }, { kind: "class", id: "c2", name: "4.B" }],
  teachers: [{ kind: "teacher", id: "NOV", name: "NOVÁK Jan" }, { kind: "teacher", id: "SVO", name: "SVOBODA Petr" }],
  rooms: [{ kind: "room", id: "r1", name: "A101" }, { kind: "room", id: "r2", name: "B2 - tělocvična" }],
};
assert.equal(findTeacher(dir, "N", "Mgr. Jan Novák Ph.D.").id, "NOV");
assert.equal(findTeacher(dir, "SVO", ""), undefined, "empty name -> undefined");
assert.equal(findTeacher(undefined, "N", "Jan Novák"), undefined);
assert.equal(findTeacher(dir, "SVO", "Neznámý Učitel").id, "SVO", "falls back to the abbreviation");
assert.equal(findRoom(dir, "a101").id, "r1");
assert.equal(findRoom(dir, "B2").id, "r2", "first word of a longer room name");
assert.equal(findRoom(dir, "Z9"), undefined);
assert.equal(findClass(dir, "3.A, 4.B").id, "c1");
assert.equal(findClass(dir, "9.Z"), undefined);
console.log("data ok");
