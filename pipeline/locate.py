"""Locate market towns: one Overpass query per county, then local name matching.

Every result carries a precision tier so the front end can be honest:
  town_seat    matched an OSM town/township/admin node of the same name
  village      matched a village/hamlet/neighbourhood node
  unresolved   no confident match -> not plotted; queued for review
All points are GCJ-02 and must fall inside the DataV county polygon.
"""
import time

import requests

import geo

OVERPASS = "https://overpass-api.de/api/interpreter"
_s = requests.Session()
_s.headers["User-Agent"] = "ganji-atlas/0.1 (research; contact via github)"  # overpass 406s generic UAs
_last = 0.0

SEAT = {"town", "township", "suburb", "city", "county"}
VILL = {"village", "hamlet", "neighbourhood", "quarter", "isolated_dwelling", "locality"}
_STRIP = ("街道办事处", "街道", "镇", "乡", "村委会", "村", "社区", "居委会", "圩", "墟", "集", "场",
          "市场", "大集", "农贸市场", "庙会", "古会", "大会")


def county_places(feature):
    """All named place nodes in the county bbox (cached), as GCJ-02, inside polygon."""
    x0, y0, x1, y1 = geo.bbox(feature, pad=0.01)
    q = (f'[out:json][timeout:90];(node["place"]["name"]({y0},{x0},{y1},{x1});'
         f'node["name"]["admin_level"~"^(8|9)$"]({y0},{x0},{y1},{x1}););out body;')

    def fetch():
        global _last
        for attempt in range(8):
            wait = 3.0 - (time.time() - _last)
            if wait > 0:
                time.sleep(wait)
            try:
                r = _s.post(OVERPASS, data={"data": q}, timeout=150)
            except requests.RequestException:
                r = None
            _last = time.time()
            if r is None or r.status_code in (429, 500, 502, 503, 504):
                time.sleep(min(15 * (attempt + 1), 90))
                continue
            r.raise_for_status()
            return r.json()["elements"]
        raise RuntimeError("overpass unavailable")

    out = []
    for e in geo._cached_json("ovp:" + q, fetch):
        lon, lat = geo.wgs2gcj(e["lon"], e["lat"])
        if not geo.contains(feature, lon, lat):
            continue
        t = e.get("tags", {})
        names = {t.get(k) for k in ("name", "name:zh", "name:zh-Hans", "old_name", "alt_name") if t.get(k)}
        out.append({"lon": round(lon, 6), "lat": round(lat, 6), "place": t.get("place", "admin"),
                    "names": sorted(names), "osm": e["id"]})
    return out


def stem(name: str) -> str:
    n = name.strip().replace(" ", "")
    n = n.split("（")[0].split("(")[0]          # 河底（农） -> 河底
    n = n.rstrip("0123456789一二三四五六七八九")      # 万寿1 -> 万寿
    for s in sorted(_STRIP, key=len, reverse=True):
        if n.endswith(s) and len(n) > len(s) + 1:
            return n[: -len(s)]
    return n


def locate(name: str, places):
    """Best place for a market name within one county's place list."""
    st = stem(name)
    best = None
    for p in places:
        for n in p["names"]:
            ns = stem(n)
            if n == name or ns == st:
                score = 3
            elif len(st) >= 2 and (n.startswith(st) or ns.startswith(st)):
                score = 2
            else:
                continue
            tier = "town_seat" if p["place"] in SEAT or p["place"] == "admin" else \
                   "village" if p["place"] in VILL else "other"
            rank = (score, tier == "town_seat", tier == "village")
            if best is None or rank > best[0]:
                best = (rank, p, tier, n)
    if not best or best[0][0] < 2:
        return {"precision": "unresolved"}
    (score, *_), p, tier, n = best
    return {"lon": p["lon"], "lat": p["lat"], "precision": tier,
            "match": "exact" if score == 3 else "prefix", "osm_name": n, "osm_id": p["osm"]}
