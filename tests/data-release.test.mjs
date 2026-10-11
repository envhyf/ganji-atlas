import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const data = async path => JSON.parse(await readFile(new URL('../site/data/'+path,import.meta.url),'utf8'));
const china = await data('china.json');
const aliases = await data('search.json');
const expected = new Set();
for (const province of china.provinces.filter(p=>p.has)) {
  const pack = await data(`m/${province.a}.json`);
  for (const market of pack.markets) {
    const seat=market[2];
    if (seat == null) continue;
    assert.ok(Number.isInteger(seat) && china.seats[seat],`Missing seat for ${market[0]}`);
    assert.equal(china.provinces[china.seats[seat][2]].a,province.a);
    const sub=[province.n,market[5],market[4]].filter(Boolean).join(' · ');
    for (const name of [market[1],market[6]].filter(Boolean)) expected.add(JSON.stringify([name,seat,sub]));
  }
}
assert.deepEqual(new Set(aliases.map(x=>JSON.stringify(x))),expected,'Search aliases must match the released market/seat indices');
console.log(`Validated ${aliases.length} search aliases against province bundles and national seat indices.`);
