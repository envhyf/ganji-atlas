// Compact labels identify a place; full market names remain in detail cards.
export function compactPlaceName(names = [], township = '') {
  const unique = [...new Set(names.filter(Boolean).map(name => {
    const urban = String(name).match(/^(.+?城)(?:里的|里)/);
    return urban ? urban[1].replace(/区城$/, '城') : String(name);
  }))];
  if (!unique.length) return township || '集市';
  const label = unique.slice(0, 2).join('·');
  return label.length <= 14 ? label : township || unique[0];
}
