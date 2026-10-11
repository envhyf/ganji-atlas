"""Parsers for xuribiao county calendar pages and town (zhen) pages."""
import html as htmlmod
import re

_TAG = re.compile(r"<[^>]+>")
_WS = re.compile(r"\s+")


def _text(s: str) -> str:
    return _WS.sub(" ", htmlmod.unescape(_TAG.sub(" ", s))).strip()


# ---- county calendar page: /ganji/xian/{city}/{county}.html?year=&month= ----
_DAY_ROW = re.compile(
    r'<div class="col-3">\s*(\d{2})月(\d{2})日\s*</br>\s*(\S+)\s+(\S\S)\[(\S)\]日'
    r'\s*</br>\s*(星期\S)\s*</div>\s*<div class="col-9">(.*?)</div>',
    re.S,
)
_ZHEN_LINK = re.compile(r'<a href="/ganji/zhen/(\d+)\.html">([^<]+)</a>')


def county_calendar(html: str, year: int):
    """Yield dicts: date, lunar, ganzhi, zodiac, weekday, zhen=[(id,name)]."""
    for m in _DAY_ROW.finditer(html):
        mo, d, lunar, gz, zod, wk, body = m.groups()
        yield {
            "date": f"{year}-{mo}-{d}",
            "lunar": lunar,
            "ganzhi": gz,
            "zodiac": zod,
            "weekday": wk,
            "zhen": [(int(i), n.strip()) for i, n in _ZHEN_LINK.findall(body)],
        }


def county_header(html: str):
    m = re.search(r'<h1[^>]*>(.*?)</h1>', html, re.S)
    return _text(m.group(1)) if m else None


def market_name(z: dict, county: str) -> str | None:
    """'襄垣县 堡底村 赶集规则 - 长治市' -> '堡底村'"""
    t = z.get("title") or ""
    m = re.match(r"\s*" + re.escape(county) + r"\s*(.+?)\s*赶集规则", t)
    return m.group(1).strip() if m else None


# ---- town page: /ganji/zhen/{id}.html ----
def zhen_page(html: str) -> dict:
    title = re.search(r'<h1[^>]*>(.*?)</h1>', html, re.S)
    body = re.search(r"<body.*?</body>", html, re.S).group(0)
    body = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", body, flags=re.S)
    txt = _text(body)
    # The rule sentence: "...是按X来赶圩的，在赶集日历表里面，赶的是Y，今天是..."
    rule = re.search(r"([^\s。]+(?: [^\s。]+)?\s?是按[^。]*?)，今天是", txt)
    city = re.search(r'上级市:\s*<a href="/ganji/shi/([^"]+)\.html">([^<]*?)赶集表</a>', body)
    county = re.search(r'上级县:\s*<a href="/ganji/xian/([^"]+)\.html">([^<]*?)赶集表</a>', body)
    return {
        "title": _text(title.group(1)) if title else None,
        "rule_sentence": rule.group(1) if rule else None,
        "city": (city.group(1), city.group(2)) if city else None,
        "county": (county.group(1), county.group(2)) if county else None,
        "text": txt,
    }
