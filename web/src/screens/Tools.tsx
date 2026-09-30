import { useEffect, useMemo, useState } from "preact/hooks";
import type { Day, Hour, Lesson, Target, Term, Week } from "../lib/model";
import { dayFor, dowOf, hhmm, liveLessons, nowMin, targetKey, toMin, today } from "../lib/model";
import { dayShort, fmtDate, t } from "../lib/i18n";
import { loadWeek, useDirectory, weekCacheKey } from "../lib/data";
import { patchSettings, readCache, settings, writeCache } from "../lib/store";
import { Icon } from "../ui/icons";
import { Empty, ErrorBox, Page, Segmented, Spinner } from "../ui/kit";
import { KIND_ICON, TargetPicker } from "../ui/picker";
import { LessonSheet } from "../ui/timetable";
import { go, isTab } from "../ui/router";

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
  const [dowSel, setDow] = useState<number | null>(null);
  const td = dowOf(today());
  const dow = dowSel ?? (dows.includes(td) ? td : dows.find((d) => d > td) ?? dows[0]);
  const remove = (tg: Target) => patchSettings({ compare: targets.filter((x) => targetKey(x) !== targetKey(tg)) });

  const days = list.map((w) => w?.days.find((d) => d.dow === dow));
  const date = days.find((d) => d?.date)?.date;
  const spans = days.map((d) => { const ls = d ? liveLessons(d) : []; return ls.length && !d!.off ? { from: ls[0].begin, to: ls[ls.length - 1].end } : null; });
  const starts = spans.filter(Boolean).map((s) => toMin(s!.from)), ends = spans.filter(Boolean).map((s) => toMin(s!.to));
  const common = hours.filter((h) => starts.length && toMin(h.begin) >= Math.min(...starts) && toMin(h.end) <= Math.max(...ends) && days.every((d) => !busyAt(d, h)));
  const offName = days.length && days.every((d) => !d || d.off) ? days.find((d) => d?.off)?.off : undefined;

  return (
    <Page title={t("compare")} backable={!isTab("/compare")}>
      <p class="hint" style={{ fontSize: "13px", marginBottom: "10px" }}>{t("compareHint")}</p>
      <div class="chips">
        {targets.map((tg) => (
          <span class="chip on">
            {tg.name}
            <button class="chip-x" onClick={() => remove(tg)} aria-label={t("delete")}><Icon name="x" size={14} /></button>
          </span>
        ))}
        <button class="chip" onClick={() => setPicker(true)}><Icon name="plus" size={14} />{t("addToCompare")}</button>
      </div>
      {targets.length === 0 && <Empty icon="users-three" text={t("compareHint")} />}
      {targets.length > 0 && (
        <div style={{ margin: "14px 0 10px" }}>
          <Segmented<Term> value={term} onChange={setTerm} options={[
            { v: "actual", label: t("thisWeek") }, { v: "next", label: t("nextWeek") }, { v: "permanent", label: t("permanent") },
          ]} />
        </div>
      )}
      {ready.length > 0 && (
        <div class="tt-days-in" style={{ marginBottom: "12px" }}>
          {dows.map((d) => {
            const iso = ready[0].days.find((x) => x.dow === d)?.date;
            return (
              <button class={`day-btn ${d === dow ? "on" : ""} ${iso === today() ? "today" : ""}`} onClick={() => setDow(d)}>
                {dayShort(d)}{iso && <small>{Number(iso.slice(8))}.{Number(iso.slice(5, 7))}.</small>}
              </button>
            );
          })}
        </div>
      )}
      {busy && <div class="center-box"><Spinner /></div>}
      {error != null && <ErrorBox error={error} />}

      {ready.length > 0 && offName && <div class="day-note"><Icon name="star" size={18} />{date ? `${fmtDate(date, true)} · ` : ""}{offName}</div>}
      {ready.length > 0 && !offName && (
        <>
          <div class="stack tight">
            {hours.map((h) => {
              const all = common.includes(h);
              return (
                <div class={`cmp-row ${all ? "all" : ""}`}>
                  <span class="cmp-when"><b>{h.caption}.</b> {hhmm(h.begin)}</span>
                  <span class="cmp-cells">
                    {targets.map((tg, i) => {
                      const free = !busyAt(days[i], h);
                      return <span class={free ? "free" : ""}>{tg.name} {free ? t("freeLow") : t("inClass")}</span>;
                    })}
                  </span>
                  <span class="cmp-all">{all ? t("allFree") : ""}</span>
                </div>
              );
            })}
          </div>
          <div class="cmp-sum">
            <div><b>{t("commonFree")}:</b> {common.length ? common.map((h) => `${h.caption}. (${hhmm(h.begin)}–${hhmm(h.end)})`).join(", ") : t("nothingInCommon")}</div>
            <div>{t("schoolEnds")}: {targets.map((tg, i) => `${tg.name} ${spans[i] ? hhmm(spans[i]!.to) : t("free")}`).join(" · ")}</div>
          </div>
        </>
      )}
      <TargetPicker open={picker} onClose={() => setPicker(false)} kinds={["class", "teacher"]} title={t("addToCompare")}
        onPick={(x) => x !== "my" && !targets.some((y) => targetKey(y) === targetKey(x)) && patchSettings({ compare: [...targets, x] })} />
    </Page>
  );
}

// ---------------- where is X / free rooms ----------------

function ToolTabs({ on }: { on: "where" | "rooms" }) {
  return (
    <div style={{ marginBottom: "12px" }}>
      <Segmented value={on} onChange={(v) => go(v === "where" ? "/where" : "/rooms", undefined, true)}
        options={[{ v: "where", label: t("whereNow") }, { v: "rooms", label: t("freeRooms") }]} />
    </div>
  );
}

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
  const [who, setWho] = useState<string | null>(null);
  const [when, setWhen] = useState<"now" | string>("now");   // "now" or an hour's begin time
  const targets = useMemo(() => (extra && !favs.some((f) => targetKey(f) === targetKey(extra)) ? [extra, ...favs] : favs), [extra, favs]);
  const { weeks } = useWeeks(targets, "actual");
  const td = today();
  const min = when === "now" ? nowMin() : toMin(when) + 1;
  const hours = periodsOf([...weeks.values()]);
  const tg = targets.find((x) => targetKey(x) === who) ?? targets[0];
  const w = tg ? weeks.get(targetKey(tg)) : undefined;
  const { now, next } = statusAt(w, td, min);
  const hr = hours.find((h) => min >= toMin(h.begin) && min < toMin(h.end));
  const kicker = when === "now" ? (hr ? t("rightNowPeriod", { p: hr.caption }) : t("rightNow")) : t("atPeriod", { p: hr?.caption ?? "", t: hhmm(when) });

  return (
    <Page title={t("whereNow")} backable={!isTab("/where")}>
      {settings.value.publicOk && <ToolTabs on="where" />}
      <div class="chips">
        {targets.map((x) => (
          <button class={`chip ${tg && targetKey(tg) === targetKey(x) ? "on" : ""}`} onClick={() => setWho(targetKey(x))}>
            <Icon name={KIND_ICON[x.kind]} size={14} />{x.name}
          </button>
        ))}
        <button class="chip" onClick={() => setPicker(true)}><Icon name="magnifying-glass" size={14} />{t("search")}</button>
      </div>
      {hours.length > 0 && (
        <div class="chips scroll" style={{ marginTop: "10px" }}>
          <button class={`chip ${when === "now" ? "on" : ""}`} onClick={() => setWhen("now")}>{t("rightNow")}</button>
          {hours.map((h) => <button class={`chip ${when === h.begin ? "on" : ""}`} onClick={() => setWhen(h.begin)}>{h.caption}. {hhmm(h.begin)}</button>)}
        </div>
      )}
      {!targets.length && <Empty icon="map-pin" text={t("whereHint")}><button class="btn" onClick={() => setPicker(true)}>{t("search")}</button></Empty>}
      {tg && (
        <div class="where-card">
          <div class="kicker">{kicker}</div>
          {!w ? <div style={{ marginTop: "8px" }}><Spinner small /></div> : now ? (
            <>
              <button class="where-room" onClick={() => setSel(now)}>{now.room ? t("roomX", { r: now.room }) : "—"}</button>
              <div class="detail">{[now.subjectName || now.subject, tg.kind === "teacher" ? now.group : now.teacherName, t("untilT", { t: hhmm(now.end) })].filter(Boolean).join(" · ")}</div>
            </>
          ) : (
            <>
              <div class="where-room">{dowOf(td) > 5 || !dayFor(w, td) ? t("noSchoolToday") : next ? t("free") : t("notInSchool")}</div>
              {next && <div class="detail">{t("nextRoomAt", { r: next.room || "—", t: hhmm(next.begin) })}</div>}
            </>
          )}
          <div class="btn-row">
            <button class="btn small line" onClick={() => go("/timetable", { k: tg.kind, id: tg.id, n: tg.name })}>
              <Icon name="calendar-blank" size={16} />{t("openTimetableBtn")}
            </button>
          </div>
        </div>
      )}
      <TargetPicker open={picker} onClose={() => setPicker(false)} kinds={["teacher", "class"]} title={t("whereNow")}
        onPick={(x) => { if (x !== "my") { setExtra(x); setWho(targetKey(x)); } }} />
      <LessonSheet lesson={sel} onClose={() => setSel(null)} />
    </Page>
  );
}

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
  const hr = hours.find((h) => h.begin === cur);

  const isFree = (r: Target) => {
    const w = weeks.get(targetKey(r));
    if (!w) return null;
    const d = dayFor(w, day);
    return !d || !liveLessons(d).some((l) => l.begin === cur);
  };
  const free = rooms.filter((r) => isFree(r) === true);

  return (
    <Page title={t("freeRooms")} backable={!isTab("/where")}>
      <ToolTabs on="rooms" />
      {!enabled && (
        <Empty icon="door-open" text={t("freeRoomsHint", { mb: Math.max(1, Math.round(rooms.length * 0.15)) })}>
          <button class="btn" disabled={!rooms.length} onClick={() => setGo(true)}>{t("download")}</button>
        </Empty>
      )}
      {enabled && busy && (
        <div style={{ margin: "8px 0 14px" }}>
          <div class="progress"><span style={{ width: `${(done / Math.max(1, rooms.length)) * 100}%` }} /></div>
          <div class="hint" style={{ marginTop: "6px" }}>{t("progress", { a: done, b: rooms.length })}</div>
        </div>
      )}
      {error != null && <ErrorBox error={error} />}
      {enabled && hours.length > 0 && (
        <>
          {days.length > 1 && (
            <div class="chips scroll" style={{ marginBottom: "10px" }}>
              {days.map((d) => <button class={`chip ${d === day ? "on" : ""}`} onClick={() => setDay(d)}>{fmtDate(d)}</button>)}
            </div>
          )}
          <div class="periods">
            {hours.map((h) => <button class={cur === h.begin ? "on" : ""} onClick={() => setWhen(h.begin)}>{h.caption}</button>)}
          </div>
          <div class="hint" style={{ margin: "10px 0 8px" }}>
            {t("freeRoomsCount", { p: hr?.caption ?? "", a: hr ? hhmm(hr.begin) : "", b: hr ? hhmm(hr.end) : "", n: free.length })}
          </div>
          <div class="room-grid">
            {rooms.map((r) => {
              const f = isFree(r);
              return (
                <button class={`room ${f === false ? "busy" : ""}`} onClick={() => go("/timetable", { k: "room", id: r.id, n: r.name })}>
                  <b>{r.name}</b>
                  <span>{f === null ? "…" : f ? t("freeLow") : t("occupied")}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </Page>
  );
}
