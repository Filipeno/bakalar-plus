// Debug the mondayOf function logic

const parseIso = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d, 12); };
const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Current implementation from model.ts
function mondayOf_current(iso) {
  const d = parseIso(iso);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return isoDate(d);
}

// Let's trace what should happen:
console.log("Testing Monday of week for 2026-10-05 (Sunday):");
const testDate = parseIso("2026-10-05");
console.log(`Day of week (0=Sunday): ${testDate.getDay()}`);
console.log(`Original date: ${isoDate(testDate)}`);

// The logic should be: for any day, get to the Monday of that same week
// Sunday = 0 -> need to go back 6 days to get to Monday (which is 0-6=-6, but we want positive)
// Monday = 1 -> need to go back 1 day to get to Monday (which is 1-1=0)
// etc.

// What's the correct formula?
const dow = testDate.getDay(); // 0 for Sunday
console.log(`dow: ${dow}`);
const daysToSubtract = dow; // This is wrong - if it's Sunday, we want to go back 6 days, not 0
console.log(`Days to subtract (wrong): ${daysToSubtract}`);

// Correct way:
// If we want Monday of the same week, and we're on day X, we need to go back X days
// But since Sunday=0, we want to go back 6 days to get to Monday
// So: if day is 0 (Sunday), subtract 6; if day is 1 (Monday), subtract 1, etc.
const correctDaysToSubtract = (dow + 6) % 7;
console.log(`Correct days to subtract: ${correctDaysToSubtract}`);

// Test the actual current function
const result = mondayOf_current("2026-10-05");
console.log(`Current implementation result: ${result}`);