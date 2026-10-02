package cz.filipeno.bakalarplus;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * window.BPNative for the web part (web/src/lib/native.ts). `call` answers asynchronously through
 * window.__bpResolve(id, ok, payload); `sync` returns at once.
 */
final class Bridge {
    private final MainActivity act;
    private final WebView web;
    private final ExecutorService pool = Executors.newFixedThreadPool(4);

    Bridge(MainActivity act, WebView web) { this.act = act; this.web = web; }

    @JavascriptInterface
    public void call(int id, String method, String argsJson) {
        pool.execute(() -> {
            try {
                JSONObject a = new JSONObject(argsJson == null || argsJson.isEmpty() ? "{}" : argsJson);
                resolve(id, true, run(method, a));
            } catch (Baka.BakaException e) {
                resolve(id, false, err(e.code, e.getMessage()));
            } catch (Exception e) {
                resolve(id, false, err("other", String.valueOf(e.getMessage())));
            }
        });
    }

    private String run(String method, JSONObject a) throws Exception {
        switch (method) {
            case "http": {
                // Public pages and the school directory only; authorised calls go through "api".
                String url = a.getString("url");
                if (!url.startsWith("https://")) throw new Baka.BakaException("other", "https only");
                return Baka.http(url, a.optString("method", "GET"), a.optJSONObject("headers"), a.has("body") ? a.optString("body") : null, a.optBoolean("raw")).toJson().toString();
            }
            case "login":
                Baka.login(act, a.getString("school"), a.getString("username"), a.getString("password"));
                SyncJob.schedule(act);
                SyncJob.baselineSoon(act);
                return "null";
            case "api":
                return Baka.api(act, a.optString("method", "GET"), a.getString("path"), a.has("body") ? a.optString("body") : null).toJson().toString();
            case "accessToken":
                return new JSONObject().put("token", Baka.token(act, false)).toString();
            case "logout":
                Baka.logout(act);
                return "null";
            case "secretPut":    // the canteen password: encrypted with the Android Keystore, never leaves the phone
                Store.prefs(act).edit().putString("secret_" + a.getString("key"), Store.encrypt(a.getString("value"))).apply();
                return "null";
            case "secretGet": {
                String v = Store.prefs(act).getString("secret_" + a.getString("key"), null);
                return v == null ? "null" : JSONObject.quote(Store.decrypt(v));
            }
            case "secretDel":
                Store.prefs(act).edit().remove("secret_" + a.getString("key")).apply();
                return "null";
            case "updateCheck":
                return Updater.check(act).toString();
            case "updateInstall":
                return JSONObject.quote(Updater.install(act, a.getString("url"), a.optString("sha256")));
            case "ensureNotifications":
                if (Build.VERSION.SDK_INT >= 33 && act.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    act.runOnUiThread(() -> act.requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1));
                }
                return "null";
            default:
                throw new Baka.BakaException("other", "unknown method " + method);
        }
    }

    @JavascriptInterface
    public String sync(String method, String argsJson) {
        try {
            JSONObject a = new JSONObject(argsJson == null || argsJson.isEmpty() ? "{}" : argsJson);
            switch (method) {
                case "authState":
                    return new JSONObject().put("loggedIn", Baka.loggedIn(act)).put("school", Baka.school(act)).toString();
                case "setPrefs": {
                    JSONObject old = Store.json(act, "prefs");
                    Store.putJson(act, "prefs", a);
                    if (!a.optString("school").equals(old.optString("school")) || !String.valueOf(a.opt("myTarget")).equals(String.valueOf(old.opt("myTarget")))) {
                        Store.prefs(act).edit().remove("seen").apply();   // new school/class: take a fresh baseline
                    }
                    act.runOnUiThread(() -> act.applyTheme(a.optBoolean("dark")));
                    SyncJob.schedule(act);
                    return "null";
                }
                case "setWidget": {
                    JSONArray days = Tt.fromWebWeeks(a.optJSONArray("weeks") == null ? new JSONArray() : a.getJSONArray("weeks"));
                    Store.prefs(act).edit().putString("widget", days.toString()).apply();
                    Widget.updateAll(act);
                    return "null";
                }
                case "setCloud":
                    Store.putJson(act, "cloud", a);
                    return "null";
                case "openUrl":
                    act.runOnUiThread(() -> act.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(a.optString("url")))));
                    return "null";
                default:
                    return "null";
            }
        } catch (Exception e) {
            return "null";
        }
    }

    private void resolve(int id, boolean ok, String payload) {
        String js = "window.__bpResolve&&window.__bpResolve(" + id + "," + ok + "," + JSONObject.quote(payload) + ")";
        web.post(() -> web.evaluateJavascript(js, null));
    }

    private static String err(String code, String msg) {
        try { return new JSONObject().put("code", code).put("message", msg).toString(); } catch (Exception e) { return "{}"; }
    }
}
