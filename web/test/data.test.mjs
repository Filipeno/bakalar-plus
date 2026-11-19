import assert from "node:assert/strict";

// Import the real module to test its exports
import * as data from "../src/lib/data.ts";

// Test that all expected pure functions are exported
assert.equal(typeof data.sourceKey, "function");
assert.equal(typeof data.weekCacheKey, "function");
assert.equal(typeof data.loadWeek, "function");

// Test that hook-style functions are exported (these are not pure but should be exported)
assert.equal(typeof data.useWeek, "function");
assert.equal(typeof data.useDirectory, "function");
assert.equal(typeof data.useCabinets, "function");
assert.equal(typeof data.useMarks, "function");
assert.equal(typeof data.useHomework, "function");
assert.equal(typeof data.useMessages, "function");
assert.equal(typeof data.useEvents, "function");
assert.equal(typeof data.useAbsence, "function");
assert.equal(typeof data.useFinalMarks, "function");
assert.equal(typeof data.useSubstitutions, "function");
assert.equal(typeof data.useSubjects, "function");
assert.equal(typeof data.useThemes, "function");

// Test that utility functions are exported
assert.equal(typeof data.findTeacher, "function");
assert.equal(typeof data.findRoom, "function");
assert.equal(typeof data.findClass, "function");

console.log("data test assertions passed");