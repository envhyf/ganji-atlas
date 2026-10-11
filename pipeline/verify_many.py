"""Run verify() over many counties and summarise mismatches by rule type."""
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from verify import verify  # noqa: E402

COUNTIES = (Path(sys.argv[1][1:]).read_text().strip() if sys.argv[1].startswith("@")
            else sys.argv[1]).split(",")
MONTHS = [tuple(map(int, a.split("-"))) for a in sys.argv[2:]]

agg = Counter()
miss_by_type = Counter()
for c in COUNTIES:
    s, misses = verify(f"/ganji/xian/{c}.html", MONTHS)
    agg.update(s)
    for m in misses:
        if m[1] != "GANZHI":
            miss_by_type[m[3]] += 1
    sys.stdout.flush()
cells = agg["tp"] + agg["tn"] + agg["fp"] + agg["fn"]
print("\n==== TOTAL ====")
print(f"cells={cells} acc={(agg['tp'] + agg['tn']) / cells:.4%} fp={agg['fp']} "
      f"fn={agg['fn']} ganzhi_mismatch={agg['ganzhi_mismatch']}")
print("misses by rule type:", dict(miss_by_type))
