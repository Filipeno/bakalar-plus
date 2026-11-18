import assert from "node:assert/strict";
import { mapMark, markNote } from "../src/lib/marks.ts";

const base = { Id: "A1", MarkText: "2-", Weight: 3, Caption: "P├şsemka", Theme: "Zlomky", MarkDate: "2026-11-10T00:00:00+01:00", IsNew: true, TypeNote: "p├şsemn├í pr├íce" };

// without a note: no note, TypeNote is not mistaken for one
let m = mapMark(base);
assert.equal(m.note, undefined);
assert.equal(m.text, "2-"); assert.equal(m.value, 2.5); assert.equal(m.weight, 3); assert.equal(m.date, "2026-11-10");
assert.equal(mapMark({ ...base, Note: "   " }).note, undefined, "blank note -> undefined");
assert.equal(mapMark({ ...base, Note: null }).note, undefined);

// with a note: trimmed
assert.equal(mapMark({ ...base, Note: "  Chyb─Ťla dom├íc├ş p┼Ö├şprava  " }).note, "Chyb─Ťla dom├íc├ş p┼Ö├şprava");
// alternative field names
assert.equal(markNote({ Comment: "x" }), "x");
assert.equal(markNote({ Note: "", TeacherNote: "y" }), "y");
// points-only grade still maps
m = mapMark({ Id: "B", MarkText: "", PointsText: "8", MaxPoints: 10, Note: "ok" });
assert.equal(m.text, "8/10"); assert.deepEqual(m.points, { got: 8, max: 10 }); assert.equal(m.note, "ok");
// "Slovní hodnocení" (VerbalEvaluation) next to a mark is the note
assert.equal(mapMark({ ...base, MarkText: "1", VerbalEvaluation: "  Velmi zdarile  " }).note, "Velmi zdarile");
// verbal-only grade: the text IS the grade, not a note
m = mapMark({ Id: "C", MarkText: "", VerbalEvaluation: "Splnil" });
assert.equal(m.text, "Splnil"); assert.equal(m.note, undefined);
console.log("marks mapping ok");
