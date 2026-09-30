import { useEffect, useMemo, useState } from "preact/hooks";
import { addDays, isoDate, mondayOf, parseIso, today } from "../lib/model";
import { dayShort, fmtDate, lang, t, type TKey } from "../lib/i18n";
import { useEvents, useHomework } from "../lib/data";
import { settings, user, useData } from "../lib/store";
import * as cloud from "../lib/cloud";
import type { ClassEntry, EntryKind } from "../lib/cloud";
import { Icon } from "../ui/icons";
import { ErrorBox, NeedLogin, Page, Segmented, Sheet, Spinner, errorText } from "../ui/kit";
import { go, isTab, route } from "../ui/router";

export function useClassEntries() {
  const s = settings.value.school?.url ?? "";
  const on = !!user.value && cloud.cloudAvailable() && !!s;
  return useData(on ? `cls:${s}:${user.value!.uid}` : null,
    () => cloud.listEntries(s, addDays(today(), -60), addDays(today(), 200)), 5 * 60_000);
}

type Source = "school" | "hw" | "class";
interface Item { date: string; time: string; title: string; sub: string; src: Source; entry?: ClassEntry; text?: string }

export const SOURCE_COLOR: Record<Source, string> = { school: "oklch(.7 .11 230)", hw: "oklch(.72 .11 70)", class: "var(--ac)" };
const SOURCE_LABEL: Record<Source, TKey> = { school: "calSchool", hw: "calHw", class: "calClass" };

export function Calendar() {
  const ev = useEvents();
  const hw = useHomework();
  const cls = useClassEntries();
  const td = today();
  const [month, setMonth] = useState(() => (route.value.q.d ?? td).slice(0, 7));
  const [sel, setSel] = useState(route.value.q.d ?? td);
  const [edit, setEdit] = useState<Partial<ClassEntry> | null>(null);
  const [open, setOpen] = useState<Item | null>(null);
  const [filt, setFilt] = useState<Record<Source, boolean>>({ school: true, hw: true, class: true });

  const items = useMemo(() => {
    const out: Item[] = [];
    for (const e of ev.data ?? []) {
      let d = e.start.slice(0, 10);
      const endD = e.end.slice(0, 10);
      // multi-day events show on every day
      for (let i = 0; d <= endD && i < 40; i++, d = addDays(d, 1)) {
        out.push({ date: d, time: e.wholeDay ? "" : e.start.slice(11, 16), title: e.title, sub: [t("fromSchool"), e.type].filter(Boolean).join(" · "), src: "school", text: e.description });
      }
    }
    for (const h of hw.data ?? []) if (!h.done && h.due) out.push({ date: h.due, time: "", title: t("homeworkDue", { s: h.subjectName }), sub: h.text.slice(0, 80), src: "hw", text: h.text });
    for (const e of cls.data?.entries ?? []) {
      out.push({ date: e.date, time: e.time, title: e.title, sub: `${t(`kind_${e.kind}` as TKey)} · ${t("addedBy", { a: e.author })}`, src: "class", entry: e, text: e.note });
    }
    return out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }, [ev.data, hw.data, cls.data]);

  if (!user.value) return <Page title={t("tabCalendar")} backable={!isTab("/calendar")}><NeedLogin onLogin={() => go("/login")} /></Page>;

  const byDate = new Map<string, Item[]>();
  for (const it of items) if (filt[it.src]) byDate.set(it.date, [...(byDate.get(it.date) ?? []), it]);

  // month grid, Monday first; only the weeks this month touches
  const first = `${month}-01`;
  const start = mondayOf(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const rows = Math.ceil((cells.indexOf(first) + cells.filter((d) => d.slice(0, 7) === month).length) / 7);
  const shiftMonth = (n: number) => { const d = parseIso(first); d.setMonth(d.getMonth() + n); setMonth(isoDate(d).slice(0, 7)); };
  const monthName = parseIso(first).toLocaleDateString(lang.value === "cs" ? "cs-CZ" : "en-GB", { month: "long", year: "numeric" });
  const dayItems = byDate.get(sel) ?? [];
  const label = cls.data?.classLabel ?? user.value.classAbbrev;
  const canAdd = cloud.cloudAvailable();

  return (
    <Page title={t("tabCalendar")} sub={label ? (canAdd ? t("classCalendar", { c: label }) : label) : undefined} backable={!isTab("/calendar")}>
      <div class="cal-head">
        <button onClick={() => shiftMonth(-1)} aria-label="‹"><Icon name="caret-left" size={20} /></button>
        <b>{monthName.charAt(0).toUpperCase() + monthName.slice(1)}</b>
        <button onClick={() => shiftMonth(1)} aria-label="›"><Icon name="caret-right" size={20} /></button>
      </div>
      <div class="cal-grid">
        {[1, 2, 3, 4, 5, 6, 7].map((d) => <span class="cal-dow">{dayShort(d)}</span>)}
      </div>
      <div class="cal-grid" style={{ marginTop: "4px" }}>
        {cells.slice(0, rows * 7).map((d) => {
          const its = byDate.get(d) ?? [];
          const srcs = [...new Set(its.map((i) => i.src))];
          return (
            <button class={`cal-day ${d.slice(0, 7) !== month ? "other" : ""} ${d === td ? "today" : ""} ${d === sel ? "sel" : ""}`} onClick={() => setSel(d)}>
              <span>{Number(d.slice(8))}</span>
              <span class="cal-dots">{srcs.map((s) => <i style={{ background: SOURCE_COLOR[s] }} />)}</span>
            </button>
          );
        })}
      </div>
      <div class="chips cal-filters">
        {(["school", "hw", "class"] as Source[]).map((s) => (
          <button class={`chip pill ${filt[s] ? "on" : "off"}`} onClick={() => setFilt({ ...filt, [s]: !filt[s] })} aria-pressed={filt[s]}>
            <span class="dot" style={{ background: SOURCE_COLOR[s] }} />{t(SOURCE_LABEL[s])}
          </button>
        ))}
      </div>

      {(ev.error != null || cls.error != null) && <div style={{ marginTop: "12px" }}><ErrorBox error={ev.error ?? cls.error} onRetry={() => { ev.reload(); cls.reload(); }} /></div>}
      {!canAdd && <div class="banner" style={{ marginTop: "12px" }}>{t("cloudOff")}</div>}

      <div class="section-head" style={{ margin: "16px 0 8px" }}>
        <span class="label">{fmtDate(sel, true)} {(ev.loading || cls.loading) && <Spinner small />}</span>
        {canAdd && (
          <button class="link" onClick={() => setEdit({ date: sel >= td ? sel : td, kind: "test", title: "", note: "", time: "" })}>
            <Icon name="plus" size={14} />{t("addEntry")}
          </button>
        )}
      </div>
      <div class="stack">
        {!dayItems.length && <div class="hint" style={{ padding: "8px 0", fontSize: "13px" }}>{t("noEvents")}</div>}
        {dayItems.map((it) => (
          <button class="ev-row" onClick={() => setOpen(it)}>
            <span class="dot" style={{ width: "8px", height: "8px", background: SOURCE_COLOR[it.src] }} />
            <span class="row-main">
              <span class="row-title">{it.time && <span class="muted">{it.time} </span>}{it.title}</span>
              <span class="row-sub ellipsis">{it.sub}</span>
            </span>
          </button>
        ))}
      </div>

      <ItemSheet item={open} onClose={() => setOpen(null)} onEdit={(e) => { setOpen(null); setEdit(e); }} onChanged={cls.reload} />
      <EntryEditor entry={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); setFilt((f) => ({ ...f, class: true })); cls.reload(); }} />
    </Page>
  );
}

function ItemSheet({ item, onClose, onEdit, onChanged }: { item: Item | null; onClose: () => void; onEdit: (e: ClassEntry) => void; onChanged: () => void }) {
  const [msg, setMsg] = useState("");
  const [sure, setSure] = useState(false);
  useEffect(() => { setSure(false); setMsg(""); }, [item]);
  const school = settings.value.school?.url ?? "";
  const e = item?.entry;
  const act = async (fn: () => Promise<unknown>, done: string) => {
    try { await fn(); setMsg(done); onChanged(); if (done !== t("reported")) onClose(); } catch (err) { setMsg(errorText(err)); }
  };
  return (
    <Sheet open={!!item} onClose={() => { setMsg(""); setSure(false); onClose(); }} title={item?.title}
      sub={item ? `${fmtDate(item.date, true)}${item.time ? ` · ${item.time}` : ""} · ${item.sub}` : ""}>
      {item && (
        <div>
          {item.text && <p class="pre" style={{ fontSize: "14px", marginTop: "12px" }}>{item.text}</p>}
          {e && (
            <div class="btn-row" style={{ marginTop: "18px" }}>
              {e.mine ? (
                <>
                  <button class="btn line" onClick={() => onEdit(e)}><Icon name="pencil-simple" size={18} />{t("edit")}</button>
                  <button class="btn danger" onClick={() => (sure ? act(() => cloud.deleteEntry(school, e.id), t("delete")) : setSure(true))}>
                    <Icon name="trash" size={18} />{sure ? t("deleteConfirm") : t("delete")}
                  </button>
                </>
              ) : (
                <button class="btn line" onClick={() => act(() => cloud.reportEntry(school, e.id), t("reported"))}><Icon name="flag" size={18} />{t("report")}</button>
              )}
            </div>
          )}
          {msg && <p class="hint" style={{ marginTop: "10px" }}>{msg}</p>}
        </div>
      )}
    </Sheet>
  );
}

function EntryEditor({ entry, onClose, onSaved }: { entry: Partial<ClassEntry> | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Partial<ClassEntry>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const cur = { ...entry, ...f };
  const school = settings.value.school?.url ?? "";
  const set = (p: Partial<ClassEntry>) => setF({ ...f, ...p });

  const save = async (ev: Event) => {
    ev.preventDefault();
    if (!cur.title?.trim() || !cur.date) return;
    setBusy(true); setErr("");
    const body = { date: cur.date, time: cur.time ?? "", kind: cur.kind ?? "other", title: cur.title.trim(), note: (cur.note ?? "").trim() };
    try {
      if (cur.id) await cloud.updateEntry(school, cur.id, body); else await cloud.addEntry(school, body);
      setF({});
      onSaved();
    } catch (e) { setErr(errorText(e)); }
    setBusy(false);
  };

  return (
    <Sheet open={!!entry} onClose={() => { setF({}); onClose(); }} title={t("addEntry")} sub={cur.date ? fmtDate(cur.date, true) : undefined}>
      <form class="form" onSubmit={save} style={{ marginTop: "14px" }}>
        <Segmented<EntryKind> value={(cur.kind as EntryKind) ?? "test"} onChange={(k) => set({ kind: k })}
          options={(["test", "homework", "event", "other"] as EntryKind[]).map((k) => ({ v: k, label: t(`kind_${k}` as TKey) }))} />
        <input required maxLength={120} placeholder={t("title")} aria-label={t("title")} value={cur.title ?? ""} onInput={(e) => set({ title: (e.target as HTMLInputElement).value })} />
        <div class="form-2">
          <label>{t("date")}<input type="date" required value={cur.date ?? ""} onInput={(e) => set({ date: (e.target as HTMLInputElement).value })} /></label>
          <label>{t("time")}<input type="time" value={cur.time ?? ""} onInput={(e) => set({ time: (e.target as HTMLInputElement).value })} /></label>
        </div>
        <textarea rows={3} maxLength={1000} placeholder={t("note")} aria-label={t("note")} value={cur.note ?? ""} onInput={(e) => set({ note: (e.target as HTMLTextAreaElement).value })} />
        <p class="hint">{t("visibleClass")}</p>
        {err && <p class="hint err-text">{err}</p>}
        <button class="btn block" disabled={busy || !cur.title?.trim()}>{busy ? <Spinner small /> : t("save")}</button>
      </form>
    </Sheet>
  );
}
