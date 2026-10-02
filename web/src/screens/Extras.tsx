// "Další z Bakalářů": the official app's less used modules, kept out of the way (Více → Další z Bakalářů).
// One route, /extras, with ?s= for the section: final (Pololetí), subst (Suplování), subjects (Předměty), themes (Výuka).

import { useState } from "preact/hooks";
import { fmtDate, fmtRelDay, t, type TKey } from "../lib/i18n";
import { today } from "../lib/model";
import { findTeacher, useCabinets, useDirectory, useFinalMarks, useSubjects, useSubstitutions, useThemes } from "../lib/data";
import type { SubjectInfo } from "../lib/bakalari";
import { settings, user } from "../lib/store";
import { Icon, type IconName } from "../ui/icons";
import { Empty, ErrorBox, Loading, Page, Row, Sheet, Updated, usePullToRefresh } from "../ui/kit";
import { go, route } from "../ui/router";
import { NeedLogin } from "./More";

const SECTIONS: { s: string; icon: IconName; title: TKey; sub: TKey }[] = [
  { s: "final", icon: "chart-line-up", title: "exFinal", sub: "exFinalSub" },
  { s: "subst", icon: "swap", title: "exSubst", sub: "exSubstSub" },
  { s: "subjects", icon: "notebook", title: "exSubjects", sub: "exSubjectsSub" },
  { s: "themes", icon: "rows", title: "exThemes", sub: "exThemesSub" },
];

export function Extras() {
  const s = route.value.q.s;
  if (!user.value) return <Page title={t("extras")} backable><NeedLogin /></Page>;
  if (s === "final") return <FinalMarks />;
  if (s === "subst") return <Substitutions />;
  if (s === "subjects") return <Subjects />;
  if (s === "themes") return <Themes />;
  const school = settings.value.school?.url ?? "";
  return (
    <Page title={t("extras")} backable>
      <p class="hint" style={{ margin: "0 4px 12px" }}>{t("extrasHint")}</p>
      <div class="stack">
        {SECTIONS.map((x) => <Row icon={x.icon} title={t(x.title)} sub={t(x.sub)} chevron onClick={() => go("/extras", { s: x.s })} />)}
        <Row icon="envelope-simple" title={t("exInfo")} sub={t("exInfoSub")} chevron onClick={() => go("/messages")} />
      </div>
      <div class="section-head" style={{ marginTop: "22px" }}><span class="label">{t("exWebOnly")}</span></div>
      <div class="stack">
        {(["exPolls", "exConfirm"] as TKey[]).map((k) => (
          <a class="row" href={`${school}/login`} target="_blank" rel="noopener noreferrer">
            <span class="row-icon"><Icon name={k === "exPolls" ? "check-circle" : "flag"} size={20} /></span>
            <span class="row-main"><span class="row-title">{t(k)}</span><span class="row-sub">{t("exOpenWeb")}</span></span>
            <Icon name="export" size={16} class="chev" />
          </a>
        ))}
      </div>
    </Page>
  );
}

// ---- Pololetí: final marks per report term ----

function FinalMarks() {
  const fin = useFinalMarks();
  const [sel, setSel] = useState(0);
  usePullToRefresh(fin.reload);
  const terms = fin.data ?? [];
  const term = terms[Math.min(sel, terms.length - 1)];
  return (
    <Page title={t("exFinal")} backable>
      {fin.loading && !fin.data && <Loading />}
      {fin.error != null && <ErrorBox error={fin.error} onRetry={fin.reload} />}
      {fin.data && !terms.length && <Empty icon="chart-line-up" text={t("exNothing")} />}
      {terms.length > 1 && (
        <div class="chips scroll" style={{ marginBottom: "12px" }}>
          {terms.map((x, i) => <button class={`chip ${x === term ? "on" : ""}`} onClick={() => setSel(i)}>{x.label}</button>)}
        </div>
      )}
      {term && (
        <>
          <div class="card" style={{ marginBottom: "10px" }}>
            <div style={{ fontWeight: 500 }}>{term.label}{term.year ? ` · ${term.year}` : ""}</div>
            <div class="hint">
              {[term.achievement, term.average != null ? t("exAverage", { a: term.average.toFixed(2).replace(".", ",") }) : "",
                t("exAbsent", { a: term.absent, b: term.unexcused }), term.closed ? "" : t("exOpen")].filter(Boolean).join(" · ")}
            </div>
          </div>
          <div class="stack">
            {term.marks.map((m) => <Row title={m.subject || m.abbrev} right={<b class="ex-mark">{m.mark || "–"}</b>} />)}
          </div>
        </>
      )}
      {fin.data && <Updated at={fin.at} loading={fin.loading} onRefresh={fin.reload} />}
    </Page>
  );
}

// ---- Suplování: the school's substitution list for this student ----

function Substitutions() {
  const sub = useSubstitutions();
  usePullToRefresh(sub.reload);
  const td = today();
  const days = [...new Set((sub.data ?? []).map((c) => c.day))];
  return (
    <Page title={t("exSubst")} backable>
      {sub.loading && !sub.data && <Loading />}
      {sub.error != null && <ErrorBox error={sub.error} onRetry={sub.reload} />}
      {sub.data && !sub.data.length && <Empty icon="swap" text={t("exNoSubst")} />}
      {days.map((d) => (
        <section class="section">
          <div class="section-head"><span class="label">{d ? `${fmtRelDay(d, td)} · ${fmtDate(d)}` : "—"}</span></div>
          <div class="stack">
            {(sub.data ?? []).filter((c) => c.day === d).map((c) => (
              <Row icon="swap" title={[c.hours && t("period", { n: c.hours }), c.type].filter(Boolean).join(" · ")} sub={[c.text, c.time].filter(Boolean).join(" · ")} />
            ))}
          </div>
        </section>
      ))}
      {sub.data && <Updated at={sub.at} loading={sub.loading} onRefresh={sub.reload} />}
    </Page>
  );
}

// ---- Předměty: subjects with the teacher's contacts ----

function Subjects() {
  const subj = useSubjects();
  const dir = useDirectory();
  const cabs = useCabinets();
  const [open, setOpen] = useState<SubjectInfo | null>(null);
  usePullToRefresh(subj.reload);
  const tg = open ? findTeacher(dir.data, open.teacherAbbrev, open.teacher) : undefined;
  const cab = tg ? cabs.data?.[tg.id] : undefined;
  return (
    <Page title={t("exSubjects")} backable>
      {subj.loading && !subj.data && <Loading />}
      {subj.error != null && <ErrorBox error={subj.error} onRetry={subj.reload} />}
      {subj.data && !subj.data.length && <Empty icon="notebook" text={t("exNothing")} />}
      <div class="stack">
        {(subj.data ?? []).map((x) => <Row title={x.name} sub={x.teacher} chevron onClick={() => setOpen(x)} />)}
      </div>
      {subj.data && <Updated at={subj.at} loading={subj.loading} onRefresh={subj.reload} />}
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.name} sub={open?.teacher}>
        {open && (
          <div class="link-list" style={{ marginTop: "8px" }}>
            {open.email && <a class="row" href={`mailto:${open.email}`}><span class="row-icon"><Icon name="envelope-simple" size={20} /></span><span class="row-main"><span class="row-title">{open.email}</span><span class="row-sub">{t("exEmail")}</span></span></a>}
            {open.phone && <a class="row" href={`tel:${open.phone.replace(/\s+/g, "")}`}><span class="row-icon"><Icon name="bell" size={20} /></span><span class="row-main"><span class="row-title">{open.phone}</span><span class="row-sub">{t("exPhone")}</span></span></a>}
            {open.web && <a class="row" href={/^https?:/.test(open.web) ? open.web : `https://${open.web}`} target="_blank" rel="noopener noreferrer"><span class="row-icon"><Icon name="export" size={20} /></span><span class="row-main"><span class="row-title">{open.web}</span><span class="row-sub">{t("exWeb")}</span></span></a>}
            {cab?.room && <Row icon="door" title={t("cabinetX", { r: cab.room })} sub={cab.hours ? t("consultX", { h: cab.hours }) : undefined} />}
            <Row icon="rows" title={t("exThemes")} chevron onClick={() => { const id = open.id; setOpen(null); setTimeout(() => go("/extras", { s: "themes", id }), 50); }} />
            {tg && <Row icon="calendar-blank" title={t("openTimetableBtn")} chevron onClick={() => { setOpen(null); setTimeout(() => go("/timetable", { k: tg.kind, id: tg.id, n: tg.name }), 50); }} />}
          </div>
        )}
      </Sheet>
    </Page>
  );
}

// ---- Výuka: lesson topics of one subject ----

function Themes() {
  const subj = useSubjects();
  const id = route.value.q.id || subj.data?.[0]?.id || null;
  const th = useThemes(id);
  const name = subj.data?.find((x) => x.id === id)?.name;
  return (
    <Page title={t("exThemes")} sub={name} backable>
      {(subj.data?.length ?? 0) > 1 && (
        <div class="chips scroll" style={{ marginBottom: "12px" }}>
          {subj.data!.map((x) => <button class={`chip ${x.id === id ? "on" : ""}`} onClick={() => go("/extras", { s: "themes", id: x.id }, true)}>{x.abbrev || x.name}</button>)}
        </div>
      )}
      {th.loading && !th.data && <Loading />}
      {th.error != null && <ErrorBox error={th.error} onRetry={th.reload} />}
      {th.data && !th.data.length && <Empty icon="rows" text={t("exNoThemes")} />}
      <div class="stack">
        {(th.data ?? []).map((x) => <Row title={x.theme || "—"} sub={[x.date ? fmtDate(x.date) : "", x.hour && t("period", { n: x.hour }), x.note].filter(Boolean).join(" · ")} />)}
      </div>
    </Page>
  );
}
