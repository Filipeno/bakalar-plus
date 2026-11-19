import assert from "node:assert/strict";
import {
  pad,
  isoDate,
  today,
  parseIso,
  addDays,
  addSchoolDays,
  mondayOf,
  dowOf,
  toMin,
  hhmm,
  nowMin,
  liveLessons,
  dayFor,
  byPeriod,
  lessonGroups,
  groupFamilies,
  mergeWeeks,
  filterGroups,
  usualRoom
} from "../src/lib/model.ts";

// Test pad function
assert.equal(pad(5), "05");
assert.equal(pad(12), "12");
assert.equal(pad(0), "00");

// Test isoDate function
const date = new Date(2026, 8, 15); // September is month 8
assert.equal(isoDate(date), "2026-09-15");

// Test today function (will vary, so just check it's a valid ISO date format)
const todayStr = today();
assert.match(todayStr, /^\d{4}-\d{2}-\d{2}$/);

// Test parseIso function
const parsed = parseIso("2026-09-15");
assert.equal(parsed.getFullYear(), 2026);
assert.equal(parsed.getMonth(), 8); // September is month 8
assert.equal(parsed.getDate(), 15);

// Test addDays function
assert.equal(addDays("2026-09-15", 1), "2026-09-16");
assert.equal(addDays("2026-09-15", -1), "2026-09-14");

// Test addSchoolDays function (skips weekends)
assert.equal(addSchoolDays("2026-09-15", 1), "2026-09-16"); // Tuesday + 1 = Wednesday
assert.equal(addSchoolDays("2026-09-15", 3), "2026-09-18"); // Tuesday + 3 = Friday (skipping weekends)

// Test mondayOf function
assert.equal(mondayOf("2026-09-18"), "2026-09-14"); // Friday of the week

// Test dowOf function
assert.equal(dowOf("2026-09-18"), 5); // Friday is day 5

// Test toMin function
assert.equal(toMin("08:00"), 480);
assert.equal(toMin("09:30"), 570);

// Test hhmm function
assert.equal(hhmm("8:00"), "8:00");
assert.equal(hhmm("08:00"), "8:00");

// Test liveLessons function
const dayWithLessons = {
  date: "2026-09-15",
  dow: 1,
  lessons: [
    { hour: "1", begin: "08:00", end: "08:45", subject: "MAT", subjectName: "Matematika", teacher: "T1", teacherName: "Teacher 1", room: "101", roomName: "Room 101", group: "AJ_1" },
    { hour: "2", begin: "08:45", end: "09:30", subject: "ENG", subjectName: "English", teacher: "T2", teacherName: "Teacher 2", room: "102", roomName: "Room 102", group: "AJ_1", removed: true }
  ]
};
const liveLessonsResult = liveLessons(dayWithLessons);
assert.equal(liveLessonsResult.length, 1);
assert.equal(liveLessonsResult[0].subject, "MAT");

// Test lessonGroups function
const lessonWithGroups = {
  hour: "1",
  begin: "08:00",
  end: "08:45",
  subject: "MAT",
  subjectName: "Matematika",
  teacher: "T1",
  teacherName: "Teacher 1",
  room: "101",
  roomName: "Room 101",
  group: "AJ_1, NJ_2 · lichý týden"
};
const groups = lessonGroups(lessonWithGroups);
assert.equal(groups.length, 2);
assert.equal(groups[0], "AJ_1");
assert.equal(groups[1], "NJ_2");

console.log("model tests ok");