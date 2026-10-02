import { useEffect } from "preact/hooks";
import { go } from "./router";

/**
 * Phones: swipe left / right anywhere on a tab's screen to move to the next / previous tab (Dnes, Rozvrh, ...).
 * Left alone: swipes that start in something that scrolls sideways (chip rows, day buttons, the week grid), in a
 * sheet or a form field, near the screen edges (Android's back gesture), and swipes a screen already used (the
 * timetable's day list marks the event with `bpSwiped` when it changed the day).
 */
export function TabSwipe({ paths, current }: { paths: string[]; current: string }) {
  useEffect(() => {
    const i = paths.indexOf(current);
    if (i < 0) return;
    let start: { x: number; y: number; t: number } | null = null;
    const skip = (el: EventTarget | null) => el instanceof Element &&
      !!el.closest(".chips.scroll, .tt-days-in, .wk-grid, .periods, .sheet-wrap, input, textarea, select, [data-noswipe], .scroll");
    const down = (e: TouchEvent) => {
      const p = e.touches[0];
      start = e.touches.length === 1 && !skip(e.target) && p.clientX > 24 && p.clientX < innerWidth - 24 ? { x: p.clientX, y: p.clientY, t: Date.now() } : null;
    };
    const up = (e: TouchEvent) => {
      const s = start; start = null;
      if (!s || (e as TouchEvent & { bpSwiped?: boolean }).bpSwiped) return;
      const p = e.changedTouches[0];
      const dx = p.clientX - s.x, dy = p.clientY - s.y;
      // A clear, quick sideways swipe, not a scroll.
      if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6 || Date.now() - s.t > 700) return;
      const to = paths[i + (dx < 0 ? 1 : -1)];
      if (!to) return;
      document.documentElement.dataset.swipe = dx < 0 ? "next" : "prev";
      setTimeout(() => { delete document.documentElement.dataset.swipe; }, 260);
      go(to, undefined, true);
    };
    addEventListener("touchstart", down, { passive: true });
    addEventListener("touchend", up, { passive: true });
    return () => { removeEventListener("touchstart", down); removeEventListener("touchend", up); };
  }, [paths.join(), current]);
  return null;
}
