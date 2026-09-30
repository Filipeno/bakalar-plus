package cz.filipeno.bakalarplus;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Background check every ~30 min (Android decides the exact moment): timetable changes, new grades, homework
 * and messages, plus the evening "tomorrow" reminder. The first run after sign-in only records what already
 * exists, so nobody gets a flood of old grades.
 */
public class SyncJob extends JobService {
    private static final int JOB_PERIODIC = 4201, JOB_SOON = 4202;

    static void schedule(Context c) {
        JobScheduler js = c.getSystemService(JobScheduler.class);
        if (js == null || js.getPendingJob(JOB_PERIODIC) != null) return;
        js.schedule(new JobInfo.Builder(JOB_PERIODIC, new ComponentName(c, SyncJob.class))
                .setPeriodic(30 * 60 * 1000L, 10 * 60 * 1000L)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPersisted(true)
                .build());
    }

    /** Right after sign-in: take the baseline now, not in half an hour. */
    static void baselineSoon(Context c) {
        JobScheduler js = c.getSystemService(JobScheduler.class);
        if (js == null) return;
        js.schedule(new JobInfo.Builder(JOB_SOON, new ComponentName(c, SyncJob.class))
                .setMinimumLatency(3000)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .build());
    }

    @Override
    public boolean onStartJob(JobParameters params) {
        new Thread(() -> {
            try { run(getApplicationContext()); } catch (Throwable ignored) { }
            jobFinished(params, false);
        }, "bp-sync").start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) { return true; }

    // ------------------------------------------------------------------

    private static boolean cs(Context c) {
        String l = Store.json(c, "prefs").optString("lang", "auto");
        return "cs".equals(l) || ("auto".equals(l) && ("cs".equals(Locale.getDefault().getLanguage()) || "sk".equals(Locale.getDefault().getLanguage())));
    }

    static String iso(Calendar c) { return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(c.getTime()); }

    static String niceDate(Context c, String iso) {
        try {
            Calendar d = Calendar.getInstance();
            d.setTime(new SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(iso));
            String[] cz = {"ne", "po", "út", "st", "čt", "pá", "so"}, en = {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"};
            int dow = d.get(Calendar.DAY_OF_WEEK) - 1;
            return cs(c) ? cz[dow] + " " + d.get(Calendar.DAY_OF_MONTH) + ". " + (d.get(Calendar.MONTH) + 1) + "."
                    : en[dow] + " " + d.get(Calendar.DAY_OF_MONTH) + "/" + (d.get(Calendar.MONTH) + 1);
        } catch (Exception e) { return iso; }
    }

    static void run(Context c) throws Exception {
        JSONObject prefs = Store.json(c, "prefs");
        String school = prefs.optString("school");
        if (school.isEmpty()) return;
        JSONObject notify = prefs.optJSONObject("notify");
        if (notify == null) notify = new JSONObject();
        boolean logged = Baka.loggedIn(c) && school.equals(Baka.school(c));
        boolean cs = cs(c);
        JSONObject seen = Store.json(c, "seen");
        boolean baseline = !seen.optBoolean("init");
        Calendar now = Calendar.getInstance();
        String today = iso(now);

        // ---- timetable (this week + next) ----
        JSONArray days = new JSONArray();
        try {
            if (logged) {
                append(days, Tt.fromApi(Baka.apiJson(c, "GET", "/api/3/timetable/actual", null)));
                Calendar mon = (Calendar) now.clone();
                mon.add(Calendar.DAY_OF_MONTH, 7);
                append(days, Tt.fromApi(Baka.apiJson(c, "GET", "/api/3/timetable/actual?date=" + iso(mon), null)));
            } else if (prefs.optJSONObject("myTarget") != null) {
                JSONObject t = prefs.getJSONObject("myTarget");
                String kind = t.optString("kind"), path = "class".equals(kind) ? "Class" : "teacher".equals(kind) ? "Teacher" : "Room";
                for (String term : new String[]{"Actual", "Next"}) {
                    Baka.Res r = Baka.http(school + "/Timetable/Public/" + term + "/" + path + "/" + java.net.URLEncoder.encode(t.optString("id"), "UTF-8").replace("+", "%20"), "GET", null, null);
                    if (r.status == 200) append(days, Tt.fromPublicHtml(r.text));
                }
            }
        } catch (Baka.BakaException e) {
            if ("offline".equals(e.code)) return;
        }
        if (days.length() > 0) {
            Store.prefs(c).edit().putString("widget", days.toString()).apply();
            Widget.updateAll(c);

            Set<String> old = set(seen.optJSONArray("chg")), cur = new HashSet<>();
            List<String> fresh = new ArrayList<>();
            for (int i = 0; i < days.length(); i++) {
                JSONObject d = days.getJSONObject(i);
                if (d.getString("d").compareTo(today) < 0) continue;
                JSONArray l = d.getJSONArray("l");
                for (int k = 0; k < l.length(); k++) {
                    JSONObject x = l.getJSONObject(k);
                    if (x.optString("c").isEmpty()) continue;
                    String key = d.getString("d") + "|" + x.optString("b") + "|" + x.optString("s") + "|" + x.optString("c");
                    cur.add(key);
                    if (!old.contains(key)) fresh.add(niceDate(c, d.getString("d")) + " " + x.optString("b") + " " +
                            (x.optString("s").isEmpty() ? "" : x.optString("s") + ": ") + x.optString("c"));
                }
            }
            seen.put("chg", new JSONArray(cur));
            if (!baseline && !fresh.isEmpty() && notify.optBoolean("changes", true)) {
                post(c, "changes", 100, cs ? "Změna v rozvrhu" : "Timetable change", fresh, "/today");
            }
        }

        if (logged) {
            // ---- grades ----
            try {
                JSONArray subjects = Baka.apiJson(c, "GET", "/api/3/marks", null).optJSONArray("Subjects");
                Set<String> old = set(seen.optJSONArray("marks")), cur = new HashSet<>();
                List<String> fresh = new ArrayList<>();
                for (int i = 0; subjects != null && i < subjects.length(); i++) {
                    JSONObject s = subjects.getJSONObject(i);
                    JSONArray ms = s.optJSONArray("Marks");
                    for (int k = 0; ms != null && k < ms.length(); k++) {
                        JSONObject m = ms.getJSONObject(k);
                        String text = m.optString("MarkText");
                        if (text.isEmpty()) text = m.optString("PointsText");
                        String key = m.optString("Id") + ":" + text;
                        cur.add(key);
                        if (!old.contains(key)) fresh.add(text + " · " + s.getJSONObject("Subject").optString("Name") +
                                (m.optString("Caption").isEmpty() ? "" : " – " + m.optString("Caption")));
                    }
                }
                seen.put("marks", new JSONArray(cur));
                if (!baseline && !fresh.isEmpty() && notify.optBoolean("grades", true)) {
                    post(c, "school", 200, fresh.size() == 1 ? (cs ? "Nová známka" : "New grade") : (cs ? "Nové známky" : "New grades"), fresh, "/grades");
                }
            } catch (Baka.BakaException ignored) { }

            // ---- homework ----
            try {
                Calendar from = (Calendar) now.clone();
                from.add(Calendar.DAY_OF_MONTH, -14);
                JSONArray hw = Baka.apiJson(c, "GET", "/api/3/homeworks?from=" + iso(from), null).optJSONArray("Homeworks");
                Set<String> old = set(seen.optJSONArray("hw")), cur = new HashSet<>();
                List<String> fresh = new ArrayList<>();
                for (int i = 0; hw != null && i < hw.length(); i++) {
                    JSONObject h = hw.getJSONObject(i);
                    cur.add(h.optString("ID"));
                    String due = h.optString("DateEnd");
                    if (!old.contains(h.optString("ID")) && !h.optBoolean("Done") && due.length() >= 10 && due.substring(0, 10).compareTo(today) >= 0) {
                        fresh.add(h.getJSONObject("Subject").optString("Name") + " (" + (cs ? "do " : "due ") + niceDate(c, due.substring(0, 10)) + "): " +
                                stripHtml(h.optString("Content")));
                    }
                }
                seen.put("hw", new JSONArray(cur));
                if (!baseline && !fresh.isEmpty() && notify.optBoolean("homework", true)) {
                    post(c, "school", 300, cs ? "Nový úkol" : "New homework", fresh, "/homework");
                }
            } catch (Baka.BakaException ignored) { }

            // ---- messages ----
            try {
                JSONArray msgs = Baka.apiJson(c, "POST", "/api/3/komens/messages/received", "{}").optJSONArray("Messages");
                Set<String> old = set(seen.optJSONArray("msg")), cur = new HashSet<>();
                List<String> fresh = new ArrayList<>();
                for (int i = 0; msgs != null && i < msgs.length(); i++) {
                    JSONObject m = msgs.getJSONObject(i);
                    cur.add(m.optString("Id"));
                    if (!old.contains(m.optString("Id")) && !m.optBoolean("Read")) {
                        JSONObject from = m.optJSONObject("Sender");
                        fresh.add((from == null ? "" : from.optString("Name") + ": ") + (m.optString("Title").isEmpty() ? stripHtml(m.optString("Text")) : m.optString("Title")));
                    }
                }
                seen.put("msg", new JSONArray(cur));
                if (!baseline && !fresh.isEmpty() && notify.optBoolean("messages", true)) {
                    post(c, "school", 400, cs ? "Nová zpráva" : "New message", fresh, "/messages");
                }
            } catch (Baka.BakaException ignored) { }
        }

        // ---- evening reminder: tomorrow at a glance ----
        int hour = now.get(Calendar.HOUR_OF_DAY);
        if (notify.optBoolean("evening", true) && hour >= notify.optInt("eveningHour", 19) && hour < 23 && !today.equals(seen.optString("evening"))) {
            Calendar t = (Calendar) now.clone();
            t.add(Calendar.DAY_OF_MONTH, 1);
            String tomorrow = iso(t);
            List<String> lines = new ArrayList<>();
            String title = null;
            for (int i = 0; i < days.length(); i++) {
                JSONObject d = days.getJSONObject(i);
                if (!tomorrow.equals(d.getString("d")) || !d.optString("off").isEmpty()) continue;
                JSONArray l = d.getJSONArray("l");
                List<String> subj = new ArrayList<>();
                String first = null, last = null;
                for (int k = 0; k < l.length(); k++) {
                    JSONObject x = l.getJSONObject(k);
                    if (x.optBoolean("x")) continue;
                    if (first == null) first = x.optString("b");
                    last = x.optString("e");
                    if (subj.isEmpty() || !subj.get(subj.size() - 1).equals(x.optString("s"))) subj.add(x.optString("s"));
                    if (!x.optString("c").isEmpty()) lines.add("⚠ " + x.optString("b") + " " + x.optString("s") + ": " + x.optString("c"));
                }
                if (first != null) {
                    title = cs ? "Zítra začínáš v " + first + ", konec " + last : "Tomorrow: " + first + "–" + last;
                    lines.add(0, String.join(" · ", subj));
                }
            }
            if (logged) {
                try {
                    JSONArray ev = Baka.apiJson(c, "GET", "/api/3/events/my", null).optJSONArray("Events");
                    for (int i = 0; ev != null && i < ev.length(); i++) {
                        JSONObject e = ev.getJSONObject(i);
                        JSONArray times = e.optJSONArray("Times");
                        for (int k = 0; times != null && k < times.length(); k++) {
                            String st = times.getJSONObject(k).optString("StartTime");
                            if (st.startsWith(tomorrow)) lines.add("📅 " + e.optString("Title"));
                        }
                    }
                } catch (Baka.BakaException ignored) { }
                JSONObject cloud = Store.json(c, "cloud");
                if (!cloud.optString("url").isEmpty() && cloud.optLong("exp") > System.currentTimeMillis() / 1000) {
                    try {
                        JSONObject h = new JSONObject().put("Authorization", "Bearer " + cloud.optString("token"));
                        Baka.Res r = Baka.http(cloud.optString("url") + "/cal/entries?from=" + tomorrow + "&to=" + tomorrow, "GET", h, null);
                        if (r.status == 200) {
                            JSONArray en = new JSONObject(r.text).optJSONArray("entries");
                            for (int i = 0; en != null && i < en.length(); i++) {
                                JSONObject e = en.getJSONObject(i);
                                lines.add(("test".equals(e.optString("kind")) ? "📝 " : "👥 ") + e.optString("title"));
                            }
                        }
                    } catch (Exception ignored) { }
                }
            }
            if (title != null || lines.size() > 0) {
                post(c, "evening", 500, title != null ? title : (cs ? "Zítra" : "Tomorrow"), lines, "/today");
            }
            seen.put("evening", today);
        }

        seen.put("init", true);
        Store.putJson(c, "seen", seen);
    }

    private static void append(JSONArray to, JSONArray from) throws Exception {
        for (int i = 0; i < from.length(); i++) to.put(from.get(i));
    }

    private static Set<String> set(JSONArray a) {
        Set<String> s = new HashSet<>();
        for (int i = 0; a != null && i < a.length(); i++) s.add(a.optString(i));
        return s;
    }

    static String stripHtml(String s) {
        return android.text.Html.fromHtml(s, android.text.Html.FROM_HTML_MODE_COMPACT).toString().replaceAll("\\s+", " ").trim();
    }

    // ---- notifications ----

    private static void channels(Context c, NotificationManager nm) {
        boolean cs = cs(c);
        nm.createNotificationChannel(new NotificationChannel("changes", cs ? "Změny v rozvrhu" : "Timetable changes", NotificationManager.IMPORTANCE_HIGH));
        nm.createNotificationChannel(new NotificationChannel("school", cs ? "Známky, úkoly a zprávy" : "Grades, homework and messages", NotificationManager.IMPORTANCE_DEFAULT));
        nm.createNotificationChannel(new NotificationChannel("evening", cs ? "Večerní připomenutí" : "Evening reminder", NotificationManager.IMPORTANCE_DEFAULT));
    }

    static void post(Context c, String channel, int id, String title, List<String> lines, String route) {
        if (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        channels(c, nm);
        Intent open = new Intent(c, MainActivity.class).putExtra("route", route).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, id, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.InboxStyle inbox = new Notification.InboxStyle();
        for (int i = 0; i < Math.min(lines.size(), 7); i++) inbox.addLine(lines.get(i));
        if (lines.size() > 7) inbox.setSummaryText("+" + (lines.size() - 7));
        Notification n = new Notification.Builder(c, channel)
                .setSmallIcon(R.drawable.ic_notify)
                .setColor(0xFF4F46E5)
                .setContentTitle(title)
                .setContentText(lines.isEmpty() ? "" : lines.get(0))
                .setStyle(inbox)
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build();
        nm.notify(id, n);
    }
}
