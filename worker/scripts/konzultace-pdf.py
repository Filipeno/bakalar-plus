# Reads a school's "Konzultační hodiny učitelů" PDF (a table: first name, SURNAME, day, time, note, room) into the
# list format of seed-cabinets.mjs. Needs PyMuPDF: pip install pymupdf
#
#   python scripts/konzultace-pdf.py <list.pdf> <out.json | --check> ["konzultační hodiny 2025/26"]
#
# Columns are found from the header row ("Jméno", "Příjmení", "Den", "Časové", "Upřesnění", "Pracoviště"), so the
# exact layout can shift between years.

import json, re, sys
import pymupdf

src, dst = sys.argv[1], sys.argv[2]
label = sys.argv[3] if len(sys.argv) > 3 else "konzultační hodiny"

doc = pymupdf.open(src)
if len(sys.argv) <= 3:
    year = re.search(r"(\d{4})\s*/\s*(\d{2,4})", doc[0].get_text())
    if year: label = f"konzultační hodiny {year.group(1)}/{year.group(2)[-2:]}"

HEAD = {"jméno": "first", "příjmení": "last", "den": "day", "časové": "time", "upřesnění": "note", "pracoviště": "room"}
cols = None          # [(x, field)] sorted by x
rows = []            # [{field: text}]

for page in doc:
    lines = {}
    for x0, y0, x1, y1, w, *_ in page.get_text("words"):
        lines.setdefault(round(y0 / 3), []).append((x0, w))
    for y in sorted(lines):
        words = sorted(lines[y])
        found = {HEAD[w.lower()]: x for x, w in words if w.lower() in HEAD}
        if found:           # header words (they can sit on several lines: "Pracoviště -" / "místnost")
            known = {f: x for x, f in (cols or [])}
            known.update(found)
            cols = sorted((x, f) for f, x in known.items())
            continue
        if not cols or len(cols) < 6:
            continue
        cells = {}
        for x, w in words:
            field = [f for cx, f in cols if x >= cx - 4][-1] if x >= cols[0][0] - 4 else None
            if field: cells[field] = (cells.get(field, "") + " " + w).strip()
        if cells.get("first") and cells.get("last"):
            rows.append(cells)
        elif rows and cells:     # a wrapped line belongs to the row above
            for f, v in cells.items(): rows[-1][f] = (rows[-1].get(f, "") + " " + v).strip()

out = {}
for r in rows:
    name = f'{r["last"]} {r["first"]}'
    hours = " ".join(x for x in (r.get("day", ""), r.get("time", "").replace("-", "–")) if x)
    note = r.get("note", "").strip()
    hours = f"{hours} · {note}" if hours and note else hours or note
    room = r.get("room", "").strip()
    out[name] = {"room": room, "by": label, "hours": hours}

if dst == "--check":   # counts only, writes nothing
    print({f: sum(1 for r in rows if r.get(f)) for f in HEAD.values()}, label)
    sys.exit(0)
json.dump(out, open(dst, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"{len(out)} teachers ({sum(1 for v in out.values() if v['room'])} with a room) -> {dst}")
