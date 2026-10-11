"""Measure location hit rate on the 16 verified counties (towns already cached)."""
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from fetch import get  # noqa: E402
import admin  # noqa: E402
import geo  # noqa: E402
import locate  # noqa: E402
import parse  # noqa: E402

COUNTIES = ["nanningshi/binyangxian", "qingdaoshi/pingdushi", "chengdushi/qingyangqu",
            "nanchongshi/yingshanxian", "dazhoushi/xuanhanxian", "sanmenxiashi/mianchixian",
            "xinxiangshi/weihuishi", "zhongqingshi/dazuqu", "tianjinshi/wuqingqu",
            "qianxinanzhou/xingrenxian", "jinchengshi/qinshuixian", "baoshanshi/changningxian",
            "dalizhou/dalishi", "changzhishi/xiangyuanxian", "nanyangshi/zhenpingxian",
            "nanpingshi/shaowushi"]
ROOT = Path(__file__).resolve().parent.parent
index = admin.load()
tot = Counter()
unres = defaultdict(list)
rows = []
for c in COUNTIES:
    days = list(parse.county_calendar(get(f"/ganji/xian/{c}.html?year=2026&month=10"), 2026))
    ids = sorted({i for d in days for i, _ in d["zhen"]})
    z0 = parse.zhen_page(get(f"/ganji/zhen/{ids[0]}.html"))
    city, county = z0["city"][1], z0["county"][1]
    rec = admin.match_county(index, z0["rule_sentence"][:3], city, county)
    if not rec:
        print("!! county not matched:", c, city, county)
        continue
    feat = geo.datav(str(rec["adcode"]))["features"][0]
    places = locate.county_places(feat)
    cnt = Counter()
    for i in ids:
        z = parse.zhen_page(get(f"/ganji/zhen/{i}.html"))
        name = parse.market_name(z, county) or str(i)
        r = locate.locate(name, places)
        cnt[r["precision"]] += 1
        rows.append({"id": i, "name": name, "county": county, "adcode": rec["adcode"], **r})
        if r["precision"] == "unresolved":
            unres[county].append(name)
    tot.update(cnt)
    n = sum(cnt.values())
    print(f"{county:6s} ({rec['adcode']}) osm_places={len(places):5d} towns={n:4d}  "
          + "  ".join(f"{k}={v} ({v / n:.0%})" for k, v in cnt.most_common()))
    sys.stdout.flush()

n = sum(tot.values())
print("\nTOTAL", n, "  " + "  ".join(f"{k}={v} ({v / n:.1%})" for k, v in tot.most_common()))
print("\nunresolved samples:")
for k, v in unres.items():
    print(" ", k, "：", "、".join(v[:14]), "…" if len(v) > 14 else "")
(ROOT / "data" / "locate_sample.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
