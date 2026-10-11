"""高德 Web 服务：乡镇名录、地理编码、逆地理编码。结果全部是 GCJ-02。

Key 从环境变量 AMAP_KEY 或项目根目录的 .amap_key 读取（已 gitignore）。
所有响应缓存在 data/geo_cache/，重跑不消耗配额。
"""
import os
import time
from pathlib import Path

import requests

import geo

ROOT = Path(__file__).resolve().parent.parent
API = "https://restapi.amap.com/v3/"
INTERVAL = 0.4          # 个人 Key 并发上限约 3 QPS
_s = requests.Session()
_last = 0.0


class QuotaExceeded(RuntimeError):
    """当日配额用尽：停下来，已缓存的结果不丢，明天续跑。"""


def _key():
    k = os.environ.get("AMAP_KEY")
    if not k and (ROOT / ".amap_key").exists():
        k = (ROOT / ".amap_key").read_text(encoding="utf-8").strip()
    if not k:
        raise RuntimeError("需要高德 Web 服务 Key：设置 AMAP_KEY 或写入 .amap_key")
    return k


def _call(endpoint, **params):
    cache_key = "amap:" + endpoint + ":" + "&".join(f"{k}={params[k]}" for k in sorted(params))

    def fetch():
        global _last
        for attempt in range(6):
            wait = INTERVAL - (time.time() - _last)
            if wait > 0:
                time.sleep(wait)
            r = _s.get(API + endpoint, params={**params, "key": _key()}, timeout=20)
            _last = time.time()
            d = r.json()
            if d.get("status") == "1":
                return d
            info = d.get("info", "")
            if "QPS" in info or "TOO_FREQUENT" in info:
                time.sleep(1.5 * (attempt + 1))
                continue
            if "DAILY_QUERY_OVER_LIMIT" in info or "QUOTA" in info:
                raise QuotaExceeded(info)
            if info in ("INVALID_PARAMS", "ENGINE_RESPONSE_DATA_ERROR"):
                return {"status": "0", "info": info}   # this query only; cache the miss
            raise RuntimeError(f"amap {endpoint}: {info}")
        raise RuntimeError(f"amap {endpoint}: QPS retries exhausted")

    return geo._cached_json(cache_key, fetch)


def _lonlat(s):
    if not s or "," not in s:
        return None
    x, y = s.split(",")
    return float(x), float(y)


def townships(county_adcode):
    """[{name, adcode, lon, lat, level}]：该县全部乡镇/街道，坐标为驻地。"""
    d = _call("config/district", keywords=str(county_adcode), subdistrict=1, extensions="base")
    out = []
    for dist in d.get("districts", []):
        if str(dist.get("adcode")) != str(county_adcode):
            continue
        for t in dist.get("districts", []):
            ll = _lonlat(t.get("center"))
            if ll:
                out.append({"name": t["name"], "adcode": t.get("adcode"),
                            "lon": ll[0], "lat": ll[1], "level": t.get("level")})
    return out


def geocode(address, city_adcode=None):
    """地址 -> (lon, lat, level)，失败返回 None。level 如 '乡镇'、'村庄'、'兴趣点'、'区县'。"""
    params = {"address": address}
    if city_adcode:
        params["city"] = str(city_adcode)
    d = _call("geocode/geo", **params)
    for g in d.get("geocodes", []):
        ll = _lonlat(g.get("location"))
        if ll:
            return ll[0], ll[1], g.get("level")
    return None


def regeo_township(lon, lat):
    """坐标 -> 所属乡镇名，失败返回 None。"""
    d = _call("geocode/regeo", location=f"{lon:.6f},{lat:.6f}", extensions="base")
    ac = (d.get("regeocode") or {}).get("addressComponent") or {}
    t = ac.get("township")
    return t if isinstance(t, str) and t else None


GOV_TYPES = "130105|130106"   # 乡镇级政府及事业单位 / 乡镇以下级政府


def gov_seat(township_name, county_adcode):
    """乡镇人民政府/街道办事处 POI -> (lon, lat, poi_name)，找不到返回 None。

    只接受名称里含乡镇核心名、且是"人民政府"或"办事处"的 POI。
    """
    core = township_name
    for s in ("街道办事处", "街道", "民族乡", "镇", "乡"):
        if core.endswith(s) and len(core) - len(s) >= 2:
            core = core[: -len(s)]
            break
    kw = township_name + ("办事处" if township_name.endswith("街道") else "人民政府")
    d = _call("place/text", keywords=kw, city=str(county_adcode), citylimit="true",
              types=GOV_TYPES, offset=10)
    for p in d.get("pois", []):
        n = p.get("name") or ""
        ll = _lonlat(p.get("location"))
        if ll and core in n and ("人民政府" in n or "办事处" in n) and "村" not in n.replace(core, ""):
            return ll[0], ll[1], n
    return None


def poi(keyword, county_adcode):
    """本县范围内的 POI 关键字检索，返回 [(name, lon, lat, type)]。"""
    d = _call("place/text", keywords=keyword, city=str(county_adcode), citylimit="true", offset=10)
    out = []
    for p in d.get("pois", []):
        ll = _lonlat(p.get("location"))
        if ll:
            out.append((p.get("name"), ll[0], ll[1], p.get("type")))
    return out
