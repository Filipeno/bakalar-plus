import { useEffect, useMemo, useState } from "preact/hooks";
import type { Day, Hour, Lesson, Target, Term, Week } from "../lib/model";
import { dayFor, dowOf, liveLessons, nowMin, targetKey, toMin, today } from "../lib/model";
import { dayShort, fmtDate, t } from "../lib/i18n";
import { loadWeek, useDirectory, weekCacheKey } from "../lib/data";
import { patchSettings, readCache, settings, writeCache } from "../lib/store";
import { Icon } from "../ui/icons";
import { Empty, ErrorBox, Page, Section, Segmented, Spinner, subjectColor } from "../ui/kit";
import { KIND_ICON, TargetPicker } from "../ui/picker";
import { LessonSheet } from "../ui/timetable";
import { go } from "../ui/router";

const TTL = 15 * 60_000;

/** Load many public timetables with a small concurrency limit, reusing the per-timetable cache. */
function useWeeks(targets: Target[], term: Term, enabled = true) {
  const [weeks, setWeeks] = useState<Map<string, Week>>(new Map());
  const [done, setDone] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const key = targets.map(targetKey).join(",") + term;

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const out = new Map<string, Week>();
    const todo: Target[] = [];
    for (const tg of targets) {
      const c = readCache<Week>(weekCacheKey(tg, term));
      if (c) out.set(targetKey(tg), c.v);
      if (!c || Date.now() - c.t > TTL) todo.push(tg);
    }
    setWeeks(new Map(out)); setDone(targets.length - todo.length); setError(null);
    if (!todo.length) return;
    setBusy(true);
    let i = 0;
    const worker = async () => {
      while (alive && i < todo.length) {
        const tg = todo[i++];
        try {
          const w = await loadWeek(tg, term);
          writeCache(weekCacheKey(tg, term), w);
          out.set(targetKey(tg), w);
        } catch (e) { setError(e); }
        if (alive) { setWeeks(new Map(out)); setDone((d) => d + 1); }
      }
    };
    Promise.all([worker(), worker(), worker(), worker()]).then(() => alive && setBusy(false));
    return () => { alive = false; };
  }, [key, enabled]);

  return { weeks, done, busy, error };
}

const periodsOf = (weeks: Week[]): Hour[] => {
  const used = new Set(weeks.flatMap((w) => w.days.flatMap((d) => d.lessons.map((l) => l.begin))));
  return (weeks.find((w) => w.hours.length)?.hours ?? []).filter((h) => used.has(h.begin));
};
const busyAt = (d: Day | undefined, h: Hour) => !!d && !d.off && liveLessons(d).some((l) => l.begin === h.begin);

// ---------------- common free time ----------------

export function Compare() {
  const targets = settings.value.compare;
  const [term, setTerm] = useState<Term>("actual");
  const [picker, setPicker] = useState(false);
  const { weeks, busy, error } = useWeeks(targets, term);
  const list = targets.map((tg) => weeks.get(targetKey(tg)));
  const ready = list.filter((w): w is Week => !!w);
  const hours = periodsOf(ready);
  const dows = [...new Set(ready.flatMap((w) => w.days.map((d) => d.dow)))].sort();
  const colors = targets.map((tg) => subjectColor(tg.name));
  const remove = (tg: Target) => patchSettings({ compare: targets.filter((x) => targetKey(x) !== targetKey(tg)) });

  return (
    <Page title={t("compare")} backable wide>
      <div class="chips wrap">
        {targets.map((tg, i) => (
          <span class="chip on" style={{ "--c": colors[i] } as any}>
            <i class="swatch" /> {tg.name}
            <button class="chip-x" onClick={() => remove(tg)} aria-label={t("delete")}><Icon name="close" size={14} /></button>
          </span>
        ))}
        <button class="chip add" onClick={() => setPicker(true)}><Icon name="plus" size={16} />{t("addToCompare")}</button>
      </div>
      {targets.length === 0 && <Empty icon="users" text={t("compareHint")} />}
      {targets.length > 0 && (
        <Segmented<Term> small value={term} onChange={setTerm} options={[
          { v: "actual", label: t("thisWeek") }, { v: "next", label: t("nextWeek") }, { v: "permanent", label: t("permanent") },
        ]} />
      )}
      {busy && <div class="center-box"><Spinner /></div>}
      {error != null && <ErrorBox error={error} />}

      {ready.length > 0 && dows.map((dow) => {
        const days = list.map((w) => w?.days.find((d) => d.dow === dow));
        const date = days.find((d) => d?.date)?.date;
        const spans = days.map((d) => { const ls = d ? liveLessons(d) : []; return ls.length && !d!.off ? { from: ls[0].begin, to: ls[ls.length - 1].end } : null; });
        const starts = spans.filter(Boolean).map((s) => toMin(s!.from)), ends = spans.filter(Boolean).map((s) => toMin(s!.to));
        const common = hours.filter((h) => starts.length && toMin(h.begin) >= Math.min(...starts) && toMin(h.end) <= Math.max(...ends) && days.every((d) => !busyAt(d, h)));
        const offName = days.every((d) => !d || d.off) ? days.find((d) => d?.off)?.off : undefined;
        if (offName) return <Section title={date ? fmtDate(date, true) : dayShort(dow)}><div class="day-off">{offName}</div></Section>;
        return (
          <Section title={date ? fmtDate(date, true) : dayShort(dow)}>
            <div class="cmp">
              <div class="cmp-grid" style={{ gridTemplateColumns: `repeat(${hours.length}, minmax(34px, 1fr))` }}>
                {hours.map((h) => {
                  const allFree = days.every((d) => !busyAt(d, h));
                  return (
                    <div class={`cmp-col ${allFree && common.includes(h) ? "free" : ""}`}>
                      <span class="cmp-h">{h.caption}</span>
                      {days.map((d, i) => <i class={busyAt(d, h) ? "busy" : ""} style={{ "--c": colors[i] } as any} />)}
                    </div>
                  );
                })}
              </div>
              <div class="cmp-sum">
                <div><b>{t("commonFree")}:</b> {common.length ? common.map((h) => `${h.caption}. (${h.begin}–${h.end})`).join(", ") : t("nothingInCommon")}</div>
                <div class="cmp-ends">
                  {targets.map((tg, i) => <span><i class="swatch" style={{ "--c": colors[i] } as any} />{tg.name}: {spans[i] ? `${spans[i]!.from}–${spans[i]!.to}` : t("free")}</span>)}
                </div>
              </div>
            </div>
          </Section>
        );
      })}
      <TargetPicker open={picker} onClose={() => setPicker(false)} kinds={["class", "teacher"]} title={t("addToCompare")}
        onPick={(x) => x !== "my" && !targets.some((y) => targetKey(y) === targetKey(x)) && patchSettings({ compare: [...targets, x] })} />
    </Page>
  );
}

// ---------------- where is X ----------------

function statusAt(week: Week | undefined, iso: string, min: number): { now?: Lesson; next?: Lesson } {
  const d = dayFor(week, iso);
  if (!d || d.off) return {};
  const ls = liveLessons(d);
  return { now: ls.find((l) => min >= toMin(l.begin) && min < toMin(l.end)), next: ls.find((l) => toMin(l.begin) > min) };
}

export function WhereNow() {
  const favs = settings.value.favourites.filter((f) => f.kind !== "room");
  const [extra, setExtra] = useState<Target | null>(null);
  const [picker, setPicker] = useState(false);
  const [sel, setSel] = useState<Lesson | null>(null);
  const [when, setWhen] = useState<"now" | string>("now");   // "now" or an hour's begin time
  const targets = useMemo(() => (extra && !favs.some((f) => targetKey(f) === targetKey(extra)) ? [extra, ...favs] : favs), [extra, favs]);
  const { weeks, busy } = useWeeks(targets, "actual");
  const td = today();
  const min = when === "now" ? nowMin() : toMin(when) + 1;
  const hours = periodsOf([...weeks.values()]);

  return (
    <Page title={t("whereNow")} backable>
      <button class="search-box as-btn" onClick={() => setPicker(true)}><Icon name="search" size={18} /><span>{t("searchTarget")}</span></button>
      <div class="chips scroll">
        <button class={`chip ${when === "now" ? "on" : ""}`} onClick={() => setWhen("now")}>{t("rightNow")}</button>
        {hours.map((h) => <button class={`chip ${when === h.begin ? "on" : ""}`} onClick={() => setWhen(h.begin)}>{h.caption}. {h.begin}</button>)}
      </div>
      {busy && <div class="center-box"><Spinner /></div>}
      {!targets.length && <Empty icon="pin" text={t("whereHint")} />}
      <div class="card-list">
        {targets.map((tg) => {
          const w = weeks.get(targetKey(tg));
          const { now, next } = statusAt(w, td, min);
          return (
            <div class="where">
              <button class="where-head" onClick={() => go("/timetable", { k: tg.kind, id: tg.id, n: tg.name })}>
                <span class="row-icon"><Icon name={KIND_ICON[tg.kind]} size={18} /></span>
                <b class="grow">{tg.name}</b>
                <Icon name="chev" size={16} class="muted" />
              </button>
              {!w ? <Spinner small /> : now ? (
                <button class="where-now" style={{ "--c": subjectColor(now.subject) } as any} onClick={() => setSel(now)}>
                  <span class="where-room">{now.room || "—"}</span>
                  <span class="grow"><b>{now.subjectName || now.subject}</b><span class="muted"> · {tg.kind === "teacher" ? now.group : now.teacherName} · {now.begin}–{now.end}</span></span>
                </button>
              ) : (
                <div class="where-free">{dowOf(td) > 5 || !dayFor(w, td) ? t("noSchoolToday") : next ? t("free") : t("notInSchool")}</div>
              )}
              {w && next && <div class="muted small">{t("nextLessonAt", { s: next.subject, t: next.begin, r: next.room || "—" })}</div>}
            </div>
          );
        })}
      </div>
      <TargetPicker open={picker} onClose={() => setPicker(false)} kinds={["teacher", "class"]} title={t("whereNow")} onPick={(x) => x !== "my" && setExtra(x)} />
      <LessonSheet lesson={sel} onClose={() => setSel(null)} />
    </Page>
  );
}

// ---------------- free rooms ----------------

export function FreeRooms() {
  const dir = useDirectory();
  const rooms = dir.data?.rooms ?? [];
  const cached = rooms.length > 0 && rooms.every((r) => readCache(weekCacheKey(r, "actual")));
  const [go_, setGo] = useState(false);
  const enabled = go_ || cached;
  const { weeks, done, busy, error } = useWeeks(rooms, "actual", enabled);
  const td = today();
  const [day, setDay] = useState(td);
  const [when, setWhen] = useState<string>("");
  const all = [...weeks.values()];
  const hours = periodsOf(all);
  const days = all[0]?.days.filter((d) => d.date && !d.off).map((d) => d.date!) ?? [];
  const cur = when || hours.find((h) => toMin(h.end) > nowMin())?.begin || hours[0]?.begin || "";

  const free = rooms.filter((r) => {
    const w = weeks.get(targetKey(r));
    if (!w) return false;
    const d = dayFor(w, day);
    return !d || !liveLessons(d).some((l) => l.begin === cur);
  });

  return (
    <Page title={t("freeRooms")} backable>
      {!enabled && (
        <Empty icon="door" text={t("freeRoomsHint", { mb: Math.max(1, Math.round(rooms.length * 0.15)) })}>
          <button class="btn" disabled={!rooms.length} onClick={() => setGo(true)}>{t("download")}</button>
        </Empty>
      )}
      {enabled && busy && (
        <div class="progress-box">
          <div class="progress"><span style={{ width: `${(done / Math.max(1, rooms.length)) * 100}%` }} /></div>
          <span class="muted small">{t("progress", { a: done, b: rooms.length })}</span>
        </div>
      )}
      {error != null && <ErrorBox error={error} />}
      {enabled && hours.length > 0 && (
        <>
          <div class="chips scroll">
            {days.map((d) => <button class={`chip ${d === day ? "on" : ""}`} onClick={() => setDay(d)}>{fmtDate(d)}</button>)}
          </div>
          <div class="chips scroll">
            {hours.map((h) => <button class={`chip ${cur === h.begin ? "on" : ""}`} onClick={() => setWhen(h.begin)}>{h.caption}. {h.begin}</button>)}
          </div>
          <Section title={t("freeAt", { p: `${hours.find((h) => h.begin === cur)?.caption ?? ""}. ${cur}` })}>
            <div class="room-grid">
              {free.map((r) => <button class="room" onClick={() => go("/timetable", { k: "room", id: r.id, n: r.name })}>{r.name}</button>)}
            </div>
          </Section>
        </>
      )}
    </Page>
  );
}
