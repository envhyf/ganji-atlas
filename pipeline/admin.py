"""National county index from DataV (GCJ-02), and name matching for xuribiao.

xuribiao names drift from current admin names (兴仁县 -> 兴仁市, 大理州 vs
大理白族自治州), so we match on name cores within the right parent.
"""
import json
import re
from pathlib import Path

import geo

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "data" / "counties.json"
_SUFFIX = re.compile(r"(特别行政区|自治区|自治州|自治县|自治旗|地区|新区|林区|矿区|"
                     r"省|市|州|盟|县|区|旗)$")
_ETHNIC = re.compile(r"(各族|土家族|苗族|侗族|布依族|彝族|白族|傣族|哈尼族|壮族|瑶族|回族|藏族|"
                     r"羌族|蒙古族|满族|朝鲜族|黎族|畲族|仡佬族|水族|纳西族|傈僳族|景颇族|拉祜族|"
                     r"佤族|怒族|独龙族|普米族|阿昌族|德昂族|基诺族|布朗族|哈萨克族|柯尔克孜族|"
                     r"锡伯族|土族|撒拉族|东乡族|保安族|裕固族|塔吉克族|俄罗斯族|达斡尔族|仫佬族|毛南族)+")


def core(name: str) -> str:
    n = _SUFFIX.sub("", name)
    n = _ETHNIC.sub("", n)
    return _SUFFIX.sub("", n) or name


def build():
    """[{adcode, name, city, province, center}] for every county-level unit."""
    out = []
    for prov in geo.datav("100000_full")["features"]:
        pp = prov["properties"]
        if not pp.get("adcode"):
            continue
        pf = geo.datav(f"{pp['adcode']}_full")
        for c in (pf or {}).get("features", []):
            cp = c["properties"]
            if cp.get("level") == "district" or cp.get("childrenNum", 0) == 0:
                # municipality districts, or county-level units directly under a province
                out.append({"adcode": cp["adcode"], "name": cp["name"], "city": pp["name"],
                            "province": pp["name"], "center": cp.get("center")})
                continue
            cf = geo.datav(f"{cp['adcode']}_full")
            if not cf:   # e.g. 东莞/中山/儋州: city with no county layer
                out.append({"adcode": cp["adcode"], "name": cp["name"], "city": cp["name"],
                            "province": pp["name"], "center": cp.get("center")})
                continue
            for k in cf["features"]:
                kp = k["properties"]
                out.append({"adcode": kp["adcode"], "name": kp["name"], "city": cp["name"],
                            "province": pp["name"], "center": kp.get("center")})
    INDEX.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    return out


def load():
    return json.loads(INDEX.read_text(encoding="utf-8")) if INDEX.exists() else build()


def match_county(index, province: str, city: str, county: str):
    """Best county record for xuribiao's (province, city, county) names, or None."""
    pc, cc, kc = core(province or ""), core(city or ""), core(county or "")
    cands = [r for r in index if core(r["name"]) == kc]
    if len(cands) > 1 and pc:
        cands = [r for r in cands if core(r["province"]).startswith(pc[:2])] or cands
    if len(cands) > 1 and cc:
        cands = [r for r in cands if core(r["city"]).startswith(cc[:2])] or cands
    return cands[0] if len(cands) == 1 else None
