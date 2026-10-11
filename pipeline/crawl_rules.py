"""Crawl every market town's rule nationwide -> data/markets.jsonl (resumable).

One line per town: id, name, province/city/county (xuribiao naming), the raw
rule sentence, and the parsed rule. Pages are cached by fetch.get, and towns
already in the output are skipped, so the run can be stopped and resumed.

usage: crawl_rules.py [province_slug ...]   (default: all provinces)
"""
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from fetch import get  # noqa: E402
import parse  # noqa: E402
import rules  # noqa: E402
from records import read_records, atomic_json, job_lock, replace_with_retry  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "markets.jsonl"
PROGRESS = ROOT / 'data' / 'crawl_progress.json'


NO_SITEMAP = ["xinjiang", "qinghai"]   # listed on the home page but absent from the sitemap index


def provinces():
    idx = get("/sitemap/index/index.xml")
    return re.findall(r"sitemap/index/([a-z]+)\.xml", idx) + NO_SITEMAP


def town_ids(slug):
    if slug not in NO_SITEMAP:
        return sorted({int(i) for i in re.findall(r"ganji/zhen/(\d+)\.html", get(f"/sitemap/index/{slug}.xml"))})
    # walk province page -> county pages
    h = get(f"/ganji/sheng/{slug}.html")
    ids = set(re.findall(r"/ganji/zhen/(\d+)\.html", h))
    for x in sorted(set(re.findall(r"/ganji/xian/([a-z0-9]+/[a-z0-9]+)\.html", h))):
        ids |= set(re.findall(r"/ganji/zhen/(\d+)\.html", get(f"/ganji/xian/{x}.html")))
    return sorted(int(i) for i in ids)


def main():
    only = sys.argv[1:]
    done = set()
    if OUT.exists():
        keep = []
        for r in read_records(OUT):
            if "error" in r:          # retry failures on every run
                continue
            done.add(r["id"])
            keep.append(json.dumps(r, ensure_ascii=False))
        tmp = OUT.with_suffix('.jsonl.tmp')
        tmp.write_text("".join(l + "\n" for l in keep), encoding="utf-8")
        replace_with_retry(tmp, OUT)
    t0, n_new = time.time(), 0
    progress = {'state': 'running', 'completed': [], 'saved': len(done)}
    def checkpoint(slug, total, remaining):
        progress.update(province=slug, total=total, remaining=remaining, saved=len(done))
        atomic_json(PROGRESS, progress)
    with OUT.open("a", encoding="utf-8") as f:
        for slug in provinces():
            if only and slug not in only:
                continue
            ids = town_ids(slug)
            todo = [i for i in ids if i not in done]
            checkpoint(slug, len(ids), len(todo))
            print(f"[{slug}] {len(ids)} towns, {len(todo)} to fetch", flush=True)
            for k, i in enumerate(todo):
                try:
                    html = get(f"/ganji/zhen/{i}.html")
                    if len(html) < 200:   # "参数错误！": entry deleted upstream, still in sitemap
                        f.write(json.dumps({"id": i, "slug": slug, "gone": True}) + "\n")
                        f.flush()
                        done.add(i)
                        continue
                    z = parse.zhen_page(html)
                except Exception as e:  # 404s, timeouts: record and move on
                    f.write(json.dumps({"id": i, "slug": slug, "error": str(e)[:120]}, ensure_ascii=False) + "\n")
                    f.flush()
                    continue
                county = z["county"][1] if z["county"] else None
                s = z["rule_sentence"]
                f.write(json.dumps({
                    "id": i, "slug": slug,
                    "name": parse.market_name(z, county) if county else None,
                    "province_hint": s[:3] if s else None,
                    "city": z["city"][1] if z["city"] else None, "city_slug": z["city"][0] if z["city"] else None,
                    "county": county, "county_slug": z["county"][0] if z["county"] else None,
                    "rule_sentence": s, "rule": rules.parse(s),
                }, ensure_ascii=False) + "\n")
                f.flush()
                done.add(i)
                n_new += 1
                if k % 100 == 99:
                    f.flush()
                    rate = n_new / (time.time() - t0)
                    print(f"  {slug} {k + 1}/{len(todo)}  {rate:.2f}/s", flush=True)
                    checkpoint(slug, len(ids), sum(i not in done for i in ids))
            remaining = sum(i not in done for i in ids)
            if remaining == 0:
                progress['completed'].append(slug)
            checkpoint(slug, len(ids), remaining)
    progress['state'] = 'finished'
    atomic_json(PROGRESS, progress)
    print("done; new records:", n_new)


if __name__ == "__main__":
    try:
        with job_lock(ROOT / 'data' / 'jobs' / 'rules.lock'):
            main()
    except KeyboardInterrupt:
        print('\nInterrupted; saved records and cached pages are kept. Rerun to resume.', flush=True)
        sys.exit(130)
