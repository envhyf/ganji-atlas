// Summary counts use township seats, matching the nearby calendar.
export const summaryLevel = widthKm => widthKm > 1400 ? 'province' : widthKm > 200 ? 'city' : 'local';
export function groupSeats(seats, counties, cities, provinces, flags, level) {
  const cityById=new Map(cities.map(c=>[c[0],c]));
  const groups=new Map();
  seats.forEach((s,i)=>{
    const p=s[2], city=cityById.get(counties[s[3]]?.[2]);
    if(level==='city' && !city) return;
    const id=level==='province'?p:city[0];
    if(!groups.has(id)) groups.set(id,{id,p,level,name:level==='province'?provinces[p].n:city[1],count:0,total:0,x:0,y:0,point:city?[city[3]/1000,city[4]/1000]:null});
    const g=groups.get(id);g.total++;g.x+=s[0]/1000;g.y+=s[1]/1000;
    if(flags?.[i]===1)g.count++;
  });
  return [...groups.values()].map(g=>({...g,point:level==='city'?g.point:[g.x/g.total,g.y/g.total]}));
}

// Separate nearby badges in screen space without changing their geographic anchors.
export function spaceBadges(items,width,height,compact=false) {
  const gapX=compact?54:76,gapY=compact?50:72,placed=[];
  for(const item of items){
    let best=null,bestCost=Infinity;
    for(let y=44;y<=height-42;y+=gapY)for(let x=30;x<=width-30;x+=gapX){
      if(x>width-72&&y<115)continue;
      const overlap=placed.reduce((n,b)=>n+(Math.abs(x-b.x)<gapX&&Math.abs(y-b.y)<gapY?1:0),0);
      const cost=overlap*1e7+(x-item.anchor[0])**2+(y-item.anchor[1])**2;
      if(cost<bestCost){bestCost=cost;best={...item,x,y};}
    }
    if(best)placed.push(best);
  }
  const distance=(g,x,y)=>(x-g.anchor[0])**2+(y-g.anchor[1])**2;
  for(let pass=0;pass<12;pass++){
    let changed=false;
    for(let i=0;i<placed.length;i++)for(let j=i+1;j<placed.length;j++){
      const a=placed[i],b=placed[j];
      if(distance(a,b.x,b.y)+distance(b,a.x,a.y)+1<distance(a,a.x,a.y)+distance(b,b.x,b.y)){
        [a.x,b.x]=[b.x,a.x];[a.y,b.y]=[b.y,a.y];changed=true;
      }
    }
    if(!changed)break;
  }
  return placed;
}
