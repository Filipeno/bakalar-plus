import assert from "node:assert/strict";
import {
  today,
  pad,
  parseIso,
  addDays,
  mondayOf,
  dowOf,
  toMin,
  liveLessons,
  lessonGroups
} from "../src/lib/model.ts";

// Test today() function
const todayStr = today();
assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(todayStr), "today() should return ISO date string");
// Also test that it returns the current actual date (not just a format match)
const now = new Date();
const expectedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
assert.equal(todayStr, expectedDate, "today() should return today's actual date");

// Test pad() function
assert.equal(pad(5), "05", "pad() should zero-pad single digits");
assert.equal(pad(12), "12", "pad() should not change double digits");

// Test parseIso() function
const parsed = parseIso("2026-10-15");
assert.equal(parsed.getFullYear(), 2026, "parseIso() should parse year correctly");
assert.equal(parsed.getMonth(), 9, "parseIso() should parse month correctly (0-indexed)");
assert.equal(parsed.getDate(), 15, "parseIso() should parse day correctly");

// Test addDays() function
assert.equal(addDays("2026-10-15", 1), "2026-10-16", "addDays() should add one day");
assert.equal(addDays("2026-10-15", -1), "2026-10-14", "addDays() should subtract one day");

// Test mondayOf() function
assert.equal(mondayOf("2026-10-15"), "2026-10-11", "mondayOf() should return Monday of the week");
// For a Sunday input, it should return the Monday of that week
assert.equal(mondayOf("2026-10-04"), "2026-10-04", "mondayOf() should return Monday of the week (when given Sunday)");

// Test dowOf() function
assert.equal(dowOf("2026-10-15"), 5, "dowOf() should return correct day of week (Friday)");
assert.equal(dowOf("2026-10-11"), 1, "dowOf() should return correct day of week (Monday)");

// Test toMin() function
assert.equal(toMin("8:00"), 480, "toMin() should convert time to minutes");
assert.equal(toMin("12:30"), 750, "toMin() should convert time with minutes");

// Test liveLessons() function with mock data
const mockDay = {
  date: "2026-10-15",
  dow: 5,
  lessons: [
    { hour: "1", begin: "08:00", end: "08:45", subject: "MAT", subjectName: "Matematika", teacher: "T1", teacherName: "Teacher One", room: "101", roomName: "Math Room", group: "AJ_1" },
    { hour: "2", begin: "08:50", end: "09:35", subject: "ENG", subjectName: "English", teacher: "T2", teacherName: "Teacher Two", room: "102", roomName: "English Room", group: "AJ_1", removed: true }
  ]
};
const live = liveLessons(mockDay);
assert.equal(live.length, 1, "liveLessons() should filter out removed lessons");
assert.equal(live[0].subject, "MAT", "liveLessons() should return only non-removed lessons");

// Test lessonGroups() function
const mockLesson = { group: "AJ_1, NJ_2 · lichý týden" };
assert.deepEqual(lessonGroups(mockLesson), ["AJ_1", "NJ_2"], "lessonGroups() should split groups correctly");

console.log("model tests passed");