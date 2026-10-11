"""Geocoding + validation against DataV county polygons.

- DataV (geo.datav.aliyun.com) boundaries are GCJ-02 and stop at county level.
- Nominatim (OSM) returns WGS-84; we convert to GCJ-02 so everything lines up
  with DataV and AMap basemaps.
- A geocode is accepted only if the point falls inside its county polygon.
"""
import hashlib
import json
import math
import time
import urllib.parse
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "geo_cache"
DATAV = "https://geo.datav.aliyun.com/areas_v3/bound/"
NOMINATIM = "https://nominatim.openstreetmap.org/search"
UA = "ganji-atlas research crawler (non-commercial)"

_s = requests.Session()
_s.headers["User-Agent"] = UA
_last_nom = 0.0


class NotCached(LookupError):
    """Raised in CACHE_ONLY mode when a lookup would hit the network."""


CACHE_ONLY = False


def _cached_json(key: str, fetch):
    CACHE.mkdir(parents=True, exist_ok=True)
    p = CACHE / (hashlib.sha1(key.encode()).hexdigest() + ".json")
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    if CACHE_ONLY:
        raise NotCached(key)
    data = fetch()
    p.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data


# ---------------- DataV ----------------
def datav(code: str):
    """DataV GeoJSON for an adcode (or '{adcode}_full'); None if DataV has no such file."""
    def fetch():
        r = _s.get(DATAV + code + ".json", timeout=30)
        return r.json() if r.status_code == 200 else {"missing": r.status_code}
    d = _cached_json("datav:" + code, fetch)
    return None if "missing" in d else d


def find_county(city_name: str, county_name: str):
    """Locate a county feature by (city, county) names. Returns GeoJSON feature."""
    for prov in datav("100000_full")["features"]:
        pc = prov["properties"].get("adcode")
        if not pc:
            continue
        for city in datav(f"{pc}_full")["features"]:
            cp = city["properties"]
            # direct-admin cities list districts directly under the province
            if cp["name"] == county_name and prov["properties"]["name"].startswith(city_name[:2]):
                return datav(str(cp["adcode"]))["features"][0]
            if cp["name"] != city_name:
                continue
            for c in datav(f"{cp['adcode']}_full")["features"]:
                if c["properties"]["name"] == county_name:
                    return datav(str(c["properties"]["adcode"]))["features"][0]
    return None


# ---------------- geometry ----------------
def _in_ring(x, y, ring):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def contains(feature, lon, lat) -> bool:
    g = feature["geometry"]
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    for poly in polys:
        if _in_ring(lon, lat, poly[0]) and not any(_in_ring(lon, lat, h) for h in poly[1:]):
            return True
    return False


# ---------------- WGS-84 -> GCJ-02 ----------------
_A = 6378245.0
_EE = 0.00669342162296594323


def _tlat(x, y):
    r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * math.sqrt(abs(x))
    r += (20 * math.sin(6 * x * math.pi) + 20 * math.sin(2 * x * math.pi)) * 2 / 3
    r += (20 * math.sin(y * math.pi) + 40 * math.sin(y / 3 * math.pi)) * 2 / 3
    r += (160 * math.sin(y / 12 * math.pi) + 320 * math.sin(y * math.pi / 30)) * 2 / 3
    return r


def _tlon(x, y):
    r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * math.sqrt(abs(x))
    r += (20 * math.sin(6 * x * math.pi) + 20 * math.sin(2 * x * math.pi)) * 2 / 3
    r += (20 * math.sin(x * math.pi) + 40 * math.sin(x / 3 * math.pi)) * 2 / 3
    r += (150 * math.sin(x / 12 * math.pi) + 300 * math.sin(x / 30 * math.pi)) * 2 / 3
    return r


def wgs2gcj(lon, lat):
    dlat = _tlat(lon - 105, lat - 35)
    dlon = _tlon(lon - 105, lat - 35)
    rad = lat / 180 * math.pi
    magic = 1 - _EE * math.sin(rad) ** 2
    sq = math.sqrt(magic)
    dlat = dlat * 180 / ((_A * (1 - _EE)) / (magic * sq) * math.pi)
    dlon = dlon * 180 / (_A / sq * math.cos(rad) * math.pi)
    return lon + dlon, lat + dlat


# ---------------- Nominatim ----------------
def bbox(feature, pad=0.05):
    g = feature["geometry"]
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    xs = [p[0] for poly in polys for p in poly[0]]
    ys = [p[1] for poly in polys for p in poly[0]]
    return min(xs) - pad, min(ys) - pad, max(xs) + pad, max(ys) + pad


def nominatim(q: str, box=None):
    def fetch():
        global _last_nom
        wait = 1.1 - (time.time() - _last_nom)
        if wait > 0:
            time.sleep(wait)
        params = {"format": "jsonv2", "q": q, "limit": 10, "countrycodes": "cn",
                  "namedetails": 1}
        if box:
            params["viewbox"] = ",".join(f"{v:.4f}" for v in box)
            params["bounded"] = 1
        url = NOMINATIM + "?" + urllib.parse.urlencode(params)
        r = _s.get(url, timeout=30)
        _last_nom = time.time()
        r.raise_for_status()
        return r.json()
    key = "nom2:" + q + (":" + ",".join(f"{v:.4f}" for v in box) if box else "")
    return _cached_json(key, fetch)


_SUFFIXES = ("镇", "乡", "街道", "圩", "集", "市场", "场")


def name_variants(name: str):
    out = [name]
    for s in _SUFFIXES:
        if name.endswith(s) and len(name) > len(s) + 1:
            out.append(name[: -len(s)])
    return out


_RANK = {"town": 0, "township": 0, "suburb": 1, "village": 2, "hamlet": 3}


def geocode(name: str, county_feature) -> dict:
    """Return {lon, lat (GCJ-02), precision, source, osm_name}."""
    box = bbox(county_feature)
    for q in name_variants(name):
        hits = []
        for r in nominatim(q, box):
            names = [r.get("name") or ""] + list((r.get("namedetails") or {}).values())
            if not any(q in n or n in name for n in names if n):
                continue  # fuzzy match on a different name (e.g. 六卢 -> 六律)
            lon, lat = wgs2gcj(float(r["lon"]), float(r["lat"]))
            if contains(county_feature, lon, lat):
                hits.append((_RANK.get(r.get("addresstype"), 5), lon, lat, r))
        if hits:
            hits.sort(key=lambda h: h[0])
            _, lon, lat, r = hits[0]
            return {"lon": round(lon, 6), "lat": round(lat, 6),
                    "precision": "osm:" + r.get("addresstype", "?"),
                    "source": "nominatim", "osm_name": r.get("name"), "query": q}
    cx, cy = county_feature["properties"]["centroid"] or county_feature["properties"]["center"]
    # Unresolved: placeholder at county centroid, flagged for LLM/manual review.
    return {"lon": cx, "lat": cy, "precision": "county_centroid",
            "source": "datav", "osm_name": None, "query": None}
