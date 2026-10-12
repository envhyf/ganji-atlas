// The loom: rows = nearby township seats grouped by rhythm, columns = days.
import { isMarket, ruleLabel, groupKey, weekday } from './calendar.js?v=20261012-summary';

import { compactPlaceName } from './place-name.js?v=20261012-summary';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WK = ['一', '二', '三', '四', '五', '六', '日'];
const nameOf = x => compactPlaceName(x.names, x.s.t);
export const SPAN = 35;

export function renderWeave(root, lede, title, m, on) {
  const cols = [];
  for (let k = m.win; k < Math.min(m.win + SPAN, m.days.length); k++) cols.push(k);

  // one row per seat, grouped by the rhythms of the markets it holds
  const groups = new Map();
  for (const x of m.weaveNear) {
    const key = (x.rules || []).map(groupKey).sort().join('|');
    const label = (x.rules || []).map(ruleLabel).join('、');
    if (!groups.has(key)) groups.set(key, { label, rows: [] });
    groups.get(key).rows.push(x);
  }

  const L = m.L;
  const isOpen = (x, k) => (x.rules || []).some(r => isMarket(r, m.days[k]));
  const covered = cols.filter(k => m.weaveNear.some(x => isOpen(x, k))).length;
  title.textContent = `${m.hereName} · 周边 ${m.radius} 公里`;
  document.getElementById('loom-eyebrow').textContent = `${L.period}经纬`;
  lede.innerHTML = `横为日，纵为${L.c}，取周边最近的 ${m.weaveNear.length} 处，同一节律者排在一起。
    这一带 ${cols.length} 天里，<em>${covered} 天有${L.c}可${L.go.slice(0, 1)}</em>${covered === cols.length ? '——没有一天落空' : ''}。`;

  const focusCol = document.activeElement?.dataset?.col;
  let html = `<table class="weave"><thead><tr><th scope="col"><span class="sr-only">${L.place}</span></th>`;
  for (const k of cols) {
    const d = m.days[k], wd = weekday(d.d), first = d.ld === 1;
    const cls = [k === m.i ? 'is-col' : '', wd === 0 && k !== m.win ? 'wv-mon' : ''].join(' ');
    html += `<th scope="col" class="${cls}"><button type="button" class="wv-day${k === m.today ? ' is-today' : ''}" data-col="${k}"
      aria-label="${d.d} 农历${esc(d.lt)}" ${k === m.i ? 'aria-current="date"' : ''}>
      <span class="${wd >= 5 ? 'wk-we' : ''}">${WK[wd]}</span><b class="num">${+d.d.slice(8)}</b>
      <span class="${first ? 'lm' : ''}">${esc(first ? d.lt.replace(/初一$/, '') : d.lt.slice(-2))}</span></button></th>`;
  }
  html += '</tr></thead><tbody>';
  for (const { label, rows } of groups.values()) {
    html += `<tr class="wv-group"><th colspan="${cols.length + 1}" scope="rowgroup"><span>${esc(label || '每日')}</span> · ${rows.length} 处</th></tr>`;
    for (const x of rows) {
      html += `<tr class="${m.seat?.i === x.s.i ? 'is-sel' : ''}"><th scope="row"><button type="button" data-seat="${x.s.i}">${esc(nameOf(x))}<small class="num">${Math.round(x.d)} 公里</small></button></th>`;
      for (const k of cols) {
        const on_ = isOpen(x, k);
        html += `<td class="${on_ ? 'on' : ''}${k === m.i ? ' is-col' : ''}"><i></i>${on_ ? `<span class="sr-only">${L.open}</span>` : ''}</td>`;
      }
      html += '</tr>';
    }
  }
  html += '</tbody></table>';
  root.innerHTML = html;

  root.querySelectorAll('[data-col]').forEach(b => b.onclick = () => on.day(+b.dataset.col));
  root.querySelectorAll('[data-seat]').forEach(b => b.onclick = () => on.seat(+b.dataset.seat));
  if (focusCol) root.querySelector(`[data-col="${focusCol}"]`)?.focus({ preventScroll: true });
  const sel = root.querySelector('thead .is-col');
  if (sel && (sel.offsetLeft < root.scrollLeft + 90 || sel.offsetLeft + sel.offsetWidth > root.scrollLeft + root.clientWidth)) {
    root.scrollLeft = sel.offsetLeft - root.clientWidth / 2 + sel.offsetWidth / 2;
  }
}
