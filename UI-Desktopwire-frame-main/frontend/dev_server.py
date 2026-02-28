from __future__ import annotations

import http.client
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

FRONTEND_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_HOST = "127.0.0.1"
BACKEND_PORT = 8000


class ProxyHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=FRONTEND_DIR, **kwargs)

    def do_OPTIONS(self):
        if self.path.startswith("/api/"):
            self._proxy_request("OPTIONS")
            return
        super().do_OPTIONS()

    def do_GET(self):
        if self.path.startswith("/api/"):
            self._proxy_request("GET")
            return
        super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/"):
            self._proxy_request("POST")
            return
        super().do_POST()

    def do_DELETE(self):
        if self.path.startswith("/api/"):
            self._proxy_request("DELETE")
            return
        super().do_DELETE()

    def _proxy_request(self, method: str):
        conn = http.client.HTTPConnection(BACKEND_HOST, BACKEND_PORT, timeout=30)
        try:
            parsed = urlsplit(self.path)
            target = parsed.path
            if parsed.query:
                target = f"{target}?{parsed.query}"

            headers = {}
            for key, value in self.headers.items():
                low = key.lower()
                if low in {"host", "connection", "content-length"}:
                    continue
                headers[key] = value

            body = None
            content_length = self.headers.get("Content-Length")
            if content_length:
                body = self.rfile.read(int(content_length))

            conn.request(method, target, body=body, headers=headers)
            resp = conn.getresponse()
            payload = resp.read()

            self.send_response(resp.status, resp.reason)
            for key, value in resp.getheaders():
                low = key.lower()
                if low in {"transfer-encoding", "connection", "content-length"}:
                    continue
                self.send_header(key, value)
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        except Exception as exc:
            msg = f"Proxy error: {exc}".encode("utf-8")
            self.send_response(502, "Bad Gateway")
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)
        finally:
            conn.close()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5500"))
    with ThreadingHTTPServer(("0.0.0.0", port), ProxyHandler) as server:
        print(f"Frontend proxy server running at http://0.0.0.0:{port}")
        print(f"Proxying /api/* to http://{BACKEND_HOST}:{BACKEND_PORT}")
        server.serve_forever()
