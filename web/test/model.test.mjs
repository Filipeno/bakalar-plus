import assert from "node:assert/strict";
import { addDays, addSchoolDays, byPeriod, dayFor, dowOf, hhmm, isoDate, lessonGroups, mondayOf, pad, parseIso, targetKey, toMin, usualRoom } from "../src/lib/model.ts";

const lesson = (o) => ({ hour: "1", begin: "08:00", end: "08:45", subject: "MAT", subjectName: "Matematika", teacher: "AB", teacherName: "", room: "101", roomName: "", group: "", ...o });

// dates (2026-11-10 is a Tuesday)
assert.equal(pad(7), "07");
assert.equal(isoDate(parseIso("2026-11-10")), "2026-11-10");
assert.equal(addDays("2026-11-30", 1), "2026-12-01");
assert.equal(addDays("2026-03-01", -1), "2026-02-28");
assert.equal(mondayOf("2026-11-10"), "2026-11-09");
assert.equal(mondayOf("2026-11-15"), "2026-11-09", "Sunday belongs to the week that started on Monday");
assert.equal(mondayOf("2026-11-09"), "2026-11-09");
assert.equal(dowOf("2026-11-09"), 1);
assert.equal(dowOf("2026-11-15"), 7);
assert.equal(addSchoolDays("2026-11-13", 1), "2026-11-16", "Friday + 1 school day = Monday");
assert.equal(addSchoolDays("2026-11-10", 3), "2026-11-13");

// times
assert.equal(toMin("08:30"), 510);
assert.equal(toMin("9"), 540);
assert.equal(hhmm("08:05"), "8:05");
assert.equal(targetKey({ kind: "class", id: "X1" }), "class:X1");

// groups
assert.deepEqual(lessonGroups({ group: "AJ_1, NJ_2 · lichý týden" }), ["AJ_1", "NJ_2"]);
assert.deepEqual(lessonGroups({ group: "AJ_1<br/>AJ_2" }), ["AJ_1", "AJ_2"]);
assert.deepEqual(lessonGroups({ group: "" }), []);

// byPeriod merges parallel groups and sorts by start time
const day = { date: "2026-11-10", dow: 2, lessons: [
  lesson({ begin: "09:00", end: "09:45", group: "AJ_1" }),
  lesson({ begin: "08:00", end: "08:45", group: "AJ_1" }),
  lesson({ begin: "08:00", end: "08:45", group: "NJ_1", subject: "NJ" }),
] };
const p = byPeriod(day);
assert.equal(p.length, 2);
assert.equal(p[0].begin, "08:00");
assert.equal(p[0].lessons.length, 2);

// dayFor: by date; the permanent timetable matches by weekday
const wk = { term: "actual", days: [day] };
assert.equal(dayFor(wk, "2026-11-10"), day);
assert.equal(dayFor(wk, "2026-11-17"), undefined);
assert.equal(dayFor({ term: "permanent", days: [{ ...day, date: null }] }, "2026-11-17").dow, 2);
assert.equal(dayFor(undefined, "2026-11-10"), undefined);

// usualRoom ignores removed lessons and picks the most frequent room
const rw = { term: "actual", days: [{ ...day, lessons: [lesson({ room: "A" }), lesson({ room: "B" }), lesson({ room: "B" }), lesson({ room: "A", removed: true }), lesson({ room: "A", removed: true })] }] };
assert.equal(usualRoom(rw), "B");
assert.equal(usualRoom(undefined), undefined);
console.log("model ok");
