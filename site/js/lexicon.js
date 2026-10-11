// 各地对"赶集"的叫法。页面上所有措辞都从这里取，随所在地切换。
// 省级为默认，市级可覆盖。此表据一般认识整理，尚待各地读者勘正。

const L = {
  ji:  { c: '集', place: '集市', go: '赶集', open: '逢集', none: '无集', period: '集期', day: '集日',
         note: '北方多称"赶集"，大集小集，逢五排十。' },
  chang: { c: '场', place: '场镇', go: '赶场', open: '逢场', none: '无场', period: '场期', day: '场期',
           note: '川渝黔一带称"赶场"，一场接一场，"场"即是集，也是集所在的镇子。' },
  xu:  { c: '圩', place: '圩场', go: '赶圩', open: '开圩', none: '无圩', period: '圩期', day: '圩日',
         note: '圩，此处读 xū，同"墟"。岭南、赣南称集为圩，开市叫"开圩"，散市叫"散圩"。' },
  xu2: { c: '墟', place: '墟市', go: '趁墟', open: '墟日', none: '无墟', period: '墟期', day: '墟日',
         note: '粤语地区说"趁墟"，"趁"是赶、趁热闹的意思。' },
  jie: { c: '街', place: '街子', go: '赶街', open: '街天', none: '无街', period: '街期', day: '街子天',
         note: '云南称集为"街子"，赶集叫"赶街"，开集那天是"街子天"。' },
};

const PROVINCE = {
  广西: 'xu', 江西: 'xu', 海南: 'xu', 福建: 'xu', 广东: 'xu2',
  四川: 'chang', 重庆: 'chang', 贵州: 'chang',
  云南: 'jie',
};
const CITY = {   // 省内不同的地方
  湘西土家族苗族自治州: 'chang', 怀化市: 'chang', 张家界市: 'chang', 恩施土家族苗族自治州: 'chang',
};

export function lexicon(province = '', city = '') {
  if (CITY[city]) return { ...L[CITY[city]], key: CITY[city] };
  const p = Object.keys(PROVINCE).find(k => province.startsWith(k));
  const key = p ? PROVINCE[p] : 'ji';
  return { ...L[key], key };
}
