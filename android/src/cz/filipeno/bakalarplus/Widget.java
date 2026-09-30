package cz.filipeno.bakalarplus;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;

/** Home-screen widget: the lesson now (or next), then the rest of the day. Re-renders at every lesson boundary. */
public class Widget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context c, AppWidgetManager mgr, int[] ids) { render(c, mgr, ids); }

    static void updateAll(Context c) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(c);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(c, Widget.class));
        if (ids.length > 0) render(c, mgr, ids);
    }

    private static boolean cs(Context c) {
        String l = Store.json(c, "prefs").optString("lang", "auto");
        return "cs".equals(l) || ("auto".equals(l) && ("cs".equals(Locale.getDefault().getLanguage()) || "sk".equals(Locale.getDefault().getLanguage())));
    }

    private static List<JSONObject> live(JSONObject day) {
        List<JSONObject> out = new ArrayList<>();
        JSONArray l = day.optJSONArray("l");
        for (int i = 0; l != null && i < l.length(); i++) if (!l.optJSONObject(i).optBoolean("x")) out.add(l.optJSONObject(i));
        return out;
    }

    static void render(Context c, AppWidgetManager mgr, int[] ids) {
        boolean cs = cs(c);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget);
        v.removeAllViews(R.id.w_rows);
        Calendar now = Calendar.getInstance();
        String today = SyncJob.iso(now);
        int nm = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE);
        v.setTextViewText(R.id.w_head, "BAKALÁŘI+ · " + SyncJob.niceDate(c, today).toUpperCase(Locale.ROOT));

        JSONArray days;
        try { days = new JSONArray(Store.prefs(c).getString("widget", "[]")); } catch (Exception e) { days = new JSONArray(); }
        JSONObject todayDay = null, nextDay = null;
        for (int i = 0; i < days.length(); i++) {
            JSONObject d = days.optJSONObject(i);
            String date = d.optString("d");
            if (date.equals(today) && d.optString("off").isEmpty()) todayDay = d;
            if (date.compareTo(today) > 0 && d.optString("off").isEmpty() && !live(d).isEmpty() && (nextDay == null || date.compareTo(nextDay.optString("d")) < 0)) nextDay = d;
        }

        List<JSONObject> rest = new ArrayList<>();
        long nextBoundary = -1;
        List<JSONObject> ls = todayDay == null ? new ArrayList<>() : live(todayDay);
        JSONObject cur = null, nxt = null;
        for (JSONObject l : ls) {
            int b = Tt.min(l.optString("b")), e = Tt.min(l.optString("e"));
            if (cur == null && b <= nm && nm < e) cur = l;
            else if (nxt == null && b > nm) nxt = l;
            if (b > nm && nextBoundary < 0) nextBoundary = b;
            if (e > nm && (nextBoundary < 0 || e < nextBoundary)) nextBoundary = e;
        }
        if (cur != null) {
            v.setTextViewText(R.id.w_now_label, (cs ? "TEĎ · DO " : "NOW · UNTIL ") + cur.optString("e"));
            v.setTextViewText(R.id.w_now_title, title(cur));
            v.setTextViewText(R.id.w_now_meta, meta(cur));
            for (JSONObject l : ls) if (Tt.min(l.optString("b")) >= Tt.min(cur.optString("e"))) rest.add(l);
        } else if (nxt != null) {
            int mins = Tt.min(nxt.optString("b")) - nm;
            v.setTextViewText(R.id.w_now_label, (cs ? "DALŠÍ · " : "NEXT · ") + nxt.optString("b") + (mins <= 60 ? (cs ? " (ZA " : " (IN ") + mins + " MIN)" : ""));
            v.setTextViewText(R.id.w_now_title, title(nxt));
            v.setTextViewText(R.id.w_now_meta, meta(nxt));
            for (JSONObject l : ls) if (Tt.min(l.optString("b")) > Tt.min(nxt.optString("b"))) rest.add(l);
        } else if (nextDay != null) {
            List<JSONObject> nl = live(nextDay);
            v.setTextViewText(R.id.w_now_label, SyncJob.niceDate(c, nextDay.optString("d")).toUpperCase(Locale.ROOT));
            v.setTextViewText(R.id.w_now_title, (cs ? "Začínáš v " : "Starts at ") + nl.get(0).optString("b"));
            v.setTextViewText(R.id.w_now_meta, title(nl.get(0)) + (nl.get(0).optString("r").isEmpty() ? "" : " · " + nl.get(0).optString("r")));
            rest.addAll(nl.subList(1, nl.size()));
        } else {
            v.setTextViewText(R.id.w_now_label, cs ? "ROZVRH" : "TIMETABLE");
            v.setTextViewText(R.id.w_now_title, days.length() == 0 ? (cs ? "Otevři aplikaci" : "Open the app") : (cs ? "Volno 🎉" : "No school 🎉"));
            v.setTextViewText(R.id.w_now_meta, "");
        }
        String lastBegin = "";
        int shown = 0;
        for (JSONObject l : rest) {
            if (shown >= 5) break;
            if (l.optString("b").equals(lastBegin)) continue;   // parallel groups: show the period once
            lastBegin = l.optString("b");
            RemoteViews row = new RemoteViews(c.getPackageName(), R.layout.widget_row);
            row.setTextViewText(R.id.r_time, l.optString("b"));
            row.setTextViewText(R.id.r_subj, title(l) + (l.optString("c").isEmpty() ? "" : " ⚠"));
            row.setTextViewText(R.id.r_room, l.optString("r"));
            v.addView(R.id.w_rows, row);
            shown++;
        }

        Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        v.setOnClickPendingIntent(R.id.w_root, PendingIntent.getActivity(c, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        mgr.updateAppWidget(ids, v);

        // Next redraw: at the next lesson start/end today, otherwise just after midnight.
        Calendar at = (Calendar) now.clone();
        if (nextBoundary >= 0) {
            at.set(Calendar.HOUR_OF_DAY, (int) (nextBoundary / 60));
            at.set(Calendar.MINUTE, (int) (nextBoundary % 60));
            at.set(Calendar.SECOND, 5);
        } else {
            at.add(Calendar.DAY_OF_MONTH, 1);
            at.set(Calendar.HOUR_OF_DAY, 0);
            at.set(Calendar.MINUTE, 5);
        }
        AlarmManager am = c.getSystemService(AlarmManager.class);
        Intent tick = new Intent(c, Widget.class).setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE).putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
        if (am != null) am.set(AlarmManager.RTC, at.getTimeInMillis(), PendingIntent.getBroadcast(c, 2, tick, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
    }

    private static String title(JSONObject l) {
        String n = l.optString("n");
        return n.isEmpty() ? l.optString("s") : n;
    }

    private static String meta(JSONObject l) {
        StringBuilder s = new StringBuilder(l.optString("r"));
        if (!l.optString("t").isEmpty()) s.append(s.length() > 0 ? " · " : "").append(l.optString("t"));
        if (!l.optString("c").isEmpty()) s.append(" · ⚠ ").append(l.optString("c"));
        return s.toString();
    }
}
