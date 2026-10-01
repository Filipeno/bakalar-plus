// Turns a list of teachers' cabinets into SQL for the `cabinets` table, so a school's known cabinets show up
// for its students before anyone fills them in. The list itself never goes into the repo.
//
//   node scripts/seed-cabinets.mjs <school address> <list.json> [more.json ...] > .wrangler/cabinets.sql
//   npx wrangler d1 execute bakalar-plus --remote --file .wrangler/cabinets.sql
//
// A list is {"SURNAME Firstname": {room, year?} | {room, via?, conf?} | {room, by?}} with names as the school's public
// timetable writes them. Rows from a school website get "web školy (year)", guesses "odhad podle kolegů (subjects)"
// (skipped below 40 % confidence). Existing rows (students' entries) are never overwritten.

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const [school, ...files] = process.argv.slice(2);
if (!school || !files.length) {
  console.error("usage: node scripts/seed-cabinets.mjs <school address> <list.json> [more.json ...]");
  process.exit(1);
}
const base = school.replace(/\/+$/, "");
const schoolKey = createHash("sha256").update(base.toLowerCase()).digest("base64url").slice(0, 32);   // = sha() in util.ts

// Teacher ids from the public timetable (what the app uses as the key).
const html = await (await fetch(`${base}/Timetable/Public`)).text();
const select = html.slice(html.indexOf('id="selectedTeacher"'), html.indexOf("</select>", html.indexOf('id="selectedTeacher"')));
const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[.,]/g, " ").split(/\s+/).filter((w) => w.length > 1).join(" ");
const unescape = (s) => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&amp;/g, "&").replace(/&nbsp;/g, " ");
const ids = new Map([...select.matchAll(/value="([^"]+)"[^>]*>\s*([^<]*?)\s*</g)].map((m) => [fold(unescape(m[2])), m[1]]));
if (!ids.size) { console.error("no teachers in the public timetable"); process.exit(1); }

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const now = Date.now();
const rows = [], missing = [];
for (const file of files) {
  for (const [name, c] of Object.entries(JSON.parse(readFileSync(file, "utf8")))) {
    if (!c?.room || (c.conf !== undefined && c.conf < 0.4)) continue;
    const id = ids.get(fold(name));
    if (!id) { missing.push(name); continue; }
    const by = c.by ?? (c.year ? `web školy (${c.year})` : c.via ? `odhad podle kolegů (${[].concat(c.via).join(", ")})` : "");
    rows.push(`(${q(schoolKey)}, ${q(id)}, ${q(c.room)}, 'seed', ${q(by)}, ${now})`);
  }
}
if (missing.length) console.error(`not in the public timetable (skipped): ${missing.length}`);
console.error(`${rows.length} cabinets`);
console.log("INSERT OR IGNORE INTO cabinets (school_key, teacher, room, author_hash, author_name, updated) VALUES");
console.log(rows.join(",\n") + ";");
