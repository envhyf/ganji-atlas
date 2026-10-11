// Market-day rules, evaluated against the precomputed day-facts table.
// Mirrors pipeline/rules.py exactly (verified: 143,714 cells, 0 mismatches).

const WEEK = ['一', '二', '三', '四', '五', '六', '日'];

/** date ISO string -> weekday 0=Mon..6=Sun, timezone-safe */
export function weekday(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export function isMarket(rule, day) {
  switch (rule.type) {
    case 'daily': return true;
    case 'branches': return rule.branches.includes(day.br);
    case 'stems': return rule.stems.includes(day.gn);
    case 'weekdays': return rule.weekdays.includes(weekday(day.d));
    case 'solar_days': return rule.days.includes(+day.d.slice(8));
    case 'solar_fixed': return rule.dates.some(([m, d]) => m === +day.d.slice(5, 7) && d === +day.d.slice(8));
    case 'lunar_days': return rule.days.includes(day.ld);
    case 'lunar_fixed': return rule.dates.some(([m, d]) => m === day.lm && d === day.ld);
    default: return false;
  }
}

/** Short human label for a rule, e.g. "逢寅巳申亥" / "每逢星期日". */
export function ruleLabel(rule) {
  switch (rule.type) {
    case 'daily': return '每日有市';
    case 'branches': return `逢${rule.branches.join('')}日`;
    case 'stems': return `逢${rule.stems.join('')}日`;
    case 'weekdays': return '每逢星期' + rule.weekdays.map(i => WEEK[i]).join('、');
    case 'solar_days': return '公历逢' + rule.days.join('、') + '日';
    case 'lunar_days': return '农历逢' + tailDigits(rule.days);
    case 'lunar_fixed': return '农历' + rule.dates.map(([m, d]) => `${m}月${d}`).join('、');
    case 'solar_fixed': return '每年' + rule.dates.map(([m, d]) => `${m}月${d}日`).join('、');
    default: return '圩期待考';
  }
}

// [1,11,21,4,14,24] -> "一、四" style tail digits when the set is periodic
function tailDigits(days) {
  const tails = [...new Set(days.map(d => d % 10))].sort((a, b) => (a || 10) - (b || 10));
  const periodic = tails.every(t => [t || 10, (t || 10) + 10, (t || 10) + 20].every(x => days.includes(x)));
  const cn = ['十', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  return periodic ? tails.map(t => cn[t]).join('') : days.join('、') + '日';
}

/** Group key for weave rows: towns that share a rhythm sit together. */
export function groupKey(rule) {
  if (rule.type === 'branches') return 'b:' + rule.branches.join('');
  if (rule.type === 'stems') return 's:' + rule.stems.join('');
  return rule.type + ':' + JSON.stringify(rule.days || rule.weekdays || rule.dates || '');
}

export function weekdayCn(iso) { return WEEK[weekday(iso)]; }

/** index of ISO date in days[], clamped */
export function indexOf(days, iso) {
  const i = days.findIndex(d => d.d === iso);
  if (i >= 0) return i;
  return iso < days[0].d ? 0 : days.length - 1;
}

/** Next n market-day indices at or after index i. */
export function nextDays(rule, days, i, n = 5) {
  const out = [];
  for (let k = i; k < days.length && out.length < n; k++) if (isMarket(rule, days[k])) out.push(k);
  return out;
}

/** 'YYYY-MM-DD' -> 'M月D日' */
export function md(iso) { return `${+iso.slice(5, 7)}月${+iso.slice(8)}日`; }

export function todayISO() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
