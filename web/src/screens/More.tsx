import { useState } from "preact/hooks";
import { addDays, today } from "../lib/model";
import { fmtDate, fmtRelDay, t } from "../lib/i18n";
import { useAbsence, useHomework, useMessages } from "../lib/data";
import type { Message } from "../lib/bakalari";
import { settings, user } from "../lib/store";
import { Icon } from "../ui/icons";
import { Empty, ErrorBox, Loading, Page, Row, Section, Segmented, Sheet, subjectColor, Updated, usePullToRefresh } from "../ui/kit";
import { go } from "../ui/router";

export function NeedLogin() {
  return <Empty icon="user" text={t("loginNeeded")}><button class="btn" onClick={() => go("/login")}>{t("loginAction")}</button></Empty>;
}

export function More() {
  const logged = !!user.value;
  const pub = settings.value.publicOk;
  return (
    <Page title={t("tabMore")}>
      {logged && (
        <Section>
          <div class="card-list">
            <Row icon="book" accent="#f59e0b" title={t("homework")} chevron onClick={() => go("/homework")} />
            <Row icon="mail" accent="#0ea5e9" title={t("messages")} chevron onClick={() => go("/messages")} />
            <Row icon="clock" accent="#ef4444" title={t("absence")} chevron onClick={() => go("/absence")} />
          </div>
        </Section>
      )}
      {pub && (
        <Section>
          <div class="card-list">
            <Row icon="users" accent="#8b5cf6" title={t("compare")} sub={t("compareHint")} chevron onClick={() => go("/compare")} />
            <Row icon="pin" accent="#10b981" title={t("whereNow")} sub={t("whereHint")} chevron onClick={() => go("/where")} />
            <Row icon="door" accent="#6366f1" title={t("freeRooms")} chevron onClick={() => go("/rooms")} />
          </div>
        </Section>
      )}
      <Section>
        <div class="card-list">
          <Row icon="gear" title={t("settings")} chevron onClick={() => go("/settings")} />
          {!logged && <Row icon="user" title={t("loginAction")} chevron onClick={() => go("/login")} />}
        </div>
      </Section>
    </Page>
  );
}

export function Homework() {
  const hw = useHomework();
  const [tab, setTab] = useState<"todo" | "all">("todo");
  usePullToRefresh(hw.reload);
  if (!user.value) return <Page title={t("homework")} backable><NeedLogin /></Page>;
  const td = today();
  const list = (hw.data ?? [])
    .filter((h) => (tab === "todo" ? !h.done && !h.closed && h.due >= addDays(td, -1) : true))
    .sort((a, b) => (tab === "todo" ? a.due.localeCompare(b.due) : b.due.localeCompare(a.due)));
  return (
    <Page title={t("homework")} backable>
      <Segmented small value={tab} onChange={setTab} options={[{ v: "todo", label: t("hwTodo") }, { v: "all", label: t("hwAll") }]} />
      {hw.loading && !hw.data && <Loading />}
      {hw.error != null && <ErrorBox error={hw.error} onRetry={hw.reload} />}
      {hw.data && !list.length && <Empty icon="check" text={t("noHomework")} />}
      <div class="card-list">
        {list.map((h) => (
          <div class={`hw ${h.done ? "done" : ""}`} style={{ "--c": subjectColor(h.subject) } as any}>
            <div class="hw-head">
              <b>{h.subjectName}</b>
              <span class={`badge ${h.due <= addDays(td, 1) && !h.done ? "warn" : ""}`}>{h.done ? `✓ ${t("doneLabel")}` : t("due", { d: fmtRelDay(h.due, td) })}</span>
            </div>
            <p class="pre">{h.text}</p>
            <div class="muted small">{h.teacher}</div>
          </div>
        ))}
      </div>
      {hw.data && <Updated at={hw.at} loading={hw.loading} onRefresh={hw.reload} />}
    </Page>
  );
}

export function Messages() {
  const msgs = useMessages();
  const [open, setOpen] = useState<Message | null>(null);
  usePullToRefresh(msgs.reload);
  if (!user.value) return <Page title={t("messages")} backable><NeedLogin /></Page>;
  return (
    <Page title={t("messages")} backable>
      {msgs.loading && !msgs.data && <Loading />}
      {msgs.error != null && <ErrorBox error={msgs.error} onRetry={msgs.reload} />}
      {msgs.data && !msgs.data.length && <Empty icon="mail" text={t("noMessages")} />}
      <div class="card-list">
        {(msgs.data ?? []).map((m) => (
          <button class={`row tap msg ${m.read ? "" : "unread"}`} onClick={() => setOpen(m)}>
            <span class="row-icon"><Icon name={m.board ? "flag" : "mail"} size={20} /></span>
            <span class="row-main">
              <span class="row-title">{m.title || m.sender}</span>
              <span class="row-sub">{m.sender} · {fmtDate(m.date.slice(0, 10))}{m.board ? ` · ${t("noticeboard")}` : ""}</span>
              <span class="row-sub clamp2">{m.text}</span>
            </span>
          </button>
        ))}
      </div>
      {msgs.data && <Updated at={msgs.at} loading={msgs.loading} onRefresh={msgs.reload} />}
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.title || open?.sender} full>
        {open && (
          <div class="msg-body">
            <div class="muted">{open.sender} · {fmtDate(open.date.slice(0, 10), true)} {open.date.slice(11, 16)}</div>
            <p class="pre">{linkify(open.text)}</p>
          </div>
        )}
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
          {d.unsolved > 0 && <div class="banner warn">{t("unsolved", { n: d.unsolved })}</div>}
          <Section title={d.threshold ? t("threshold", { p: Math.round(d.threshold) }) : undefined}>
            <div class="card-list">
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
                    <b class={over ? "text-bad" : near ? "text-warn" : ""}>{s.percent.toFixed(0)} %</b>
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
