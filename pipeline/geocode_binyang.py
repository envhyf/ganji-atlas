"""Geocode the 24 宾阳县 market towns and validate against the county polygon."""
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import geo  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
towns = json.loads((ROOT / "data" / "binyang_towns.json").read_text(encoding="utf-8"))
county = geo.find_county("南宁市", "宾阳县")
print("county:", county["properties"]["name"], county["properties"]["adcode"])

prec = Counter()
for t in towns:
    g = geo.geocode(t["name"], county)
    t["geo"] = g
    prec[g["precision"]] += 1
    print(f"{t['id']:>6} {t['name']:6s} {g['lon']:.5f},{g['lat']:.5f}  {g['precision']:16s} "
          f"osm={g['osm_name']}")
print(dict(prec))
(ROOT / "data" / "binyang_towns.json").write_text(
    json.dumps(towns, ensure_ascii=False, indent=1), encoding="utf-8")
