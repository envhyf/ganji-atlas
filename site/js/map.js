// The atlas: SVG for boundaries, frame and 南海诸岛 inset; canvas for the dots.
// A canvas keeps 25k seats smooth, and hit-testing is then ours to do.
import { bounds, fitProjection, pathOf, linePathOf, km, centroid } from './geo.js';
import { worldToScreen, screenToWorld, limitView, MAX_ZOOM } from './view.js?v=20261012-local-zoom';

const NS = 'http://www.w3.org/2000/svg';
const W = 1000, PAD = 34;
const CINNABAR = '#e77559', INK = '#294d45', INK3 = '#8da69d', PAPER = '#f2f7f3';

function el(tag, attrs = {}, parent) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}

export function createMap(stage, svg, canvas, { onPick, onSeat }) {
  let proj = null, H = W * 0.8, vb = null, seats = [], openFlags = null;
  const ctx = canvas.getContext('2d');
  const land = el('g', { class: 'm-land' }, svg);
  const detail = el('g', { class: 'm-detail' }, svg);
  const provinceEdges = el('g', { class: 'm-province-edges' }, svg);
  const detailLayers = new Map();
  let provinceLabels = [];
  const frame = el('g', { class: 'm-frame-g' }, svg);
  const here = el('g', { class: 'm-here', visibility: 'hidden' }, svg);
  const ring = el('ellipse', { class: 'm-ring' }, here);
  const me = el('path', { class: 'm-me' }, here);
  const inset = el('g', { class: 'm-inset' }, svg);

  // ---- static national layer ----
  function setNation(provinces, jd) {
    const all = provinces.map(p => p.g);
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    for (const g of all) {
      const b = bounds(g);
      box[0] = Math.min(box[0], b[0]); box[1] = Math.min(box[1], b[1]);
      box[2] = Math.max(box[2], b[2]); box[3] = Math.max(box[3], b[3]);
    }
    const json = { type: 'MultiPolygon', coordinates: all.flatMap(g => g.coordinates) };
    proj = fitProjection([box[0] - .3, box[1] - .3, box[2] + .3, box[3] + .3], W, PAD);
    H = proj.height;
    stage.style.aspectRatio = `${W} / ${H}`;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('height', H);
    canvas.width = W; canvas.height = H;
    land.innerHTML = '';
    el('path', { class: 'm-shadow', d: pathOf(json, proj) }, land);
    for (const p of provinces) el('path', { class: 'm-prov', d: pathOf(p.g, proj) }, land);
    for (const p of provinces) if (p.has) el('path', { class: 'm-has', d: pathOf(p.g, proj) }, land);
    el('path', { class: 'm-prov-line', d: pathOf(json, proj) }, land);
    provinceLabels = provinces.map(p => ({ name: p.n, point: centroid(p.g) })).filter(p => p.point);
    if (jd) {
      const b = bounds(jd);
      const s = Math.min(150 / ((b[2] - b[0]) || 1), 120 / ((b[3] - b[1]) || 1));
      const iw = (b[2] - b[0]) * s + 18, ih = (b[3] - b[1]) * s + 26;
      const ox = W - iw - 14, oy = H - ih - 14;
      inset.innerHTML = '';
      el('rect', { class: 'm-inset-bg', x: ox, y: oy, width: iw, height: ih }, inset);
      const pj = ([x, y]) => [ox + 9 + (x - b[0]) * s, oy + 20 + (b[3] - y) * s];
      el('path', { class: 'm-jd', d: pathOf(jd, pj) }, inset);
      el('text', { class: 'm-inset-lbl', x: ox + 8, y: oy + 14 }, inset).textContent = '南海诸岛';
      inset.setAttribute('transform', `translate(${0},${0})`);
    }
    vb = [0, 0, W, H];
    apply(vb);
  }

  /** counties + cities of one province, drawn above the national layer */
  function setDetail(bundle) {
    if (!bundle) return;
    const key = bundle.a || bundle.n;
    detailLayers.get(key)?.node.remove();
    detailLayers.get(key)?.edge?.remove();
    const node = el('g', { 'data-province': key }, detail);
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    for (const c of bundle.counties) {
      const b = bounds(c.g);
      if (!b.every(Number.isFinite)) continue;
      const [x0, y0] = proj([b[0], b[3]]), [x1, y1] = proj([b[2], b[1]]);
      box[0] = Math.min(box[0], x0); box[1] = Math.min(box[1], y0);
      box[2] = Math.max(box[2], x1); box[3] = Math.max(box[3], y1);
    }
    if (bundle.mesh) {
      el('path', { class: 'm-county-mesh', d: linePathOf(bundle.mesh, proj) }, node);
    } else {
      // Older bundles: use county borders only, without duplicate city outlines.
      for (const c of bundle.counties) el('path', { class: 'm-cty', d: pathOf(c.g, proj) }, node);
    }
    const edge = bundle.outline
      ? el('path', { class: 'm-province-edge', d: pathOf(bundle.outline, proj) }, provinceEdges)
      : null;
    detailLayers.set(key, { node, edge, box, cities: (bundle.cities || []).map(c => ({ name: c.n, point: centroid(c.g) })).filter(c => c.point), counties: bundle.counties.map(c => ({ name: c.n, point: centroid(c.g) })).filter(c => c.point) });
    syncDetailMode();
  }

  function syncDetailMode() {
    if (!vb) return;
    const [x, y, w, h] = vb;
    const visible = [...detailLayers.values()].some(({ box: b }) =>
      b[0] <= x + w && b[2] >= x && b[1] <= y + h && b[3] >= y);
    stage.classList.toggle('is-detailed', proj.zoom > 3.4 && visible);
  }

  function setSeats(list) {
    seats = list.map((s, i) => ({ i, lon: s[0] / 1000, lat: s[1] / 1000, p: s[2], rules: s[5], px: 0, py: 0 }));
    for (const s of seats) { const q = proj([s.lon, s.lat]); s.px = q[0]; s.py = q[1]; }
    updateNearby();
  }

  function updateNearby() {
    for (const s of seats) s.within = !herePt || km(herePt, [s.lon, s.lat]) <= hereKm;
  }

  // ---- view ----
  let raf = 0;
  const zoomOf = v => W / v[2];

  function apply(v) {
    vb = v;
    svg.setAttribute('viewBox', v.map(n => n.toFixed(2)).join(' '));
    proj.zoom = zoomOf(v);
    stage.classList.toggle('is-national', proj.zoom < 1.2);
    syncDetailMode();
    drawFrame(v);
    placeHere();
    paint();
  }

  function animateTo(target, ms = 520) {
    cancelAnimationFrame(raf);
    const from = vb.slice(), t0 = performance.now();
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const step = t => {
      const k = reduce ? 1 : Math.min(1, (t - t0) / ms), e = 1 - (1 - k) ** 3;
      apply(from.map((a, i) => a + (target[i] - a) * e));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  const clampView = v => limitView(v, W, H);
  function boxAround([lon, lat], radiusKm) {
    const [cx, cy] = proj([lon, lat]);
    const r = radiusKm / proj.kmPerPx, aspect = H / W;
    const w = Math.max(2 * r, 2 * r / aspect);
    return clampView([cx - w / 2, cy - (w * aspect) / 2, w, w * aspect]);
  }
  function zoomAt(px, py, k) {
    const z = zoomOf(vb);
    k = Math.max(1 / z, Math.min(MAX_ZOOM / z, k));
    if (Math.abs(k - 1) < 1e-9) return;
    apply(clampView([px - (px - vb[0]) / k, py - (py - vb[1]) / k, vb[2] / k, vb[3] / k]));
  }

  // ---- canvas painting ----
  function paint() {
    if (!proj || !vb) return;
    const z = zoomOf(vb), dpr = Math.min(2, devicePixelRatio || 1);
    const cw = stage.clientWidth || W, ch = stage.clientHeight || H;
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.lineWidth = 1.2;
    const [vx, vy, vw, vh] = vb;
    const rOpen = z > 3.4 ? 5 : 2.2;
    const rShut = z > 3.4 ? 3 : 1.2;
    const showLabel = z > 3.4, fs = 11;
    ctx.font = `${fs}px "PingFang SC","Microsoft YaHei",sans-serif`;
    const labels = [];
    for (let i = 0; i < seats.length; i++) {
      const s = seats[i];
      const [x, y] = worldToScreen([s.px, s.py], vb, cw, ch);
      if (x < -20 || x > cw + 20 || y < -20 || y > ch + 20) continue;
      const on = openFlags ? openFlags[i] : false;
      const emphasized = !!herePt && s.within && on;
      ctx.globalAlpha = 1;
      ctx.lineWidth = emphasized ? 1.8 : 1.2;
      if (s.sel) {
        ctx.beginPath(); ctx.fillStyle = 'rgba(231,117,89,.18)';
        ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
      }
      ctx.beginPath();
      if (on) {
        ctx.fillStyle = emphasized ? '#d9573c' : CINNABAR;
        ctx.arc(x, y, emphasized ? rOpen * 1.2 : rOpen, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = '#ffffff'; ctx.stroke();
        if (showLabel) labels.push({ s, x, y, emphasized });
      } else {
        ctx.strokeStyle = INK3;
        ctx.globalAlpha = z > 3 ? .85 : .5;
        ctx.arc(x, y, rShut, 0, 6.2832); ctx.stroke();
        ctx.globalAlpha = 1;
        if (showLabel && s.sel) labels.push({ s, x, y, emphasized: false });
      }
    }
    ctx.globalAlpha = 1;
    // Reserve the selected place first so administrative names cannot hide it.
    const placed = labels.filter(({ s }) => s.sel).map(({ s, x, y }) => {
      const tx = x + rOpen + 4;
      return [tx, y - 9, tx + ctx.measureText(s.label || '').width, y + 9];
    });
    // Reserve a small amount of space for administrative names before town labels.
    const level = z < 3.4 ? 'province' : z < 12 ? 'cities' : 'counties';
    const names = level === 'province' ? provinceLabels : [...detailLayers.values()].flatMap(layer => layer[level]);
    const candidates = names.map(n => ({ ...n, screen: worldToScreen(proj(n.point), vb, cw, ch) }))
      .filter(n => n.screen[0] > 24 && n.screen[0] < cw - 24 && n.screen[1] > 18 && n.screen[1] < ch - 18)
      .sort((a, b) => Math.hypot(a.screen[0]-cw/2, a.screen[1]-ch/2) - Math.hypot(b.screen[0]-cw/2, b.screen[1]-ch/2));
    ctx.font = '10px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#758e80'; ctx.strokeStyle = 'rgba(242,247,243,.8)'; ctx.lineWidth = 3;
    let count = 0;
    for (const n of candidates) {
      const [x, y] = n.screen, half = ctx.measureText(n.name).width / 2;
      if (placed.some(b => x-half-14 < b[2] && x+half+14 > b[0] && y-17 < b[3] && y+17 > b[1])) continue;
      ctx.strokeText(n.name, x, y); ctx.fillText(n.name, x, y);
      placed.push([x-half-14, y-17, x+half+14, y+17]);
      if (++count >= (cw < 500 ? 6 : 10)) break;
    }
    if (showLabel) {
      ctx.fillStyle = INK; ctx.strokeStyle = PAPER; ctx.lineWidth = 4;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      let townCount = 0;
      const townLimit = labels.length > 90 ? (cw < 500 ? 24 : 48) : Infinity;
      labels.sort((a, b) => Number(!!b.s.sel) - Number(!!a.s.sel)
        || Number(b.emphasized) - Number(a.emphasized)
        || Math.hypot(a.x-cw/2, a.y-ch/2) - Math.hypot(b.x-cw/2, b.y-ch/2));
      for (const { s, x, y, emphasized } of labels) {
        ctx.font = `${emphasized ? '600 ' : ''}${fs}px "PingFang SC","Microsoft YaHei",sans-serif`;
        const t = s.label || '';
        if (!t) continue;
        const tx = x + rOpen + 4, tw = ctx.measureText(t).width;
        if (!s.sel && placed.some(b => tx < b[2] && tx + tw > b[0] && y - 7 < b[3] && y + 7 > b[1])) continue;
        placed.push([tx, y - 7, tx + tw, y + 7]);
        ctx.strokeText(t, tx, y); ctx.fillText(t, tx, y);
        if (++townCount >= townLimit) break;
      }
    }
    canvas.classList.toggle('is-labelled', showLabel);

  }

  // ---- frame & graticule ----
  function drawFrame(v) {
    frame.innerHTML = '';
    const [vx, vy, vw, vh] = v, z = zoomOf(v), ins = 8 / z;
    el('rect', { class: 'm-frame', x: vx + ins, y: vy + ins, width: vw - 2 * ins, height: vh - 2 * ins }, frame);
    const [lonA, latB] = proj.invert([vx, vy + vh]), [lonB, latA] = proj.invert([vx + vw, vy]);
    const span = lonB - lonA, step = span > 30 ? 10 : span > 12 ? 5 : span > 5 ? 1 : span > 2 ? .5 : 1 / 12;
    const fmt = d => { const a = Math.floor(d + 1e-9), m = Math.round((d - a) * 60); return m ? `${a}°${m}′` : `${a}°`; };
    const tl = 5 / z, fs = 9.5 / z;
    for (let lon = Math.ceil(lonA / step) * step; lon < lonB; lon += step) {
      const [x] = proj([lon, latA]);
      el('line', { class: 'm-tick', x1: x, x2: x, y1: vy + ins, y2: vy + ins + tl }, frame);
      el('text', { class: 'm-tick-lbl', x, y: vy + ins - 3 / z, 'font-size': fs, 'text-anchor': 'middle' }, frame).textContent = fmt(lon);
    }
    for (let lat = Math.ceil(latB / step) * step; lat < latA; lat += step) {
      const [, y] = proj([lonA, lat]);
      el('line', { class: 'm-tick', x1: vx + ins, x2: vx + ins + tl, y1: y, y2: y }, frame);
      el('text', { class: 'm-tick-lbl', x: vx + ins + tl + 2 / z, y: y + 3 / z, 'font-size': fs }, frame).textContent = fmt(lat);
    }
  }

  // ---- "here" ----
  let herePt = null, hereKm = 20;
  function placeHere() {
    if (!herePt) { here.setAttribute('visibility', 'hidden'); return; }
    here.setAttribute('visibility', 'visible');
    const [x, y] = proj(herePt), z = zoomOf(vb), r = hereKm / proj.kmPerPx, s = 6 / z;
    const rx = Math.abs(proj([herePt[0] + hereKm / (111.195 * Math.cos(herePt[1] * Math.PI / 180)), herePt[1]])[0] - x);
    for (const shape of [ring]) {
      shape.setAttribute('cx', x); shape.setAttribute('cy', y);
      shape.setAttribute('rx', rx); shape.setAttribute('ry', r);
    }
    me.setAttribute('d', `M${x} ${y - s}L${x + s} ${y}L${x} ${y + s}L${x - s} ${y}Z`);
  }

  // ---- pointer: drag, wheel, pinch, tap ----
  const toSvg = (cx, cy) => {
    const r = stage.getBoundingClientRect();
    return screenToWorld([cx - r.left, cy - r.top], vb, r.width, r.height);
  };
  const pts = new Map();
  let moved = 0;
  const wrap = stage;
  wrap.addEventListener('wheel', e => {
    e.preventDefault(); cancelAnimationFrame(raf);
    const [px, py] = toSvg(e.clientX, e.clientY);
    zoomAt(px, py, Math.exp(-e.deltaY * (e.ctrlKey ? .01 : .0018)));
  }, { passive: false });
  wrap.addEventListener('pointerdown', e => {
    cancelAnimationFrame(raf);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) moved = 0;
  });
  wrap.addEventListener('pointermove', e => {
    const prev = pts.get(e.pointerId); if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    if (pts.size === 1) {
      const dx = cur.x - prev.x, dy = cur.y - prev.y;
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 5) {
        if (!wrap.hasPointerCapture(e.pointerId)) wrap.setPointerCapture(e.pointerId);
        wrap.classList.add('is-dragging');
        const k = vb[2] / wrap.clientWidth;
        apply(clampView([vb[0] - dx * k, vb[1] - dy * k, vb[2], vb[3]]));
      }
    } else if (pts.size === 2) {
      const other = [...pts].filter(([id]) => id !== e.pointerId).map(([, p]) => p)[0];
      const d0 = Math.hypot(prev.x - other.x, prev.y - other.y);
      const d1 = Math.hypot(cur.x - other.x, cur.y - other.y);
      const [mx, my] = toSvg((cur.x + other.x) / 2, (cur.y + other.y) / 2);
      if (d0 > 0) zoomAt(mx, my, d1 / d0);
      moved += 99;
    }
    pts.set(e.pointerId, cur);
  });
  const lift = e => { pts.delete(e.pointerId); if (!pts.size) wrap.classList.remove('is-dragging'); };
  wrap.addEventListener('pointerup', lift);
  wrap.addEventListener('pointercancel', lift);

  function nearest(cx, cy) {
    if (!proj) return null;
    const [px, py] = toSvg(cx, cy);
    const tol = 12 * (vb[2] / (stage.clientWidth || W));
    let best = null, bd = tol;
    for (const s of seats) {
      const d = Math.hypot(s.px - px, s.py - py);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  wrap.addEventListener('click', e => {
    if (e.target.closest('button')) return;
    if (moved > 5) return;
    const s = nearest(e.clientX, e.clientY);
    if (s) return onSeat(s);
    const [px, py] = toSvg(e.clientX, e.clientY);
    onPick(proj.invert([px, py]));
  });

  new ResizeObserver(() => paint()).observe(stage);

  return {
    setNation, setDetail, setSeats,
    fitBounds(b) {
      const [x0, y0] = proj([b[0], b[3]]), [x1, y1] = proj([b[2], b[1]]);
      const w = Math.max(x1 - x0, (y1 - y0) * W / H) * 1.15;
      animateTo(clampView([(x0 + x1 - w) / 2, (y0 + y1 - w * H / W) / 2, w, w * H / W]));
    },
    setOpen(flags) { openFlags = flags; paint(); },
    setLabels(fn) { for (const s of seats) s.label = fn(s); paint(); },
    setSelected(s) {
      for (const x of seats) x.sel = s?.i === x.i;
      paint();
    },
    setHere(ll, radiusKm) { herePt = ll; if (radiusKm) hereKm = radiusKm; updateNearby(); placeHere(); if (ll) animateTo(boxAround(ll, hereKm * 1.4)); },
    clearHere() { herePt = null; updateNearby(); placeHere(); animateTo([0, 0, W, H]); },
    zoomAll() { animateTo([0, 0, W, H]); },
    zoomBy(k) { animateTo(clampView([vb[0] + vb[2] * (1 - 1 / k) / 2, vb[1] + vb[3] * (1 - 1 / k) / 2, vb[2] / k, vb[3] / k]), 260); },
    fitsIn(ll) { const [x, y] = proj(ll); return x > -W && x < 2 * W && y > -H && y < 2 * H; },
    project: ll => proj(ll),
    get view() { return vb; },
  };
}
