import { useMemo, useState } from "preact/hooks";
import type { Target, TargetKind, Week } from "../lib/model";
import { groupFamilies, lessonGroups, mergeWeeks, targetKey } from "../lib/model";
import { t } from "../lib/i18n";
import { useDirectory, useWeek, weekCacheKey } from "../lib/data";
import { patchSettings, readCache, settings, user } from "../lib/store";
import { fold } from "../lib/schools";
import { Icon, type IconName } from "./icons";
import { ErrorBox, Loading, Segmented, Sheet } from "./kit";

export const KIND_ICON: Record<TargetKind, IconName> = { class: "users", teacher: "user", room: "door" };

export function isFav(tg: Target) { return settings.value.favourites.some((f) => targetKey(f) === targetKey(tg)); }
export function toggleFav(tg: Target) {
  const favs = settings.value.favourites;
  patchSettings({ favourites: isFav(tg) ? favs.filter((f) => targetKey(f) !== targetKey(tg)) : [...favs, tg] });
}

type Tab = "fav" | TargetKind;

export function TargetPicker({ open, onClose, onPick, allowMy, kinds = ["class", "teacher", "room"], title }: {
  open: boolean; onClose: () => void; onPick: (t: Target | "my") => void; allowMy?: boolean; kinds?: TargetKind[]; title?: string;
}) {
  const dir = useDirectory();
  const hasFavs = settings.value.favourites.some((f) => kinds.includes(f.kind));
  const [tab, setTab] = useState<Tab>(hasFavs ? "fav" : kinds[0]);
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    const d = dir.data;
    if (!d) return [];
    const all: Target[] = [...(kinds.includes("class") ? d.classes : []), ...(kinds.includes("teacher") ? d.teachers : []), ...(kinds.includes("room") ? d.rooms : [])];
    const n = fold(q);
    if (n) return all.filter((x) => fold(x.name).includes(n)).slice(0, 80);
    if (tab === "fav") return settings.value.favourites.filter((f) => kinds.includes(f.kind));
    return tab === "class" ? d.classes : tab === "teacher" ? d.teachers : d.rooms;
  }, [dir.data, tab, q, settings.value.favourites]);

  const pick = (x: Target | "my") => { onPick(x); onClose(); setQ(""); };
  const chips = tab === "class" && !q;

  return (
    <Sheet open={open} onClose={onClose} title={title ?? t("tabTimetable")} full>
      <div class="search">
        <Icon name="magnifying-glass" size={18} />
        <input type="search" placeholder={t("searchTarget")} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      </div>
      {!q && (
        <Segmented<Tab> value={tab} onChange={setTab} options={[
          ...(hasFavs ? [{ v: "fav" as Tab, label: t("favourites") }] : []),
          ...kinds.map((k) => ({ v: k as Tab, label: t(k === "class" ? "classes" : k === "teacher" ? "teachers" : "rooms") })),
        ]} />
      )}
      <div class="pick-list">
        {allowMy && !q && (user.value || settings.value.myTarget) && (
          <button class="pick" onClick={() => pick("my")}>
            <Icon name="house" size={20} />
            <span class="grow"><b>{t("my")}</b>{!user.value && <small>{settings.value.myTarget?.name}</small>}</span>
          </button>
        )}
        {dir.loading && !dir.data && <Loading />}
        {dir.error != null && !dir.data && <ErrorBox error={dir.error} onRetry={dir.reload} />}
        {chips ? (
          <div class="target-chips">
            {list.map((x) => <button class="chip big" key={targetKey(x)} onClick={() => pick(x)}>{x.name}</button>)}
          </div>
        ) : list.map((x) => (
          <div class="target-row" key={targetKey(x)}>
            <button class="pick" onClick={() => pick(x)}>
              <Icon name={KIND_ICON[x.kind]} size={20} />
              <span class="grow"><b>{x.name}</b></span>
            </button>
            <button class={`fav-btn ${isFav(x) ? "on" : ""}`} onClick={() => toggleFav(x)} aria-label={isFav(x) ? t("removeFav") : t("addFav")}>
              <Icon name="star" size={20} fill={isFav(x)} />
            </button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

/** The groups a class is split into for some subjects. One pick per set (AJ_1 or AJ_2), remembered per class. */
export function GroupChips({ cls, week }: { cls: Target; week?: Week }) {
  const perm = useWeek(cls, "permanent").data;
  const fams = useMemo(() => groupFamilies(mergeWeeks(week, perm)), [week, perm]);
  const [open, setOpen] = useState(false);
  if (!fams.length) return null;
  const picked = pickedGroups(cls);
  const auto = !settings.value.groups[cls.id] && picked.length > 0;
  const toggle = (fam: string[], g: string) => {
    const rest = picked.filter((x) => !fam.includes(x));
    patchSettings({ groups: { ...settings.value.groups, [cls.id]: picked.includes(g) ? rest : [...rest, g] } });
  };
  const chosen = fams.filter((f) => f.groups.some((g) => picked.includes(g))).length;
  return (
    <div class="group-box">
      <button class="group-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Icon name="users-three" size={18} />
        <span class="grow">
          <b>{t("groupsOf", { n: fams.length })}</b>
          <small>{picked.length ? `${picked.join(", ")}${auto ? ` · ${t("groupsAuto")}` : ""}` : t("groupsNone")}</small>
        </span>
        <span class="group-count">{chosen}/{fams.length}</span>
        <Icon name={open ? "caret-down" : "caret-right"} size={16} />
      </button>
      {open && (
        <div class="group-list">
          <p class="hint">{t("groupsHint")}</p>
          {fams.map((f) => (
            <div class="group-row">
              <span class="group-subj">{f.subjects.slice(0, 2).join(", ") || t("group")}</span>
              <div class="chips">
                {f.groups.map((g) => <button class={`chip ${picked.includes(g) ? "on" : ""}`} onClick={() => toggle(f.groups, g)}>{g}</button>)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The class's permanent timetable, if it was loaded (GroupChips loads it): it shows every split of the class. */
export const permanentOf = (tg: Pick<Target, "kind" | "id"> | null | undefined) =>
  tg?.kind === "class" ? readCache<Week>(weekCacheKey(tg as Target, "permanent"))?.v : undefined;

/** Your own class when signed in: the groups in your personal timetable (it only lists your own lessons). */
function myGroups(): string[] {
  if (!user.value) return [];
  const gs = new Set<string>();
  for (const term of ["permanent", "actual"] as const) {
    for (const d of readCache<Week>(weekCacheKey({ kind: "my" }, term))?.v.days ?? []) for (const l of d.lessons) lessonGroups(l).forEach((g) => gs.add(g));
  }
  return [...gs];
}

/** The groups picked for a class; for your own class (signed in) they come from your timetable until you change them. */
export function pickedGroups(tg: Pick<Target, "kind" | "id"> & { name?: string } | null | undefined): string[] {
  if (tg?.kind !== "class") return [];
  const saved = settings.value.groups[tg.id];
  if (saved) return saved;
  const u = user.value;
  if (!u || !tg.name || tg.name.trim().toLowerCase() !== u.classAbbrev.trim().toLowerCase()) return [];
  const week = mergeWeeks(permanentOf(tg), readCache<Week>(weekCacheKey(tg as Target, "actual"))?.v);
  // Only splits where your timetable shows exactly one of the groups (two would mean it isn't your own).
  const mine = new Set(myGroups());
  return groupFamilies(week).map((f) => f.groups.filter((g) => mine.has(g))).filter((gs) => gs.length === 1).flat();
}
