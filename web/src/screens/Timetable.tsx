import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Day, Lesson, Target, Term } from "../lib/model";
import { dowOf, filterGroups, targetKey, today } from "../lib/model";
import { dayShort, t } from "../lib/i18n";
import { useCabinets, useDirectory, useHomework, useWeek, type Source } from "../lib/data";
import { patchSettings, settings, user } from "../lib/store";
import { Icon } from "../ui/icons";
import { Empty, ErrorBox, Loading, Page, Segmented, Updated, usePullToRefresh } from "../ui/kit";
import { DayList, LessonSheet, WeekGrid } from "../ui/timetable";
import { GroupChips, isFav, KIND_ICON, pickedGroups, permanentOf, TargetPicker, toggleFav } from "../ui/picker";
import { go, isTab, route } from "../ui/router";

export function Timetable() {
  const q = route.value.q;
  const dir = useDirectory();
  const hw = useHomework();
  const hasMy = !!user.value || !!settings.value.myTarget;

  const src: Source | null = useMemo(() => {
    if (q.k && q.id) {
      const kind = q.k as Target["kind"];
      const list = kind === "class" ? dir.data?.classes : kind === "teacher" ? dir.data?.teachers : dir.data?.rooms;
      return list?.find((x) => x.id === q.id) ?? { kind, id: q.id, name: q.n || q.id };
    }
    return hasMy ? { kind: "my" } : null;
  }, [q.k, q.id, dir.data, hasMy]);

  const cabs = useCabinets();
  const term = (q.term as Term) || "actual";
  const week = useWeek(src, term);
  // A class timetable (or "my" class without a login) can be narrowed to the groups you're in.
  const groupClass = src?.kind === "class" ? src : src?.kind === "my" && !user.value ? settings.value.myTarget : null;
  const picked = pickedGroups(groupClass);
  const shown = useMemo(() => (week.data ? filterGroups(week.data, picked, permanentOf(groupClass)) : undefined), [week.data, picked.join(), permanentOf(groupClass)]);
  const [picker, setPicker] = useState(!src);
  const [sel, setSel] = useState<{ l: Lesson; d: Day } | null>(null);
  const view = settings.value.view;
  usePullToRefresh(week.reload);

  // Which day is shown in day view: today in this week, Monday otherwise (and after the last school day).
  const days = shown?.days ?? [];
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
    // Used for a day change: the tab swipe (ui/swipe.tsx) leaves it alone. At the first / last day it moves tabs.
    if (next) { setDow(next.dow); (e as TouchEvent & { bpSwiped?: boolean }).bpSwiped = true; }
  };

  const myName = user.value ? t("my") : settings.value.myTarget?.name ?? t("my");
  const title = !src ? t("tabTimetable") : src.kind === "my" ? myName : src.name;
  const setTerm = (v: Term) => go("/timetable", { ...q, term: v === "actual" ? undefined : v }, true);
  const publicTarget = src && src.kind !== "my" ? (src as Target) : null;
  const open = (x: Target | "my") => go("/timetable", x === "my" ? { term: q.term } : { k: x.kind, id: x.id, n: x.name, term: q.term }, true);

  // Quick switch: my timetable, favourites, and whatever is open now.
  const favs = settings.value.favourites;
  const quick: Target[] = publicTarget && !favs.some((f) => targetKey(f) === targetKey(publicTarget)) ? [...favs, publicTarget] : favs;
  const canBrowse = settings.value.publicOk;

  return (
    <Page wide backable={!isTab("/timetable")}
      sub={src ? [t("tabTimetable"), src.kind === "teacher" && cabs.data?.[src.id]?.room ? t("cabinetX", { r: cabs.data[src.id].room }) : ""].filter(Boolean).join(" · ") : undefined}
      title={<button class="title-btn" onClick={() => canBrowse && setPicker(true)}>
        {title}{canBrowse && <Icon name="caret-down" size={18} />}
      </button>}
      actions={<>
        {publicTarget && (
          <button class={`icon-btn ${isFav(publicTarget) ? "on" : ""}`} onClick={() => toggleFav(publicTarget)} aria-label={isFav(publicTarget) ? t("removeFav") : t("addFav")}>
            <Icon name="star" size={24} fill={isFav(publicTarget)} />
          </button>
        )}
        <button class="icon-btn" onClick={() => go("/settings")} aria-label={t("settings")}><Icon name="gear" size={24} /></button>
      </>}>
      {canBrowse && (
        <div class="chips scroll tt-targets">
          {hasMy && <button class={`chip ${src?.kind === "my" ? "on" : ""}`} onClick={() => open("my")}>{myName}</button>}
          {quick.map((x) => (
            <button class={`chip ${publicTarget && targetKey(publicTarget) === targetKey(x) ? "on" : ""}`} onClick={() => open(x)}>
              <Icon name={KIND_ICON[x.kind]} size={14} />{x.name}
            </button>
          ))}
          <button class="chip" onClick={() => setPicker(true)}><Icon name="magnifying-glass" size={14} />{t("search")}</button>
        </div>
      )}
      {src && (
        <div class="tt-term">
          <Segmented<Term> value={term} onChange={setTerm} options={[
            { v: "actual", label: t("thisWeek") }, { v: "next", label: t("nextWeek") }, { v: "permanent", label: t("permanent") },
          ]} />
        </div>
      )}

      {groupClass?.kind === "class" && <GroupChips cls={groupClass} week={week.data} />}

      {!src && <Empty icon="calendar-blank" text={t("searchTarget")}><button class="btn" onClick={() => setPicker(true)}>{t("search")}</button></Empty>}
      {src && week.loading && !week.data && <Loading />}
      {src && week.error != null && <ErrorBox error={week.error} onRetry={week.reload} />}

      {week.data && (
        <div class="tt-days">
          <div class="tt-days-in">
            {view === "day" && days.map((d) => (
              <button class={`day-btn ${d.dow === dow ? "on" : ""} ${d.date === today() ? "today" : ""} ${d.off ? "off" : ""}`} onClick={() => setDow(d.dow)}>
                {dayShort(d.dow)}
                {d.date && <small>{Number(d.date.slice(8))}.{Number(d.date.slice(5, 7))}.</small>}
                {d.lessons.some((l) => l.change) && <i />}
              </button>
            ))}
          </div>
          <button class="view-btn" onClick={() => patchSettings({ view: view === "day" ? "week" : "day" })} aria-label={t("viewToggle")}>
            <Icon name={view === "day" ? "squares-four" : "rows"} size={20} />
          </button>
        </div>
      )}
      {week.data && view === "day" && (
        <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <DayList day={day} view={src!.kind} onLesson={(l) => setSel({ l, d: day! })} />
        </div>
      )}
      {shown && view === "week" && <WeekGrid week={shown} view={src!.kind} onLesson={(l, d) => setSel({ l, d })} />}
      {week.data && <Updated at={week.at} loading={week.loading} onRefresh={week.reload} />}

      <TargetPicker open={picker} onClose={() => setPicker(false)} allowMy onPick={open} />
      <LessonSheet lesson={sel?.l ?? null} day={sel?.d} hw={src?.kind === "my" ? hw.data : undefined} onClose={() => setSel(null)} />
    </Page>
  );
}
