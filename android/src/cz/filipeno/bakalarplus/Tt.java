package cz.filipeno.bakalarplus;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Compact timetable for the widget and the background checks (same meaning as web/src/lib/model.ts, fewer fields):
 * [{ d: "2026-09-30", off: "", l: [{ b: "08:00", e: "08:45", s: "MAT", n: "Matematika", r: "357", t: "Novák", c: "change", x: removed }] }]
 */
final class Tt {
    private Tt() {}

    static String hhmm(String t) {
        if (t == null || t.isEmpty()) return "";
        String[] p = t.split(":");
        return Integer.parseInt(p[0].trim()) + ":" + (p.length > 1 ? p[1] : "00");
    }

    static int min(String t) {
        String[] p = t.split(":");
        return Integer.parseInt(p[0].trim()) * 60 + Integer.parseInt(p[1].trim());
    }

    private static JSONObject lesson(String b, String e, String s, String n, String r, String t, String c, boolean x) throws Exception {
        return new JSONObject().put("b", b).put("e", e).put("s", s).put("n", n).put("r", r).put("t", t).put("c", c).put("x", x);
    }

    /** From the app's own Week objects (sent by the web part through the bridge). */
    static JSONArray fromWebWeeks(JSONArray weeks) throws Exception {
        JSONArray out = new JSONArray();
        for (int w = 0; w < weeks.length(); w++) {
            JSONArray days = weeks.getJSONObject(w).optJSONArray("days");
            if (days == null) continue;
            for (int i = 0; i < days.length(); i++) {
                JSONObject d = days.getJSONObject(i);
                if (d.isNull("date")) continue;
                JSONArray ls = d.optJSONArray("lessons"), l = new JSONArray();
                for (int j = 0; ls != null && j < ls.length(); j++) {
                    JSONObject a = ls.getJSONObject(j);
                    JSONObject ch = a.optJSONObject("change");
                    l.put(lesson(a.optString("begin"), a.optString("end"), a.optString("subject"), a.optString("subjectName"),
                            a.optString("room"), a.optString("teacherName"), ch == null ? "" : ch.optString("text", ch.optString("kind")),
                            a.optBoolean("removed")));
                }
                out.put(new JSONObject().put("d", d.getString("date")).put("off", d.optString("off", "")).put("l", l));
            }
        }
        return out;
    }

    /** From GET /api/3/timetable/actual. */
    static JSONArray fromApi(JSONObject j) throws Exception {
        Map<String, JSONObject> subj = byId(j.optJSONArray("Subjects")), tea = byId(j.optJSONArray("Teachers")), rooms = byId(j.optJSONArray("Rooms"));
        Map<Integer, String[]> hours = new HashMap<>();
        JSONArray hs = j.optJSONArray("Hours");
        for (int i = 0; hs != null && i < hs.length(); i++) {
            JSONObject h = hs.getJSONObject(i);
            hours.put(h.getInt("Id"), new String[]{hhmm(h.optString("BeginTime")), hhmm(h.optString("EndTime"))});
        }
        JSONArray out = new JSONArray(), days = j.optJSONArray("Days");
        for (int i = 0; days != null && i < days.length(); i++) {
            JSONObject d = days.getJSONObject(i);
            String type = d.optString("DayType", "WorkDay");
            JSONArray l = new JSONArray(), atoms = d.optJSONArray("Atoms");
            for (int k = 0; atoms != null && k < atoms.length(); k++) {
                JSONObject a = atoms.getJSONObject(k);
                String[] h = hours.get(a.optInt("HourId"));
                if (h == null) continue;
                JSONObject s = subj.get(a.optString("SubjectId").trim()), t = tea.get(a.optString("TeacherId").trim()), r = rooms.get(a.optString("RoomId").trim());
                JSONObject ch = a.optJSONObject("Change");
                String c = ch == null ? "" : ch.optString("Description", ch.optString("TypeName", "změna"));
                if (ch != null && c.isEmpty()) c = ch.optString("ChangeType", "změna");
                boolean x = ch != null && ("Removed".equals(ch.optString("ChangeType")) || "Canceled".equals(ch.optString("ChangeType")));
                l.put(lesson(h[0], h[1], s == null ? "" : s.optString("Abbrev").trim(), s == null ? (ch == null ? "" : ch.optString("ChangeSubject")) : s.optString("Name"),
                        r == null ? "" : r.optString("Abbrev").trim(), t == null ? "" : t.optString("Name"), c, x));
            }
            out.put(new JSONObject().put("d", d.optString("Date").substring(0, 10))
                    .put("off", "WorkDay".equals(type) ? "" : d.optString("DayDescription", type)).put("l", l));
        }
        return out;
    }

    private static Map<String, JSONObject> byId(JSONArray a) {
        Map<String, JSONObject> m = new HashMap<>();
        for (int i = 0; a != null && i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null) m.put(o.optString("Id").trim(), o);
        }
        return m;
    }

    private static final Pattern FULL_DATE = Pattern.compile("(\\d{1,2})\\.\\s*(\\d{1,2})\\.\\s*(\\d{4})");

    /** From a public timetable page ({school}/Timetable/Public/Actual/Class/{id}). */
    static JSONArray fromPublicHtml(String html) throws Exception {
        String js = extractObject(html, "const timetableData = ");
        JSONArray out = new JSONArray();
        if (js == null) return out;
        JSONObject data = new JSONObject(js);
        JSONArray days = data.optJSONArray("Days");
        for (int i = 0; days != null && i < days.length(); i++) {
            JSONObject d = days.getJSONObject(i);
            JSONArray l = new JSONArray(), hs = d.optJSONArray("Hours");
            String date = null;
            for (int k = 0; hs != null && k < hs.length(); k++) {
                JSONArray atoms = hs.getJSONObject(k).optJSONArray("Atoms");
                for (int m = 0; atoms != null && m < atoms.length(); m++) {
                    JSONObject a = atoms.getJSONObject(m);
                    if (date == null) {
                        Matcher mt = FULL_DATE.matcher(a.optString("Day"));
                        if (mt.find()) date = String.format("%s-%02d-%02d", mt.group(3), Integer.parseInt(mt.group(2)), Integer.parseInt(mt.group(1)));
                    }
                    String c = a.optString("ChangeInfo", "").trim();
                    boolean x = "removed".equals(a.optString("Type")) || c.toLowerCase().contains("odpad") || c.toLowerCase().contains("zrušen");
                    l.put(lesson(hhmm(a.optString("Begin")), hhmm(a.optString("End")), a.optString("SubjectAbbrev"), a.optString("SubjectText"),
                            a.optString("Room"), a.optString("TeacherFullname"), c, x));
                }
            }
            if (date == null) continue;    // a whole day off has no atoms and no full date: skip it
            out.put(new JSONObject().put("d", date).put("off", d.optBoolean("DayOff") ? d.optString("DayOffName", "Volno") : "").put("l", l));
        }
        return out;
    }

    /** The object literal after `marker`, cut by brace matching that respects strings. */
    static String extractObject(String s, String marker) {
        int at = s.indexOf(marker);
        if (at < 0) return null;
        int start = s.indexOf('{', at), depth = 0;
        boolean str = false, esc = false;
        for (int i = start; i < s.length(); i++) {
            char c = s.charAt(i);
            if (str) { if (esc) esc = false; else if (c == '\\') esc = true; else if (c == '"') str = false; }
            else if (c == '"') str = true;
            else if (c == '{') depth++;
            else if (c == '}' && --depth == 0) return s.substring(start, i + 1);
        }
        return null;
    }
}
