// State and wiring for the national atlas. Boundaries and market names load on
// demand per province; seats and their rules live in the national bundle.
import { isMarket, indexOf, todayISO, weekday } from './calendar.js?v=20261012-summary';
import { km, wgs2gcj, bounds, contains } from './geo.js?v=20261012-summary';
import { createMap } from './map.js?v=20261012-summary';
import { renderAlmanac, renderLedger } from './panel.js?v=20261012-summary';
import { renderWeave, SPAN } from './weave.js?v=20261012-summary';
import { lexicon } from './lexicon.js?v=20261012-summary';
import { compactPlaceName } from './place-name.js?v=20261012-summary';
import { regionTrail, inRegion } from './region.js?v=20261012-summary';
import { findPlaces, seatKey, parseHash } from './query.js?v=20261012-summary';

const RADII = [10, 20, 30, 50];
const $ = id => document.getElementById(id);
const DATA_ROOT = 'data/';
async function dataFile(path) {
  const response = await fetch(DATA_ROOT + path, { cache: 'no-cache' });
  if (!response.ok) throw new Error('资料暂时无法加载');
  return response.json();
}
let china;
try { china = await dataFile('china.json'); }
catch (error) {
  $('load-status').textContent = '集市资料加载失败，请检查网络后重试。';
  $('recovery').hidden = false;
  throw error;
}
$('load-status').hidden = true;

const counties = china.counties, cities = china.cities, provs = china.provinces, rules = china.rules;
const seats = china.seats.map(([x, y, p, c, t, rs], i) => ({
  i, lon: x / 1000, lat: y / 1000, p, c, t, rules: rs, label: t || '',
}));
const unplaced = china.unplaced;
const cityName = new Map(cities.map(c => [c[0], c[1]]));
const provBox = provs.map(p => bounds(p.g));

// ---- lazy per-province detail ----
const packed = new Map();     // adcode -> {geo, markets}
const loading = new Map();
const marketOf = new Map();
function loadProvince(k) {
  if (!provs[k]?.has) return Promise.resolve();
  const code = provs[k].a;
  if (packed.has(code) || loadingErrors.has(code)) return Promise.resolve();
  if (loading.has(code)) return loading.get(code);
  const pending = (async () => {
    try {
      const [geoP, mP] = await Promise.all([dataFile(`p/${code}.json`), dataFile(`m/${code}.json`)]);
      for (const m of mP.markets) {
        if (!marketOf.has(m[2])) marketOf.set(m[2], []);
        marketOf.get(m[2]).push(m);
      }
      packed.set(code, {geo:geoP, markets:mP.markets});
      map.setDetail(geoP);
      if (S.region?.p === k) fitRegion(S.region);
      loadingErrors.delete(code);
      syncLoadStatus(); render();
    } catch (error) {
      loadingErrors.add(code); syncLoadStatus();
    } finally { loading.delete(code); }
  })();
  loading.set(code,pending);
  return pending;
}
const loadingErrors = new Set();
function syncLoadStatus() {
  $('load-status').hidden = !loadingErrors.size;
  if (loadingErrors.size) $('load-status').textContent = '部分地区资料未能加载，地图名称或详情可能不完整。';
  $('recovery').hidden = !loadingErrors.size;
}
var viewTimer;
function loadVisible(box, zoom) {
  clearTimeout(viewTimer);
  if (zoom < 3.4) return;
  viewTimer = setTimeout(() => { for (const k of provincesIn(box)) loadProvince(k); }, 600);
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
const todayIndex = () => { const i=china.days.findIndex(d=>d.d===todayISO()); return i<0?-10000:i; };
let today = todayIndex();
const S = { i: indexOf(china.days,todayISO()), win: 0, here: null, via: null, seat: null, near: [], radius: 20, loom: false, playing: 0, detail: null, region: null, query: null };
const openFlags = new Uint8Array(seats.length);

const map = createMap($('stage'), $('map'), $('dots'), {
  onView: loadVisible,
  onRegion: async group => {
    if(group.level==='province' && S.region?.level==='province' && S.region.id===group.id){
      map.zoomToCities(group.point);return;
    }
    await selectRegion({level:group.level,id:group.id,name:group.name,p:group.p});
    if(group.level==='city' && S.region?.id===group.id)map.zoomToLocal(group.point);
  },
  onPick: ll => setHere(ll, 'map'),
  onSeat: s => selectSeat(seats[s.i]),
});
map.setNation(provs, china.jd);
map.setSeats(china.seats);
map.setSummaryData(china.seats,counties,cities,provs);

function setHere(ll, via) {
  S.region = null; S.seat = null; S.here = ll; S.via = via;
  map.setSummaryScope(null);
  $('hint').textContent = via==='gps'?'已按你的位置显示':'点一个小圆点，看看这附近哪天有集。';
  if (via !== 'pick' && via !== 'featured') {
    const place = nameNear(ll);
    const text = place.distance <= 50 ? `${place.label}${place.city ? `（${place.city}）` : ''}`
      : `${ll[0].toFixed(4)}, ${ll[1].toFixed(4)}`;
    syncFinder(text, ll);
  }
  map.setHere(ll, S.radius);
  $('locate').setAttribute('aria-pressed', via === 'gps');
  $('browse-note').textContent = via === 'featured' ? '先从广西宾阳逛起' : via === 'gps' ? '从你所在的地方出发' : '换个地方，逛逛当地的集';
  updateHash();
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
  stop(); render(); updateHash();
  if (seat && matchMedia('(max-width:720px)').matches) { $('stage').scrollIntoView({block:'start',behavior:'instant'}); $('ledger').querySelector('[data-close]')?.focus({preventScroll:true}); }
}
async function selectRegion(region) {
  stop();
  S.region = region; S.seat = null;
  map.setSummaryScope(region.p);
  S.here = S.here || centreOf(region.p); S.via = 'region';
  syncFinder(region.name, S.here, region);
  map.clearHere();
  $('locate').setAttribute('aria-pressed', 'false');
  $('browse-note').textContent = `逛逛${region.name}的集`;
  $('hint').textContent = `正在查看${region.name}的已收录集市`;
  updateHash();
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
  $('hint').textContent='点省市数字逐级放大，查看当地集市。';
  map.setSummaryScope(null);
  S.region = null; S.here = null; S.via = null; S.seat = null; S.loom = false;
  $('q').value = ''; S.query = null;
  history.replaceState(null, '', location.pathname);
  map.clearHere();
  render();
}
function provOf(ll) {
  return provincesIn([ll[0],ll[1],ll[0],ll[1]]).find(k => contains(packed.get(provs[k].a)?.geo.outline || provs[k].g,ll)) ?? -1;
}
function locationTrail(ll) {
  if (!ll) return [];
  const p = provOf(ll);
  if (p < 0) return [];
  const county = packed.get(provs[p].a)?.geo.counties.find(c => contains(c.g,ll));
  if (county) return regionTrail({p,c:counties.findIndex(c=>c[0]===county.a)},china);
  return [{level:'province',id:p,name:provs[p].n,p}];
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
  const trail = locationTrail(ll), p = trail[0]?.p;
  let best = null, bd = Infinity;
  for (const s of seats) {
    if (s.p !== p) continue;
    const d = km(ll,[s.lon,s.lat]);
    if (d < bd) { bd=d; best=s; }
  }
  const county = trail.find(r=>r.level==='county');
  const city = trail.find(r=>r.level==='city')?.name || '';
  if (best && bd<=3 && (!county || counties[best.c]?.[0]===county.id))
    return {label:`${county?.name || ''}${best.t}一带`,city,distance:bd};
  return {label:county?.name || trail[0]?.name || '此处',city,distance:trail.length?0:Infinity};
}

function render() {
  const day = china.days[S.i];
  let openCount = 0;
  for (let i = 0; i < seats.length; i++) {
    const on = seats[i].rules && seats[i].rules.length > 0 && seats[i].rules.some(r => isMarket(rules[r], day));
    openFlags[i] = on ? 1 : seats[i].rules.some(r=>rules[r]?.type==='unknown') ? 2 : 0;
    if (on) openCount++;
  }
  map.setOpen(openFlags);
  map.setSelected(S.seat);
  map.setLabels(s => {
    const markets = marketOf.get(s.i) || [];
    const names = S.seat?.i === s.i ? markets : markets.filter(m => isMarket(rules[m[3]], day));
    return compactPlaceName(names.map(m => m[1]), seats[s.i]?.t);
  });

  const near = S.here ? (() => {
    const out = [];
    for (const s of seats) {
      const d = km(S.here, [s.lon, s.lat]);
      if (S.region ? !inRegion(s,S.region,counties) : d > S.radius) continue;
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
  const L = lexicon(seatInfo ? provs[seatInfo.p].n : S.here ? (provs[S.region?.p ?? provOf(S.here)]?.n || '') : '', seatInfo ? seatInfo.city : (nearName?.city ?? ''));
  $('seal').textContent = L.c;
  $('local-word').textContent = `这里叫「${L.go}」`;
  $('local-word').title = L.note;

  const m = {
    L, days: china.days, i: S.i, today, win: S.win, radius: S.radius,
    here: S.here, region: S.region, seat: seatInfo, near, nearOpen: near.filter(x => x.open).length,
    provOpen: openCount, total: china.counts.markets, unplaced: nearbyUnplaced(),
    hereName: S.region?.name || nearName?.label || '', rules,
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

  let trail = S.seat ? regionTrail(S.seat,china) : locationTrail(S.here);
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
    <span class="atlas__legend"><span><i class="lg-open"></i>当日${L.open}</span><span><i class="lg-shut"></i>当日${L.none}</span><span><i class="lg-unknown"></i>场期待核验</span><span><i class="lg-me"></i>所在</span></span>`;
}

/** [provinceName, openToday, total] sorted by openToday */
function byProv(flags) {
  const counts = new Map();
  for (let i = 0; i < seats.length; i++) {
    const p = seats[i].p;
    const e = counts.get(p) || [provs[p].n, 0, 0];
    e[2]++;
    if (flags[i]===1) e[1]++;
    counts.set(p, e);
  }
  return [...counts.values()].filter(e => e[2]).sort((a, b) => b[1] - a[1]);
}

function nearbyUnplaced() {
  if (!S.here) return [];
  return unplaced.filter(([p]) => km(S.here, centreOf(p)) < S.radius * 5)
    .slice(0, 10).map(([p, r]) => ({ prov: provs[p].n, rule: rules[r] }));
}

function setDay(i) { S.i = Math.max(0, Math.min(china.days.length - 1, i)); render(); updateHash(); }

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
$('back-near').onclick = () => S.region ? fitRegion(S.region) : S.here && map.setHere(S.here,S.radius);

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
for (const [a,n,cp,p,x,y] of counties) index.push({k:n,ll:[x/1000,y/1000],sub:`${provs[p].n} · ${cityName.get(cp)??''}`,region:{level:'county',id:a,name:n,p}});
for (const [a,n,p,x,y] of cities) index.push({k:n,ll:[x/1000,y/1000],sub:provs[p].n,region:{level:'city',id:a,name:n,p}});
provs.forEach((p,k)=>index.push({k:p.n,ll:centreOf(k),sub:'省级地区',region:{level:'province',id:k,name:p.n,p:k}}));
let searchPromise;
function ensureSearch() {
  return searchPromise ||= dataFile('search.json').then(entries=>{
    index.push(...entries.map(([k,si,sub])=>({k,sub,si,ll:[seats[si].lon,seats[si].lat]})));
  }).catch(error=>{searchPromise=null;throw error;});
}
let searchRun=0;
function choosePlace(hit) {
  $('search-results').hidden=true; $('q').blur();
  if (hit.si != null) selectSeat(seats[hit.si]);
  else { S.here=hit.ll; selectRegion(hit.region); }
  $('hint').textContent=`已前往 ${hit.k}`;
}
$('q').addEventListener('input',()=>{searchRun++;$('search-results').hidden=true;});
$('finder').onsubmit = async e => {
  e.preventDefault();
  const q=$('q').value.trim(), run=++searchRun;
  if (!q) { $('hint').textContent='请输入省、市、县、乡镇或集市名称'; return; }
  if (q===S.query?.text) {
    $('q').blur();
    return S.query.region?selectRegion(S.query.region):setHere(S.query.ll,'pick');
  }
  const nums=q.match(/-?\d+(?:\.\d+)?/g)?.map(Number);
  if (nums?.length===2 && !/[一-鿿]/.test(q)) {
    const ll=nums[0]>nums[1]?nums:[nums[1],nums[0]];
    if (ll[0]<72||ll[0]>137||ll[1]<15||ll[1]>55) { $('hint').textContent='这个坐标不在中国范围内';return; }
    return setHere(ll,'map');
  }
  $('hint').textContent='正在查找…';
  try { await ensureSearch(); }
  catch { $('hint').textContent='地名资料加载失败，请稍后再点找集重试';return; }
  if (run!==searchRun) return;
  const hits=findPlaces(index,q);
  if (!hits.length) { $('hint').textContent=`没找到「${q}」，试试所属县市或其他名称`;return; }
  if (hits.length===1) return choosePlace(hits[0]);
  const results=$('search-results'); results.replaceChildren(); results.hidden=false;
  $('hint').textContent='请选择您要找的地方';
  for (const hit of hits) {
    const b=document.createElement('button');b.type='button';b.textContent=`${hit.k} · ${hit.sub}`;
    b.onclick=()=>choosePlace(hit);results.append(b);
  }
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

// ---- shared links, local bookmarks and boot ----
function updateHash() {
  if (!S.here) return;
  const ll=S.here.map(n=>n.toFixed(4)).join(',');
  const base=S.region?`region,${S.region.level},${S.region.id},${ll},${S.radius}`:`${ll},${S.radius}`;
  const params=new URLSearchParams({date:china.days[S.i].d});
  if (S.seat) params.set('seat',seatKey(S.seat,counties));
  history.replaceState(null,'',`#${base}?${params}`);
}
function restoreLink() {
  if (location.hash && document.getElementById(location.hash.slice(1))) return;
  const h=parseHash(location.hash);
  S.radius=h.radius;S.i=indexOf(china.days,h.date||todayISO());S.win=monday(S.i);
  if (h.ll) {
    const region=h.region && index.find(e=>e.region?.level===h.region.level && e.region.id===h.region.id)?.region;
    if (region) {S.here=h.ll;selectRegion(region);}
    else if (h.seat) {
      const seat=seats.find(s=>seatKey(s,counties)===h.seat);
      seat?selectSeat(seat):setHere(h.ll,'map');
    } else setHere(h.ll,'map');
  } else {
    const c=counties.find(c=>c[1]==='宾阳县');
    if(c)setHere([c[4]/1000,c[5]/1000],'featured');else render();
  }
}
$('share-place').onclick=async()=>{
  updateHash();
  try {
    if (navigator.share) await navigator.share({title:'赶集志',url:location.href});
    else {await navigator.clipboard.writeText(location.href);$('hint').textContent='已复制链接，包含所选日期和地点';}
  } catch(e) {if(e.name!=='AbortError')$('hint').textContent='可以复制浏览器地址分享此处';}
};
const readSaved=()=>{try{const saved=JSON.parse(localStorage.getItem('ganji-saved')||'[]');return Array.isArray(saved)?saved.filter(x=>typeof x?.name==='string'&&typeof x?.hash==='string'):[];}catch{return [];}};
$('save-place').onclick=()=>{
  if(!S.here){$('hint').textContent='先选一个地方再收藏';return;}
  updateHash();
  const entry={name:S.seat?seatInfoOf(S.seat).displayName:S.region?.name||nameNear(S.here).label,hash:location.hash};
  try {localStorage.setItem('ganji-saved',JSON.stringify([entry,...readSaved().filter(x=>x.hash!==entry.hash)].slice(0,50)));$('hint').textContent='已收藏在这台设备中';}
  catch {$('hint').textContent='浏览器未允许保存，可复制链接收藏';}
};
$('saved-places').onclick=()=>{
  const root=$('saved-list');root.hidden=!root.hidden;root.replaceChildren();
  const saved=readSaved();
  if(!saved.length)root.textContent='还没有收藏。选一个地方后，点「收藏此处」。';
  for(const x of saved){const row=document.createElement('div'),b=document.createElement('button'),del=document.createElement('button');b.type=del.type='button';b.textContent=x.name;b.onclick=()=>{history.replaceState(null,'',x.hash);restoreLink();root.hidden=true;};del.textContent='移除';del.setAttribute('aria-label',`移除收藏 ${x.name}`);del.onclick=()=>{try{localStorage.setItem('ganji-saved',JSON.stringify(readSaved().filter(y=>y.hash!==x.hash)));row.remove();}catch{}};row.append(b,del);root.append(row);}
};
window.addEventListener('hashchange',restoreLink);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&S.seat){selectSeat(null);$('q').focus({preventScroll:true});}});
function checkDate() {
  const iso=todayISO(),next=todayIndex();
  $('today').disabled=next<0;
  if (iso<china.days[0].d||iso>china.days.at(-1).d) {
    $('load-status').hidden=false;$('load-status').textContent=`当前集历仅覆盖至 ${china.days.at(-1).d}，以下显示覆盖期内资料。`;
  }
  if(next!==today){const wasToday=S.i===today;today=next;if(wasToday)S.i=indexOf(china.days,iso);render();updateHash();}
}
restoreLink();checkDate();setInterval(checkDate,60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkDate();});
