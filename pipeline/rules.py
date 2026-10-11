"""Parse xuribiao rule sentences into structured rules, and evaluate them.

Rule sentence shape: "...是按{KIND}来赶圩的，在赶集日历表里面，赶的是{SPEC}"
"""
import re
from datetime import date

from lunar_python import Solar

BRANCHES = "子丑寅卯辰巳午未申酉戌亥"
STEMS = "甲乙丙丁戊己庚辛壬癸"
_CN_NUM = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8,
           "九": 9, "十": 10}
_WEEK = {"一": 0, "二": 1, "三": 2, "四": 3, "五": 4, "六": 5, "日": 6, "天": 6}


def lunar_day_num(s: str) -> int:
    """初一..初十, 十一..十九, 二十, 廿一..廿九, 三十 -> 1..30"""
    if s.startswith("初"):
        return 10 if s[1] == "十" else _CN_NUM[s[1]]
    if s == "二十":
        return 20
    if s == "三十":
        return 30
    if s.startswith("廿"):
        return 20 + _CN_NUM[s[1]]
    if s.startswith("十"):
        return 10 + _CN_NUM[s[1]]
    raise ValueError(s)


def lunar_month_num(s: str) -> int:
    s = s.replace("正", "一").replace("冬", "十一").replace("腊", "十二")
    if len(s) == 1:
        return _CN_NUM[s]
    if s == "十一":
        return 11
    if s == "十二":
        return 12
    return _CN_NUM[s[0]] * 10 + (_CN_NUM[s[1]] if len(s) > 1 else 0)


def parse(sentence: str) -> dict:
    """Return {'type': ..., ...}. Unrecognised -> type 'unknown'."""
    if not sentence:
        return {"type": "unknown", "why": "no sentence"}
    m = re.search(r"是按(.*?)来赶", sentence)
    kind = m.group(1) if m else ""
    spec = sentence.split("赶的是", 1)[1].strip() if "赶的是" in sentence else ""
    if spec == "每天":
        return {"type": "daily", "kind": kind}
    # 空四赶五: 十天干取两个，五日一圩（"甲已" 是 "甲己" 的常见笔误）
    if kind == "空四赶五" or re.fullmatch(r"[甲乙丙丁戊己已庚辛壬癸]{2,}", spec):
        st = sorted({("己" if c == "已" else c) for c in spec if c in STEMS + "已"}, key=STEMS.index)
        if st:
            return {"type": "stems", "stems": st, "kind": kind}
    # branches: anything carrying 地支 chars before the [生肖] bracket
    if kind in ("三日一圩", "空五赶六", "生肖") or re.match(r"^[子丑寅卯辰巳午未申酉戌亥]", spec):
        head = re.sub(r"[\[(（【].*?[\])）】]", "", spec)
        br = sorted({c for c in head if c in BRANCHES}, key=BRANCHES.index)
        if br:
            return {"type": "branches", "branches": br, "kind": kind}
    if kind == "星期" or spec.startswith("星期"):
        wd = sorted({_WEEK[c] for c in re.findall(r"星期(.)", spec)})
        if wd:
            return {"type": "weekdays", "weekdays": wd, "kind": kind}
    if kind.startswith("新历"):
        ds = sorted({int(x) for x in re.findall(r"(\d+)日", spec)})
        if ds:
            return {"type": "solar_days", "days": ds, "kind": kind}
    if kind == "固定新历":
        md = [[int(a), int(b)] for a, b in re.findall(r"(\d+)月(\d+)日", spec)]
        if md:
            return {"type": "solar_fixed", "dates": md, "kind": kind}
    if kind in ("农历尾数", "农历每月几号"):
        ds = sorted({lunar_day_num(x) for x in re.findall(r"(初.|十.|二十|廿.|三十)", spec)})
        if ds:
            return {"type": "lunar_days", "days": ds, "kind": kind}
    if kind == "固定农历":
        md = []
        for mo, dy in re.findall(r"(闰?[正一二三四五六七八九十冬腊]{1,2})月(初.|十.|二十|廿.|三十)", spec):
            md.append([lunar_month_num(mo.lstrip("闰")), lunar_day_num(dy)])
        if md:
            return {"type": "lunar_fixed", "dates": md, "kind": kind}
    return {"type": "unknown", "kind": kind, "spec": spec}


def day_facts(d: date) -> dict:
    lu = Solar.fromYmd(d.year, d.month, d.day).getLunar()
    return {
        "branch": lu.getDayZhi(),
        "stem": lu.getDayGan(),
        "ganzhi": lu.getDayInGanZhi(),
        "lunar_month": abs(lu.getMonth()),
        "lunar_leap": lu.getMonth() < 0,
        "lunar_day": lu.getDay(),
        "weekday": d.weekday(),
    }


def is_market(rule: dict, d: date, f: dict | None = None) -> bool:
    f = f or day_facts(d)
    t = rule["type"]
    if t == "daily":
        return True
    if t == "branches":
        return f["branch"] in rule["branches"]
    if t == "stems":
        return f["stem"] in rule["stems"]
    if t == "weekdays":
        return f["weekday"] in rule["weekdays"]
    if t == "solar_days":
        return d.day in rule["days"]
    if t == "lunar_days":
        return f["lunar_day"] in rule["days"]
    if t == "solar_fixed":
        return [d.month, d.day] in rule["dates"]
    if t == "lunar_fixed":
        return [f["lunar_month"], f["lunar_day"]] in rule["dates"]
    return False
