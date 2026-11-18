// Pure mapping of one /api/3/marks entry (no browser imports, so node can run the unit test).

export interface Mark {
  id: string;
  text: string;          // what to show: "1", "2-", "8/10", "A"
  value: number | null;  // numeric value for averages (1-5), null if it doesn't count
  weight: number;
  caption: string;
  theme: string;
  date: string;          // ISO
  isNew: boolean;
  points?: { got: number; max: number };
  note?: string;         // teacher's note ("Poznámka"), when the grade has one
}

export function markValue(text: string): number | null {
  const m = /^([1-5])(-)?$/.exec(text.trim());
  return m ? +m[1] + (m[2] ? 0.5 : 0) : null;
}

// The community docs (bakalari-api-v3, moduly/marks.md) do not list a per-grade note field, so we read the
// plausible text fields defensively, first non-empty wins. TypeNote is the grade *type* ("písemná práce"), not a note.
const NOTE_FIELDS = ["Note", "Notice", "TeacherNote", "Comment", "Remark", "Poznamka", "MarkNote", "MarkComment"];

export function markNote(m: any): string | undefined {
  // Confirmed on the school's Bakaláři (2026-11-18): the teacher's text is "Slovní hodnocení" = VerbalEvaluation.
  // When the grade also has a mark/points, that text is the note; otherwise it is already the shown grade.
  const verbal = typeof m?.VerbalEvaluation === "string" ? m.VerbalEvaluation.trim() : "";
  if (verbal && (m.MarkText || m.PointsText)) return verbal;
  for (const k of NOTE_FIELDS) {
    const v = m?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

export function mapMark(m: any): Mark {
  const text = String(m.MarkText || m.PointsText || m.VerbalEvaluation || "?").trim();
  const got = parseFloat(m.PointsText), max = parseFloat(m.MaxPoints);
  return {
    id: String(m.Id), text: m.MaxPoints && !m.MarkText ? `${m.PointsText}/${m.MaxPoints}` : text,
    value: markValue(m.MarkText ?? ""), weight: Number(m.Weight) || 1,
    caption: m.Caption ?? "", theme: m.Theme ?? "", date: String(m.MarkDate ?? m.EditDate ?? "").slice(0, 10),
    isNew: !!m.IsNew, points: !isNaN(got) && !isNaN(max) && max > 0 ? { got, max } : undefined,
    note: markNote(m),
  };
}
