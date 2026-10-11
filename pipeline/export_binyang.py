"""Export the 宾阳县 pilot bundle for the front end.

Rules are evaluated client-side against a precomputed day-facts table, so the
same bundle shape scales to the national dataset.
"""
import json
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from fetch import get  # noqa: E402
import geo  # noqa: E402
import parse  # noqa: E402
import rules  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data" / "binyang.json"
START, DAYS = date(2026, 9, 1), 400


def rnd(coords):
    if isinstance(coords[0], (int, float)):
        return [round(coords[0], 4), round(coords[1], 4)]
    return [rnd(c) for c in coords]


def slim(f):
    return {"name": f["properties"]["name"], "adcode": f["properties"]["adcode"],
            "geometry": {"type": f["geometry"]["type"],
                         "coordinates": rnd(f["geometry"]["coordinates"])}}


towns_in = json.loads((ROOT / "data" / "binyang_towns.json").read_text(encoding="utf-8"))
county = geo.find_county("南宁市", "宾阳县")
neighbours = [slim(f) for f in geo.datav("450100_full")["features"]
              if f["properties"]["name"] != "宾阳县"]

towns = []
for t in towns_in:
    z = parse.zhen_page(get(f"/ganji/zhen/{t['id']}.html"))
    g = t["geo"]
    located = g["precision"] != "county_centroid"
    towns.append({
        "id": t["id"], "name": t["name"],
        "rule": rules.parse(z["rule_sentence"]),
        "rule_text": z["rule_sentence"].split("是按", 1)[1] if z["rule_sentence"] else None,
        "lon": g["lon"] if located else None, "lat": g["lat"] if located else None,
        "precision": g["precision"], "osm_name": g["osm_name"],
        "source": f"https://www.xuribiao.com/ganji/zhen/{t['id']}.html",
    })

days = []
for k in range(DAYS):
    d = START + timedelta(days=k)
    f = rules.day_facts(d)
    from lunar_python import Solar
    lu = Solar.fromYmd(d.year, d.month, d.day).getLunar()
    days.append({"d": d.isoformat(), "br": f["branch"], "gz": f["ganzhi"],
                 "lm": f["lunar_month"], "leap": f["lunar_leap"], "ld": f["lunar_day"],
                 "lt": ("闰" if f["lunar_leap"] else "") + lu.getMonthInChinese() + "月"
                       + lu.getDayInChinese(),
                 "sx": lu.getDayShengXiao(), "jq": lu.getJieQi() or None})

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps({
    "county": slim(county), "city": "南宁市", "province": "广西壮族自治区",
    "neighbours": neighbours, "towns": towns, "days": days,
    "generated": date.today().isoformat(),
}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(OUT, OUT.stat().st_size // 1024, "KB;", len(towns), "towns;",
      sum(t["lon"] is not None for t in towns), "located")
