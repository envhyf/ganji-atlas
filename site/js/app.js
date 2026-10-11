// State and wiring for the national atlas. Boundaries and market names load on
// demand per province; seats and their rules live in the national bundle.
import { isMarket, indexOf, todayISO, weekday } from './calendar.js';
import { km, wgs2gcj, bounds } from './geo.js';
import { createMap } from './map.js?v=20261010-place-labels-3';
import { renderAlmanac, renderLedger } from './panel.js?v=20261011-short-names';
import { renderWeave, SPAN } from './weave.js?v=20261011-short-names';
import { lexicon } from './lexicon.js';
import { compactPlaceName } from './place-name.js';
import { regionTrail, inRegion } from './region.js';

const RADII = [10, 20, 30, 50];
const $ = id => document.getElementById(id);
const china = await (await fetch('data/china.json')).json();

const counties = china.counties, cities = china.cities, provs = china.provinces, rules = china.rules;
const seats = china.seats.map(([x, y, p, c, t, rs], i) => ({
  i, lon: x / 1000, lat: y / 1000, p, c, t, rules: rs, label: t || '',
}));
const unplaced = china.unplaced;
const cityName = new Map(cities.map(c => [c[0], c[1]]));
const provBox = provs.map(p => bounds(p.g));

// ---- lazy per-province detail ----
const packed = new Map();     // adcode -> {geo, markets}
const loading = new Set();
const marketOf = new Map();   // seat index -> [market]

async function loadProvince(k) {
  if (!provs[k]?.has) return;
  const code = provs[k].a;
  if (packed.has(code) || loading.has(code)) return;
  loading.add(code);
  try {
    const [geoP, mP] = await Promise.all([
      fetch(`data/p/${code}.json`).then(r => r.json()),
      fetch(`data/m/${code}.json`).then(r => r.json()),
    ]);
    packed.set(code, { geo: geoP, markets: mP.markets });
    for (const m of mP.markets) {
      const si = m[2];
      if (!marketOf.has(si)) marketOf.set(si, []);
      marketOf.get(si).push(m);
    }
    for (const m of mP.markets) {
      const s = seats[m[2]];
      if (s) s.label = compactPlaceName(marketOf.get(s.i).map(x => x[1]), s.t);
    }
    if (S.detail !== k) { S.detail = k; map.setDetail(geoP); }
    if (S.region?.p === k) fitRegion(S.region);
    render();
  } finally { loading.delete(code); }
}

async function loadAllProvinces() {
  for (const k of provs.keys()) {
    if (!provs[k].has) continue;
    await loadProvince(k).catch(() => {});
  }
}

/** province indices whose bbox touches a box */
function provincesIn(box, pad = 0) {
  const out = [];
  provs.forEach((p, k) => {
    const b = provBox[k];
    if (b && b[0] - pad <= box[2] && b[2] + pad >= box[0] && b[1] - pad <= box[3] && b[3] + pad >= box[1]) out.push(k);
  });
  return out;
}

function bboxOf(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
}

// ---- state ----
const today = indexOf(china.days, todayISO());
const S = { i: today, win: 0, here: null, via: null, seat: null, near: [], radius: 20, loom: false, playing: 0, detail: null, region: null, query: null };
const openFlags = new Uint8Array(seats.length);

const map = createMap($('stage'), $('map'), $('dots'), {
  onPick: ll => setHere(ll, 'map'),
  onSeat: s => selectSeat(seats[s.i]),
});
map.setNation(provs, china.jd);
map.setSeats(china.seats);

function setHere(ll, via) {
  S.region = null; S.seat = null; S.here = ll; S.via = via;
  if (via !== 'pick') {
    const place = nameNear(ll);
    const text = place.distance <= 50 ? `${place.label}${place.city ? `（${place.city}）` : ''}`
      : `${ll[0].toFixed(4)}, ${ll[1].toFixed(4)}`;
    syncFinder(text, ll);
  }
  map.setHere(ll, S.radius);
  $('locate').setAttribute('aria-pressed', via === 'gps');
  $('browse-note').textContent = via === 'featured' ? '先从广西宾阳逛起' : via === 'gps' ? '从你所在的地方出发' : '换个地方，逛逛当地的集';
  history.replaceState(null, '', `#${ll[0].toFixed(4)},${ll[1].toFixed(4)},${S.radius}`);
  loadProvince(provOf(ll));
  for (const k of provincesIn([ll[0] - .8, ll[1] - .8, ll[0] + .8, ll[1] + .8])) loadProvince(k);
  render();
}
function syncFinder(text, ll, region = null) {
  $('q').value = text;
  S.query = { text, ll: ll.slice(), region };
}
function selectSeat(seat) {
  if (seat) setHere([seat.lon, seat.lat], 'seat');
  S.seat = seat;
  if (seat) {
    const info = seatInfoOf(seat);
    syncFinder(`${info.county}${info.township}${info.city ? `（${info.city}）` : ''}`, [seat.lon, seat.lat]);
  }
  stop(); render();
}
async function selectRegion(region) {
  stop();
  S.region = region; S.seat = null;
  S.here = S.here || centreOf(region.p); S.via = 'region';
  syncFinder(region.name, S.here, region);
  map.clearHere();
  $('locate').setAttribute('aria-pressed', 'false');
  $('browse-note').textContent = `逛逛${region.name}的集`;
  $('hint').textContent = `正在查看${region.name}的已收录集市`;
  history.replaceState(null, '', `#region,${region.level},${region.id},${S.here[0].toFixed(4)},${S.here[1].toFixed(4)},${S.radius}`);
  render();
  await loadProvince(region.p);
  if (S.region !== region) return;
  fitRegion(region);
  render();
}
function fitRegion(region) {
  const geo = packed.get(provs[region.p].a)?.geo;
  let box = provBox[region.p];
  if (region.level === 'county') {
    const county = geo?.counties.find(c => c.a === region.id);
    if (county) box = bounds(county.g);
  } else if (region.level === 'city') {
    const city = cities.find(c => c[0] === region.id);
    const shape = geo?.cities.find(c => c.n === city?.[1]);
    if (shape) box = bounds(shape.g);
  }
  map.fitBounds(box);
}
function clearHere() {
  S.region = null; S.here = null; S.via = null; S.seat = null; S.loom = false;
  $('q').value = ''; S.query = null;
  history.replaceState(null, '', location.pathname);
  map.clearHere();
  render();
}
function provOf(ll) {
  const k = provincesIn([ll[0], ll[1], ll[0], ll[1]]);
  if (!k.length) return 0;
  // prefer one that actually contains it, else the nearest centre
  return k.sort((a, b) => km(ll, centreOf(a)) - km(ll, centreOf(b)))[0];
}
function centreOf(k) {
  const b = provBox[k];
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
}
function marketsOf(s) { return marketOf.get(s.i) || []; }

function seatInfoOf(s) {
  const c = s.c != null ? counties[s.c] : null;
  return {
    i: s.i, p: s.p, lon: s.lon, lat: s.lat,
    city: c ? (cityName.get(c[2]) ?? '') : '', county: c ? c[1] : '',
    displayName: compactPlaceName(marketsOf(s).map(m => m[1]), s.t),
    township: s.t || '', markets: marketsOf(s), rules: s.rules,
  };
}

function nameNear(ll) {
  let best = null, bd = Infinity;
  for (const s of seats) { const d = km(ll, [s.lon, s.lat]); if (d < bd) { bd = d; best = s; } }
  if (!best) return { label: '此处', city: '' };
  const c = best.c != null ? counties[best.c] : null;
  return { label: `${c ? c[1] : ''}${best.t || ''}${bd > 3 ? '一带' : ''}`, city: c ? (cityName.get(c[2]) ?? '') : '', distance: bd };
}

function render() {
  const day = china.days[S.i];
  let openCount = 0;
  for (let i = 0; i < seats.length; i++) {
    const on = seats[i].rules && seats[i].rules.length > 0 && seats[i].rules.some(r => isMarket(rules[r], day));
    openFlags[i] = on ? 1 : 0;
    if (on) openCount++;
  }
  map.setOpen(openFlags);
  map.setSelected(S.seat);
  map.setLabels(s => {
    const active = (marketOf.get(s.i) || []).filter(m => isMarket(rules[m[3]], day));
    return compactPlaceName(active.map(m => m[1]), seats[s.i]?.t);
  });

  const near = S.here ? (() => {
    const out = [];
    for (const s of seats) {
      const d = km(S.here, [s.lon, s.lat]);
      if (d > S.radius) continue;
      const ms = marketOf.get(s.i) || [];
      const localRules = [...new Set(s.rules || [])].map(r => rules[r]).filter(Boolean);
      out.push({ s, d, rules: localRules, markets: ms, names: ms.map(x => x[1]),
        openNames: ms.filter(x => isMarket(rules[x[3]], day)).map(x => x[1]), rs: ms.length === 1 ? ms[0][10] : null,
        open: localRules.some(r => isMarket(r, day)) });
    }
    return out.sort((a, b) => a.d - b.d);
  })() : [];
  const seatInfo = S.seat ? seatInfoOf(S.seat) : null;
  const nearName = S.here ? nameNear(S.here) : null;
  const L = lexicon(seatInfo ? provs[seatInfo.p].n : S.here ? provs[S.region?.p ?? provOf(S.here)].n : '', seatInfo ? seatInfo.city : (nearName?.city ?? ''));
  $('seal').textContent = L.c;
  $('local-word').textContent = `这里叫「${L.go}」`;
  $('local-word').title = L.note;

  const m = {
    L, days: china.days, i: S.i, today, win: S.win, radius: S.radius,
    here: S.here, region: null, seat: seatInfo, near, nearOpen: near.filter(x => x.open).length,
    provOpen: openCount, total: china.counts.markets, unplaced: nearbyUnplaced(),
    hereName: nearName?.label ?? '', rules,
    byProv: byProv(openFlags), withData: provs.filter(p => p.has).map(p => ({ a: p.a, n: p.n })),
    weaveNear: near.slice(0, 30),
  };
  const on = {
    day: setDay, loom: openLoom,
    seat: k => selectSeat(k == null ? null : (typeof k === 'number' ? seats[k] : null)),
  };
  renderAlmanac($('almanac'), m, on);
  renderLedger($('ledger'), m, on);
  $('loom-sec').hidden = !(S.loom && S.here);
  if (S.loom && S.here) renderWeave($('loom'), $('loom-lede'), $('loom-title'), m, on);
  renderRadius();

  $('col-period').textContent = L.period;
  $('colophon-geo').textContent =
    `目前收录 ${china.counts.markets} 处集市、${china.counts.seats} 个乡镇。地图标的是乡镇参考位置，并非集市入口。`;

  const nearest = S.here ? seats.reduce((best, s) => !best || km(S.here, [s.lon, s.lat]) < km(S.here, [best.lon, best.lat]) ? s : best, null) : null;
  let trail = regionTrail(S.seat || nearest, china);
  if (S.region && !S.seat) {
    const representative = seats.find(s => inRegion(s, S.region, counties));
    trail = regionTrail(representative, china);
    const last = trail.findIndex(r => r.level === S.region.level);
    trail = last < 0 ? [S.region] : trail.slice(0, last + 1);
  }
  $('crumbs').replaceChildren();
  trail.forEach((region, k) => {
    if (k) {
      const slash = document.createElement('span'); slash.textContent = '／';
      slash.setAttribute('aria-hidden', 'true'); $('crumbs').append(slash);
    }
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = region.name;
    button.title = `查看${region.name}的集市`;
    if (k === trail.length - 1) button.setAttribute('aria-current', 'location');
    button.onclick = () => selectRegion(region);
    $('crumbs').append(button);
  });
  if (!trail.length) $('crumbs').textContent = '全国';
  $('map-desc').innerHTML = `<span>${china.counts.markets} 处${L.place}，${china.counts.seats} 个乡镇驻地。</span>
    <span class="atlas__legend"><span><i class="lg-open"></i>当日${L.open}</span><span><i class="lg-shut"></i>当日${L.none}</span><span><i class="lg-me"></i>所在</span></span>`;
}

/** [provinceName, openToday, total] sorted by openToday */
function byProv(flags) {
  const counts = new Map();
  for (let i = 0; i < seats.length; i++) {
    const p = seats[i].p;
    const e = counts.get(p) || [provs[p].n, 0, 0];
    e[2]++;
    if (flags[i]) e[1]++;
    counts.set(p, e);
  }
  return [...counts.values()].filter(e => e[2]).sort((a, b) => b[1] - a[1]);
}

function nearbyUnplaced() {
  if (!S.here) return [];
  return unplaced.filter(([p]) => km(S.here, centreOf(p)) < S.radius * 5)
    .slice(0, 10).map(([p, r]) => ({ prov: provs[p].n, rule: rules[r] }));
}

function setDay(i) { S.i = Math.max(0, Math.min(china.days.length - 1, i)); render(); }

// ---- controls ----
function stop() { if (S.playing) { clearInterval(S.playing); S.playing = 0; syncPlay(); } }
function syncPlay() {
  $('play').setAttribute('aria-pressed', !!S.playing);
  $('play').querySelector('.play__txt').textContent = S.playing ? '暂停' : '播放';
}
$('play').onclick = () => {
  if (S.playing) return stop();
  S.playing = setInterval(() => {
    S.i = S.i + 1 >= Math.min(S.win + SPAN, china.days.length) ? S.win : S.i + 1;
    render();
  }, 750);
  syncPlay();
};
const monday = i => { let k = i - 7; while (k > 0 && weekday(china.days[k].d) !== 0) k--; return Math.max(0, k); };
$('prev').onclick = () => { stop(); S.win = Math.max(0, S.win - 7); setDay(Math.max(S.win, Math.min(S.i - 7, S.win + SPAN - 1))); };
$('next').onclick = () => { stop(); S.win = Math.min(china.days.length - SPAN, S.win + 7); setDay(Math.min(S.win + SPAN - 1, Math.max(S.i + 7, S.win))); };
$('today').onclick = () => { stop(); S.win = monday(today); setDay(today); };
$('loom-close').onclick = () => { stop(); S.loom = false; render(); };
$('zoom-all').onclick = clearHere;
$('zoom-in').onclick = () => map.zoomBy(1.8);
$('zoom-out').onclick = () => map.zoomBy(1 / 1.8);

function openLoom() {
  S.loom = true; S.win = monday(S.i); render();
  $('loom-sec').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function renderRadius() {
  $('radius').innerHTML = RADII.map(r =>
    `<button type="button" role="radio" aria-checked="${r === S.radius}" data-r="${r}" aria-label="${r} 公里">${r}<small>km</small></button>`).join('');
  $('radius').querySelectorAll('[data-r]').forEach(b => b.onclick = () => {
    S.radius = +b.dataset.r;
    if (S.here) { setHere(S.here, 'pick'); } else render();
  });
}

// ---- finder ----
const index = [];
for (const [a, n, cp, p, x, y] of counties) index.push({ k: n, ll: [x / 1000, y / 1000], sub: cityName.get(cp) ?? '', a });
for (const [a, n, p, x, y] of cities) index.push({ k: n, ll: [x / 1000, y / 1000], sub: provs[p].n, a });
$('places').innerHTML = [...new Map(index.map(e => [`${e.k}（${e.sub}）`, e])).keys()].slice(0, 5000)
  .map(k => `<option value="${k}">`).join('');

$('finder').onsubmit = e => {
  e.preventDefault();
  const q = $('q').value.trim();
  // Labels supplied by the map retain the exact picked point when submitted.
  if (q && q === S.query?.text) {
    $('q').blur();
    if (S.query.region) return selectRegion(S.query.region);
    return setHere(S.query.ll, 'pick');
  }
  const nums = q.match(/-?\d+(?:\.\d+)?/g)?.map(Number);
  if (nums && nums.length === 2 && !/[一-鿿]/.test(q)) {
    const [a, b] = nums, ll = a > b ? [a, b] : [b, a];   // in China the latitude is the smaller number
    if (ll[0] < 72 || ll[0] > 137 || ll[1] < 15 || ll[1] > 55) { $('hint').textContent = '这个坐标不在中国范围内'; return; }
    $('hint').textContent = `已前往 ${ll[0].toFixed(4)}, ${ll[1].toFixed(4)}`;
    return setHere(ll, 'pick');
  }
  const name = q.replace(/（.*）$/, ''), sub = q.match(/（(.*)）$/)?.[1];
  const hit = index.find(e => e.k === name && (!sub || e.sub === sub)) || index.find(e => e.k === name)
    || index.find(e => e.k.startsWith(name)) || index.find(e => e.k.includes(name));
  if (!hit) { $('hint').textContent = `没找到「${name}」，试试县名或经纬度`; return; }
  $('hint').textContent = `已前往 ${hit.k}（${hit.sub}）`;
  $('q').blur();
  setHere(hit.ll, 'pick');
};

$('locate').onclick = () => {
  if (!navigator.geolocation) { $('hint').textContent = '浏览器不支持定位，请直接点地图'; return; }
  $('hint').textContent = '正在定位…';
  navigator.geolocation.getCurrentPosition(pos => {
    const ll = wgs2gcj(pos.coords.longitude, pos.coords.latitude);
    if (ll[0] < 72 || ll[0] > 137 || ll[1] < 15 || ll[1] > 55) { $('hint').textContent = '你似乎不在中国境内，可以点地图选一处'; return; }
    $('hint').textContent = '已按你的位置显示'; setHere(ll, 'gps');
  }, () => { $('hint').textContent = '没能拿到位置，请直接点地图'; }, { enableHighAccuracy: false, timeout: 8000 });
};

// ---- boot ----
S.win = monday(S.i);
const h = location.hash.slice(1).split(',').map(Number);
if (h.length === 3 && RADII.includes(h[2])) S.radius = h[2];
render();
loadAllProvinces();
const regionHash = location.hash.slice(1).split(',');
if (regionHash[0] === 'region' && regionHash.length >= 6) {
  const ll = regionHash.slice(3, 5).map(Number);
  if (ll.every(Number.isFinite) && ll[0] >= 72 && ll[0] <= 137 && ll[1] >= 15 && ll[1] <= 55) S.here = ll;
  if (RADII.includes(+regionHash[5])) S.radius = +regionHash[5];
}
const regionSeat = regionHash[0] === 'region' && seats.find(s => regionTrail(s, china).some(r => r.level === regionHash[1] && r.id === +regionHash[2]));
if (regionSeat) selectRegion(regionTrail(regionSeat, china).find(r => r.level === regionHash[1]));
else if (h.length >= 2 && h.slice(0, 2).every(Number.isFinite)) setHere(h.slice(0, 2), 'map');

else {
  const binyang = counties.find(c => c[1] === '宾阳县');
  if (binyang) setHere([binyang[4] / 1000, binyang[5] / 1000], 'featured');
}
