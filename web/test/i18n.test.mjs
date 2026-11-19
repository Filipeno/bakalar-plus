// i18n.ts only needs @preact/signals (from the repo's node_modules) and is loaded as it is.
import assert from "node:assert/strict";
const { cap, dayLong, dayShort, fmtDate, fmtRelDay, lang, langSetting, t } = await import("../src/lib/i18n.ts");

// language selection
langSetting.value = "cs";
assert.equal(lang.value, "cs");
langSetting.value = "en";
assert.equal(lang.value, "en");

// t(): per-language text and {var} substitution
langSetting.value = "cs";
assert.equal(t("stepOf", { n: 2, total: 5 }), "Krok 2 ze 5");
assert.equal(t("stepOf"), "Krok {n} ze {total}", "no vars -> placeholders stay");
langSetting.value = "en";
assert.equal(t("stepOf", { n: 2, total: 5 }), "Step 2 of 5");
assert.equal(t("nonexistent_key"), "nonexistent_key", "unknown key falls back to the key");

// weekday names
langSetting.value = "cs";
assert.equal(dayShort(1), "po");
assert.equal(dayLong(2), "úterý");
langSetting.value = "en";
assert.equal(dayShort(1), "Mon");
assert.equal(dayLong(7), "Sunday");

// dates (2026-11-10 is a Tuesday)
langSetting.value = "cs";
assert.equal(fmtDate("2026-11-10"), "út 10. 11.");
assert.equal(fmtDate("2026-11-10", true), "úterý 10. 11.");
langSetting.value = "en";
assert.equal(fmtDate("2026-11-10"), "Tue 10/11");

// relative days
langSetting.value = "cs";
assert.equal(fmtRelDay("2026-11-10", "2026-11-10"), "dnes");
assert.equal(fmtRelDay("2026-11-11", "2026-11-10"), "zítra");
assert.equal(fmtRelDay("2026-11-09", "2026-11-10"), "včera");
assert.equal(fmtRelDay("2026-11-20", "2026-11-10"), "pá 20. 11.");
langSetting.value = "en";
assert.equal(fmtRelDay("2026-11-11", "2026-11-10"), "tomorrow");

assert.equal(cap("školní"), "Školní");
assert.equal(cap(""), "");
console.log("i18n ok");
