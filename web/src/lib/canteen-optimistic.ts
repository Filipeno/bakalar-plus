// Instant order / cancel in the canteen: the list changes at once, the server call runs in the background,
// and a failed call puts the list back. One meal can only have one action in flight, so a fast second tap
// can never order twice.

import type { MenuDay } from "./canteen";

export type OrderKind = "make" | "reorder" | "delete";
export interface MealRef { date: string; variant: string }

export const mealKey = (m: MealRef) => `${m.date}|${m.variant}`;

/** The list as it will look once the action goes through. Links are dropped until the next fetch brings fresh ones. */
export function applyOrder(days: MenuDay[], target: MealRef, kind: OrderKind): MenuDay[] {
  return days.map((d) => d.date !== target.date ? d : {
    ...d,
    meals: d.meals.map((m) => {
      if (m.variant === target.variant) return { ...m, ordered: kind !== "delete", onBurza: false, orderUrl: undefined, orderType: undefined };
      return kind === "reorder" && m.ordered ? { ...m, ordered: false, onBurza: false, orderUrl: undefined, orderType: undefined } : m;
    }),
  });
}

/** Link that reverses an action, read from a fresh menu (the old links are single-use). */
export function undoLink(fresh: MenuDay[], target: MealRef, kind: OrderKind, previous?: MealRef): string | null {
  const day = fresh.find((d) => d.date === target.date);
  if (!day) return null;
  if (kind === "delete") return day.meals.find((m) => m.variant === target.variant && !m.ordered)?.orderUrl ?? null;
  if (previous && kind === "reorder") return day.meals.find((m) => m.variant === previous.variant && !m.ordered)?.orderUrl ?? null;
  return day.meals.find((m) => m.variant === target.variant && m.ordered && m.orderType === "delete")?.orderUrl ?? null;
}

export type RunResult = { status: "busy" } | { status: "ok" } | { status: "failed"; error: unknown };

/** Apply now, call the server, roll back on failure. `locks` holds the keys that are in flight. */
export async function runOptimistic(o: {
  key: string; locks: Set<string>; apply: () => void; rollback: () => void; call: () => Promise<void>;
}): Promise<RunResult> {
  if (o.locks.has(o.key)) return { status: "busy" };
  o.locks.add(o.key);
  o.apply();
  try {
    await o.call();
    return { status: "ok" };
  } catch (error) {
    o.rollback();
    return { status: "failed", error };
  } finally {
    o.locks.delete(o.key);
  }
}
