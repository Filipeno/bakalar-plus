import type { Day, Hour, Lesson, TargetKind, Week } from "../lib/model";
import { byPeriod, hhmm, nowMin, toMin, today } from "../lib/model";
import { dayShort, fmtDate, t, type TKey } from "../lib/i18n";
import { Icon } from "./icons";
import { Sheet, subjectColor } from "./kit";
import { findClass, findRoom, findTeacher, useDirectory } from "../lib/data";
import { go } from "./router";
import { settings } from "../lib/store";

export const changeLabel = (k: string) => t(`change_${k}` as TKey);

/** Which secondary fields to show: a class timetable shows teachers, a teacher's shows classes, etc. */
export function lessonMeta(l: Lesson, viewKind: TargetKind | "my"): string {
  const parts: string[] = [];
  if (l.room && viewKind !== "room") parts.push(l.room);
  if (l.teacher && viewKind !== "teacher") parts.push(l.teacherName || l.teacher);
  if (l.group) parts.push(l.group);
  return parts.join(" · ");
}

export function LessonCard({ l, view, onClick, live }: { l: Lesson; view: TargetKind | "my"; onClick?: () => void; live?: boolean }) {
  const color = subjectColor(l.subject || l.subjectName || "?");
  const bare = l.removed && !l.subject && !l.subjectName;   // a cancelled period with nothing else to show
  return (
    <button class={`lesson ${l.removed ? "removed" : ""} ${bare ? "bare" : ""} ${l.change ? `chg-${l.change.kind}` : ""} ${live ? "live" : ""}`} onClick={onClick}
      style={{ "--c": color } as any}>
      <span class="lesson-bar" />
      <span class="lesson-main">
        <span class="lesson-title">
          {bare ? t("cancelled") : l.subjectName || l.subject || "—"}
          {l.change && !bare && <span class={`badge chg ${l.change.kind}`}>{changeLabel(l.change.kind)}</span>}
        </span>
        <span class="lesson-meta">{lessonMeta(l, view)}</span>
        {l.change?.text && l.change.text !== t("cancelled") && <span class="lesson-change">{l.change.text}</span>}
      </span>
    </button>
  );
}

export function DayList({ day, view, onLesson }: { day: Day | undefined; view: TargetKind | "my"; onLesson: (l: Lesson) => void }) {
  if (!day) return <div class="empty small"><p>{t("noLessons")}</p></div>;
  const periods = byPeriod(day);
  const isToday = day.date === today();
  const nm = nowMin();
  return (
    <div class="day-list">
      {day.off && <div class="day-off"><Icon name="star" size={18} /> {day.off}</div>}
      {day.note && <div class="day-note"><Icon name="info" size={16} /> {day.note}</div>}
      {!periods.length && !day.off && <div class="empty small"><p>{t("noLessons")}</p></div>}
      {periods.map((p) => {
        const live = isToday && nm >= toMin(p.begin) && nm < toMin(p.end);
        return (
          <div class={`period ${live ? "live" : ""} ${isToday && nm >= toMin(p.end) ? "past" : ""}`} key={p.key}>
            <div class="period-time">
              <span class="period-no">{p.hour}</span>
              <span>{p.begin}</span>
              <span class="muted">{p.end}</span>
            </div>
            <div class="period-lessons">
              {p.lessons.map((l) => <LessonCard l={l} view={view} live={live && !l.removed} onClick={() => onLesson(l)} />)}
            </div>
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
    <div class="week-scroll">
      <table class="week">
        <thead>
          <tr>
            <th />
            {hours.map((h) => <th><span class="wk-no">{h.caption}</span><span class="wk-time">{h.begin}</span></th>)}
          </tr>
        </thead>
        <tbody>
          {week.days.map((d) => (
            <tr class={d.date === td ? "today" : ""}>
              <th class="wk-day">
                <span>{dayShort(d.dow)}</span>
                {d.date && <span class="wk-date">{d.date.slice(8).replace(/^0/, "")}.{d.date.slice(5, 7).replace(/^0/, "")}.</span>}
              </th>
              {d.off
                ? <td colSpan={hours.length} class="wk-off">{d.off}</td>
                : hours.map((h) => {
                    const ls = d.lessons.filter((l) => l.begin === h.begin);
                    return (
                      <td>
                        {ls.map((l) => (
                          <button class={`wk-cell ${l.removed ? "removed" : ""} ${l.change ? `chg-${l.change.kind}` : ""}`}
                            style={{ "--c": subjectColor(l.subject || l.subjectName || "?") } as any} onClick={() => onLesson(l, d)}>
                            <b>{l.subject || "—"}</b>
                            <span>{view === "room" ? l.group || l.teacher : l.room}</span>
                            {view !== "teacher" && view !== "my" && l.group && ls.length > 1 && <span>{l.group}</span>}
                            {view === "teacher" && <span>{l.group}</span>}
                          </button>
                        ))}
                      </td>
                    );
                  })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LessonSheet({ lesson, day, onClose }: { lesson: Lesson | null; day?: Day | null; onClose: () => void }) {
  const dir = useDirectory().data;
  const l = lesson;
  const open = (target?: { kind: string; id: string }) => { if (target) { onClose(); setTimeout(() => go("/timetable", { k: target.kind, id: target.id }), 50); } };
  const teacherT = l ? findTeacher(dir, l.teacher, l.teacherName) : undefined;
  const roomT = l ? findRoom(dir, l.room) : undefined;
  const classT = l ? findClass(dir, l.group) : undefined;
  const canLink = settings.value.publicOk;
  return (
    <Sheet open={!!l} onClose={onClose} title={l ? (l.subjectName || l.subject || t("cancelled")) : ""}>
      {l && (
        <div class="lesson-detail">
          <div class="ld-when">
            <Icon name="clock" size={18} />
            {day?.date ? `${fmtDate(day.date, true)} · ` : day ? `${dayShort(day.dow)} · ` : ""}
            {l.hour && `${t("period", { n: l.hour })} · `}{hhmm(l.begin)}–{hhmm(l.end)}
          </div>
          {l.change && (
            <div class={`ld-change ${l.change.kind}`}>
              <b>{changeLabel(l.change.kind)}</b>
              {l.change.text && <span>{l.change.text}</span>}
            </div>
          )}
          <dl class="ld-list">
            {l.teacherName && <LinkRow label={t("teacher")} value={l.teacherName} onClick={canLink && teacherT ? () => open(teacherT) : undefined} />}
            {l.roomName && <LinkRow label={t("room")} value={l.roomName} onClick={canLink && roomT ? () => open(roomT) : undefined} />}
            {l.group && <LinkRow label={t("group")} value={l.group} onClick={canLink && classT ? () => open(classT) : undefined} />}
            {l.theme && <LinkRow label={t("theme")} value={l.theme} />}
          </dl>
        </div>
      )}
    </Sheet>
  );
}

function LinkRow({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
  return (
    <div class={`ld-row ${onClick ? "tap" : ""}`} onClick={onClick} role={onClick ? "button" : undefined}>
      <dt>{label}</dt>
      <dd>{value}{onClick && <Icon name="chev" size={16} class="muted" />}</dd>
    </div>
  );
}
