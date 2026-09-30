import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Day, Lesson, Target, Term } from "../lib/model";
import { dowOf, today } from "../lib/model";
import { dayShort, t } from "../lib/i18n";
import { useDirectory, useWeek, type Source } from "../lib/data";
import { patchSettings, settings, user } from "../lib/store";
import { Icon } from "../ui/icons";
import { Empty, ErrorBox, Loading, Page, Segmented, Updated, usePullToRefresh } from "../ui/kit";
import { DayList, LessonSheet, WeekGrid } from "../ui/timetable";
import { isFav, KIND_ICON, TargetPicker, toggleFav } from "../ui/picker";
import { go, route } from "../ui/router";

export function Timetable() {
  const q = route.value.q;
  const dir = useDirectory();
  const hasMy = !!user.value || !!settings.value.myTarget;

  const src: Source | null = useMemo(() => {
    if (q.k && q.id) {
      const kind = q.k as Target["kind"];
      const list = kind === "class" ? dir.data?.classes : kind === "teacher" ? dir.data?.teachers : dir.data?.rooms;
      return list?.find((x) => x.id === q.id) ?? { kind, id: q.id, name: q.n || q.id };
    }
    return hasMy ? { kind: "my" } : null;
  }, [q.k, q.id, dir.data, hasMy]);

  const term = (q.term as Term) || "actual";
  const week = useWeek(src, term);
  const [picker, setPicker] = useState(!src);
  const [sel, setSel] = useState<{ l: Lesson; d: Day } | null>(null);
  const view = settings.value.view;
  usePullToRefresh(week.reload);

  // Which day is shown in day view: today in this week, Monday otherwise (and after the last school day).
  const days = week.data?.days ?? [];
  const defaultDow = () => {
    if (term !== "actual") return days[0]?.dow ?? 1;
    const d = dowOf(today());
    return days.some((x) => x.dow === d) ? d : days.find((x) => x.dow > d)?.dow ?? days[0]?.dow ?? 1;
  };
  const [dow, setDow] = useState<number>(defaultDow());
  useEffect(() => setDow(defaultDow()), [term, week.data === undefined]);
  const day = days.find((d) => d.dow === dow);

  // swipe between days
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: TouchEvent) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e: TouchEvent) => {
    if (!touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current.x, dy = e.changedTouches[0].clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return;
    const i = days.findIndex((d) => d.dow === dow);
    const next = days[i + (dx < 0 ? 1 : -1)];
    if (next) setDow(next.dow);
  };

  const title = !src ? t("tabTimetable") : src.kind === "my" ? (user.value ? t("my") : settings.value.myTarget?.name ?? t("my")) : src.name;
  const setTerm = (v: Term) => go("/timetable", { ...q, term: v === "actual" ? undefined : v }, true);
  const publicTarget = src && src.kind !== "my" ? (src as Target) : null;

  return (
    <Page wide
      title={<button class="title-btn" onClick={() => setPicker(true)}>
        {src && src.kind !== "my" && <Icon name={KIND_ICON[src.kind]} size={20} />}{title}<Icon name="down" size={18} />
      </button>}
      actions={<>
        {publicTarget && (
          <button class={`icon-btn star ${isFav(publicTarget) ? "on" : ""}`} onClick={() => toggleFav(publicTarget)} aria-label={t("addFav")}>
            <Icon name="star" filled={isFav(publicTarget)} />
          </button>
        )}
        <button class="icon-btn" onClick={() => patchSettings({ view: view === "day" ? "week" : "day" })} aria-label={view === "day" ? t("weekView") : t("dayView")}>
          <Icon name={view === "day" ? "grid" : "menu"} />
        </button>
      </>}>
      <div class="tt-controls">
        <Segmented<Term> value={term} onChange={setTerm} options={[
          { v: "actual", label: t("thisWeek") }, { v: "next", label: t("nextWeek") }, { v: "permanent", label: t("permanent") },
        ]} />
      </div>

      {!src && <Empty icon="grid" text={t("searchTarget")}><button class="btn" onClick={() => setPicker(true)}>{t("search")}</button></Empty>}
      {src && week.loading && !week.data && <Loading />}
      {src && week.error != null && <ErrorBox error={week.error} onRetry={week.reload} />}

      {week.data && view === "day" && (
        <>
          <div class="day-tabs">
            {days.map((d) => (
              <button class={`day-tab ${d.dow === dow ? "on" : ""} ${d.date === today() ? "today" : ""} ${d.off ? "off" : ""}`} onClick={() => setDow(d.dow)}>
                <span>{dayShort(d.dow)}</span>
                {d.date && <b>{Number(d.date.slice(8))}</b>}
                {d.lessons.some((l) => l.change) && <i class="dot" />}
              </button>
            ))}
          </div>
          <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            <DayList day={day} view={src!.kind} onLesson={(l) => setSel({ l, d: day! })} />
          </div>
        </>
      )}
      {week.data && view === "week" && <WeekGrid week={week.data} view={src!.kind} onLesson={(l, d) => setSel({ l, d })} />}
      {week.data && <Updated at={week.at} loading={week.loading} onRefresh={week.reload} />}

      <TargetPicker open={picker} onClose={() => setPicker(false)} allowMy
        onPick={(x) => go("/timetable", x === "my" ? { term: q.term } : { k: x.kind, id: x.id, n: x.name, term: q.term }, true)} />
      <LessonSheet lesson={sel?.l ?? null} day={sel?.d} onClose={() => setSel(null)} />
    </Page>
  );
}
