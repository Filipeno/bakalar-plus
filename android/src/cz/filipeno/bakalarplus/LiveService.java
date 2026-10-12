package cz.filipeno.bakalarplus;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import org.json.JSONObject;

import java.util.Calendar;

/**
 * Fast notifications without Google: a foreground service that runs the same check as SyncJob every couple of
 * minutes (JobScheduler alone is allowed ~every 30 min and Doze or a vendor battery manager stretches that further).
 * The notification it has to show is the lowest priority, so it stays out of the way. Switch: notify.live (default on).
 */
public class LiveService extends Service {
    private static final String CHANNEL = "live", TICK = "cz.filipeno.bakalarplus.LIVE_TICK";
    private static final int ID = 7001;
    private static final long DAY_MS = 2 * 60_000L, NIGHT_MS = 15 * 60_000L;
    private volatile boolean running;

    /** Start or stop the service so it matches the settings. Never throws: Android may refuse a background start. */
    static void sync(Context c) {
        try {
            Intent i = new Intent(c, LiveService.class);
            if (wanted(c)) c.startForegroundService(i); else c.stopService(i);
        } catch (Throwable ignored) { }
    }

    private static boolean wanted(Context c) {
        JSONObject p = Store.json(c, "prefs");
        if (p.optString("school").isEmpty()) return false;
        JSONObject n = p.optJSONObject("notify");
        if (n == null) return true;
        return n.optBoolean("live", true) && (n.optBoolean("changes", true) || n.optBoolean("grades", true)
                || n.optBoolean("homework", true) || n.optBoolean("messages", true));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!wanted(this)) { stopSelf(); return START_NOT_STICKY; }
        startForegroundCompat();
        if (!running) {
            running = true;
            final Context app = getApplicationContext();
            PowerManager pm = getSystemService(PowerManager.class);
            final PowerManager.WakeLock wl = pm == null ? null : pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "bakalarplus:check");
            new Thread(() -> {
                if (wl != null) wl.acquire(60_000L);
                try { SyncJob.run(app); } catch (Throwable ignored) { }
                finally {
                    if (wl != null && wl.isHeld()) wl.release();
                    running = false;
                    scheduleNext(app);
                }
            }, "bp-live").start();
        }
        return START_STICKY;
    }

    private static void scheduleNext(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am == null) return;
        int h = Calendar.getInstance().get(Calendar.HOUR_OF_DAY);
        long wait = h >= 6 && h < 22 ? DAY_MS : NIGHT_MS;
        PendingIntent pi = PendingIntent.getService(c, 0, new Intent(c, LiveService.class).setAction(TICK),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + wait, pi);
    }

    private void startForegroundCompat() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        boolean cs = SyncJob.cs(this);
        NotificationChannel ch = new NotificationChannel(CHANNEL, cs ? "Rychlá upozornění" : "Fast notifications", NotificationManager.IMPORTANCE_MIN);
        ch.setShowBadge(false);
        nm.createNotificationChannel(ch);
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.ic_notify)
                .setContentTitle(cs ? "Hlídám změny v rozvrhu a známky" : "Watching for timetable and grade changes")
                .setContentIntent(open)
                .setOngoing(true)
                .build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(ID, n, 1 << 30);   // FOREGROUND_SERVICE_TYPE_SPECIAL_USE
        else startForeground(ID, n);
    }

    @Override
    public void onDestroy() {
        AlarmManager am = getSystemService(AlarmManager.class);
        if (am != null) am.cancel(PendingIntent.getService(this, 0, new Intent(this, LiveService.class).setAction(TICK),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
