import { useEffect, useMemo, useState } from "preact/hooks";
import type { Day, Lesson, Week } from "../lib/model";
import { addDays, addSchoolDays, byPeriod, dayFor, filterGroups, hhmm, liveLessons, nowMin, toMin, today } from "../lib/model";
import { pickedGroups, permanentOf } from "../ui/picker";
import { cap, fmtDate, fmtRelDay, t } from "../lib/i18n";
import { useEvents, useHomework, useMarks, useWeek } from "../lib/data";
import type { Homework } from "../lib/bakalari";
import { settings, user } from "../lib/store";
import { native } from "../lib/native";
import { Icon } from "../ui/icons";
import { Empty, ErrorBox, IosInstall, Loading, Page, Row, Section, SectionLink, Updated, usePullToRefresh } from "../ui/kit";
import { changeLabel, LessonSheet, TimeRail } from "../ui/timetable";
import { go } from "../ui/router";
import { prefs, type CardKey } from "../ui/prefs";
import { useClassEntries } from "./Calendar";
import { expressive } from "../ui/prefs";
import { wide } from "../ui/layout";

/** Re-renders every `ms`, and at once when the app comes back to the screen (timers sleep in the background). */
function useTick(ms: number) {
  const [, set] = useState(0);
  useEffect(() => {
    const bump = () => { if (document.visibilityState === "visible") set((x) => x + 1); };
    const id = setInterval(bump, ms);
    document.addEventListener("visibilitychange", bump);
    addEventListener("focus", bump);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", bump); removeEventListener("focus", bump); };
  }, [ms]);
}

/** Seconds since midnight, now; the countdown re-renders every second with useTick(1000). */
const nowSec = () => { const d = new Date(); return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds(); };
/** 942 s -> "15:42"; an hour or more -> "1:05:00" is too long for the badge, so whole minutes ("65"). */
const clock = (s: number) => (s >= 3600 ? String(Math.ceil(s / 60)) : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);

/** Next school day (with lessons) after `iso` within the loaded weeks. */
function nextSchoolDay(weeks: (Week | undefined)[], iso: string): Day | undefined {
  const all = weeks.flatMap((w) => w?.days ?? []).filter((d) => d.date && d.date > iso && !d.off && liveLessons(d).length);
  return all.sort((a, b) => a.date!.localeCompare(b.date!))[0];
}

const SCHOOL_EVENT = "oklch(.7 .11 230)";

export function Today() {
  useTick(20_000);
  const my = { kind: "my" as const };
  const hasMy = !!user.value || !!settings.value.myTarget;
  const curRaw = useWeek(hasMy ? my : null, "actual");
  const nxtRaw = useWeek(hasMy ? my : null, "next");
  // Without a login "my" is a whole class: keep only the groups picked in its timetable.
  const picked = pickedGroups(user.value ? null : settings.value.myTarget).join();
  const cur = useMemo(() => ({ ...curRaw, data: curRaw.data && filterGroups(curRaw.data, picked ? picked.split(",") : [], permanentOf(settings.value.myTarget)) }), [curRaw, picked]);
  const nxt = useMemo(() => ({ ...nxtRaw, data: nxtRaw.data && filterGroups(nxtRaw.data, picked ? picked.split(",") : [], permanentOf(settings.value.myTarget)) }), [nxtRaw, picked]);
  const hw = useHomework();
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
  const cls = user.value?.classAbbrev || settings.value.myTarget?.name;

  if (!hasMy) {
    return (
      <Page title={t("appName")}>
        <IosInstall dismissible />
        <Empty icon="calendar-blank" text={t("pickClassHint")}><button class="btn" onClick={() => go("/settings")}>{t("myClass")}</button></Empty>
      </Page>
    );
  }

  const cards: Record<CardKey, () => preact.JSX.Element | null> = {
    changes: () => <Changes weeks={[cur.data, nxt.data]} onLesson={(l, d) => setSel({ l, d })} />,
    hw: () => (user.value ? <DueSoon hw={hw.data} /> : null),
    events: () => (user.value ? <Upcoming /> : null),
    grades: () => (user.value ? <NewGrades /> : null),
  };

  return (
    <Page smallTitle title={`${greet}${first ? `, ${first}` : ""}`} sub={[fmtDate(td, true), cls].filter(Boolean).join(" · ")}
      actions={<button class="icon-btn" onClick={() => go("/settings")} aria-label={t("settings")}><Icon name="gear" size={24} /></button>}>
      <IosInstall dismissible />
      {cur.loading && !cur.data && <Loading />}
      {cur.error != null && <ErrorBox error={cur.error} onRetry={cur.reload} />}
      <div class="today-grid">
        <div class="today-main">
          {cur.data && <NowCard day={todayDay} tomorrow={nextSchoolDay([cur.data, nxt.data], td)} />}

          {shown && shown !== todayDay && <div class="label" style={{ marginTop: "22px" }}>{cap(fmtRelDay(shown.date!, td))}</div>}
          {shown?.note && <div class="day-note"><Icon name="info" size={18} />{shown.note}</div>}
          {shown && <TimeRail day={shown} hw={hw.data} onLesson={(l) => setSel({ l, d: shown })} />}
        </div>
        <div class="today-side">
          {prefs.value.cards.filter((c) => c.on).map((c) => cards[c.k]())}
        </div>
      </div>
      {cur.data && <Updated at={cur.at} loading={cur.loading} onRefresh={() => { cur.reload(); nxt.reload(); }} />}
      <LessonSheet lesson={sel?.l ?? null} day={sel?.d} hw={hw.data} onClose={() => setSel(null)} />
    </Page>
  );
}

function NowCard({ day, tomorrow }: { day?: Day; tomorrow?: Day }) {
  useTick(1000);   // live countdown
  const ns = nowSec();
  const nm = Math.floor(ns / 60);
  const periods = day && !day.off ? byPeriod({ ...day, lessons: liveLessons(day) }) : [];
  const current = periods.find((p) => nm >= toMin(p.begin) && nm < toMin(p.end));
  const upcoming = periods.find((p) => toMin(p.begin) > nm);
  const name = (l: Lesson) => l.subjectName || l.subject;
  const nextLine = (p?: (typeof periods)[number]) => p
    ? `${t("next")}: ${name(p.lessons[0])} ${hhmm(p.begin)}–${hhmm(p.end)}${p.lessons[0].room ? ` · ${p.lessons[0].room}` : ""}`
    : "";

  // Material 3 Expressive (phones) and desktop: big card with a countdown badge and wavy progress.
  const xp = expressive || wide.value;
  if (xp && (current || upcoming)) {
    const p = (current ?? upcoming)!;
    const l = p.lessons[0];
    const inBreak = !current && periods.some((x) => toMin(x.end) <= nm);
    const after = current ? periods.find((x) => toMin(x.begin) >= toMin(current.end)) : periods.find((x) => toMin(x.begin) > toMin(p.begin));
    const secs = Math.max(0, (current ? toMin(current.end) : toMin(p.begin)) * 60 - ns);
    const mins = Math.ceil(secs / 60);
    const pct = current ? Math.min(100, ((ns - toMin(current.begin) * 60) / ((toMin(current.end) - toMin(current.begin)) * 60)) * 100) : 0;
    const kicker = current ? (l.hour ? t("nowKicker", { p: l.hour }) : t("now")) : inBreak ? `${t("breakNow")} · ${t("next")}` : t("firstLesson", { t: hhmm(p.begin) });
    return (
      <div class={`now-card xp ${current ? "live" : ""}`}>
        <div class="xp-top">
          <div class="grow">
            <div class="xp-kicker">{kicker}</div>
            <div class="xp-title">{name(l)}</div>
            <div class="xp-meta">{[l.room, l.teacherName || l.teacher, l.group].filter(Boolean).join(" · ")}{l.change && <span class="xp-tag">{changeLabel(l.change.kind)}</span>}</div>
          </div>
          <div class="xp-count" aria-label={`${mins} ${t("minShort")}`}>
            <b class={secs < 3600 ? "secs" : ""}>{clock(secs)}</b><small>{current ? t("leftShort") : t("untilStart")}</small>
          </div>
        </div>
        {current && <div class="wavy" role="progressbar" aria-valuenow={Math.round(pct)}><span style={{ width: `${pct}%` }} /><i /></div>}
        <div class="xp-times"><span>{hhmm(p.begin)}</span><span>{t("endsShort", { t: hhmm(p.end) })}</span></div>
        <div class="xp-next"><Icon name="caret-right" size={18} />
          <span class="grow">{after ? nextLine(after) : t("lastEnds", { t: hhmm(periods[periods.length - 1].end) })}{after ? ` · ${t("lastEnds", { t: hhmm(periods[periods.length - 1].end) })}` : ""}</span>
        </div>
      </div>
    );
  }

  if (current) {
    const l = current.lessons[0];
    const total = toMin(current.end) - toMin(current.begin);
    const pct = Math.min(100, ((ns - toMin(current.begin) * 60) / (total * 60)) * 100);
    const after = periods.find((p) => toMin(p.begin) >= toMin(current.end));
    return (
      <div class="now-card">
        <div class="now-top">
          <span class="now-title">{name(l)}{l.room ? ` · ${l.room}` : ""}{l.change && <span class="tag">{changeLabel(l.change.kind)}</span>}</span>
          <span class="now-end">{t("endsAtInClock", { t: hhmm(current.end), c: clock(Math.max(0, toMin(current.end) * 60 - ns)) })}</span>
        </div>
        <div class="progress"><span style={{ width: `${pct}%` }} /></div>
        <div class="now-next">{after ? nextLine(after) : t("lastEnds", { t: hhmm(current.end) })}</div>
      </div>
    );
  }

  if (upcoming) {
    const l = upcoming.lessons[0];
    const inBreak = periods.some((p) => toMin(p.end) <= nm);
    return (
      <div class="now-card">
        <div class="now-top">
          <span class="now-title">{inBreak ? `${t("breakNow")} · ${name(l)}` : t("firstLesson", { t: hhmm(upcoming.begin) })}{l.change && <span class="tag">{changeLabel(l.change.kind)}</span>}</span>
          <span class="now-end">{inBreak ? t("startsAtIn", { t: hhmm(upcoming.begin), m: toMin(upcoming.begin) - nm }) : t("startsIn", { m: toMin(upcoming.begin) - nm })}</span>
        </div>
        <div class="now-next">
          {inBreak
            ? [l.room, l.teacherName].filter(Boolean).join(" · ")
            : [name(l), l.room, t("lessonsCount", { n: periods.length }), t("lastEnds", { t: hhmm(periods[periods.length - 1].end) })].filter(Boolean).join(" · ")}
        </div>
      </div>
    );
  }

  const tp = tomorrow ? byPeriod({ ...tomorrow, lessons: liveLessons(tomorrow) }) : [];
  return (
    <div class="now-card">
      <div class="now-top"><span class="now-title">{periods.length ? t("schoolOver") : day?.off ?? t("noSchoolToday")}</span></div>
      {tomorrow && tp.length > 0 && (
        <div class="now-next">
          {t("dayStarts", { d: cap(fmtRelDay(tomorrow.date!, today())), t: hhmm(tp[0].begin) })} · {t("lessonsCount", { n: tp.length })} · {t("lastEnds", { t: hhmm(tp[tp.length - 1].end) })}
        </div>
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
    <Section title={t("upcomingChanges")} action={<SectionLink label={t("tabTimetable")} onClick={() => go("/timetable")} />}>
      <div class="stack">
        {items.slice(0, 8).map(({ d, l }) => (
          <Row icon={l.change!.kind === "removed" ? "x-circle" : "swap"} iconColor={l.change!.kind === "removed" ? "var(--er)" : "var(--wn)"} onClick={() => onLesson(l, d)}
            title={<>{cap(fmtRelDay(d.date!, td))} · {l.hour ? `${t("period", { n: l.hour })} · ` : ""}{l.subjectName || l.subject || changeLabel(l.change!.kind)}</>}
            sub={l.change!.text || changeLabel(l.change!.kind)} />
        ))}
      </div>
    </Section>
  );
}

function DueSoon({ hw }: { hw?: Homework[] }) {
  const td = today();
  const soon = (hw ?? []).filter((h) => !h.done && !h.closed && h.due >= td && h.due <= addSchoolDays(td, 3)).sort((a, b) => a.due.localeCompare(b.due));
  if (!soon.length) return null;
  return (
    <Section title={t("dueSoon")} action={<SectionLink label={t("homework")} onClick={() => go("/homework")} />}>
      <div class="stack">
        {soon.map((h) => (
          <Row icon="notebook" title={<span class="clamp2">{h.subjectName} · {h.text}</span>} sub={t("due", { d: fmtRelDay(h.due, td) })} onClick={() => go("/homework")} />
        ))}
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
    <Section title={t("upcoming")} action={<SectionLink label={t("tabCalendar")} onClick={() => go("/calendar")} />}>
      <div class="stack">
        {items.slice(0, 6).map((e) => (
          <Row icon={e.cls ? "users" : "calendar-dots"} iconColor={e.cls ? "var(--ac)" : SCHOOL_EVENT} title={e.title}
            sub={[cap(fmtRelDay(e.date, td)), e.sub].filter(Boolean).join(" · ")} onClick={() => go("/calendar", { d: e.date })} />
        ))}
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
    <Section title={t("newGrades")} action={<SectionLink label={t("tabGrades")} onClick={() => go("/grades")} />}>
      <div class="stack">
        {recent.map(({ s, m }) => (
          <Row icon="chart-line-up" title={s.name} sub={[m.caption, fmtDate(m.date)].filter(Boolean).join(" · ")} onClick={() => go("/grades", { s: s.id })}
            right={<span class="row-right">{m.text}</span>} />
        ))}
      </div>
    </Section>
  );
}
