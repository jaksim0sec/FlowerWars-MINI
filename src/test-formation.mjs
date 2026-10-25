// Test-only roles and parade-ground layout; character rigs remain untouched.
const roles={
 guard:{role:'guard',characterId:'shield-guard'},banner:{role:'banner',characterId:'banner-bearer'},
 scout:{role:'scout',characterId:'scout'},archer:{role:'archer',characterId:'archer'},
 autumn:{role:'autumn',characterId:'archer',name:'낙엽병',weapon:'basic_sword',stats:{maxHealth:110,damage:26,attackPeriod:.85,range:1,rangeShape:'king'}},
};
export function armyFormation(count){
 const rows=Math.max(3,Math.ceil(Math.sqrt(count)*1.4)|1),middle=Math.floor(rows/2),rowOrder=[];
 for(let d=0;rowOrder.length<rows;d++)for(const r of d?[middle-d,middle+d]:[middle])if(r>=0&&r<rows)rowOrder.push(r);
 const counts=count<5?{guard:0,banner:0,archer:0,autumn:0}:{guard:Math.max(1,Math.floor(count*.16)),banner:Math.max(1,Math.ceil(count/12)),archer:Math.max(1,Math.ceil(count*.06)),autumn:Math.max(1,Math.ceil(count*.06))};
 counts.scout=count-counts.guard-counts.banner-counts.archer-counts.autumn;
 const slots=[],used=new Set(),place=(role,depth,row)=>{used.add(`${depth},${row}`);slots.push({...roles[role],depth,row});};
 const guardRanks=Math.ceil(counts.guard/rows),bannerDepth=guardRanks+1;
 for(let i=0;i<counts.guard;i++)place('guard',Math.floor(i/rows),rowOrder[i%rows]);
 for(let i=0;i<counts.banner;i++)place('banner',bannerDepth+Math.floor(i/rows),rowOrder[i%rows]);
 for(let i=0,cell=0;i<counts.scout;cell++){
  const depth=guardRanks+Math.floor(cell/rows),row=rowOrder[cell%rows];if(used.has(`${depth},${row}`))continue;
  place('scout',depth,row);i++;
 }
 let rear=Math.max(...slots.map(s=>s.depth))+1;
 for(const role of ['archer','autumn']){
  for(let i=0;i<counts[role];i++)place(role,rear+Math.floor(i/rows),rowOrder[i%rows]);
  rear+=Math.max(1,Math.ceil(counts[role]/rows));
 }
 return {slots,rows,depth:Math.max(...slots.map(s=>s.depth))};
}
