import {armyFormation} from './test-formation.mjs';
const registries=new WeakMap();
function registry(board){let r=registries.get(board);if(!r||r.epoch!==board.byId){r={epoch:board.byId,groups:new Map(),squads:new Map(),next:1};registries.set(board,r);}return r;}
export function groupsFor(board){return registry(board).groups;}
export function squadsFor(board){return registry(board).squads;}
export function squadOf(board,unit){return unit?.squadId?squadsFor(board).get(unit.squadId):null;}

/** Plain JSON template, independent of board/camera/character instances. */
const types={
 assault:['banner-bearer',...Array(10).fill('scout'),'clover-mage'],
 defense:['banner-bearer',...Array(10).fill('shield-guard'),'clover-mage'],
 ranged:['banner-bearer',...Array(9).fill('archer'),'shield-guard','scout'],
 mobile:['banner-bearer',...Array(9).fill('scout'),...Array(2).fill('archer')],
 support:['banner-bearer',...Array(4).fill('clover-mage'),...Array(3).fill('scholar'),'shield-guard',...Array(3).fill('scout')],
 mixed:['banner-bearer',...Array(6).fill('scout'),'shield-guard',...Array(3).fill('archer'),'clover-mage']
};
const fullSquads={
 defense:['banner-bearer',...Array(6).fill('shield-guard'),...Array(6).fill('scout'),'clover-mage'],
 ranged:['banner-bearer',...Array(14).fill('archer'),...Array(7).fill('shield-guard'),...Array(2).fill('clover-mage')],
 support:['banner-bearer',...Array(5).fill('clover-mage'),...Array(6).fill('scholar'),...Array(8).fill('shield-guard'),...Array(4).fill('scout')]
};
export const SPEAR_BATTLE={damageMultiplier:2,visionRange:4,speedMultiplier:1.5,attackPeriod:2.4,impactTime:.07,activeDuration:.32,movingPoise:true,charge:true,chargeDistance:4,chargeDamageMultiplier:3};
const roles={'banner-bearer':'banner','scout':'scout','shield-guard':'guard','archer':'archer','clover-mage':'healer','scholar':'support'};
export function availableSquadBlueprints(){return Object.keys(types).map(type=>createFormationGroup(type==='assault'?6:type==='defense'?14:24,'squad','',type));}
export function createFormationGroup(count=8,kind='squad',name='',type='mixed'){
 count=Math.max(2,Math.min(128,Math.floor(Number(count)||8)));kind=kind==='platoon'?'platoon':'squad';
 const formation=armyFormation(count),center=Math.floor(formation.rows/2),squadSize=kind==='squad'&&(count===24||count===fullSquads[type]?.length)?count:12;
 if((type!=='mixed'||squadSize===24)&&types[type])for(let i=0;i<formation.slots.length;i++){
   const id=(squadSize===24||count===fullSquads[type]?.length)?(fullSquads[type]?.[i]??(i===0?'banner-bearer':types[type][1+(i-1)%11])):types[type][i%12];formation.slots[i]={...formation.slots[i],characterId:id,role:roles[id],weapon:undefined,stats:undefined};
 }
 if(type!=='defense'&&!(squadSize===24&&fullSquads[type])){
  let shields=0;
  for(const slot of formation.slots)if(slot.characterId==='shield-guard'&&++shields>1){slot.characterId=type==='ranged'?'archer':'scout';slot.role=roles[slot.characterId];slot.weapon=undefined;}
 }
 if(type==='assault')for(const slot of formation.slots){
  slot.battle={speedMultiplier:1.5};
  if(slot.characterId==='scout'){slot.weapon='ribbon_spear';slot.battle={...SPEAR_BATTLE};}
 }
 return {format:'doragami-unit-group',version:1,kind,squadSize,name:name.trim()||(kind==='platoon'?'혼성 소대':'혼성 분대'),squadType:types[type]?type:'mixed',members:formation.slots.map(({depth,row,...slot})=>({...structuredClone(slot),offset:{x:-depth,y:row-center}}))};
}
export function placeGroup(board,blueprint,anchor,options={}){
 if(blueprint?.format!=='doragami-unit-group'||blueprint.version!==1||!Array.isArray(blueprint.members)||!blueprint.members.length||blueprint.members.length>1024)return null;
 if(board.match&&board.units.filter(u=>u.team===(options.team||'A')&&u.health.current>0).length+blueprint.members.length>board.match.limit)return null;
 const sign=options.team==='B'?-1:1,seen=new Set();
 const positions=blueprint.members.map(m=>({x:anchor.x+m.offset?.x*sign,y:anchor.y+m.offset?.y}));
 const free=()=>positions.every(p=>{const key=p.y*board.width+p.x;if(!board.inside(p.x,p.y)||board.occupied(p.x,p.y)||board.navigation.blocked(key))return false;return true;});
 for(const p of positions){const k=`${p.x},${p.y}`;if(seen.has(k))return null;seen.add(k);}
 if(!free())return null;
 const prepared=blueprint.members.map((member,i)=>{const character=options.makeCharacter?.(member,i)||null;return {character,settings:{battle:member.battle,stats:member.stats,movement:member.movement,capabilities:member.capabilities,...options.optionsFor?.(character,member,i),unitType:member.characterId,team:options.team||'A',autoCombat:options.autoCombat??true}};});
 if(!free())return null;
 const r=registry(board),id=`${blueprint.kind}-${r.next++}`;
 const group={id,name:blueprint.name,kind:blueprint.kind,team:options.team||'A',anchor:{...anchor},blueprint:structuredClone(blueprint),memberIds:[]};
 for(let i=0;i<positions.length;i++){const u=board.spawn(positions[i].x,positions[i].y,prepared[i].character,prepared[i].settings);u.groupId=id;u.memberIndex=i;u.formationRole=blueprint.members[i].role||null;u.facing=sign;group.memberIds.push(u.id);}
 r.groups.set(id,group);attachSquads(board,group);return group;
}

/** Wrap an already placed formation as one command/data unit. */
export function registerPlacedGroup(board,memberIds,{kind='squad',name='',team='A'}={}){
 const units=memberIds.map(id=>board.unit(id));if(!units.length||units.some(u=>!u||u.groupId||u.team!==team))return null;
 const anchor={x:units[0].x,y:units[0].y},sign=team==='B'?-1:1;
 const blueprint={format:'doragami-unit-group',version:1,kind,name:name||(kind==='platoon'?'혼성 소대':'혼성 분대'),members:units.map(u=>({characterId:u.character?.characterId||null,role:u.formationRole||null,name:u.character?.testName,weapon:u.character?.testName?Object.values(u.character.equipment).find(a=>a)?.equipmentId:undefined,offset:{x:(u.x-anchor.x)*sign,y:u.y-anchor.y},stats:{maxHealth:u.health.max,damage:u.damage,attackPeriod:u.combat.period,range:u.combat.range,rangeShape:u.combat.shape,preferredRange:u.combat.preferredRange,lineOfSight:u.combat.lineOfSight,searchInterval:u.combat.searchInterval},movement:{...u.movement},capabilities:[...u.capabilities]}))};
 const r=registry(board),id=`${kind}-${r.next++}`,group={id,kind,name:blueprint.name,team,anchor,blueprint,memberIds:[...memberIds]};
 units.forEach((u,i)=>{u.groupId=id;u.memberIndex=i;});r.groups.set(id,group);attachSquads(board,group);return group;
}

/** Sub-squads retain the parent group's ID and roster; no board/model changes. */
function attachSquads(board,group){
 const r=registry(board),units=group.memberIds.map(id=>board.unit(id)).filter(Boolean);
 const indexed=units.length>0&&units.every(u=>Number.isInteger(u.formationSquadIndex));
 let squads;
 if(indexed){
  // Scenario battalions keep each specialized 12-member squad intact, not
  // a sequential mixture of all the infantry in one giant parent formation.
  const buckets=new Map();
  for(const u of units){const index=u.formationSquadIndex;if(!buckets.has(index))buckets.set(index,[]);buckets.get(index).push(u);}
  squads=[...buckets].sort(([a],[b])=>a-b).map(([index,members])=>{
   const leader=members.find(u=>u.formationRole==='banner'||u.character?.characterId==='banner-bearer');
   const platoonIndex=members[0].formationPlatoonIndex??Math.floor(index/4);
   return {
    id:group.id+':'+(index+1),groupId:group.id,
    name:`${index+1}분대 · ${members[0].formationSquadLabel||'혼성대'}`,
    team:group.team,type:members[0].formationSquadType||'mixed',
    platoonIndex,platoonId:group.id+':p'+(platoonIndex+1),
    leaderId:leader?.id??null,memberIds:members.map(u=>u.id),
    stance:'balanced',formation:'line',order:null
   };
  });
 }else{
  const leaders=units.filter(u=>u.character?.characterId==='banner-bearer'||u.formationRole==='banner');
  const capacity=group.blueprint.squadSize||12,count=Math.ceil(units.length/capacity),troops=units.filter(u=>!leaders.includes(u));
  squads=Array.from({length:count},(_,i)=>({
   id:group.id+':'+(i+1),groupId:group.id,
   name:count===1?group.name:group.name+' · '+(i+1)+'분대',team:group.team,
   type:group.blueprint.squadType||'mixed',leaderId:leaders[i]?.id??null,
   memberIds:leaders[i]?[leaders[i].id]:[],stance:'balanced',formation:'line',order:null
  }));
  for(const u of [...troops,...leaders.slice(count)]){
   const squad=squads.find(s=>s.memberIds.length<capacity);
   if(squad)squad.memberIds.push(u.id);
  }
 }
 for(const squad of squads){
  for(const id of squad.memberIds){const u=board.unit(id);if(u)u.squadId=squad.id;}
  r.squads.set(squad.id,squad);
 }
 group.squads=squads.map(squad=>squad.id);group.commanderId=squads[0]?.leaderId??null;
 if(indexed){
  const platoons=new Map();
  for(const squad of squads){
   const i=squad.platoonIndex;
   if(!platoons.has(i))platoons.set(i,{id:squad.platoonId,name:`제${i+1}소대`,squadIds:[]});
   platoons.get(i).squadIds.push(squad.id);
  }
  group.platoons=[...platoons.values()];
 }
}
