import assert from "node:assert/strict";
import { applyOrder, mealKey, runOptimistic, undoLink } from "../src/lib/canteen-optimistic.ts";

const meal = (variant, ordered, extra = {}) => ({ date: "2026-11-19", variant, name: "x", allergens: [], ordered, canChange: true, onBurza: false, orderUrl: `u-${variant}`, orderType: ordered ? "delete" : "make", ...extra });
const days = () => [{ date: "2026-11-19", meals: [meal("Oběd 1", false), meal("Oběd 2", true)] }, { date: "2026-11-20", meals: [meal("Oběd 1", false)] }];
const t1 = { date: "2026-11-19", variant: "Oběd 1" };

// order: only the target changes, its stale link is dropped, input untouched
const d0 = days();
let r = applyOrder(d0, t1, "make");
assert.equal(r[0].meals[0].ordered, true); assert.equal(r[0].meals[0].orderUrl, undefined);
assert.equal(r[0].meals[1].ordered, true); assert.equal(r[1], d0[1]);
assert.equal(d0[0].meals[0].ordered, false, "no mutation");
// cancel
r = applyOrder(days(), { date: "2026-11-19", variant: "Oběd 2" }, "delete");
assert.equal(r[0].meals[1].ordered, false);
// reorder moves the order to the target
r = applyOrder(days(), t1, "reorder");
assert.deepEqual(r[0].meals.map((m) => m.ordered), [true, false]);

// undo links come from the fresh menu
const fresh = [{ date: "2026-11-19", meals: [meal("Oběd 1", true, { orderUrl: "del-1" }), meal("Oběd 2", false, { orderUrl: "re-2", orderType: "reorder" })] }];
assert.equal(undoLink(fresh, t1, "make"), "del-1");
assert.equal(undoLink(fresh, t1, "reorder", { date: "2026-11-19", variant: "Oběd 2" }), "re-2");
assert.equal(undoLink([{ date: "2026-11-19", meals: [meal("Oběd 1", false, { orderUrl: "mk-1" })] }], t1, "delete"), "mk-1");
assert.equal(undoLink([], t1, "make"), null);

// success: applied once, no rollback, lock released
{
  const locks = new Set(); const log = [];
  const res = await runOptimistic({ key: mealKey(t1), locks, apply: () => log.push("apply"), rollback: () => log.push("rollback"), call: async () => { log.push("call"); } });
  assert.deepEqual(res, { status: "ok" }); assert.deepEqual(log, ["apply", "call"]); assert.equal(locks.size, 0);
}
// server error: rolled back, error returned, lock released (retry possible)
{
  const locks = new Set(); const log = []; const boom = new Error("Nelze objednat");
  const res = await runOptimistic({ key: "k", locks, apply: () => log.push("apply"), rollback: () => log.push("rollback"), call: async () => { throw boom; } });
  assert.deepEqual(res, { status: "failed", error: boom }); assert.deepEqual(log, ["apply", "rollback"]); assert.equal(locks.size, 0);
}
// second tap while the first is in flight: ignored, the server is called once
{
  const locks = new Set(); let calls = 0, applies = 0; let release;
  const call = () => { calls++; return new Promise((ok) => { release = ok; }); };
  const first = runOptimistic({ key: "k", locks, apply: () => applies++, rollback() {}, call });
  const second = await runOptimistic({ key: "k", locks, apply: () => applies++, rollback() {}, call });
  assert.deepEqual(second, { status: "busy" });
  release(); assert.deepEqual(await first, { status: "ok" });
  assert.equal(calls, 1); assert.equal(applies, 1);
}
console.log("canteen-optimistic ok");
