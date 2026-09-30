package cz.filipeno.bakalarplus;

import android.app.Activity;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/** Hosts the web app from the APK's assets under a private https origin, plus the native bridge. */
public class MainActivity extends Activity {
    static final String HOST = "app.bakalarplus.cz";
    private static final String ORIGIN = "https://" + HOST + "/";
    private WebView web;
    private boolean dark;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        FrameLayout root = new FrameLayout(this);
        web = new WebView(this);
        root.addView(web);
        setContentView(root);

        // Android 15 draws apps edge to edge: keep the page clear of the status and navigation bars.
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                Insets b = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                v.setPadding(b.left, b.top, b.right, b.bottom);
            } else {
                v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                        insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });

        dark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        applyTheme(dark);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setTextZoom(100);
        web.addJavascriptInterface(new Bridge(this, web), "BPNative");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (!HOST.equals(u.getHost())) return null;
                String path = u.getPath() == null || u.getPath().equals("/") ? "/index.html" : u.getPath();
                try {
                    InputStream in = getAssets().open("web" + path);
                    Map<String, String> h = new HashMap<>();
                    h.put("Cache-Control", path.startsWith("/assets/") ? "max-age=31536000" : "no-cache");
                    return new WebResourceResponse(mime(path), "utf-8", 200, "OK", h, in);
                } catch (Exception e) {
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<>(), null);
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                if (HOST.equals(req.getUrl().getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, req.getUrl())); } catch (Exception ignored) { }
                return true;
            }
        });
        web.setBackgroundColor(Color.parseColor(dark ? "#0F1115" : "#F5F6FA"));
        web.loadUrl(ORIGIN + "index.html" + routeFrom(getIntent()));
        SyncJob.schedule(this);
    }

    private static String routeFrom(Intent i) {
        String r = i == null ? null : i.getStringExtra("route");
        return r == null ? "" : "#" + r;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String r = routeFrom(intent);
        if (!r.isEmpty()) web.evaluateJavascript("location.hash=" + org.json.JSONObject.quote(r), null);
    }

    private static String mime(String p) {
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js")) return "text/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".json") || p.endsWith(".webmanifest")) return "application/json";
        return "application/octet-stream";
    }

    /** Status/navigation bar colours follow the app's theme (the app can differ from the system setting). */
    void applyTheme(boolean darkTheme) {
        dark = darkTheme;
        int bg = Color.parseColor(dark ? "#0F1115" : "#F5F6FA");
        getWindow().setStatusBarColor(bg);
        getWindow().setNavigationBarColor(bg);
        getWindow().getDecorView().setBackgroundColor(bg);
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                c.setSystemBarsAppearance(dark ? 0 : light, light);
            }
        } else {
            View d = getWindow().getDecorView();
            d.setSystemUiVisibility(dark ? 0 : View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        // The web part closes sheets and sub-pages first; "false" means it's on the home tab.
        web.evaluateJavascript("window.__bpBack?window.__bpBack():false", v -> {
            if (!"true".equals(v)) finish();
        });
    }

    @Override
    protected void onPause() {
        super.onPause();
        Widget.updateAll(this);
    }
}
