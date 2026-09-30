import { useEffect, useMemo, useState } from "preact/hooks";
import { addDays, isoDate, mondayOf, parseIso, today } from "../lib/model";
import { dayShort, fmtDate, lang, t, type TKey } from "../lib/i18n";
import { useEvents, useHomework } from "../lib/data";
import { settings, user, useData } from "../lib/store";
import * as cloud from "../lib/cloud";
import type { ClassEntry, EntryKind } from "../lib/cloud";
import { Icon, type IconName } from "../ui/icons";
import { Empty, ErrorBox, Page, Section, Segmented, Sheet, Spinner, errorText } from "../ui/kit";
import { route } from "../ui/router";
import { NeedLogin } from "./More";

export function useClassEntries() {
  const s = settings.value.school?.url ?? "";
  const on = !!user.value && cloud.cloudAvailable() && !!s;
  return useData(on ? `cls:${s}:${user.value!.uid}` : null,
    () => cloud.listEntries(s, addDays(today(), -60), addDays(today(), 200)), 5 * 60_000);
}

interface Item { date: string; time: string; title: string; sub: string; icon: IconName; color: string; entry?: ClassEntry; text?: string }

const KIND_ICON: Record<EntryKind, IconName> = { test: "alert", homework: "book", event: "star", other: "info" };
const KIND_COLOR: Record<EntryKind, string> = { test: "#ef4444", homework: "#f59e0b", event: "#8b5cf6", other: "#64748b" };

export function Calendar() {
  const ev = useEvents();
  const hw = useHomework();
  const cls = useClassEntries();
  const td = today();
  const [month, setMonth] = useState(() => (route.value.q.d ?? td).slice(0, 7));
  const [sel, setSel] = useState(route.value.q.d ?? td);
  const [edit, setEdit] = useState<Partial<ClassEntry> | null>(null);
  const [open, setOpen] = useState<Item | null>(null);

  const items = useMemo(() => {
    const out: Item[] = [];
    for (const e of ev.data ?? []) {
      let d = e.start.slice(0, 10);
      const endD = e.end.slice(0, 10);
      // multi-day events show on every day
      for (let i = 0; d <= endD && i < 40; i++, d = addDays(d, 1)) {
        out.push({ date: d, time: e.wholeDay ? "" : e.start.slice(11, 16), title: e.title, sub: `${t("fromSchool")} · ${e.type}`, icon: "cal", color: "#0ea5e9", text: e.description });
      }
    }
    for (const h of hw.data ?? []) if (!h.done && h.due) out.push({ date: h.due, time: "", title: t("homeworkDue", { s: h.subjectName }), sub: h.text.slice(0, 80), icon: "book", color: "#f59e0b", text: h.text });
    for (const e of cls.data?.entries ?? []) {
      out.push({ date: e.date, time: e.time, title: e.title, sub: `${t(`kind_${e.kind}` as TKey)} · ${t("addedBy", { a: e.author })}`, icon: KIND_ICON[e.kind], color: KIND_COLOR[e.kind], entry: e, text: e.note });
    }
    return out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }, [ev.data, hw.data, cls.data]);

  if (!user.value) return <Page title={t("tabCalendar")}><NeedLogin /></Page>;

  const byDate = new Map<string, Item[]>();
  for (const it of items) byDate.set(it.date, [...(byDate.get(it.date) ?? []), it]);

  // month grid, Monday first
  const first = `${month}-01`;
  const start = mondayOf(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const shiftMonth = (n: number) => { const d = parseIso(first); d.setMonth(d.getMonth() + n); setMonth(isoDate(d).slice(0, 7)); };
  const monthName = parseIso(first).toLocaleDateString(lang.value === "cs" ? "cs-CZ" : "en-GB", { month: "long", year: "numeric" });
  const dayItems = byDate.get(sel) ?? [];
  const label = cls.data?.classLabel ?? user.value.classAbbrev;
  const canAdd = cloud.cloudAvailable();

  return (
    <Page title={t("tabCalendar")} sub={canAdd && label ? t("classCalendar", { c: label }) : undefined}>
      <div class="cal">
        <div class="cal-head">
          <button class="icon-btn" onClick={() => shiftMonth(-1)} aria-label="‹"><Icon name="back" /></button>
          <b>{monthName}</b>
          <button class="icon-btn" onClick={() => shiftMonth(1)} aria-label="›"><Icon name="chev" /></button>
        </div>
        <div class="cal-grid">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => <span class="cal-dow">{dayShort(d)}</span>)}
          {cells.map((d) => {
            const its = byDate.get(d) ?? [];
            return (
              <button class={`cal-day ${d.slice(0, 7) !== month ? "other" : ""} ${d === td ? "today" : ""} ${d === sel ? "sel" : ""}`} onClick={() => setSel(d)}>
                <span>{Number(d.slice(8))}</span>
                <span class="cal-dots">{its.slice(0, 3).map((i) => <i style={{ background: i.color }} />)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {(ev.error != null || cls.error != null) && <ErrorBox error={ev.error ?? cls.error} onRetry={() => { ev.reload(); cls.reload(); }} />}
      {!canAdd && <div class="banner soft">{t("cloudOff")}</div>}

      <Section title={fmtDate(sel, true)} action={(ev.loading || cls.loading) ? <Spinner small /> : undefined}>
        {!dayItems.length && <Empty icon="cal" text={t("noEvents")} />}
        <div class="card-list">
          {dayItems.map((it) => (
            <button class="row tap" onClick={() => setOpen(it)}>
              <span class="row-icon" style={{ color: it.color, background: `${it.color}1f` }}><Icon name={it.icon} size={20} /></span>
              <span class="row-main">
                <span class="row-title">{it.time && <span class="muted">{it.time} </span>}{it.title}</span>
                <span class="row-sub clamp2">{it.sub}</span>
              </span>
            </button>
          ))}
        </div>
      </Section>

      {canAdd && (
        <button class="fab" onClick={() => setEdit({ date: sel >= td ? sel : td, kind: "test", title: "", note: "", time: "" })} aria-label={t("addEntry")}>
          <Icon name="plus" size={26} />
        </button>
      )}
      <ItemSheet item={open} onClose={() => setOpen(null)} onEdit={(e) => { setOpen(null); setEdit(e); }} onChanged={cls.reload} />
      <EntryEditor entry={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); cls.reload(); }} />
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
    <Sheet open={!!item} onClose={() => { setMsg(""); setSure(false); onClose(); }} title={item?.title}>
      {item && (
        <div class="entry-detail">
          <div class="muted">{fmtDate(item.date, true)}{item.time ? ` · ${item.time}` : ""}</div>
          <div class="muted">{item.sub}</div>
          {item.text && <p class="pre">{item.text}</p>}
          {e && (
            <div class="btn-row">
              {e.mine ? (
                <>
                  <button class="btn ghost" onClick={() => onEdit(e)}><Icon name="gear" size={18} />{t("edit")}</button>
                  <button class="btn danger" onClick={() => (sure ? act(() => cloud.deleteEntry(school, e.id), t("delete")) : setSure(true))}>
                    <Icon name="trash" size={18} />{sure ? t("deleteConfirm") : t("delete")}
                  </button>
                </>
              ) : (
                <button class="btn ghost" onClick={() => act(() => cloud.reportEntry(school, e.id), t("reported"))}><Icon name="flag" size={18} />{t("report")}</button>
              )}
            </div>
          )}
          {msg && <p class="hint">{msg}</p>}
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
    <Sheet open={!!entry} onClose={() => { setF({}); onClose(); }} title={t("addEntry")}>
      <form class="form" onSubmit={save}>
        <Segmented<EntryKind> small value={(cur.kind as EntryKind) ?? "test"} onChange={(k) => set({ kind: k })}
          options={(["test", "homework", "event", "other"] as EntryKind[]).map((k) => ({ v: k, label: t(`kind_${k}` as TKey) }))} />
        <label>{t("title")}<input required maxLength={120} value={cur.title ?? ""} onInput={(e) => set({ title: (e.target as HTMLInputElement).value })} /></label>
        <div class="form-2">
          <label>{t("date")}<input type="date" required value={cur.date ?? ""} onInput={(e) => set({ date: (e.target as HTMLInputElement).value })} /></label>
          <label>{t("time")}<input type="time" value={cur.time ?? ""} onInput={(e) => set({ time: (e.target as HTMLInputElement).value })} /></label>
        </div>
        <label>{t("note")}<textarea rows={3} maxLength={1000} value={cur.note ?? ""} onInput={(e) => set({ note: (e.target as HTMLTextAreaElement).value })} /></label>
        {err && <p class="error-text">{err}</p>}
        <button class="btn block" disabled={busy}>{busy ? <Spinner small /> : t("save")}</button>
      </form>
    </Sheet>
  );
}
