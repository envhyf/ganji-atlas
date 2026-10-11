"""National bundle + lazy per-province bundles for the front end.

  site/data/china.json     provinces, 南海诸岛, rule table, all seats, days, counties
  site/data/p/{adcode}.json  cities + counties geometry (loaded when you zoom in)
  site/data/m/{adcode}.json  markets: name, township, rule index, rule text (loaded in
                             the background; drives search, labels and cards)

A seat is one township seat; its markets share the seat's coordinates. Seats are
indexed nationally so provinces can refer to them by number.

usage: export_china.py
"""
import json
import sys
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import admin  # noqa: E402
import geo  # noqa: E402
from export_province import simplify, days_table, BEFORE, AFTER  # noqa: E402
from provinces import SLUG_PROVINCE  # noqa: E402
from boundaries import county_mesh, province_outline  # noqa: E402
from records import atomic_json  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data"


def simplify_hard(g, tol):
    """Simplification at two levels: national (coarse) and provincial (finer)."""
    return simplify(g, tol)


def centre(g):
    """Largest ring's mid point, in thousands of a degree."""
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    r = max((poly[0] for poly in polys), key=len)
    xs = [p[0] for p in r]; ys = [p[1] for p in r]
    return round((min(xs) + max(xs)) / 2 * 1000), round((min(ys) + max(ys)) / 2 * 1000)


def main():
    nat = geo.datav("100000_full")["features"]
    provs = [f for f in nat if f["properties"].get("adcode")]
    jd = next((f for f in nat if not f["properties"].get("adcode")), None)
    pidx = {f["properties"]["adcode"]: k for k, f in enumerate(provs)}

    located = []
    for slug in SLUG_PROVINCE:
        for suf in ("", "_preview"):
            p = ROOT / "data" / f"located_{slug}{suf}.json"
            if p.exists():
                located += json.loads(p.read_text(encoding="utf-8"))
                break

    rules, rkey = [], {}

    def ri(r):
        k = json.dumps(r, ensure_ascii=False, sort_keys=True)
        if k not in rkey:
            rkey[k] = len(rules); rules.append(r)
        return rkey[k]

    def pk_of(m):
        a = m.get("county_adcode")
        if a:
            return pidx.get(int(str(a)[:2] + "0000"))
        nm = (m.get("province") or "")[:2]
        return next((k for k, f in enumerate(provs) if f["properties"]["name"].startswith(nm)), None)

    # national county + city list (for search and for the breadcrumb)
    counties, cities, cidx = [], [], {}
    for pk, f in enumerate(provs):
        code = f["properties"]["adcode"]
        for c in (geo.datav(f"{code}_full") or {"features": []})["features"]:
            cp = c["properties"]
            cities.append([cp["adcode"], cp["name"], pk, *centre(c["geometry"])])
            sub = geo.datav(f"{cp['adcode']}_full")
            for k in (sub or {"features": [c]})["features"]:
                kp = k["properties"]
                cidx[kp["adcode"]] = len(counties)
                counties.append([kp["adcode"], kp["name"], cp["adcode"], pk, *centre(k["geometry"])])

    seats, seat_of, by_prov, unplaced, markets_total = [], {}, defaultdict(list), [], 0
    for m in located:
        pk = pk_of(m)
        if pk is None:
            continue
        r = ri(m["rule"])
        markets_total += 1
        if m["lon"] is None:
            unplaced.append([pk, r])
            continue
        key = (m["county_adcode"], m["township"])
        if key not in seat_of:
            seat_of[key] = len(seats)
            seats.append({"x": round(m["lon"] * 1000), "y": round(m["lat"] * 1000), "p": pk,
                          "c": cidx.get(m["county_adcode"]), "t": m["township"], "r": []})
        si = seat_of[key]
        seats[si]["r"].append(r)
        by_prov[pk].append({"m": m, "si": si, "r": r})

    china = {
        "generated": date.today().isoformat(),
        "provinces": [{"a": f["properties"]["adcode"], "n": f["properties"]["name"],
                       "g": simplify_hard(f["geometry"], 0.04), "has": k in by_prov}
                      for k, f in enumerate(provs)],
        "jd": jd["geometry"] if jd else None,
        "rules": rules,
        "seats": [[s["x"], s["y"], s["p"], s["c"], s["t"], s["r"]] for s in seats],
        "unplaced": unplaced,
        "cities": cities,
        "counties": counties,
        "counts": {"markets": markets_total, "seats": len(seats), "provinces": len(by_prov)},
        "days": days_table(date.today() - timedelta(days=BEFORE), BEFORE + AFTER),
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "p").mkdir(exist_ok=True)
    (OUT / "m").mkdir(exist_ok=True)
    search_entries = set()
    for pk, items in by_prov.items():
        f = provs[pk]
        code = f["properties"]["adcode"]
        cities_g = (geo.datav(f"{code}_full") or {"features": []})["features"]
        cs = [{"n": c["properties"]["name"], "g": simplify_hard(c["geometry"], 0.008)} for c in cities_g]
        ks, county_features = [], []
        for c in cities_g:
            sub = geo.datav(f"{c['properties']['adcode']}_full")
            for k in (sub or {"features": [c]})["features"]:
                county_features.append(k)
                ks.append({"a": k["properties"]["adcode"], "n": k["properties"]["name"],
                           "g": simplify_hard(k["geometry"], 0.0005)})
        atomic_json(OUT / 'p' / f'{code}.json',
            {"a": code, "n": f["properties"]["name"], "cities": cs, "counties": ks,
             "mesh": county_mesh(county_features),
             "outline": province_outline(county_features)})

        mk = []
        for it in items:
            m, si, r = it["m"], it["si"], it["r"]
            rs = m.get("rule_sentence") or ""
            mk.append([m["id"], m["name"], si, r, m["county"], m["city"], m["township"],
                       m["confidence"], m["seat"] or "", m.get("how") or "",
                       rs.split("赶的是", 1)[-1] if "赶的是" in rs else ""])
        atomic_json(OUT / 'm' / f'{code}.json', {"a": code, "markets": mk})
        for row in mk:
            sub = ' · '.join(x for x in [f['properties']['name'], row[5], row[4]] if x)
            for name in [row[1], row[6]]:
                if name and row[2] is not None:
                    search_entries.add((name, row[2], sub))
        print(f"  {f['properties']['name']}: p {len(cs)}c/{len(ks)}k, "
              f"m {(OUT / 'm' / f'{code}.json').stat().st_size // 1024} KB {len(mk)} markets")
    atomic_json(OUT / 'search.json', sorted(search_entries))
    atomic_json(OUT / 'china.json', china)
    print(f"china.json {(OUT / 'china.json').stat().st_size // 1024} KB: {markets_total} markets, "
          f"{len(seats)} seats, {len(counties)} counties", flush=True)


if __name__ == "__main__":
    main()
