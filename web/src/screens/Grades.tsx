import { useState } from "preact/hooks";
import { t, fmtDate } from "../lib/i18n";
import { useMarks } from "../lib/data";
import type { Mark, SubjectMarks } from "../lib/bakalari";
import { user } from "../lib/store";
import { Icon } from "../ui/icons";
import { Empty, ErrorBox, Loading, Page, Section, subjectColor, Updated, usePullToRefresh } from "../ui/kit";
import { go, route } from "../ui/router";
import { NeedLogin } from "./More";

export function weightedAverage(marks: { value: number | null; weight: number }[]): number | null {
  let s = 0, w = 0;
  for (const m of marks) if (m.value !== null) { s += m.value * m.weight; w += m.weight; }
  return w ? s / w : null;
}

const fmtAvg = (x: number | null) => (x === null ? "–" : x.toFixed(2).replace(".", ","));
const avgClass = (x: number | null) => (x === null ? "" : x < 1.5 ? "a1" : x < 2.5 ? "a2" : x < 3.5 ? "a3" : x < 4.5 ? "a4" : "a5");
const parseAvg = (s: string) => { const n = parseFloat(s.replace(",", ".")); return isNaN(n) ? null : n; };

export function Grades() {
  const marks = useMarks();
  usePullToRefresh(marks.reload);
  if (!user.value) return <Page title={t("tabGrades")}><NeedLogin /></Page>;
  const sid = route.value.q.s;
  const subj = marks.data?.find((s) => s.id === sid);
  if (sid && subj) return <SubjectDetail s={subj} />;

  const avgs = (marks.data ?? []).map((s) => parseAvg(s.average) ?? weightedAverage(s.marks)).filter((x): x is number => x !== null);
  const overall = avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null;

  return (
    <Page title={t("tabGrades")}>
      {marks.loading && !marks.data && <Loading />}
      {marks.error != null && <ErrorBox error={marks.error} onRetry={marks.reload} />}
      {marks.data && !marks.data.length && <Empty icon="star" text={t("noGrades")} />}
      {overall !== null && (
        <div class="overall">
          <span>{t("overall")}</span>
          <b class={`avg ${avgClass(overall)}`}>{fmtAvg(overall)}</b>
        </div>
      )}
      <div class="subjects">
        {(marks.data ?? []).map((s) => {
          const avg = parseAvg(s.average) ?? weightedAverage(s.marks);
          return (
            <button class="subject-card" onClick={() => go("/grades", { s: s.id })} style={{ "--c": subjectColor(s.abbrev) } as any}>
              <div class="subject-head">
                <span class="subject-name">{s.name}</span>
                <b class={`avg ${avgClass(avg)}`}>{s.average || fmtAvg(avg)}</b>
              </div>
              <div class="mark-row">
                {s.marks.slice(0, 12).map((m) => <span class={`mark ${m.isNew ? "new" : ""}`} data-v={m.value ?? ""} data-w={m.weight > 1 ? "heavy" : ""}>{m.text}</span>)}
              </div>
            </button>
          );
        })}
      </div>
      {marks.data && <Updated at={marks.at} loading={marks.loading} onRefresh={marks.reload} />}
    </Page>
  );
}

function SubjectDetail({ s }: { s: SubjectMarks }) {
  const [extra, setExtra] = useState<Mark[]>([]);
  const [target, setTarget] = useState(2.5);
  const [w, setW] = useState(1);
  const all = [...s.marks, ...extra];
  const current = weightedAverage(s.marks);
  const withExtra = weightedAverage(all);

  // Needed grade x with weight w: (S + x·w) / (W + w) = target  →  x = (target·(W+w) − S) / w
  const S = all.reduce((a, m) => a + (m.value ?? 0) * (m.value !== null ? m.weight : 0), 0);
  const W = all.reduce((a, m) => a + (m.value !== null ? m.weight : 0), 0);
  const need = (target * (W + w) - S) / w;
  // Lower is better: any grade up to `need` keeps the target. Show the worst grade that is still enough.
  const needText = need < 1 ? t("impossible") : need >= 5 ? t("alreadyThere") : roundMark(need);
  const weights = [...new Set([1, ...s.marks.map((m) => m.weight)])].sort((a, b) => a - b);

  const addMark = (v: number) => setExtra([...extra, { id: `x${extra.length}`, text: String(v), value: v, weight: w, caption: t("hypothetical"), theme: "", date: "", isNew: false }]);

  return (
    <Page title={s.name} backable sub={`${t("average")}: ${s.average || fmtAvg(current)}`}>
      {s.pointsOnly && <div class="banner soft">{t("pointsOnly")}</div>}
      <Section title={t("calculator")}>
        <div class="calc">
          <label class="calc-row">
            <span>{t("target")}</span>
            <input type="range" min="1" max="4.5" step="0.1" value={target} onInput={(e) => setTarget(+(e.target as HTMLInputElement).value)} />
            <b class={`avg ${avgClass(target)}`}>{fmtAvg(target)}</b>
          </label>
          <div class="calc-row">
            <span>{t("weight", { w: "" }).trim()}</span>
            <div class="chips">{weights.map((x) => <button class={`chip ${x === w ? "on" : ""}`} onClick={() => setW(x)}>{x}</button>)}</div>
          </div>
          <div class="calc-result">
            <span>{t("neededMark", { w })}</span>
            <b>{needText}</b>
          </div>
          <div class="calc-row">
            <span>{t("whatIf")}</span>
            <div class="chips">{[1, 2, 3, 4, 5].map((v) => <button class="chip mark-chip" data-v={v} onClick={() => addMark(v)}>+{v}</button>)}</div>
          </div>
          {extra.length > 0 && (
            <div class="calc-result">
              <span>{t("newAverage")}</span>
              <b class={`avg ${avgClass(withExtra)}`}>{fmtAvg(withExtra)}</b>
              <button class="icon-btn" onClick={() => setExtra([])} aria-label={t("delete")}><Icon name="trash" size={18} /></button>
            </div>
          )}
        </div>
      </Section>
      <Section title={t("tabGrades")}>
        <div class="card-list">
          {[...extra].reverse().map((m) => <MarkRow m={m} hypo />)}
          {s.marks.map((m) => <MarkRow m={m} />)}
        </div>
      </Section>
    </Page>
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
      <span class="mark big" data-v={m.value ?? ""}>{m.text}</span>
      <span class="row-main">
        <span class="row-title">{m.caption || m.theme || "—"}</span>
        <span class="row-sub">{[m.date && fmtDate(m.date), t("weight", { w: m.weight }), m.theme !== m.caption ? m.theme : ""].filter(Boolean).join(" · ")}</span>
      </span>
      {m.isNew && <span class="badge new">NEW</span>}
    </div>
  );
}
