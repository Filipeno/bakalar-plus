#!/usr/bin/env python3
"""Bakaláři+ gateway: forwards the Worker's requests to schools whose servers block Cloudflare.

Some schools' firewalls drop traffic from Cloudflare (datacenter / foreign IPs). This runs on a machine with an
ordinary Czech connection (a Raspberry Pi at home) and makes those requests for the Worker.

- Listens on 127.0.0.1 only. The Worker reaches it privately through a Cloudflare Tunnel (Workers VPC service),
  so there is no public address at all.
- Every request must carry the shared secret (X-BP-Gateway), and it only forwards to Bakaláři paths
  (/api..., /Timetable/Public...) and school-canteen (iCanteen) pages over https. Nothing is stored or logged
  except the target host. Cookies pass through both ways for the canteen login; they are not kept here.

Standard library only.   Config: env BP_GATEWAY_SECRET (required), BP_GATEWAY_PORT (default 8770).
"""
import hmac
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SECRET = os.environ.get("BP_GATEWAY_SECRET", "")
PORT = int(os.environ.get("BP_GATEWAY_PORT", "8770"))
SCHOOL_PATH = re.compile(r"^(/[\w.-]+)?/(api(/.*)?|Timetable/Public(/.*)?)$", re.I)
# iCanteen (school canteen) pages: login, menu, ordering, exchange.
CANTEEN_PATH = re.compile(r"^(?!.*\.\.)/(login|j_spring_security_check|logout|web/setting|faces/(secured/)?[\w./-]*|help)?$", re.I)
FORWARD = ("authorization", "content-type", "accept", "cookie")
MAX_BODY = 64 * 1024


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None          # hand 3xx back to the Worker, like its own fetch(redirect: "manual")


OPENER = urllib.request.build_opener(NoRedirect)


class Handler(BaseHTTPRequestHandler):
    server_version = "bp-gateway"
    sys_version = ""

    def log_message(self, fmt, *args):
        pass                 # no request logging: URLs can contain tokens in query strings

    def reply(self, status, body=b"", ctype="text/plain; charset=utf-8", upstream=None):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        if upstream is not None:     # the canteen login needs its cookies and redirects back
            for v in upstream.get_all("Set-Cookie") or []:
                self.send_header("Set-Cookie", v)
            if upstream.get("Location"):
                self.send_header("Location", upstream.get("Location"))
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_any(self):
        if not SECRET or not hmac.compare_digest(self.headers.get("X-BP-Gateway", ""), SECRET):
            return self.reply(403, b"forbidden")
        q = urllib.parse.urlsplit(self.path)
        if q.path == "/health":
            return self.reply(200, b"ok")
        if q.path != "/fetch":
            return self.reply(404, b"not found")
        target = urllib.parse.parse_qs(q.query).get("u", [""])[0]
        t = urllib.parse.urlsplit(target)
        if t.scheme != "https" or not t.hostname or t.username or not (SCHOOL_PATH.match(t.path or "/") or CANTEEN_PATH.match(t.path or "/")):
            return self.reply(403, b"not a Bakalari path")
        if self.command not in ("GET", "POST", "PUT"):
            return self.reply(405, b"method")
        n = int(self.headers.get("Content-Length") or 0)
        if n > MAX_BODY:
            return self.reply(413, b"too big")
        body = self.rfile.read(n) if n else None
        headers = {"User-Agent": "BakalariPlus/1.0 (+https://github.com/Filipeno/bakalar-plus)"}
        for h in FORWARD:
            v = self.headers.get(h)
            if v:
                headers[h] = v
        req = urllib.request.Request(target, data=body, headers=headers, method=self.command)
        try:
            with OPENER.open(req, timeout=25) as r:
                return self.reply(r.status, r.read(), r.headers.get("Content-Type", "text/plain"), r.headers)
        except urllib.error.HTTPError as e:
            return self.reply(e.code, e.read() or b"", e.headers.get("Content-Type", "text/plain") if e.headers else "text/plain", e.headers)
        except Exception as e:
            print(f"upstream failed: {t.hostname}: {e.__class__.__name__}", flush=True)
            return self.reply(502, b"upstream unreachable")

    do_GET = do_POST = do_PUT = handle_any


if __name__ == "__main__":
    if len(SECRET) < 32:
        sys.exit("BP_GATEWAY_SECRET must be set (32+ characters)")
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    srv.daemon_threads = True
    print(f"bp-gateway on 127.0.0.1:{PORT}", flush=True)
    srv.serve_forever()
