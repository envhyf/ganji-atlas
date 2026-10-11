"""Polite, cached fetcher for xuribiao.com.

Every response is cached under data/raw/ keyed by URL, so reruns never
re-hit the site. Requests are spaced by DELAY seconds.
"""
import hashlib
import time
from urllib.parse import urlsplit
from pathlib import Path

import requests
import certifi
import urllib3
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "raw"
BASE = "https://www.xuribiao.com"
DELAY = 1.5
UA = "Mozilla/5.0 (compatible; ganji-atlas research crawler; non-commercial)"

_session = requests.Session()
_session.headers["User-Agent"] = UA
_session.mount('https://', HTTPAdapter(max_retries=Retry(
    total=3, backoff_factor=1.5, status_forcelist=(429, 500, 502, 503, 504),
    allowed_methods=('GET',), respect_retry_after_header=True,
)))
_last = 0.0
_use_origin_tls = False
# The origin's bare-domain TLS virtual host serves a certificate covering www.
# Keep validating the requested www identity and use www as the HTTP Host.
_origin = urllib3.HTTPSConnectionPool(
    'xuribiao.com', server_hostname='xuribiao.com',
    assert_hostname='www.xuribiao.com', cert_reqs='CERT_REQUIRED',
    ca_certs=certifi.where(), timeout=urllib3.Timeout(connect=10, read=30),
    retries=Retry(total=3, backoff_factor=1.5,
                  status_forcelist=(429, 500, 502, 503, 504),
                  allowed_methods=('GET',), respect_retry_after_header=True),
)


def _download(url):
    global _use_origin_tls
    parts = urlsplit(url)
    own_host = parts.scheme == 'https' and parts.netloc == 'www.xuribiao.com'
    if not (_use_origin_tls and own_host):
        try:
            r = _session.get(url, timeout=(10, 30))
            r.raise_for_status()
            r.encoding = 'utf-8'
            return r.text
        except requests.exceptions.SSLError:
            if not own_host:
                raise
    path = parts.path or '/'
    if parts.query:
        path += '?' + parts.query
    r = _origin.request('GET', path, headers={'Host': 'www.xuribiao.com', 'User-Agent': UA}, redirect=False)
    if r.status != 200:
        raise requests.HTTPError(f'Origin returned HTTP {r.status} for {path}')
    _use_origin_tls = True
    return r.data.decode('utf-8')


def _cache_path(url: str) -> Path:
    return CACHE / (hashlib.sha1(url.encode()).hexdigest() + ".html")


def get(path_or_url: str) -> str:
    """Return page HTML (utf-8), from cache if present."""
    global _last
    url = path_or_url if path_or_url.startswith("http") else BASE + path_or_url
    p = _cache_path(url)
    if p.exists():
        return p.read_text(encoding="utf-8")
    wait = DELAY - (time.time() - _last)
    if wait > 0:
        time.sleep(wait)
    try:
        html = _download(url)
    finally:
        _last = time.time()
    CACHE.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix('.html.tmp')
    tmp.write_text(html, encoding="utf-8")
    tmp.replace(p)
    return html
