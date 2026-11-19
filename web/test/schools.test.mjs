import assert from "node:assert/strict";

// Pure function tests for normalizeSchoolUrl (copied from schools.ts)
const normalizeSchoolUrl = (input) => {
  let s = input.trim();
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  const u = new URL(s);
  let path = u.pathname.replace(/\/(login|dashboard|next\/.*|Timetable\/.*)$/i, "").replace(/\/+$/, "");
  return `${u.protocol}//${u.host}${path}`;
};

// Pure function tests for fold (copied from schools.ts)
const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Test normalizeSchoolUrl function
assert.equal(
  normalizeSchoolUrl("bakalar.skola.cz"),
  "https://bakalar.skola.cz",
  "Should add https:// prefix to domain-only input"
);

assert.equal(
  normalizeSchoolUrl("https://x/bakaweb/login"),
  "https://x/bakaweb",
  "Should remove login path from URL"
);

assert.equal(
  normalizeSchoolUrl("https://example.com/bakaweb/dashboard"),
  "https://example.com/bakaweb",
  "Should remove dashboard path from URL"
);

assert.equal(
  normalizeSchoolUrl("https://test.com/bakaweb/next/something"),
  "https://test.com/bakaweb",
  "Should remove next/* path from URL"
);

assert.equal(
  normalizeSchoolUrl("https://example.com/bakaweb/Timetable/something"),
  "https://example.com/bakaweb",
  "Should remove Timetable/* path from URL"
);

// Test fold function
assert.equal(
  fold("ěščřžýáíéů"),
  "escrzyaieu",
  "Should remove diacritics from Czech characters"
);

assert.equal(
  fold("HELLO WORLD"),
  "hello world",
  "Should convert to lowercase"
);

assert.equal(
  fold("  Spaces   "),
  "spaces",
  "Should trim whitespace"
);

assert.equal(
  fold("Café résumé"),
  "cafe resume",
  "Should handle accented characters"
);

console.log("schools mapping ok");