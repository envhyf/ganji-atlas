// Pure search and share-state helpers, independent of the DOM.
export function findPlaces(entries, query) {
  const q = query.trim();
  if (!q) return [];
  const normalized = q.replace(/[（(].*?[）)]/g, '').trim();
  const context = q.match(/[（(](.*?)[）)]/)?.[1];
  const rank = e => e.k === normalized ? 0 : e.k.startsWith(normalized) ? 1 : 2;
  const matches = entries.filter(e => (e.k.includes(normalized) || `${e.sub}${e.k}`.includes(normalized)) && (!context || e.sub.includes(context)))
    .sort((a,b) => rank(a)-rank(b));
  const exact=matches.filter(e=>e.k===normalized);
  return (exact.length?exact:matches).slice(0,30);
}
export function seatKey(seat, counties) {
  return `${seat.c == null ? '' : counties[seat.c][0]}:${seat.t}`;
}
export function parseHash(hash) {
  const [base, options=''] = hash.replace(/^#/, '').split('?');
  const parts = base.split(',');
  const region = parts[0] === 'region';
  const nums = (region ? parts.slice(3) : parts).map(Number);
  const ll = nums.slice(0,2);
  const valid = ll.length===2 && ll.every(Number.isFinite) && ll[0]>=72 && ll[0]<=137 && ll[1]>=15 && ll[1]<=55;
  const params = new URLSearchParams(options);
  return {ll:valid?ll:null,radius:[10,20,30,50].includes(nums[2])?nums[2]:20,
    region:region?{level:parts[1],id:Number(parts[2])}:null,date:params.get('date'),seat:params.get('seat')};
}
