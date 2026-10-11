// Projection, distance, coordinate conversion. All coordinates are GCJ-02
// (DataV boundaries and our geocodes are both GCJ-02).

const R = 6371.0088;
const rad = x => x * Math.PI / 180;

export function km(a, b) {
  const dLat = rad(b[1] - a[1]), dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Browser geolocation is WGS-84; convert so it lines up with the map. */
export function wgs2gcj(lon, lat) {
  const A = 6378245.0, EE = 0.00669342162296594323, PI = Math.PI;
  const x = lon - 105, y = lat - 35;
  let dLat = -100 + 2 * x + 3 * y + .2 * y * y + .1 * x * y + .2 * Math.sqrt(Math.abs(x));
  dLat += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3;
  dLat += (20 * Math.sin(y * PI) + 40 * Math.sin(y / 3 * PI)) * 2 / 3;
  dLat += (160 * Math.sin(y / 12 * PI) + 320 * Math.sin(y * PI / 30)) * 2 / 3;
  let dLon = 300 + x + 2 * y + .1 * x * x + .1 * x * y + .1 * Math.sqrt(Math.abs(x));
  dLon += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3;
  dLon += (20 * Math.sin(x * PI) + 40 * Math.sin(x / 3 * PI)) * 2 / 3;
  dLon += (150 * Math.sin(x / 12 * PI) + 300 * Math.sin(x / 30 * PI)) * 2 / 3;
  const r = rad(lat), magic = 1 - EE * Math.sin(r) ** 2, sq = Math.sqrt(magic);
  dLat = dLat * 180 / ((A * (1 - EE)) / (magic * sq) * PI);
  dLon = dLon * 180 / (A / sq * Math.cos(r) * PI);
  return [lon + dLon, lat + dLat];
}

function rings(geom) {
  return geom.type === 'MultiPolygon' ? geom.coordinates.flat() : geom.coordinates;
}

export function bounds(geom) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const ring of rings(geom)) for (const [x, y] of ring) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

/** Equirectangular with cos(lat) correction, fitted to a box with padding. */
export function fitProjection([x0, y0, x1, y1], width, pad) {
  const k = Math.cos(rad((y0 + y1) / 2));
  const spanX = (x1 - x0) * k, spanY = y1 - y0;
  const s = (width - 2 * pad) / spanX;
  const height = Math.round(spanY * s + 2 * pad);
  const p = ([lon, lat]) => [pad + (lon - x0) * k * s, pad + (y1 - lat) * s];
  p.invert = ([x, y]) => [x0 + (x - pad) / (k * s), y1 - (y - pad) / s];
  p.kmPerPx = (R * rad(1)) / s;         // 1° lat ≈ 111.2 km
  p.height = height;
  return p;
}

export function pathOf(geom, p) {
  return rings(geom).map(r => 'M' + r.map(c => p(c).map(v => v.toFixed(3)).join(',')).join('L') + 'Z').join('');
}

export function linePathOf(geom, p) {
  if (geom.type === 'GeometryCollection') return geom.geometries.map(g => linePathOf(g, p)).join('');
  const lines = geom.type === 'LineString' ? [geom.coordinates] : geom.coordinates;
  return lines.map(r => 'M' + r.map(c => p(c).map(v => v.toFixed(3)).join(',')).join('L')).join('');
}

/** Visual centre of the largest ring (good enough for labels). */
export function centroid(geom) {
  const rs = [...rings(geom)].sort((a, b) => b.length - a.length)[0];
  if (!rs || !rs.length) return null;
  let x = 0, y = 0;
  for (const [a, b] of rs) { x += a; y += b; }
  return [x / rs.length, y / rs.length];
}
