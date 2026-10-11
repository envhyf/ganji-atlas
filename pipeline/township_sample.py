"""在 16 个已验证县上测量乡镇级定位率。"""
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from fetch import get  # noqa: E402
import admin  # noqa: E402
import amap  # noqa: E402
import geo  # noqa: E402
import parse  # noqa: E402
import township  # noqa: E402
from samples import COUNTIES  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
index = admin.load()
tot, unres, rows = Counter(), defaultdict(list), []
for c in COUNTIES:
    days = list(parse.county_calendar(get(f"/ganji/xian/{c}.html?year=2026&month=10"), 2026))
    ids = sorted({i for d in days for i, _ in d["zhen"]})
    z0 = parse.zhen_page(get(f"/ganji/zhen/{ids[0]}.html"))
    county = admin.match_county(index, z0["rule_sentence"][:3], z0["city"][1], z0["county"][1])
    feat = geo.datav(str(county["adcode"]))["features"][0]
    towns = township.seats(county["adcode"], feat)
    cnt = Counter()
    for i in ids:
        name = parse.market_name(parse.zhen_page(get(f"/ganji/zhen/{i}.html")), z0["county"][1]) or str(i)
        r = township.locate(name, county, feat, towns)
        cnt[r["precision"]] += 1
        rows.append({"id": i, "name": name, "county": county["name"], **r})
        if r["precision"] == "county":
            unres[county["name"]].append(name)
    tot.update(cnt)
    n = sum(cnt.values())
    print(f"{county['name']:6s} 乡镇={len(towns):3d} 集={n:4d}  "
          + "  ".join(f"{k}={v}({v / n:.0%})" for k, v in cnt.most_common()), flush=True)

n = sum(tot.values())
print("\nTOTAL", n, "  " + "  ".join(f"{k}={v}({v / n:.1%})" for k, v in tot.most_common()))
print("\n仍只到县：")
for k, v in unres.items():
    print(" ", k, "：", "、".join(v[:16]), "…" if len(v) > 16 else "")
(ROOT / "data" / "township_sample.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
