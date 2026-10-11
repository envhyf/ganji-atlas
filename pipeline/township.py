"""把集市定位到乡镇，坐标取乡镇驻地（高德行政区中心）。

precision 分级：
  township        集市名直接对上乡镇名（麻兰 -> 麻兰镇）
  township_via    集市是村/庙会/市场，经地理编码+逆地理编码归到所在乡镇
  county          只能确定到县，不上图
"""
import re

import amap
import geo

_TOWN_SFX = ("街道办事处", "街道", "办事处", "民族乡", "镇", "乡", "苏木", "农场", "林场", "牧场")
_MKT_SFX = ("农贸市场", "综合市场", "交易市场", "市场", "大集", "小集", "古会", "大会", "庙会",
            "赶会", "会", "集", "圩", "墟", "场", "街")


def _strip(name, sfx):
    for s in sorted(sfx, key=len, reverse=True):
        if name.endswith(s) and len(name) - len(s) >= 2:
            return name[: -len(s)]
    return name


def clean(name):
    n = re.sub(r"[（(].*?[）)]", "", name).replace(" ", "")
    return n.rstrip("0123456789一二三四五六七八九")  # 万寿1 -> 万寿


def stems(name):
    """'宅科大集' -> {'宅科大集','宅科'}；'下关文化路市场' -> {...,'下关文化路'}"""
    n = clean(name)
    out = {n, _strip(n, _MKT_SFX), _strip(n, _TOWN_SFX)}
    out.add(_strip(_strip(n, _MKT_SFX), _TOWN_SFX))
    return {s for s in out if len(s) >= 2}


def match_by_name(name, towns):
    """名称匹配，返回 (township, how) 或 None。只接受唯一结果。"""
    ms = stems(name)
    core = {t["name"]: _strip(t["name"], _TOWN_SFX) for t in towns}
    exact = [t for t in towns if t["name"] in ms or core[t["name"]] in ms]
    if len(exact) == 1:
        return exact[0], "exact"
    # 集市名以乡镇名开头：'下关文化路市场' -> 下关街道；'柯街华侨农场' -> 柯街镇
    pre = [t for t in towns if len(core[t["name"]]) >= 2 and clean(name).startswith(core[t["name"]])]
    if len(pre) >= 1:
        pre.sort(key=lambda t: -len(core[t["name"]]))
        if len(pre) == 1 or len(core[pre[0]["name"]]) > len(core[pre[1]["name"]]):
            return pre[0], "prefix"
    return None


def seats(county_adcode, feature):
    """本县乡镇名录，坐标换成乡镇人民政府/街道办事处 POI。

    高德行政区接口给的 center 不是驻地（宾州镇偏 9 km），只在找不到政府 POI 时兜底。
    """
    out = []
    for t in amap.townships(county_adcode):
        g = amap.gov_seat(t["name"], county_adcode)
        if g and geo.contains(feature, g[0], g[1]):
            out.append({**t, "lon": g[0], "lat": g[1], "seat": "gov_poi", "seat_name": g[2]})
        else:
            out.append({**t, "seat": "district_center", "seat_name": None})
    return out


def by_name(towns, tname):
    for t in towns:
        if t["name"] == tname:
            return t
    for t in towns:  # 逆地理编码偶有简写差异
        if _strip(t["name"], _TOWN_SFX) == _strip(tname, _TOWN_SFX):
            return t
    return None


def locate(name, county, feature, towns):
    """county: admin 索引记录；feature: DataV 县界。"""
    hit = match_by_name(name, towns)
    if hit:
        t, how = hit
        return _result(t, "township", how)

    # 村名、庙会、市场：先找到它在哪，再看属于哪个乡镇
    addr = f"{county['province']}{county['city']}{county['name']}{clean(name)}"
    g = amap.geocode(addr, county["adcode"])
    pts = []
    if g and g[2] not in ("省", "市", "区县", "开发区") and geo.contains(feature, g[0], g[1]):
        pts.append((g[0], g[1], "geocode:" + (g[2] or "?")))
    if not pts:
        for pname, x, y, _ in amap.poi(clean(name), county["adcode"])[:3]:
            if geo.contains(feature, x, y) and any(s in pname for s in stems(name)):
                pts.append((x, y, "poi:" + pname))
                break
    for x, y, src in pts:
        tname = amap.regeo_township(x, y)
        t = by_name(towns, tname) if tname else None
        if t:
            r = _result(t, "township_via", src)
            # 村庄级地理编码、或名称吻合的 POI 可信；住宅区/道路/兴趣点/乡镇级回退需人工复核
            strong = src in ("geocode:村庄",) or src.startswith("poi:")
            r["confidence"] = "medium" if strong else "low"
            return r

    return {"precision": "county", "township": None, "lon": None, "lat": None, "how": None,
            "confidence": None}


def _result(t, precision, how):
    return {"precision": precision, "township": t["name"], "township_code": t["adcode"],
            "lon": t["lon"], "lat": t["lat"], "seat": t.get("seat"), "seat_name": t.get("seat_name"),
            "how": how, "confidence": "high"}
