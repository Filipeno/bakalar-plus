import { useEffect, useMemo, useState } from "preact/hooks";
import type { Day, Lesson, Week } from "../lib/model";
import { addDays, byPeriod, dayFor, liveLessons, nowMin, toMin, today } from "../lib/model";
import { cap, fmtDate, fmtRelDay, t } from "../lib/i18n";
import { useEvents, useHomework, useMarks, useWeek } from "../lib/data";
import { settings, user } from "../lib/store";
import { native } from "../lib/native";
import { Icon } from "../ui/icons";
import { Empty, ErrorBox, Loading, Page, Row, Section, subjectColor, Updated, usePullToRefresh } from "../ui/kit";
import { changeLabel, DayList, LessonSheet } from "../ui/timetable";
import { go } from "../ui/router";
import { useClassEntries } from "./Calendar";

function useTick(ms: number) {
  const [, set] = useState(0);
  useEffect(() => { const id = setInterval(() => set((x) => x + 1), ms); return () => clearInterval(id); }, [ms]);
}

/** Next school day (with lessons) after `iso` within the loaded weeks. */
function nextSchoolDay(weeks: (Week | undefined)[], iso: string): Day | undefined {
  const all = weeks.flatMap((w) => w?.days ?? []).filter((d) => d.date && d.date > iso && !d.off && liveLessons(d).length);
  return all.sort((a, b) => a.date!.localeCompare(b.date!))[0];
}

export function Today() {
  useTick(20_000);
  const my = { kind: "my" as const };
  const hasMy = !!user.value || !!settings.value.myTarget;
  const cur = useWeek(hasMy ? my : null, "actual");
  const nxt = useWeek(hasMy ? my : null, "next");
  const [sel, setSel] = useState<{ l: Lesson; d: Day } | null>(null);
  usePullToRefresh(() => { cur.reload(); nxt.reload(); });

  const td = today();
  const todayDay = dayFor(cur.data, td);
  // Once today's lessons are over, show the next school day instead.
  const todayLeft = todayDay && !todayDay.off && liveLessons(todayDay).some((l) => toMin(l.end) > nowMin());
  const shown = todayLeft ? todayDay : nextSchoolDay([cur.data, nxt.data], td);

  // Give the Android widget and background checks the latest copy.
  useEffect(() => {
    if (native && cur.data) native.sync("setWidget", { weeks: [cur.data, nxt.data].filter(Boolean) });
  }, [cur.data, nxt.data]);

  const h = new Date().getHours();
  const greet = h < 10 ? t("goodMorning") : h < 18 ? t("goodDay") : t("goodEvening");
  // Bakaláři: "Surname Firstname, 2.A"
  const first = user.value?.name?.split(",")[0].trim().split(/\s+/).slice(-1)[0];

  if (!hasMy) {
    return (
      <Page title={t("appName")}>
        <Empty icon="grid" text={t("pickClassHint")}><button class="btn" onClick={() => go("/settings")}>{t("myClass")}</button></Empty>
      </Page>
    );
  }

  return (
    <Page title={`${greet}${first ? `, ${first}` : ""}`} sub={fmtDate(td, true)}
      actions={<button class="icon-btn" onClick={() => go("/settings")} aria-label={t("settings")}><Icon name="gear" /></button>}>
      {cur.loading && !cur.data && <Loading />}
      {cur.error != null && <ErrorBox error={cur.error} onRetry={cur.reload} />}
      {cur.data && <NowCard day={todayDay} tomorrow={nextSchoolDay([cur.data, nxt.data], td)} />}

      {shown && (
        <Section title={shown === todayDay ? t("todayLessons") : cap(fmtRelDay(shown.date!, td))}>
          <DayList day={shown} view="my" onLesson={(l) => setSel({ l, d: shown })} />
        </Section>
      )}

      <Changes weeks={[cur.data, nxt.data]} onLesson={(l, d) => setSel({ l, d })} />
      {user.value && <DueSoon />}
      {user.value && <Upcoming />}
      {user.value && <NewGrades />}
      {cur.data && <Updated at={cur.at} loading={cur.loading} onRefresh={() => { cur.reload(); nxt.reload(); }} />}
      <LessonSheet lesson={sel?.l ?? null} day={sel?.d} onClose={() => setSel(null)} />
    </Page>
  );
}

function NowCard({ day, tomorrow }: { day?: Day; tomorrow?: Day }) {
  const nm = nowMin();
  const periods = day && !day.off ? byPeriod({ ...day, lessons: liveLessons(day) }) : [];
  const current = periods.find((p) => nm >= toMin(p.begin) && nm < toMin(p.end));
  const upcoming = periods.find((p) => toMin(p.begin) > nm);

  if (current || (upcoming && periods.some((p) => toMin(p.end) <= nm))) {
    // at school: in a lesson or in a break
    const main = current ?? upcoming!;
    const l = main.lessons[0];
    const color = subjectColor(l.subject || l.subjectName);
    const total = toMin(main.end) - toMin(main.begin);
    const pct = current ? Math.min(100, ((nm - toMin(main.begin)) / total) * 100) : 0;
    const after = current ? periods.find((p) => toMin(p.begin) >= toMin(current.end)) : undefined;
    return (
      <div class="now-card" style={{ "--c": color } as any}>
        <div class="now-label">{current ? t("now") : t("breakNow")}</div>
        <div class="now-title">{current ? l.subjectName || l.subject : `${t("next")}: ${l.subjectName || l.subject}`}</div>
        <div class="now-meta">
          {[l.room, l.teacherName, l.group].filter(Boolean).join(" · ")}
          {l.change && <span class={`badge chg ${l.change.kind}`}>{changeLabel(l.change.kind)}</span>}
        </div>
        <div class="now-count">
          {current ? t("endsIn", { m: toMin(main.end) - nm }) : t("startsIn", { m: toMin(main.begin) - nm })}
        </div>
        {current && <div class="progress"><span style={{ width: `${pct}%` }} /></div>}
        {after && (
          <div class="now-next">
            <Icon name="chev" size={16} />
            {t("next")}: <b>{after.lessons[0].subjectName || after.lessons[0].subject}</b> {t("at", { t: after.begin })}{after.lessons[0].room ? ` · ${after.lessons[0].room}` : ""}
          </div>
        )}
      </div>
    );
  }

  if (upcoming) {
    const l = upcoming.lessons[0];
    return (
      <div class="now-card calm" style={{ "--c": subjectColor(l.subject) } as any}>
        <div class="now-label">{t("todayLessons")}</div>
        <div class="now-title">{t("firstLesson", { t: upcoming.begin })}</div>
        <div class="now-meta">{l.subjectName || l.subject}{l.room ? ` · ${l.room}` : ""} · {t("lessonsCount", { n: periods.length })} · {t("lastEnds", { t: periods[periods.length - 1].end })}</div>
        <div class="now-count">{t("startsIn", { m: toMin(upcoming.begin) - nm })}</div>
      </div>
    );
  }

  const tp = tomorrow ? byPeriod({ ...tomorrow, lessons: liveLessons(tomorrow) }) : [];
  return (
    <div class="now-card calm">
      <div class="now-label">{periods.length ? t("schoolOver") : day?.off ?? t("noSchoolToday")}</div>
      {tomorrow && tp.length > 0 && (
        <>
          <div class="now-title">{t("dayStarts", { d: cap(fmtRelDay(tomorrow.date!, today())), t: tp[0].begin })}</div>
          <div class="now-meta">
            {tp.map((p) => p.lessons[0].subject).join(" · ")}
          </div>
          <div class="now-count">{t("lessonsCount", { n: tp.length })} · {t("lastEnds", { t: tp[tp.length - 1].end })}</div>
        </>
      )}
    </div>
  );
}

function Changes({ weeks, onLesson }: { weeks: (Week | undefined)[]; onLesson: (l: Lesson, d: Day) => void }) {
  const td = today();
  const items = useMemo(() => weeks.flatMap((w) => w?.days ?? [])
    .filter((d) => d.date && d.date >= td)
    .flatMap((d) => d.lessons.filter((l) => l.change).map((l) => ({ d, l }))), [weeks]);
  if (!items.length) return null;
  return (
    <Section title={t("upcomingChanges")}>
      <div class="card-list">
        {items.slice(0, 8).map(({ d, l }) => (
          <Row icon="swap" accent="#f59e0b" onClick={() => onLesson(l, d)}
            title={<>{fmtRelDay(d.date!, td)} · {l.hour ? `${t("period", { n: l.hour })} · ` : ""}{l.subjectName || l.subject || changeLabel(l.change!.kind)}</>}
            sub={l.change!.text || changeLabel(l.change!.kind)} />
        ))}
      </div>
    </Section>
  );
}

function DueSoon() {
  const hw = useHomework();
  const td = today();
  const soon = (hw.data ?? []).filter((h) => !h.done && !h.closed && h.due >= td && h.due <= addDays(td, 3)).sort((a, b) => a.due.localeCompare(b.due));
  if (!soon.length) return null;
  return (
    <Section title={t("dueSoon")} action={<button class="link" onClick={() => go("/homework")}>{t("homework")}</button>}>
      <div class="card-list">
        {soon.map((h) => <Row icon="book" accent={subjectColor(h.subject)} title={`${h.subjectName} · ${fmtRelDay(h.due, td)}`} sub={<span class="clamp2">{h.text}</span>} onClick={() => go("/homework")} />)}
      </div>
    </Section>
  );
}

function Upcoming() {
  const ev = useEvents();
  const cls = useClassEntries();
  const td = today(), end = addDays(td, 7);
  const items = [
    ...(ev.data ?? []).filter((e) => e.start.slice(0, 10) >= td && e.start.slice(0, 10) <= end).map((e) => ({ date: e.start.slice(0, 10), title: e.title, sub: e.type, cls: false })),
    ...(cls.data?.entries ?? []).filter((e) => e.date >= td && e.date <= end).map((e) => ({ date: e.date, title: e.title, sub: t(`kind_${e.kind}` as any), cls: true })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  if (!items.length) return null;
  return (
    <Section title={t("upcoming")} action={<button class="link" onClick={() => go("/calendar")}>{t("tabCalendar")}</button>}>
      <div class="card-list">
        {items.slice(0, 6).map((e) => <Row icon={e.cls ? "users" : "cal"} accent={e.cls ? "#8b5cf6" : "#0ea5e9"} title={e.title} sub={`${fmtRelDay(e.date, td)} · ${e.sub}`} onClick={() => go("/calendar", { d: e.date })} />)}
      </div>
    </Section>
  );
}

function NewGrades() {
  const marks = useMarks();
  const since = addDays(today(), -7);
  const recent = (marks.data ?? []).flatMap((s) => s.marks.filter((m) => m.isNew || m.date >= since).map((m) => ({ s, m })))
    .sort((a, b) => b.m.date.localeCompare(a.m.date)).slice(0, 5);
  if (!recent.length) return null;
  return (
    <Section title={t("newGrades")} action={<button class="link" onClick={() => go("/grades")}>{t("tabGrades")}</button>}>
      <div class="card-list">
        {recent.map(({ s, m }) => (
          <Row title={s.name} sub={[m.caption, fmtDate(m.date)].filter(Boolean).join(" · ")} onClick={() => go("/grades", { s: s.id })}
            right={<span class="mark" data-v={m.value ?? ""}>{m.text}</span>} />
        ))}
      </div>
    </Section>
  );
}
