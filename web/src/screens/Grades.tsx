import { useState } from "preact/hooks";
import { t, fmtDate } from "../lib/i18n";
import { useMarks } from "../lib/data";
import type { Mark, SubjectMarks } from "../lib/bakalari";
import { addDays, today } from "../lib/model";
import { schoolName, user } from "../lib/store";
import { Icon } from "../ui/icons";
import { Empty, ErrorBox, Loading, NeedLogin, Page, Section, Segmented, Updated, usePullToRefresh } from "../ui/kit";
import { go, isTab, route } from "../ui/router";
import { wide } from "../ui/layout";

export function weightedAverage(marks: { value: number | null; weight: number }[]): number | null {
  let s = 0, w = 0;
  for (const m of marks) if (m.value !== null) { s += m.value * m.weight; w += m.weight; }
  return w ? s / w : null;
}

const fmtAvg = (x: number | null) => (x === null ? "–" : x.toFixed(2).replace(".", ","));
const avgClass = (x: number | null) => (x === null ? "" : x <= 1.5 ? "good" : x <= 2.5 ? "" : "bad");
const parseAvg = (s: string) => { const n = parseFloat(s.replace(",", ".")); return isNaN(n) ? null : n; };

export function Grades() {
  const marks = useMarks();
  usePullToRefresh(marks.reload);
  const backable = !isTab("/grades");
  if (!user.value) return <Page title={t("tabGrades")} backable={backable}><NeedLogin onLogin={() => go("/login")} /></Page>;
  const sid = route.value.q.s;
  const subj = marks.data?.find((s) => s.id === sid);
  if (sid && subj && !wide.value) return <SubjectDetail s={subj} />;
  // Desktop: list on the left, the selected subject's calculator on the right.
  const panel = wide.value ? subj ?? marks.data?.[0] : undefined;

  const avgs = (marks.data ?? []).map((s) => parseAvg(s.average) ?? weightedAverage(s.marks)).filter((x): x is number => x !== null);
  const overall = avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null;
  const since = addDays(today(), -7);
  const fresh = (marks.data ?? []).reduce((n, s) => n + s.marks.filter((m) => m.isNew || m.date >= since).length, 0);

  return (
    <Page title={t("tabGrades")} sub={schoolName()} backable={backable}>
      {marks.loading && !marks.data && <Loading />}
      {marks.error != null && <ErrorBox error={marks.error} onRetry={marks.reload} />}
      {marks.data && !marks.data.length && <Empty icon="chart-line-up" text={t("noGrades")} />}
      <div class={panel ? "split" : ""}>
      <div class="split-main">
      {overall !== null && (
        <div class="overall">
          <b>{fmtAvg(overall)}</b>
          <span>{t("overall")}<br />{t("newThisWeek", { n: fresh })}</span>
        </div>
      )}
      <div class="stack" style={{ marginTop: "12px" }}>
        {(marks.data ?? []).map((s) => {
          const avg = parseAvg(s.average) ?? weightedAverage(s.marks);
          const maxW = Math.max(1, ...s.marks.map((m) => m.weight));
          // Only highlight the heaviest marks when weights actually differ – with equal weights every mark would be "heavy".
          const mixed = new Set(s.marks.map((m) => m.weight)).size > 1;
          return (
            <button class={`subject ${panel?.id === s.id ? "sel" : ""}`} onClick={() => go("/grades", { s: s.id }, !!panel)}>
              <span class="subject-head">
                <span class="subject-name">{s.name}</span>
                <span class={`avg ${avgClass(avg)}`}>{s.average || fmtAvg(avg)}</span>
              </span>
              <span class="marks">
                {s.marks.slice(0, 12).map((m) => (
                  <span class={`mark ${mixed && m.weight >= maxW ? "heavy" : ""} ${m.isNew ? "new" : ""}`}>{m.text}</span>
                ))}
                <span class="calc-link"><Icon name="calculator" size={13} />{t("calc")}</span>
              </span>
            </button>
          );
        })}
      </div>
      </div>
      {panel && <aside class="split-side"><div class="panel-head"><h2>{panel.name}</h2><span class="muted">{t("average")}: {panel.average || fmtAvg(weightedAverage(panel.marks))}</span></div><SubjectBody s={panel} key={panel.id} /></aside>}
      </div>
      {marks.data && <Updated at={marks.at} loading={marks.loading} onRefresh={marks.reload} />}
    </Page>
  );
}

function SubjectDetail({ s }: { s: SubjectMarks }) {
  const current = weightedAverage(s.marks);
  return (
    <Page title={s.name} backable sub={`${t("average")}: ${s.average || fmtAvg(current)}`}>
      <SubjectBody s={s} />
    </Page>
  );
}

/** Grade calculator + marks of one subject (a page on phones, the side panel on desktop). */
function SubjectBody({ s }: { s: SubjectMarks }) {
  const [extra, setExtra] = useState<Mark[]>([]);
  const [target, setTarget] = useState(1.5);
  const [w, setW] = useState(() => Math.max(1, ...s.marks.map((m) => m.weight)));
  const all = [...s.marks, ...extra];
  const withExtra = weightedAverage(all);

  // Needed grade x with weight w: (S + x·w) / (W + w) = target  →  x = (target·(W+w) − S) / w
  const S = all.reduce((a, m) => a + (m.value ?? 0) * (m.value !== null ? m.weight : 0), 0);
  const W = all.reduce((a, m) => a + (m.value !== null ? m.weight : 0), 0);
  const need = (target * (W + w) - S) / w;
  // Lower is better: any grade up to `need` keeps the target. Show the worst grade that is still enough.
  const there = need >= 5;
  const needText = need < 1 ? "—" : there ? "✓" : roundMark(need);
  const note = need < 1 ? t("impossible") : there ? t("alreadyThere") : "";

  const addMark = (v: number) => setExtra([...extra, { id: `x${extra.length}`, text: String(v), value: v, weight: w, caption: t("hypothetical"), theme: "", date: "", isNew: false }]);

  return (
    <>
      {s.pointsOnly && <div class="banner">{t("pointsOnly")}</div>}
      <div class="label">{t("calculator")}</div>
      <div class="field-label">{t("goal")}</div>
      <Segmented<number> value={target} onChange={setTarget} options={[
        { v: 1.5, label: t("goal1") }, { v: 2.5, label: t("goal2") }, { v: 3.5, label: t("goal3") },
      ]} />
      <div class="field-label">{t("nextWeight")}</div>
      <div class="stepper">
        <button onClick={() => setW(Math.max(1, w - 1))} aria-label="−"><Icon name="minus" size={18} /></button>
        <b>{w}</b>
        <button onClick={() => setW(Math.min(10, w + 1))} aria-label="+"><Icon name="plus" size={18} /></button>
      </div>
      <div class="calc-box">
        <div class="lead">{there ? t("alreadyThere") : t("needAtLeast", { w })}</div>
        <div class="result">{needText}</div>
        {note && !there && <div class="note">{note}</div>}
      </div>

      <div class="field-label">{t("whatIf")}</div>
      <div class="chips">
        {[1, 2, 3, 4, 5].map((v) => <button class="chip" onClick={() => addMark(v)}>+{v}</button>)}
      </div>
      {extra.length > 0 && (
        <div class="row" style={{ marginTop: "10px" }}>
          <span class="row-main"><span class="row-title">{t("newAverage")}</span></span>
          <span class={`avg ${avgClass(withExtra)}`}>{fmtAvg(withExtra)}</span>
          <button class="icon-btn" onClick={() => setExtra([])} aria-label={t("delete")}><Icon name="trash" size={18} /></button>
        </div>
      )}

      <Section title={t("tabGrades")}>
        <div class="stack">
          {[...extra].reverse().map((m) => <MarkRow m={m} hypo />)}
          {s.marks.map((m) => <MarkRow m={m} />)}
        </div>
      </Section>
    </>
  );
}

function roundMark(x: number): string {
  // e.g. 2.3 needed -> "2-" (2.5) would be too much, "2" is enough.
  const steps = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
  const ok = steps.filter((s) => s <= x + 1e-9);
  const best = ok[ok.length - 1] ?? 1;
  return best % 1 ? `${Math.floor(best)}-` : String(best);
}

function MarkRow({ m, hypo }: { m: Mark; hypo?: boolean }) {
  return (
    <div class={`row ${hypo ? "hypo" : ""}`}>
      <span class={`mark big ${m.isNew ? "new" : ""}`}>{m.text}</span>
      <span class="row-main">
        <span class="row-title">{m.caption || m.theme || "—"}</span>
        <span class="row-sub">{[m.date && fmtDate(m.date), t("weight", { w: m.weight }), m.theme !== m.caption ? m.theme : ""].filter(Boolean).join(" · ")}</span>
      </span>
      {m.isNew && <span class="tag new">NEW</span>}
    </div>
  );
}
