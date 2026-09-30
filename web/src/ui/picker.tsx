import { useMemo, useState } from "preact/hooks";
import type { Target, TargetKind } from "../lib/model";
import { targetKey } from "../lib/model";
import { t } from "../lib/i18n";
import { useDirectory } from "../lib/data";
import { patchSettings, settings, user } from "../lib/store";
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

  return (
    <Sheet open={open} onClose={onClose} title={title ?? t("tabTimetable")} full>
      <div class="search-box">
        <Icon name="search" size={18} />
        <input type="search" placeholder={t("searchTarget")} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      </div>
      {!q && (
        <Segmented<Tab> small value={tab} onChange={setTab} options={[
          ...(hasFavs ? [{ v: "fav" as Tab, label: t("favourites") }] : []),
          ...kinds.map((k) => ({ v: k as Tab, label: t(k === "class" ? "classes" : k === "teacher" ? "teachers" : "rooms") })),
        ]} />
      )}
      {allowMy && !q && (user.value || settings.value.myTarget) && (
        <button class="pick-row my" onClick={() => pick("my")}>
          <span class="row-icon"><Icon name="home" size={18} /></span>
          <span class="grow">{t("my")}{user.value ? "" : ` · ${settings.value.myTarget?.name}`}</span>
        </button>
      )}
      {dir.loading && !dir.data && <Loading />}
      {dir.error != null && !dir.data && <ErrorBox error={dir.error} onRetry={dir.reload} />}
      <div class={`pick-list ${tab === "class" && !q ? "chips" : ""}`}>
        {list.map((x) => (
          <div class="pick-row" key={targetKey(x)}>
            <button class="grow pick-main" onClick={() => pick(x)}>
              <span class="row-icon"><Icon name={KIND_ICON[x.kind]} size={18} /></span>
              <span class="grow">{x.name}</span>
            </button>
            <button class={`icon-btn star ${isFav(x) ? "on" : ""}`} onClick={() => toggleFav(x)} aria-label={isFav(x) ? t("removeFav") : t("addFav")}>
              <Icon name="star" size={18} filled={isFav(x)} />
            </button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
