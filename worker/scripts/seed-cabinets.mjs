// Turns a list of teachers' cabinets into SQL for the `cabinets` table, so a school's known cabinets show up
// for its students before anyone fills them in. The list itself never goes into the repo.
//
//   node scripts/seed-cabinets.mjs <school address> <list.json> [more.json ...] --out .wrangler/cabinets.sql
//   npx wrangler d1 execute bakalar-plus --remote --file .wrangler/cabinets.sql
//
// A list is {"SURNAME Firstname": {room, year?} | {room, via?, conf?} | {room?, by?, hours?}} (konzultace-pdf.py makes one from
// a school's consultation-hours PDF). Rows from a school website get "web školy (year)", guesses "odhad podle kolegů (subjects)"
// (skipped below 40 % confidence). A student's own entry is never overwritten; earlier seeded rows are.

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const args = process.argv.slice(2);
const outAt = args.indexOf("--out");
const out = outAt >= 0 ? args.splice(outAt, 2)[1] : null;
const [school, ...files] = args;
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
// Names match whatever the word order ("ŠKUBALA Ondřej" / "Ondřej ŠKUBALA"); double surnames match on surname + first name.
const words = (n) => fold(n).split(" ");
const sameSet = (a, b) => a.length === b.length && a.every((w) => b.includes(w));
const findId = (name) => {
  const w = words(name);
  for (const [k, id] of ids) if (sameSet(words(k), w)) return id;
  const hits = [...ids].filter(([k]) => { const kw = words(k); return w.every((x) => kw.includes(x)) || kw.every((x) => w.includes(x)); });
  return hits.length === 1 ? hits[0][1] : undefined;
};

const now = Date.now();
const cab = new Map(), con = new Map(), missing = [];
for (const file of files) {        // earlier files win: list the newest source first
  for (const [name, c] of Object.entries(JSON.parse(readFileSync(file, "utf8")))) {
    const id = findId(name);
    if (!id) { missing.push(name); continue; }
    const by = c.by ?? (c.year ? `web školy (${c.year})` : c.via ? `odhad podle kolegů (${[].concat(c.via).join(", ")})` : "");
    if (c.room && !(c.conf !== undefined && c.conf < 0.4) && !cab.has(id)) cab.set(id, `(${q(schoolKey)}, ${q(id)}, ${q(c.room)}, 'seed', ${q(by)}, ${now})`);
    if (c.hours && !con.has(id)) con.set(id, `(${q(schoolKey)}, ${q(id)}, ${q(c.hours)}, ${q(by)})`);
  }
}
if (missing.length) console.error(`not in the public timetable (skipped): ${missing.length}`);
console.error(`${cab.size} cabinets, ${con.size} consultation hours`);

// Replaces earlier seeded rows, never a student's entry.
let sql = "";
if (cab.size) {
  sql += "INSERT INTO cabinets (school_key, teacher, room, author_hash, author_name, updated) VALUES\n" + [...cab.values()].join(",\n") +
    "\nON CONFLICT (school_key, teacher) DO UPDATE SET room = excluded.room, author_name = excluded.author_name, updated = excluded.updated" +
    " WHERE cabinets.author_hash = 'seed';\n";
}
if (con.size) sql += "INSERT OR REPLACE INTO consultations (school_key, teacher, hours, source) VALUES\n" + [...con.values()].join(",\n") + ";\n";
if (out) writeFileSync(out, sql, "utf8"); else process.stdout.write(sql);
