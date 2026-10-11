export function regionTrail(seat, china) {
  if (!seat) return [];
  const province = china.provinces[seat.p];
  const county = seat.c == null ? null : china.counties[seat.c];
  const city = county && china.cities.find(c => c[0] === county[2]);
  return [
    { level: 'province', id: seat.p, name: province.n, p: seat.p },
    city && { level: 'city', id: city[0], name: city[1], p: seat.p },
    county && { level: 'county', id: county[0], name: county[1], p: seat.p },
  ].filter(Boolean);
}
export function inRegion(seat, region, counties) {
  if (seat.p !== region.p) return false;
  if (region.level === 'province') return true;
  const c = seat.c == null ? null : counties[seat.c];
  return !!c && (region.level === 'city' ? c[2] === region.id : c[0] === region.id);
}
