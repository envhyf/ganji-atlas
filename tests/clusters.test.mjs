import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const src=await readFile(new URL('../site/js/clusters.js',import.meta.url),'utf8');
const {summaryLevel,groupSeats,spaceBadges}=await import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}`);
assert.equal(summaryLevel(4000),'province');assert.equal(summaryLevel(700),'city');assert.equal(summaryLevel(100),'local');
const seats=[[100000,30000,0,0,'A'],[101000,31000,0,0,'B'],[102000,32000,1,1,'C']];
const counties=[[1,'a',10,0],[2,'b',20,1]];
const provs=[{n:'甲省'},{n:'乙省'},{n:'无资料省'}],cities=[[10,'甲市',0,100000,30000],[20,'乙市',1,102000,32000]];
let groups=groupSeats(seats,counties,cities,provs,new Uint8Array([1,2,0]),'province');
assert.deepEqual(groups.map(g=>[g.name,g.count,g.total]),[['甲省',1,2],['乙省',0,1]]);
groups=groupSeats(seats,counties,cities,provs,new Uint8Array([0,1,1]),'city');
assert.deepEqual(groups.map(g=>[g.id,g.count]),[[10,1],[20,1]]);
assert.equal(groups[0].p,0);assert.deepEqual(groups[0].point,[100,30]);
console.log('Administrative summaries count open seats once, exclude unknown rules and preserve region identity.');

const placed=spaceBadges(Array.from({length:6},(_,i)=>({id:i,anchor:[170+i,170+i]})),320,300);
for(const a of placed){assert.ok(a.x>=30&&a.x<=290);assert.ok(a.y>=44&&a.y<=258);}
for(let i=0;i<placed.length;i++)for(let j=i+1;j<placed.length;j++){const a=placed[i],b=placed[j];assert.ok(Math.abs(a.x-b.x)>74||Math.abs(a.y-b.y)>70,'province badges should separate');}
const citiesPlaced=spaceBadges(Array.from({length:18},(_,i)=>({id:i,anchor:[180+i,180+i]})),300,280,true);
for(let i=0;i<citiesPlaced.length;i++)for(let j=i+1;j<citiesPlaced.length;j++){
 const a=citiesPlaced[i],b=citiesPlaced[j];assert.ok(Math.abs(a.x-b.x)>=54||Math.abs(a.y-b.y)>=50,'city hit targets must not overlap');
}
