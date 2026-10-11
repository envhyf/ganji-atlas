"""Locate completed provinces and publish them while rule collection continues.

Uses cached sitemap inventories only; it never duplicates the rule crawler's
requests. Stops cleanly when the existing AMap account's quota is exhausted.
"""
import json
import re
import time
from pathlib import Path

import amap
import build_locations
import export_china
import fetch
from provinces import SLUG_PROVINCE
from records import atomic_json, job_lock, read_records

ROOT = Path(__file__).resolve().parent.parent
STATUS = ROOT / 'data' / 'expansion_progress.json'


def main():
    while True:
        rows = read_records(ROOT / 'data' / 'markets.jsonl')
        crawl_path = ROOT / 'data' / 'crawl_progress.json'
        crawl = json.loads(crawl_path.read_text(encoding='utf-8')) if crawl_path.exists() else {}
        complete = set(crawl.get('completed', []))
        seen = {r['id'] for r in rows if 'error' not in r}
        for slug in SLUG_PROVINCE:
            cache = fetch._cache_path(fetch.BASE + f'/sitemap/index/{slug}.xml')
            if cache.exists():
                ids = {int(i) for i in re.findall(r'ganji/zhen/(\d+)\.html', cache.read_text(encoding='utf-8'))}
                if ids and ids <= seen:
                    complete.add(slug)
        valid = [r for r in rows if not r.get('gone') and 'error' not in r]
        pending = []
        for slug in SLUG_PROVINCE:
            if slug not in complete:
                continue
            source_ids = {r['id'] for r in valid if r.get('slug') == slug}
            path = ROOT / 'data' / f'located_{slug}.json'
            located_ids = {r['id'] for r in json.loads(path.read_text(encoding='utf-8'))} if path.exists() else set()
            if source_ids and not source_ids <= located_ids:
                pending.append(slug)
        if pending:
            slug = pending[0]
            atomic_json(STATUS, {'state': 'locating', 'province': slug, 'pending': pending})
            print(f'Locating completed province: {slug}', flush=True)
            try:
                build_locations.main(slug)
            except amap.QuotaExceeded:
                export_china.main()
                atomic_json(STATUS, {'state': 'quota_exhausted', 'province': slug,
                                     'message': 'Saved county checkpoints; rerun after quota resets.'})
                print('AMap quota exhausted. Saved progress and published available points. Rule crawl continues.', flush=True)
                return
            export_china.main()
            continue
        if crawl.get('state') == 'finished':
            failed = [r['id'] for r in rows if 'error' in r]
            atomic_json(STATUS, {'state': 'needs_rule_retry' if failed else 'finished', 'failed_rules': len(failed)})
            print('Finished available provinces.', flush=True)
            return
        atomic_json(STATUS, {'state': 'waiting_for_rules', 'complete_rule_provinces': sorted(complete)})
        time.sleep(30)


if __name__ == '__main__':
    try:
        with job_lock(ROOT / 'data' / 'jobs' / 'locations.lock'):
            main()
    except KeyboardInterrupt:
        print('Interrupted; county checkpoints are preserved.', flush=True)
    except Exception as exc:
        # Do not put credential-bearing request URLs in the status file.
        atomic_json(STATUS, {'state': 'error', 'error_type': type(exc).__name__})
        print(f'Location worker stopped: {type(exc).__name__}. Check local inputs and resume.', flush=True)
        raise
