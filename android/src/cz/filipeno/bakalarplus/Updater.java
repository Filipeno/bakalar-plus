package cz.filipeno.bakalarplus;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

/**
 * Self-update from the newest GitHub release. Android always asks the user to confirm an install, and only
 * accepts an APK signed with the same key as the installed app, so a swapped download can't take over the app.
 */
final class Updater {
    private static final String LATEST = "https://api.github.com/repos/Filipeno/bakalar-plus/releases/latest";
    static final String ACTION = "cz.filipeno.bakalarplus.INSTALL_DONE";

    private Updater() { }

    static String currentVersion(Context c) {
        try { return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionName; } catch (Exception e) { return "0"; }
    }

    /** {current, latest, newer, url, sha256, notes}. */
    static JSONObject check(Context c) throws Exception {
        HttpURLConnection h = open(LATEST);
        h.setRequestProperty("Accept", "application/vnd.github+json");
        if (h.getResponseCode() != 200) throw new Baka.BakaException("offline", "HTTP " + h.getResponseCode());
        JSONObject rel = new JSONObject(new String(readAll(h.getInputStream()), "UTF-8"));
        String latest = rel.getString("tag_name").replaceFirst("^v", "");
        String url = "", sha = "";
        JSONArray assets = rel.optJSONArray("assets");
        for (int i = 0; assets != null && i < assets.length(); i++) {
            JSONObject a = assets.getJSONObject(i);
            if (a.getString("name").endsWith(".apk")) {
                url = a.getString("browser_download_url");
                sha = a.optString("digest", "").replaceFirst("^sha256:", "");
                break;
            }
        }
        String cur = currentVersion(c);
        return new JSONObject().put("current", cur).put("latest", latest).put("newer", !url.isEmpty() && compare(latest, cur) > 0)
                .put("url", url).put("sha256", sha).put("notes", rel.optString("body", ""));
    }

    /** Downloads the APK and hands it to the system installer. Returns "permission" if the user must first allow installs. */
    static String install(Context c, String url, String sha256) throws Exception {
        if (!url.startsWith("https://github.com/Filipeno/bakalar-plus/releases/download/")) throw new Baka.BakaException("other", "bad update url");
        if (Build.VERSION.SDK_INT >= 26 && !c.getPackageManager().canRequestPackageInstalls()) {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + c.getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            c.startActivity(i);
            return "permission";
        }
        File apk = new File(c.getCacheDir(), "update.apk");
        HttpURLConnection h = open(url);
        if (h.getResponseCode() != 200) throw new Baka.BakaException("offline", "HTTP " + h.getResponseCode());
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = h.getInputStream(); OutputStream out = new java.io.FileOutputStream(apk)) {
            byte[] buf = new byte[16384];
            for (int n; (n = in.read(buf)) > 0; ) { out.write(buf, 0, n); md.update(buf, 0, n); }
        }
        StringBuilder hex = new StringBuilder();
        for (byte b : md.digest()) hex.append(String.format("%02x", b));
        if (!sha256.isEmpty() && !hex.toString().equalsIgnoreCase(sha256)) { apk.delete(); throw new Baka.BakaException("other", "checksum mismatch"); }

        PackageInstaller pi = c.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams p = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        if (Build.VERSION.SDK_INT >= 31) p.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
        int id = pi.createSession(p);
        try (PackageInstaller.Session s = pi.openSession(id)) {
            try (InputStream in = new FileInputStream(apk); OutputStream out = s.openWrite("update.apk", 0, apk.length())) {
                byte[] buf = new byte[16384];
                for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
                s.fsync(out);
            }
            Intent done = new Intent(ACTION).setPackage(c.getPackageName());
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            s.commit(PendingIntent.getBroadcast(c, id, done, flags).getIntentSender());
        }
        return "started";
    }

    /** Numeric compare of "1.0.10" style versions. */
    static int compare(String a, String b) {
        String[] x = a.split("\\."), y = b.split("\\.");
        for (int i = 0; i < Math.max(x.length, y.length); i++) {
            int p = i < x.length ? num(x[i]) : 0, q = i < y.length ? num(y[i]) : 0;
            if (p != q) return p < q ? -1 : 1;
        }
        return 0;
    }

    private static int num(String s) { try { return Integer.parseInt(s.replaceAll("\\D.*", "")); } catch (Exception e) { return 0; } }

    private static HttpURLConnection open(String url) throws Exception {
        HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
        h.setConnectTimeout(10_000);
        h.setReadTimeout(60_000);
        h.setRequestProperty("User-Agent", "BakalariPlus-Updater");
        return h;
    }

    private static byte[] readAll(InputStream in) throws Exception {
        java.io.ByteArrayOutputStream o = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        for (int n; (n = in.read(buf)) > 0; ) o.write(buf, 0, n);
        return o.toByteArray();
    }
}
