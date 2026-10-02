import { useState } from "preact/hooks";
import { addDays, today } from "../lib/model";
import { fmtDate, fmtRelDay, t } from "../lib/i18n";
import { useAbsence, useHomework, useMessages } from "../lib/data";
import type { Homework as Hw, Message } from "../lib/bakalari";
import { setHomeworkDone } from "../lib/bakalari";
import { settings, user } from "../lib/store";
import { Icon } from "../ui/icons";
import { Empty, ErrorBox, Loading, NeedLogin as NeedLoginBox, Page, Row, Section, Segmented, Sheet, Spinner, Updated, usePullToRefresh } from "../ui/kit";
import { go, isTab } from "../ui/router";
import { SECTION_META, available, tabSections } from "../ui/sections";
import { sectionPath } from "../ui/prefs";
import { wide } from "../ui/layout";

export function NeedLogin() {
  return <NeedLoginBox onLogin={() => go("/login")} />;
}

export function More() {
  const logged = !!user.value;
  const msgs = useMessages();
  const unread = (msgs.data ?? []).filter((m) => !m.read && !m.board).length;
  const inTabs = tabSections();
  const rest = available().filter((s) => s !== "today" && !inTabs.includes(s));
  return (
    <Page title={t("tabMore")}>
      <div class="stack">
        {rest.map((s) => (
          <Row big icon={SECTION_META[s].icon} title={t(SECTION_META[s].label)} chevron onClick={() => go(sectionPath(s))}
            badge={s === "messages" && unread ? String(unread) : undefined} />
        ))}
        {settings.value.publicOk && <Row big icon="user" title={t("teachersTitle")} sub={t("teachersSub")} chevron onClick={() => go("/teachers")} />}
        {logged && <Row big icon="clock-countdown" title={t("absence")} chevron onClick={() => go("/absence")} />}
        {logged && <Row big icon="dots-three-outline" title={t("extras")} sub={t("extrasSub")} chevron onClick={() => go("/extras")} />}
        {!logged && <Row big icon="sign-in" title={t("loginAction")} sub={t("unlockHint")} chevron onClick={() => go("/login")} />}
        <Row big icon="gear" title={t("settings")} chevron onClick={() => go("/settings")} />
        <Row big icon="sliders-horizontal" title={t("customize")} chevron onClick={() => go("/customize")} />
      </div>
      <p class="hint" style={{ padding: "10px 4px" }}>{t("unofficial")}</p>
    </Page>
  );
}

export function Homework() {
  const hw = useHomework();
  const [tab, setTab] = useState<"todo" | "all">("todo");
  const [open, setOpen] = useState<Hw | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  usePullToRefresh(hw.reload);
  const backable = !isTab("/homework");
  // Tick at once, then tell Bakaláři; put it back if the school refuses.
  const toggle = async (h: Hw) => {
    if (!hw.data || busy) return;
    const before = hw.data;
    const flip = (v: boolean) => before.map((x) => (x.id === h.id ? { ...x, done: v } : x));
    setBusy(h.id); setErr(null);
    hw.set(flip(!h.done));
    if (open?.id === h.id) setOpen({ ...h, done: !h.done });
    try { await setHomeworkDone(h.id, !h.done); }
    catch (e) { hw.set(before); setErr(e); if (open?.id === h.id) setOpen(h); }
    setBusy(null);
  };
  if (!user.value) return <Page title={t("homework")} backable={backable}><NeedLogin /></Page>;
  const td = today();
  const list = (hw.data ?? [])
    .filter((h) => (tab === "todo" ? !h.done && !h.closed && h.due >= addDays(td, -1) : true))
    .sort((a, b) => (tab === "todo" ? a.due.localeCompare(b.due) : b.due.localeCompare(a.due)));
  return (
    <Page title={t("homework")} backable={backable}>
      <div style={{ marginBottom: "12px" }}>
        <Segmented value={tab} onChange={setTab} options={[{ v: "todo", label: t("hwTodo") }, { v: "all", label: t("hwAll") }]} />
      </div>
      {hw.loading && !hw.data && <Loading />}
      {hw.error != null && <ErrorBox error={hw.error} onRetry={hw.reload} />}
      {err != null && <ErrorBox error={err} />}
      {hw.data && !list.length && <Empty icon="check-circle" text={t("noHomework")} />}
      <div class="stack">
        {list.map((h) => {
          const soon = !h.done && h.due <= addDays(td, 1);
          const late = !h.done && h.due < td;
          return (
            <button class={`row hw-row ${h.done ? "done" : ""}`} onClick={() => setOpen(h)}>
              <span class="row-icon hw-check" role="checkbox" aria-checked={h.done} aria-label={t(h.done ? "hwUndone" : "hwDone")} tabIndex={0}
                onClick={(e) => { e.stopPropagation(); toggle(h); }}
                onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); toggle(h); } }}>
                {busy === h.id ? <Spinner small /> : <Icon name={h.done ? "check-circle" : "circle"} size={22} fill={h.done} />}
              </span>
              <span class="row-main">
                <span class="row-title clamp2">{h.subjectName} · {h.text}</span>
                <span class="row-sub">
                  <span class={late ? "err-text" : soon ? "warn-text" : ""}>{h.done ? t("doneLabel") : late ? t("overdue", { d: fmtRelDay(h.due, td) }) : t("due", { d: fmtRelDay(h.due, td) })}</span>
                  {h.teacher ? ` · ${h.teacher}` : ""}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {hw.data && <Updated at={hw.at} loading={hw.loading} onRefresh={hw.reload} />}
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.subjectName}
        sub={open ? [open.done ? t("doneLabel") : t("due", { d: fmtRelDay(open.due, td) }), open.teacher].filter(Boolean).join(" · ") : ""}>
        {open && <p class="msg-body pre">{linkify(open.text)}</p>}
        {open && (
          <div class="btn-row" style={{ marginTop: "16px" }}>
            <button class={`btn ${open.done ? "line" : ""}`} disabled={busy === open.id} onClick={() => toggle(open)}>
              <Icon name={open.done ? "circle" : "check-circle"} size={18} />{t(open.done ? "hwUndone" : "hwDone")}
            </button>
          </div>
        )}
      </Sheet>
    </Page>
  );
}

export function Messages() {
  const msgs = useMessages();
  const [open, setOpen] = useState<Message | null>(null);
  usePullToRefresh(msgs.reload);
  const backable = !isTab("/messages");
  if (!user.value) return <Page title={t("messages")} backable={backable}><NeedLogin /></Page>;
  const td = today();
  // Desktop: inbox on the left, the open message in a reading pane on the right.
  const pane = wide.value ? open ?? msgs.data?.[0] ?? null : null;
  return (
    <Page title={t("messages")} backable={backable}>
      {msgs.loading && !msgs.data && <Loading />}
      {msgs.error != null && <ErrorBox error={msgs.error} onRetry={msgs.reload} />}
      {msgs.data && !msgs.data.length && <Empty icon="envelope-simple" text={t("noMessages")} />}
      <div class={pane ? "split msgs" : ""}>
      <div class="stack split-main">
        {(msgs.data ?? []).map((m) => (
          <button class={`row msg-row ${m.read ? "" : "unread"} ${pane === m ? "sel" : ""}`} onClick={() => setOpen(m)}>
            <span class="unread-dot" />
            <span class="row-main">
              <span class="msg-top">
                <span class="msg-from ellipsis">{m.sender}{m.board ? ` · ${t("noticeboard")}` : ""}</span>
                <span class="msg-when">{m.date ? fmtRelDay(m.date.slice(0, 10), td) : ""}</span>
              </span>
              {m.title && <span class="msg-subj">{m.title}</span>}
              <span class="msg-prev">{m.text}</span>
            </span>
          </button>
        ))}
      </div>
      {pane && (
        <article class="split-side reader">
          <h2>{pane.title || pane.sender}</h2>
          <div class="reader-from"><span class="reader-av">{pane.sender.replace(/^(\S+\.\s*)+/, "").slice(0, 2).toUpperCase()}</span>
            <span><b>{pane.sender}</b><small>{fmtDate(pane.date.slice(0, 10), true)} {pane.date.slice(11, 16)}{pane.board ? ` · ${t("noticeboard")}` : ""}</small></span></div>
          <p class="msg-body pre">{linkify(pane.text)}</p>
        </article>
      )}
      </div>
      {msgs.data && <Updated at={msgs.at} loading={msgs.loading} onRefresh={msgs.reload} />}
      <Sheet open={!!open && !wide.value} onClose={() => setOpen(null)} title={open?.title || open?.sender} full
        sub={open ? `${open.sender} · ${fmtDate(open.date.slice(0, 10), true)} ${open.date.slice(11, 16)}` : ""}>
        {open && <p class="msg-body pre">{linkify(open.text)}</p>}
      </Sheet>
    </Page>
  );
}

/** Plain text with clickable links (the text itself is never parsed as HTML). */
function linkify(text: string) {
  const parts = text.split(/(https?:\/\/[^\s<>"]+)/g);
  return parts.map((p, i) => (i % 2 ? <a href={p} target="_blank" rel="noopener noreferrer">{p}</a> : p));
}

export function Absence() {
  const abs = useAbsence();
  if (!user.value) return <Page title={t("absence")} backable><NeedLogin /></Page>;
  const d = abs.data;
  return (
    <Page title={t("absence")} backable>
      {abs.loading && !d && <Loading />}
      {abs.error != null && <ErrorBox error={abs.error} onRetry={abs.reload} />}
      {d && (
        <>
          {d.perSubject.filter((s) => s.lessons > 0 && d.threshold > 0 && s.percent >= d.threshold).map((s) => (
            <div class="banner err"><Icon name="warning" size={16} />{t("overLimit", { s: s.subject, p: s.percent.toFixed(0), l: Math.round(d.threshold) })}</div>
          ))}
          {d.unsolved > 0 && <div class="banner warn"><Icon name="warning" size={16} />{t("unsolved", { n: d.unsolved })}</div>}
          <Section title={d.threshold ? t("threshold", { p: Math.round(d.threshold) }) : undefined}>
            <div class="stack">
              {d.perSubject.filter((s) => s.lessons > 0).sort((a, b) => b.percent - a.percent).map((s) => {
                const over = d.threshold > 0 && s.percent >= d.threshold;
                const near = d.threshold > 0 && s.percent >= d.threshold * 0.75;
                return (
                  <div class="row">
                    <span class="row-main">
                      <span class="row-title">{s.subject}</span>
                      <span class="row-sub">{t("missed")}: {s.missed} / {s.lessons} {t("lessons")}{s.late ? ` · ${t("lateCount", { n: s.late })}` : ""}</span>
                      <span class="meter"><span class={over ? "bad" : near ? "warn" : ""} style={{ width: `${Math.min(100, d.threshold ? (s.percent / d.threshold) * 100 : s.percent)}%` }} /></span>
                    </span>
                    <span class={`row-right ${over ? "err-text" : near ? "warn-text" : ""}`}>{s.percent.toFixed(0)} %</span>
                  </div>
                );
              })}
            </div>
          </Section>
        </>
      )}
    </Page>
  );
}
