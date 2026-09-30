package cz.filipeno.bakalarplus;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;

/**
 * Talks to a school's Bakaláři server. Owns the login: the app's web part and the background job both go
 * through here, so the refresh token (which rotates on every use) is never used twice.
 */
final class Baka {
    static final class Res {
        final int status; final String text;
        Res(int status, String text) { this.status = status; this.text = text; }
        JSONObject toJson() throws Exception { return new JSONObject().put("status", status).put("text", text); }
    }

    static final class BakaException extends Exception {
        final String code;   // bad_login | expired | offline | other
        BakaException(String code, String msg) { super(msg); this.code = code; }
    }

    private static final Object LOCK = new Object();

    // ---------------- plain HTTP ----------------

    static Res http(String url, String method, JSONObject headers, String body) throws BakaException {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(15000);
            c.setReadTimeout(30000);
            c.setRequestMethod(method == null ? "GET" : method);
            c.setRequestProperty("User-Agent", "BakalariPlus/1.0 (Android)");
            if (headers != null) {
                for (Iterator<String> it = headers.keys(); it.hasNext(); ) {
                    String k = it.next();
                    c.setRequestProperty(k, headers.optString(k));
                }
            }
            if (body != null) {
                c.setDoOutput(true);
                try (OutputStream o = c.getOutputStream()) { o.write(body.getBytes(StandardCharsets.UTF_8)); }
            }
            int status = c.getResponseCode();
            InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
            return new Res(status, in == null ? "" : readAll(in));
        } catch (java.io.IOException e) {
            throw new BakaException("offline", e.getClass().getSimpleName());
        } finally {
            if (c != null) c.disconnect();
        }
    }

    static String readAll(InputStream in) throws java.io.IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        for (int n; (n = in.read(buf)) > 0; ) b.write(buf, 0, n);
        in.close();
        return b.toString("UTF-8");
    }

    // ---------------- login ----------------

    private static String form(String... kv) throws Exception {
        StringBuilder s = new StringBuilder("client_id=ANDR");
        for (int i = 0; i < kv.length; i += 2) s.append('&').append(kv[i]).append('=').append(URLEncoder.encode(kv[i + 1], "UTF-8"));
        return s.toString();
    }

    private static JSONObject tokenRequest(String school, String body) throws BakaException {
        Res r = http(school + "/api/login", "POST", headersForm(), body);
        if (r.status == 400 || r.status == 401) throw new BakaException("bad_login", "bad login");
        if (r.status != 200) throw new BakaException("other", "HTTP " + r.status);
        try { return new JSONObject(r.text); } catch (Exception e) { throw new BakaException("other", "bad answer"); }
    }

    private static JSONObject headersForm() {
        try { return new JSONObject().put("Content-Type", "application/x-www-form-urlencoded"); } catch (Exception e) { return null; }
    }

    private static void saveTokens(SharedPreferences.Editor e, JSONObject t) {
        e.putString("access", t.optString("access_token"))
         .putString("refresh", t.optString("refresh_token"))
         .putLong("exp", System.currentTimeMillis() + t.optLong("expires_in", 3000) * 1000L);
    }

    static void login(Context ctx, String school, String user, String pass) throws Exception {
        synchronized (LOCK) {
            JSONObject t = tokenRequest(school, form("grant_type", "password", "username", user, "password", pass));
            SharedPreferences.Editor e = Store.prefs(ctx).edit()
                    .putString("school", school).putString("user", user).putString("pass", Store.encrypt(pass));
            saveTokens(e, t);
            e.apply();
        }
    }

    static void logout(Context ctx) {
        synchronized (LOCK) {
            Store.prefs(ctx).edit().remove("user").remove("pass").remove("access").remove("refresh").remove("exp")
                    .remove("seen").remove("cloud").apply();
        }
    }

    static boolean loggedIn(Context ctx) { return Store.prefs(ctx).contains("pass"); }
    static String school(Context ctx) { return Store.prefs(ctx).getString("school", ""); }

    /** A valid access token: the saved one, a refreshed one, or (if the refresh token died) a fresh login. */
    static String token(Context ctx, boolean force) throws BakaException {
        synchronized (LOCK) {
            SharedPreferences p = Store.prefs(ctx);
            if (!p.contains("pass")) throw new BakaException("expired", "not logged in");
            String school = p.getString("school", "");
            if (!force && p.getLong("exp", 0) > System.currentTimeMillis() + 60000) return p.getString("access", "");
            JSONObject t = null;
            String refresh = p.getString("refresh", "");
            if (!refresh.isEmpty()) {
                try { t = tokenRequest(school, form("grant_type", "refresh_token", "refresh_token", refresh)); }
                catch (BakaException e) { if ("offline".equals(e.code)) throw e; }
                catch (Exception e) { /* fall through to password */ }
            }
            if (t == null) {
                try {
                    t = tokenRequest(school, form("grant_type", "password", "username", p.getString("user", ""),
                            "password", Store.decrypt(p.getString("pass", ""))));
                } catch (BakaException e) {
                    if ("bad_login".equals(e.code)) throw new BakaException("expired", "password changed");
                    throw e;
                } catch (Exception e) {
                    throw new BakaException("expired", "cannot read stored login");
                }
            }
            SharedPreferences.Editor e = p.edit();
            saveTokens(e, t);
            e.apply();
            return t.optString("access_token");
        }
    }

    /** Authorised request to the school; retries once with a new token on 401. */
    static Res api(Context ctx, String method, String path, String body) throws BakaException {
        String school = school(ctx);
        JSONObject h = new JSONObject();
        try {
            h.put("Accept", "application/json");
            if (body != null) h.put("Content-Type", "application/json");
            h.put("Authorization", "Bearer " + token(ctx, false));
            Res r = http(school + path, method, h, body);
            if (r.status == 401) {
                h.put("Authorization", "Bearer " + token(ctx, true));
                r = http(school + path, method, h, body);
            }
            return r;
        } catch (BakaException e) {
            throw e;
        } catch (Exception e) {
            throw new BakaException("other", e.getMessage());
        }
    }

    static JSONObject apiJson(Context ctx, String method, String path, String body) throws BakaException {
        Res r = api(ctx, method, path, body);
        if (r.status != 200) throw new BakaException(r.status == 401 ? "expired" : "other", "HTTP " + r.status);
        try { return new JSONObject(r.text); } catch (Exception e) { throw new BakaException("other", "bad json"); }
    }
}
