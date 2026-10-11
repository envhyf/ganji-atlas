// Almanac (left) and ledger (right). Pure render from a view model; events via callbacks.
// A "seat" is one township seat; it may hold several markets sharing a rhythm or not.
import { isMarket, ruleLabel, weekdayCn, weekday, nextDays, md } from './calendar.js';

import { compactPlaceName } from './place-name.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kmTxt = d => d < 1 ? '<1 公里' : `${d < 10 ? d.toFixed(1) : Math.round(d)} 公里`;
const rel = (i, today) => ({ [-1]: '昨日', 0: '今日', 1: '明日', 2: '后日' })[i - today] ?? null;
const nameOf = x => compactPlaceName(x.names, x.s.t);
const rulesOf = x => [...new Set((x.rules || []).map(r => ruleLabel(r)))];

export function renderAlmanac(root, m, on) {
  const day = m.days[m.i], L = m.L;
  const r = rel(m.i, m.today);
  root.innerHTML = `
    <p class="almanac__solar"><b class="num">${+day.d.slice(0, 4)}年${md(day.d)}</b><span>星期${weekdayCn(day.d)}</span></p>
    <div class="almanac__slip">
      <div class="almanac__lunar" aria-label="农历${esc(day.lt)}">${esc(day.lt)}</div>
      <div class="almanac__side">
        <span class="almanac__gz">${esc(day.gz)}日 · 属${esc(day.sx)}</span>
        ${day.jq ? `<span class="almanac__jq">${esc(day.jq)}</span>` : ''}
      </div>
    </div>
    <p class="almanac__count">
      <strong class="num">${m.here ? m.nearOpen : m.provOpen}</strong>
      ${m.here ? `个乡镇${r ? r : '当日'}有集<small>${m.region ? esc(m.region.name) + '内' : m.radius + ' 公里内'} · 已收录地区共 ${m.provOpen} 个乡镇</small>`
               : `个乡镇${r ? r : '当日'}有集<small>已收录 ${m.total} 处集市</small>`}
    </p>
    <div class="almanac__nav" role="group" aria-label="切换日期">
      <button type="button" class="chipbtn" data-day="${m.i - 1}" ${m.i <= 0 ? 'disabled' : ''}>前一日</button>
      <button type="button" class="chipbtn" data-day="${m.today}" ${m.i === m.today ? 'aria-current="date"' : ''}>今日</button>
      <button type="button" class="chipbtn" data-day="${m.i + 1}" ${m.i >= m.days.length - 1 ? 'disabled' : ''}>后一日</button>
    </div>
    <aside class="lexicon" aria-label="此地叫法">
      <span class="lexicon__char" aria-hidden="true">${esc(L.c)}</span>
      <p><b>${esc(L.go)}</b>${esc(L.note)}</p>
    </aside>`;
  root.querySelectorAll('[data-day]').forEach(b => b.onclick = () => on.day(+b.dataset.day));
}

export function renderLedger(root, m, on) {
  if (!m.here) {
    root.innerHTML = `<div><p class="eyebrow">下一站，想去哪里</p><h2>选个地方，看附近集历</h2>
      <p class="ledger__intro">点地图或搜地名，查看周边七天的集市。</p>
      <p class="ledger__note">已收录：${m.withData.map(p => esc(p.n)).join('、')}。</p></div>`;
    return;
  }
  const start = Math.max(0, m.i - weekday(m.days[m.i].d));
  const end = Math.min(start + 6, m.days.length - 1);
  const listFor = k => m.near.filter(x => x.rules.some(rule => isMarket(rule, m.days[k])));
  const list = listFor(m.i);
  const item = x => {
    const active = (x.markets || []).filter(mk => isMarket(m.rules[mk[3]], m.days[m.i]));
    const names = active.map(mk => mk[1]);
    return `<li><button type="button" data-seat="${x.s.i}"><span>${esc(nameOf({ ...x, names }))}
      <small>${esc(rulesOf({rules:x.rules.filter(rule => isMarket(rule,m.days[m.i]))}).join('、'))}</small></span>
      <em>${kmTxt(x.d)}</em><span class="near-cal__arrow" aria-hidden="true">↗</span></button></li>`;
  };
  root.innerHTML = `<div class="near-cal">
    <div class="near-cal__heading"><div><p class="eyebrow">${esc(m.hereName)}</p><h2>附近七日集历</h2></div><span>${m.radius} 公里内</span></div>
    <div class="near-cal__week"><button type="button" data-day="${Math.max(0,start-7)}" aria-label="上一周" ${start===0?'disabled':''}>‹</button>
      <span>${md(m.days[start].d)} — ${md(m.days[end].d)}</span>
      <button type="button" data-day="${Math.min(m.days.length-1,start+7)}" aria-label="下一周" ${end===m.days.length-1?'disabled':''}>›</button></div>
    <div class="near-cal__dates" role="group" aria-label="附近集市七日历">${Array.from({length:end-start+1},(_,j)=>{
      const k=start+j,day=m.days[k],count=listFor(k).length;
      return `<button type="button" data-day="${k}" ${k===m.i?'aria-pressed="true"':'aria-pressed="false"'} aria-label="${md(day.d)}，${count}个乡镇有集">
        <span>${k===m.today?'今':weekdayCn(day.d)}</span><b>${+day.d.slice(8)}</b><small>${count?count+'处':'—'}</small></button>`;
    }).join('')}</div>
    <div class="near-cal__day-title"><b>${rel(m.i,m.today) || md(m.days[m.i].d)}有集</b><span>${list.length} 个乡镇</span></div>
    <ul class="near-cal__markets">${list.length?list.slice(0,4).map(item).join(''):
      `<li class="near-cal__empty">${m.near.length?'这天附近暂无已收录的集市，试试另一天。':'这里的集市位置还在补充，可以换个地方看看。'}</li>`}</ul>
    ${list.length>4?`<details class="near-cal__more"><summary>还有 ${list.length-4} 个乡镇</summary><ul class="near-cal__markets">${list.slice(4).map(item).join('')}</ul></details>`:''}
    <button type="button" class="near-cal__full" data-loom>查看五周集历 <span aria-hidden="true">→</span></button>
  </div>${m.seat?card(m):''}`;
  wire(root,on);
}

function card(m) {
  const s = m.seat, L = m.L;
  const ms = s.markets.length
    ? s.markets.map((mk, i) => ({ id: mk[0], n: mk[1], r: m.rules[mk[3]], q: mk[7], seat: mk[8], rs: mk[10] }))
    : s.rules.map((ri, i) => ({ id: null, n: s.township || '圩场', r: m.rules[ri], q: null, rs: null }));
  return `<article class="card" aria-label="${esc(s.township || '')}">
    <div class="card__h"><h3>${esc(s.displayName || s.township || '此处')}</h3><button type="button" class="card__x" data-close aria-label="关闭">×</button></div>
    <p class="card__path">${esc([s.city, s.county].filter(Boolean).join(' · '))}</p>
    ${ms.map(mk => {
      const nx = nextDays(mk.r, m.days, m.i, 3);
      return `<section class="card__mkt">
        <p class="card__name">${esc(mk.n)}<span>${esc(ruleLabel(mk.r))}</span></p>
        <div class="card__next">${nx.length ? nx.map(k => `<span class="${k === m.i ? 'is-today' : ''}">${rel(k, m.today) ?? '星期' + weekdayCn(m.days[k].d)}<b class="num">${md(m.days[k].d)}</b>${esc(m.days[k].lt.slice(-2))}</span>`).join('')
          : `<em>近一年无${L.period}</em>`}</div>
        <details class="card__source"><summary>来源与位置说明</summary><p class="card__meta">原文：${esc(mk.rs || '—')}${mk.q === 'low' ? ' · 归属乡镇为推断，待复核' : ''}
          ${mk.id ? `· <a href="https://www.xuribiao.com/ganji/zhen/${mk.id}.html" rel="noopener">圩日表条目</a>` : ''}</p></details>
      </section>`;
    }).join('')}
  </article>`;
}

function wire(root, on) {
  root.querySelectorAll('[data-seat]').forEach(b => b.onclick = () => on.seat(+b.dataset.seat));
  root.querySelectorAll('[data-day]').forEach(b => b.onclick = () => on.day(+b.dataset.day));
  root.querySelector('[data-close]')?.addEventListener('click', () => on.seat(null));
  root.querySelector('[data-loom]')?.addEventListener('click', () => on.loom());
}
