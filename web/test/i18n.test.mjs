import assert from "node:assert/strict";
import { t, langSetting, lang, dayShort, dayLong, fmtDate, cap, fmtRelDay } from "../src/lib/i18n.ts";

// Set language to Czech for consistent testing
langSetting.value = "cs";

// Test basic translation function with Czech (default)
assert.equal(t("appName"), "Bakaláři+");
assert.equal(t("loading"), "Načítám…");
assert.equal(t("cancel"), "Zrušit");

// Test basic translation function with English
langSetting.value = "en";
assert.equal(t("appName"), "Bakaláři+");
assert.equal(t("loading"), "Loading…");
assert.equal(t("cancel"), "Cancel");

// Test translation with variables - Czech
langSetting.value = "cs";
assert.equal(t("updatedAt", { t: "10:30" }), "Aktualizováno 10:30");
assert.equal(t("updatedAt", { t: "14:15" }), "Aktualizováno 14:15");

// Test translation with variables - English
langSetting.value = "en";
assert.equal(t("updatedAt", { t: "10:30" }), "Updated 10:30");
assert.equal(t("updatedAt", { t: "14:15" }), "Updated 14:15");

// Test dayShort function with Czech
assert.equal(dayShort(1), "po");
assert.equal(dayShort(3), "st");
assert.equal(dayShort(7), "ne");

// Test dayLong function with Czech
assert.equal(dayLong(1), "pondělí");
assert.equal(dayLong(3), "středa");
assert.equal(dayLong(7), "neděle");

// Test fmtDate function with Czech
langSetting.value = "cs";
assert.equal(fmtDate("2026-11-10"), "úterý 10. 11.");
assert.equal(fmtDate("2026-12-25"), "čtvrtek 25. 12.");

// Test fmtDate function with English
langSetting.value = "en";
assert.equal(fmtDate("2026-11-10"), "Tue 10/11");
assert.equal(fmtDate("2026-12-25"), "Thu 25/12");

// Test cap function
assert.equal(cap("hello"), "Hello");
assert.equal(cap("world"), "World");
assert.equal(cap("test"), "Test");

// Test fmtRelDay function with Czech
langSetting.value = "cs";
assert.equal(fmtRelDay("2026-11-10", "2026-11-10"), "dnes");
assert.equal(fmtRelDay("2026-11-11", "2026-11-10"), "zítra");
assert.equal(fmtRelDay("2026-11-09", "2026-11-10"), "včera");

// Test fmtRelDay function with English
langSetting.value = "en";
assert.equal(fmtRelDay("2026-11-10", "2026-11-10"), "today");
assert.equal(fmtRelDay("2026-11-11", "2026-11-10"), "tomorrow");
assert.equal(fmtRelDay("2026-11-09", "2026-11-10"), "yesterday");

console.log("i18n tests passed");