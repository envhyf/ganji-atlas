"""Diff rule-engine predictions against xuribiao's printed county calendars.

usage: verify.py {city}/{county} [YYYY-MM ...]
"""
import sys
from collections import Counter
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from fetch import get  # noqa: E402
import parse  # noqa: E402
import rules  # noqa: E402


def verify(county: str, months, verbose=True):
    days = []
    for y, m in months:
        days += list(parse.county_calendar(get(f"{county}?year={y}&month={m}"), y))
    towns = {i: n for d in days for i, n in d["zhen"]}
    # also towns listed on the page but never in calendar (never-market rules)
    rule_of = {}
    for i in towns:
        z = parse.zhen_page(get(f"/ganji/zhen/{i}.html"))
        rule_of[i] = (z["rule_sentence"], rules.parse(z["rule_sentence"]))

    stats = Counter()
    misses = []
    for d in days:
        dt = date.fromisoformat(d["date"])
        f = rules.day_facts(dt)
        # calendar-facts check
        if f["ganzhi"] != d["ganzhi"]:
            stats["ganzhi_mismatch"] += 1
            misses.append((d["date"], "GANZHI", f["ganzhi"], d["ganzhi"]))
        printed = {i for i, _ in d["zhen"]}
        for i, (_, r) in rule_of.items():
            pred = rules.is_market(r, dt, f)
            got = i in printed
            stats["tp" if pred and got else "tn" if not pred and not got
                  else "fp" if pred else "fn"] += 1
            if pred != got:
                misses.append((d["date"], towns[i], "pred" if pred else "printed",
                               r["type"], f"农历{f['lunar_month']}/{f['lunar_day']}"))
    total = stats["tp"] + stats["tn"] + stats["fp"] + stats["fn"]
    acc = (stats["tp"] + stats["tn"]) / total if total else 0
    types = Counter(r["type"] for _, r in rule_of.values())
    if verbose:
        print(f"{county}  days={len(days)} towns={len(towns)} types={dict(types)}")
        print(f"  cells={total} acc={acc:.4%} fp={stats['fp']} fn={stats['fn']} "
              f"ganzhi_mismatch={stats['ganzhi_mismatch']}")
        for m in misses[:15]:
            print("   x", m)
        for i, (s, r) in rule_of.items():
            if r["type"] == "unknown":
                print("   ? UNKNOWN", towns[i], "|", s)
    return stats, misses


if __name__ == "__main__":
    # accept "city/county" (Git Bash mangles args that start with "/")
    county = f"/ganji/xian/{sys.argv[1].strip('/')}.html"
    ms = [tuple(map(int, a.split("-"))) for a in sys.argv[2:]] or [(2026, 10)]
    verify(county, ms)
