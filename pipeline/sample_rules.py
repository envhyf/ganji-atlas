"""Sample town pages across provinces to survey rule phrasing variety."""
import random
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from fetch import get  # noqa: E402
import parse  # noqa: E402

PROVINCES = ["shandongsheng", "hebei", "sichuan", "henansheng", "zhixiashi",
             "guizhousheng", "shanxisheng", "jiangsusheng", "yunnan", "liaoning",
             "anhui", "fujiansheng"]
PER = int(sys.argv[1]) if len(sys.argv) > 1 else 6

random.seed(7)
kinds = Counter()
for prov in PROVINCES:
    ids = sorted(set(re.findall(r"ganji/zhen/(\d+)\.html",
                                get(f"/sitemap/index/{prov}.xml"))))
    for i in random.sample(ids, min(PER, len(ids))):
        r = parse.zhen_page(get(f"/ganji/zhen/{i}.html"))["rule_sentence"] or "<NO RULE>"
        kind = re.search(r"是按(.*?)来赶", r)
        kinds[kind.group(1) if kind else "?"] += 1
        tail = r.split("赶的是", 1)[-1]
        print(f"{prov:14s} {i:>6} | {(kind.group(1) if kind else '?'):10s} | {tail}")
print()
for k, v in kinds.most_common():
    print(v, k)
