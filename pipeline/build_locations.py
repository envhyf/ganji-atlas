"""Locate every market of a province to its township seat -> data/located_{slug}.json

Idempotent: all API responses are cached, so a rerun after a quota stop only
spends calls on what is still missing.

usage: build_locations.py guangxi [hebei ...]   |   build_locations.py all
"""
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import admin  # noqa: E402
import amap  # noqa: E402
import geo  # noqa: E402
import rules  # noqa: E402
import township  # noqa: E402
from provinces import SLUG_PROVINCE, province_for  # noqa: E402
from records import read_records, atomic_json  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent


def main(slug, cache_only=False):
    geo.CACHE_ONLY = cache_only
    rows = read_records(ROOT / 'data' / 'markets.jsonl')
    rows = [r for r in rows if r.get("slug") == slug and not r.get("gone") and "error" not in r]
    index = admin.load()
    by_county = defaultdict(list)
    for r in rows:
        by_county[(r["city"], r["county"])].append(r)

    out, stats, missing_county, pending = [], Counter(), [], 0
    dst = ROOT / "data" / f"located_{slug}{'_preview' if cache_only else ''}.json"
    previous = {r['id']: r for r in json.loads(dst.read_text(encoding='utf-8'))} if dst.exists() else {}
    try:
        for k, ((city, county), ms) in enumerate(sorted(by_county.items())):
            if all(m['id'] in previous and previous[m['id']].get('name') == m['name']
                   and previous[m['id']].get('rule_sentence') == m['rule_sentence'] for m in ms):
                out.extend(previous[m['id']] for m in ms)
                stats.update(previous[m['id']].get('confidence') or 'county' for m in ms)
                continue
            rec = admin.match_county(index, province_for(slug, city), city, county)
            if not rec:
                missing_county.append((city, county, len(ms)))
                for m in ms:   # keep them: listed as "方位待考"
                    stats["county"] += 1
                    out.append({"id": m["id"], "name": m["name"], "province": province_for(slug, city),
                                "city": city, "county": county, "county_adcode": None,
                                "rule": rules.parse(m["rule_sentence"]), "rule_sentence": m["rule_sentence"],
                                "precision": "city", "township": None, "lon": None, "lat": None,
                                "how": None, "confidence": None})
                atomic_json(dst, out)
                continue
            try:
                feat = geo.datav(str(rec["adcode"]))["features"][0]
                towns = township.seats(rec["adcode"], feat)
                locs = [township.locate(m["name"], rec, feat, towns) for m in ms]
            except geo.NotCached:
                continue     # preview mode: skip counties not yet located
            for m, loc in zip(ms, locs):
                stats[loc["confidence"] or "county"] += 1
                out.append({
                    "id": m["id"], "name": m["name"],
                    "province": rec["province"], "city": rec["city"], "county": rec["name"],
                    "county_adcode": rec["adcode"],
                    "rule": rules.parse(m["rule_sentence"]), "rule_sentence": m["rule_sentence"],
                    **loc,
                })
            print(f"[{k + 1}/{len(by_county)}] {rec['city']}{rec['name']}: {len(ms)} 集", flush=True)
            atomic_json(dst, out)
    except amap.QuotaExceeded as e:
        pending = len(rows) - len(out)
        print(f"\n高德配额用尽（{e}）；已缓存，明天重跑本脚本继续。剩余 {pending} 个集。")

    finally:
        if out:
            atomic_json(dst, out)
    n = len(out) or 1
    print(f"\n{dst.name}: {len(out)} 集", "  ".join(f"{k}={v}({v / n:.1%})" for k, v in stats.most_common()))
    if missing_county:
        print("县名对不上 DataV：", missing_county)
    if pending:
        raise amap.QuotaExceeded("stop")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    slugs = list(SLUG_PROVINCE) if args == ["all"] else args
    for sl in slugs:
        try:
            main(sl, cache_only="--cache-only" in sys.argv)
        except amap.QuotaExceeded:
            break
