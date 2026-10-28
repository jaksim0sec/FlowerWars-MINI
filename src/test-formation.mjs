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


/** Scenario-only field battalion. 12 fighters = one named, specialised squad;
 * four squads = one platoon. Existing armyFormation remains unchanged. */
const battalionSquadPatterns=[
 {type:'defense',label:'철벽대',roles:['banner','guard','guard','guard','guard','guard','guard','guard','scout','scout','archer','archer']},
 {type:'assault',label:'돌격대',roles:['banner','scout','scout','scout','scout','guard','guard','scout','scout','autumn','guard','healer']},
 {type:'ranged',label:'궁병대',roles:['banner','archer','archer','archer','guard','guard','guard','archer','archer','archer','archer','scout']},
 {type:'mobile',label:'기동대',roles:['banner','scout','scout','scout','scout','scout','scout','scout','scout','scout','archer','archer']},
 {type:'mixed',label:'보병대',roles:['banner','guard','guard','guard','scout','scout','scout','scout','archer','archer','archer','healer']},
 {type:'support',label:'지원대',roles:['banner','healer','healer','healer','healer','scholar','scholar','scholar','guard','guard','guard','scout']}
];
const battalionExtraRoles={
 healer:{role:'healer',characterId:'clover-mage'},
 scholar:{role:'support',characterId:'scholar'}
};
const rankRole={guard:0,autumn:1,scout:2,banner:3,archer:4,healer:5,scholar:6};

/** Test-only layout: adjacent 4-row squad blocks, front-line before archers.
 * Both armies share the same slots, mirrored by movement-scenarios. */
export function battalionFormation(count){
 count=Math.max(1,Math.floor(Number(count)||1));
 const squadCount=Math.ceil(count/12),lanes=Math.max(3,Math.min(squadCount,Math.ceil(Math.sqrt(squadCount)*1.25)));
 const slots=[];let maxDepth=0;
 for(let index=0;index<squadCount;index++){
  const plan=battalionSquadPatterns[index%battalionSquadPatterns.length];
  const size=Math.min(12,count-index*12),lane=index%lanes,band=Math.floor(index/lanes);
  const members=plan.roles.slice(0,size).sort((a,b)=>rankRole[a]-rankRole[b]);
  for(let j=0;j<members.length;j++){
   const role=members[j],
     // The flag stays a full rank behind archers/support as well as infantry.
     depth=band*5+(role==='banner'?4:Math.floor(j/4)+(plan.type==='ranged'||plan.type==='support'?1:0)),
     row=lane*4+j%4;
   slots.push({...structuredClone(roles[role]||battalionExtraRoles[role]),depth,row,
     squadIndex:index,squadType:plan.type,squadLabel:plan.label,platoonIndex:Math.floor(index/4)});
   maxDepth=Math.max(maxDepth,depth);
  }
 }
 return {slots,rows:lanes*4,depth:maxDepth,squadCount,platoonCount:Math.ceil(squadCount/4)};
}
