import { defineConfig, type Plugin } from "vite";
import preact from "@preact/preset-vite";
import pkg from "./package.json" with { type: "json" };

// Dev only: the same /relay endpoint the Cloudflare Worker provides, so the browser can reach Bakaláři
// (it sends no CORS headers). The Android app doesn't need it: it calls Bakaláři natively.
function devRelay(): Plugin {
  return {
    name: "dev-relay",
    configureServer(server) {
      server.middlewares.use("/relay", async (req, res) => {
        const target = new URL(req.url!, "http://x").searchParams.get("u");
        if (!target?.startsWith("https://")) { res.statusCode = 400; res.end("bad target"); return; }
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const headers: Record<string, string> = { "User-Agent": "BakalariPlus/1.0" };
        for (const h of ["authorization", "content-type", "accept"]) if (req.headers[h]) headers[h] = String(req.headers[h]);
        try {
          const r = await fetch(target, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined, redirect: "manual" });
          res.statusCode = r.status;
          res.setHeader("Content-Type", r.headers.get("content-type") || "text/plain");
          res.end(Buffer.from(await r.arrayBuffer()));
        } catch (e) { res.statusCode = 502; res.end(String(e)); }
      });
    },
  };
}

export default defineConfig({
  base: "./",
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [preact(), devRelay()],
  build: { outDir: "dist", assetsInlineLimit: 0, chunkSizeWarningLimit: 400 },
  server: { host: true },
});
