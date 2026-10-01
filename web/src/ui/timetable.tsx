import type { Day, Hour, Lesson, TargetKind, Week } from "../lib/model";
import { byPeriod, hhmm, nowMin, toMin, today } from "../lib/model";
import { dayShort, fmtDate, fmtRelDay, t, type TKey } from "../lib/i18n";
import type { Homework } from "../lib/bakalari";
import { Icon } from "./icons";
import { Row, Sheet, subjectColor } from "./kit";
import { findClass, findRoom, findTeacher, useCabinets, useDirectory } from "../lib/data";
import { go } from "./router";
import { settings, user } from "../lib/store";
import { prefs } from "./prefs";

export const changeLabel = (k: string) => t(`change_${k}` as TKey);
const colorOf = (l: Lesson) => subjectColor(l.subject || l.subjectName || "?");

/** Which secondary fields to show: a class timetable shows teachers, a teacher's shows classes, etc. */
export function lessonMeta(l: Lesson, viewKind: TargetKind | "my"): string {
  const parts: string[] = [];
  if (l.room && viewKind !== "room") parts.push(l.room);
  if (l.teacher && viewKind !== "teacher") parts.push(l.teacherName || l.teacher);
  if (l.group) parts.push(l.group);
  return parts.join(" · ");
}

/** The open homework for this lesson's subject that is due next (on or after the lesson's day). */
export function lessonHomework(l: Lesson, date: string | null | undefined, hw: Homework[] | undefined): Homework | undefined {
  if (!hw || !l.subject || l.removed) return undefined;
  const from = date ?? today();
  const s = l.subject.trim().toLowerCase();
  return hw.filter((h) => !h.done && !h.closed && h.due >= from && h.subject.trim().toLowerCase() === s)
    .sort((a, b) => a.due.localeCompare(b.due))[0];
}

/** One-line note under a lesson: its homework, else its topic. */
export function lessonNote(l: Lesson, h?: Homework): string {
  if (l.removed) return "";
  if (h) return t("homeworkDue", { s: h.text.replace(/\s+/g, " ") });
  return l.theme ? t("topicLine", { x: l.theme }) : "";
}

// ---------------- Today: the whole day as a time rail ----------------

export function TimeRail({ day, hw, onLesson }: { day: Day; hw?: Homework[]; onLesson: (l: Lesson) => void }) {
  const periods = byPeriod(day);
  if (!periods.length) return null;
  const sc = prefs.value.density === "compact" ? 1.25 : 1.5;
  const first = toMin(periods[0].begin), last = Math.max(...periods.map((p) => toMin(p.end)));
  const start = Math.floor(first / 60) * 60;
  const labels: number[] = [];
  for (let m = start; m <= last; m += 60) labels.push(m);
  if (last % 60 && last - labels[labels.length - 1] >= 20) labels.push(last);
  const isToday = day.date === today();
  const nm = nowMin();
  const fmt = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;

  return (
    <div class="rail" style={{ height: `${(last - start) * sc + 10}px` }}>
      {labels.map((m) => <div class="rail-hour" style={{ top: `${(m - start) * sc}px` }}><span>{fmt(m)}</span></div>)}
      {periods.map((p) => {
        const b = toMin(p.begin), e = toMin(p.end);
        const state = !isToday ? "" : nm >= e ? "past" : nm >= b ? "live" : "";
        return (
          <div class="rail-item" style={{ top: `${(b - start) * sc}px`, height: `${(e - b) * sc}px` }}>
            {p.lessons.map((l) => {
              const note = lessonNote(l, lessonHomework(l, day.date, hw));
              const bare = l.removed && !l.subject && !l.subjectName;
              return (
                <button class={`rail-block ${state} ${l.removed ? "removed" : ""}`} style={{ "--c": colorOf(l) } as any} onClick={() => onLesson(l)}>
                  <span class="rb-top">
                    <span class="rb-name">{bare ? t("cancelled") : l.subjectName || l.subject || "—"}{l.change && <span class="tag">{changeLabel(l.change.kind)}</span>}</span>
                    {p.lessons.length === 1 && <span class="rb-time">{hhmm(p.begin)}–{hhmm(p.end)}</span>}
                  </span>
                  <span class="rb-meta">{p.lessons.length > 1 ? [hhmm(p.begin), lessonMeta(l, "my")].filter(Boolean).join(" · ") : lessonMeta(l, "my")}</span>
                  {note && <span class="rb-note"><span>{note}</span><Icon name="caret-right" size={11} /></span>}
                </button>
              );
            })}
          </div>
        );
      })}
      {isToday && nm >= start && nm <= last && (
        <div class="rail-now" style={{ top: `${(nm - start) * sc}px` }}><span>{fmt(nm)}</span></div>
      )}
    </div>
  );
}

// ---------------- Timetable: day list and week grid ----------------

export function DayList({ day, view, onLesson }: { day: Day | undefined; view: TargetKind | "my"; onLesson: (l: Lesson) => void }) {
  if (!day) return <div class="empty small"><p>{t("noLessons")}</p></div>;
  const periods = byPeriod(day);
  const isToday = day.date === today();
  const nm = nowMin();
  return (
    <div class="tt-list">
      {day.off && <div class="day-note"><Icon name="star" size={18} />{day.off}</div>}
      {day.note && <div class="day-note"><Icon name="info" size={18} />{day.note}</div>}
      {!periods.length && !day.off && <div class="empty small"><p>{t("noLessons")}</p></div>}
      {periods.map((p) => {
        const live = isToday && nm >= toMin(p.begin) && nm < toMin(p.end);
        return (
          <div class={`tt-row ${isToday && nm >= toMin(p.end) ? "past" : ""}`} key={p.key}>
            <span class="tt-time"><b>{p.hour}</b>{hhmm(p.begin)}<br />{hhmm(p.end)}</span>
            <span class="tt-lessons">
              {p.lessons.map((l) => {
                const bare = l.removed && !l.subject && !l.subjectName;
                return (
                  <button class={`tt-card ${l.removed ? "removed" : ""} ${live && !l.removed ? "live" : ""}`} style={{ "--c": colorOf(l) } as any} onClick={() => onLesson(l)}>
                    <span class="tt-head">
                      <span class="tt-name">{bare ? t("cancelled") : l.subjectName || l.subject || "—"}</span>
                      {l.change && <span class="tag">{changeLabel(l.change.kind)}</span>}
                    </span>
                    <span class="tt-meta">{lessonMeta(l, view)}</span>
                    {l.change?.text && l.change.text !== t("cancelled") && <span class="tt-change">{l.change.text}</span>}
                  </button>
                );
              })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function WeekGrid({ week, view, onLesson }: { week: Week; view: TargetKind | "my"; onLesson: (l: Lesson, d: Day) => void }) {
  const used = new Set(week.days.flatMap((d) => d.lessons.map((l) => l.begin)));
  const hours: Hour[] = week.hours.filter((h) => used.has(h.begin));
  const td = today();
  return (
    <>
      <div class="week-scroll">
        <div class="week" style={{ gridTemplateColumns: `30px repeat(${Math.max(1, hours.length)}, minmax(38px, 1fr))` }}>
          <div />
          {hours.map((h) => <div class="wk-h">{h.caption}<small>{hhmm(h.begin)}</small></div>)}
          {week.days.map((d) => (
            <>
              <div class={`wk-day ${d.date === td ? "today" : ""}`}>
                <span>{dayShort(d.dow)}</span>
                {d.date && <small>{Number(d.date.slice(8))}.{Number(d.date.slice(5, 7))}.</small>}
              </div>
              {d.off
                ? <div class="wk-off" style={{ gridColumn: `span ${Math.max(1, hours.length)}` }}>{d.off}</div>
                : hours.map((h) => (
                    <div class="wk-cell-wrap">
                      {d.lessons.filter((l) => l.begin === h.begin).map((l) => (
                        <button class={`wk-cell ${l.removed ? "removed" : l.change ? "chg" : ""}`} style={{ "--c": colorOf(l) } as any} onClick={() => onLesson(l, d)}>
                          {l.subject || "—"}
                          <small>{view === "room" ? l.group || l.teacher : view === "teacher" ? l.group : l.room}</small>
                        </button>
                      ))}
                    </div>
                  ))}
            </>
          ))}
        </div>
      </div>
      <div class="legend">{t("legend")}</div>
    </>
  );
}

// ---------------- lesson detail ----------------

export function LessonSheet({ lesson, day, hw, onClose }: { lesson: Lesson | null; day?: Day | null; hw?: Homework[]; onClose: () => void }) {
  const dir = useDirectory().data;
  const cabs = useCabinets().data;
  const l = lesson;
  const open = (target?: { kind: string; id: string; name?: string }) => {
    if (target) { onClose(); setTimeout(() => go("/timetable", { k: target.kind, id: target.id, n: target.name }), 50); }
  };
  const teacherT = l ? findTeacher(dir, l.teacher, l.teacherName) : undefined;
  const roomT = l ? findRoom(dir, l.room) : undefined;
  const cab = teacherT && cabs?.[teacherT.id]?.room ? cabs[teacherT.id] : undefined;
  const classT = l ? findClass(dir, l.group) : undefined;
  const canLink = settings.value.publicOk;
  const h = l ? lessonHomework(l, day?.date, hw) : undefined;
  const when = l ? [
    day?.date ? fmtDate(day.date, true) : day ? dayShort(day.dow) : "",
    l.hour ? t("period", { n: l.hour }) : "",
    `${hhmm(l.begin)}–${hhmm(l.end)}`,
    l.roomName || l.room, l.teacherName,
  ].filter(Boolean).join(" · ") : "";

  return (
    <Sheet open={!!l} onClose={onClose} title={l ? (l.subjectName || l.subject || t("cancelled")) : ""} sub={when}>
      {l && (
        <div>
          {l.change && (
            <div style={{ marginTop: "6px", fontSize: "12px", color: "var(--wn)" }}>
              {changeLabel(l.change.kind)}{l.change.text && l.change.text !== changeLabel(l.change.kind) ? ` · ${l.change.text}` : ""}
            </div>
          )}
          {l.theme && <><div class="sheet-label">{t("lessonTopic")}</div><div class="sheet-val">{l.theme}</div></>}
          {h && (
            <>
              <div class="sheet-label">{t("hwOne")}</div>
              <div class="sheet-val pre">{h.text}</div>
              <div class="hint" style={{ marginTop: "2px" }}>{t("due", { d: fmtRelDay(h.due, today()) })}{h.teacher ? ` · ${h.teacher}` : ""}</div>
            </>
          )}
          {l.group && !classT && <><div class="sheet-label">{t("group")}</div><div class="sheet-val">{l.group}</div></>}
          {canLink && (teacherT || roomT || classT) && (
            <div class="link-list">
              {teacherT && <Row icon="user" title={l.teacherName} sub={cab ? `${t("teacher")} · ${t("cabinetX", { r: cab.room })}` : t("teacher")} chevron onClick={() => open(teacherT)} />}
              {roomT && <Row icon="door" title={l.roomName || l.room} sub={t("room")} chevron onClick={() => open(roomT)} />}
              {classT && <Row icon="users" title={l.group} sub={t("group")} chevron onClick={() => open(classT)} />}
            </div>
          )}
          {h && user.value && (
            <div class="btn-row" style={{ marginTop: "18px" }}>
              <button class="btn" onClick={() => { onClose(); setTimeout(() => go("/homework"), 50); }}>{t("openHw")}</button>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
