"""Bundle a province for the front end -> site/data/{slug}.json

  outline   province boundary          cities   city boundaries
  counties  county boundaries (simplified, ~300 m tolerance)
  markets   one record per market, located to its township seat
  days      day facts (lunar date, 干支, 节气) for rule evaluation in the browser

usage: export_province.py guangxi
"""
import json
import sys
from datetime import date, timedelta
from pathlib import Path

from lunar_python import Solar

sys.path.insert(0, str(Path(__file__).parent))
import geo  # noqa: E402
from boundaries import simplify_polygon

ROOT = Path(__file__).resolve().parent.parent
ADCODE = {"guangxi": 450000}
TOL = 0.004            # degrees, ~300 m
BEFORE, AFTER = 45, 400


def _dp(pts, tol):
    """Douglas-Peucker, iterative."""
    if len(pts) < 5:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (x1, y1), (x2, y2) = pts[a], pts[b]
        dx, dy = x2 - x1, y2 - y1
        norm = (dx * dx + dy * dy) ** .5
        best, idx = 0.0, -1
        for i in range(a + 1, b):
            if norm == 0:   # closed ring: first == last, measure to the point itself
                d = ((pts[i][0] - x1) ** 2 + (pts[i][1] - y1) ** 2) ** .5
            else:
                d = abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / norm
            if d > best:
                best, idx = d, i
        if best > tol:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(pts, keep) if k]


def simplify(geom, tol=TOL):
    return simplify_polygon(geom, tol)


def days_table(start, n):
    out = []
    for k in range(n):
        d = start + timedelta(days=k)
        lu = Solar.fromYmd(d.year, d.month, d.day).getLunar()
        m = lu.getMonth()
        out.append({"d": d.isoformat(), "br": lu.getDayZhi(), "gn": lu.getDayGan(),
                    "gz": lu.getDayInGanZhi(), "lm": abs(m), "leap": m < 0, "ld": lu.getDay(),
                    "lt": ("闰" if m < 0 else "") + lu.getMonthInChinese() + "月" + lu.getDayInChinese(),
                    "sx": lu.getDayShengXiao(), "jq": lu.getJieQi() or None})
    return out


def main(slug):
    code = ADCODE[slug]
    prov = next(f for f in geo.datav("100000_full")["features"] if f["properties"].get("adcode") == code)
    cities = geo.datav(f"{code}_full")["features"]
    counties = []
    for c in cities:
        sub = geo.datav(f"{c['properties']['adcode']}_full")
        for k in (sub or {"features": [c]})["features"]:
            counties.append({"a": k["properties"]["adcode"], "n": k["properties"]["name"],
                             "c": c["properties"]["name"], "g": simplify(k["geometry"])})

    src = ROOT / "data" / f"located_{slug}.json"
    if "--preview" in sys.argv or not src.exists():
        src = ROOT / "data" / f"located_{slug}_preview.json"
    located = json.loads(src.read_text(encoding="utf-8"))
    markets = []
    for m in located:
        rs = m["rule_sentence"] or ""
        markets.append({
            "id": m["id"], "n": m["name"], "ca": m["county_adcode"], "cn": m["county"], "ci": m["city"],
            "t": m["township"], "x": m["lon"], "y": m["lat"], "q": m["confidence"],
            "seat": m.get("seat"), "how": m["how"], "r": m["rule"],
            "rs": rs.split("赶的是", 1)[-1] if "赶的是" in rs else None,
        })

    start = date.today() - timedelta(days=BEFORE)
    bundle = {
        "province": prov["properties"]["name"], "generated": date.today().isoformat(),
        "outline": simplify(prov["geometry"], TOL * 1.5),
        "cities": [{"n": c["properties"]["name"], "g": simplify(c["geometry"], TOL * 1.5)} for c in cities],
        "counties": counties, "markets": markets, "days": days_table(start, BEFORE + AFTER),
    }
    dst = ROOT / "site" / "data" / f"{slug}.json"
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(bundle, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{dst.name}: {dst.stat().st_size // 1024} KB, {len(counties)} counties, {len(markets)} markets, "
          f"{sum(m['x'] is not None for m in markets)} placed")


if __name__ == "__main__":
    main(sys.argv[1])
