"""One-off: fetch 宾阳县 calendar for several months + all town pages, dump rules."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from fetch import get  # noqa: E402
import parse  # noqa: E402

COUNTY = "/ganji/xian/nanningshi/binyangxian.html"
MONTHS = [(2026, 9), (2026, 10), (2026, 11), (2027, 2)]

days = []
for y, m in MONTHS:
    days += list(parse.county_calendar(get(f"{COUNTY}?year={y}&month={m}"), y))
print("calendar days parsed:", len(days))

towns = {}
for d in days:
    for i, n in d["zhen"]:
        towns[i] = n
print("distinct towns in calendar:", len(towns))

out = []
for i, n in sorted(towns.items()):
    z = parse.zhen_page(get(f"/ganji/zhen/{i}.html"))
    out.append({"id": i, "name": n, "title": z["title"], "rule": z["rule_sentence"]})
    print(i, n, "|", z["rule_sentence"])

root = Path(__file__).resolve().parent.parent
(root / "data").mkdir(exist_ok=True)
(root / "data" / "binyang_days.json").write_text(
    json.dumps(days, ensure_ascii=False, indent=1), encoding="utf-8")
(root / "data" / "binyang_towns.json").write_text(
    json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
