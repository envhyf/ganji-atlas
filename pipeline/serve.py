"""Static dev server for site/ with caching disabled (so edits show on reload)."""
import functools
import http.server
import sys
from pathlib import Path


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    site = Path(__file__).resolve().parent.parent / "site"
    handler = functools.partial(NoCache, directory=str(site))
    http.server.ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
