import {armyFormation} from './test-formation.mjs';
const registries=new WeakMap();
function registry(board){let r=registries.get(board);if(!r||r.epoch!==board.byId){r={epoch:board.byId,groups:new Map(),squads:new Map(),next:1};registries.set(board,r);}return r;}
export function groupsFor(board){return registry(board).groups;}
export function squadsFor(board){return registry(board).squads;}
export function squadOf(board,unit){return unit?.squadId?squadsFor(board).get(unit.squadId):null;}

/** Plain JSON template, independent of board/camera/character instances. */
const types={
 assault:['banner-bearer',...Array(7).fill('scout'),...Array(3).fill('shield-guard'),'clover-mage'],
 defense:['banner-bearer',...Array(7).fill('shield-guard'),...Array(2).fill('scout'),...Array(2).fill('archer')],
 ranged:['banner-bearer',...Array(7).fill('archer'),...Array(3).fill('shield-guard'),'scout'],
 mobile:['banner-bearer',...Array(9).fill('scout'),...Array(2).fill('archer')],
 support:['banner-bearer',...Array(4).fill('clover-mage'),...Array(3).fill('scholar'),...Array(3).fill('shield-guard'),'scout'],
 mixed:['banner-bearer',...Array(4).fill('scout'),...Array(3).fill('shield-guard'),...Array(3).fill('archer'),'clover-mage']
};
const roles={'banner-bearer':'banner','scout':'scout','shield-guard':'guard','archer':'archer','clover-mage':'healer','scholar':'support'};
export function createFormationGroup(count=8,kind='squad',name='',type='mixed'){
 count=Math.max(2,Math.min(128,Math.floor(Number(count)||8)));kind=kind==='platoon'?'platoon':'squad';
 const formation=armyFormation(count),center=Math.floor(formation.rows/2);
 if(type!=='mixed'&&types[type])for(let i=0;i<formation.slots.length;i++){
   const id=types[type][i%12];formation.slots[i]={...formation.slots[i],characterId:id,role:roles[id],weapon:undefined,stats:undefined};
 }
 return {format:'doragami-unit-group',version:1,kind,name:name.trim()||(kind==='platoon'?'혼성 소대':'혼성 분대'),squadType:types[type]?type:'mixed',members:formation.slots.map(({depth,row,...slot})=>({...structuredClone(slot),offset:{x:-depth,y:row-center}}))};
}
export function placeGroup(board,blueprint,anchor,options={}){
 if(blueprint?.format!=='doragami-unit-group'||blueprint.version!==1||!Array.isArray(blueprint.members)||!blueprint.members.length||blueprint.members.length>1024)return null;
 const sign=options.team==='B'?-1:1,seen=new Set();
 const positions=blueprint.members.map(m=>({x:anchor.x+m.offset?.x*sign,y:anchor.y+m.offset?.y}));
 const free=()=>positions.every(p=>{const key=p.y*board.width+p.x;if(!board.inside(p.x,p.y)||board.occupied(p.x,p.y)||board.navigation.blocked(key))return false;return true;});
 for(const p of positions){const k=`${p.x},${p.y}`;if(seen.has(k))return null;seen.add(k);}
 if(!free())return null;
 const prepared=blueprint.members.map((member,i)=>{const character=options.makeCharacter?.(member,i)||null;return {character,settings:{stats:member.stats,movement:member.movement,capabilities:member.capabilities,...options.optionsFor?.(character,member,i),team:options.team||'A',autoCombat:options.autoCombat??true}};});
 if(!free())return null;
 const r=registry(board),id=`${blueprint.kind}-${r.next++}`;
 const group={id,name:blueprint.name,kind:blueprint.kind,team:options.team||'A',anchor:{...anchor},blueprint:structuredClone(blueprint),memberIds:[]};
 for(let i=0;i<positions.length;i++){const u=board.spawn(positions[i].x,positions[i].y,prepared[i].character,prepared[i].settings);u.groupId=id;u.memberIndex=i;u.facing=sign;group.memberIds.push(u.id);}
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
 const leaders=units.filter(u=>u.character?.characterId==='banner-bearer'||u.formationRole==='banner');
 const count=Math.ceil(units.length/12),troops=units.filter(u=>!leaders.includes(u));
 const squads=Array.from({length:count},(_,i)=>({
   id:group.id+':'+(i+1),groupId:group.id,
   name:count===1?group.name:group.name+' · '+(i+1)+'분대',team:group.team,
   type:group.blueprint.squadType||'mixed',leaderId:leaders[i]?.id??null,
   memberIds:leaders[i]?[leaders[i].id]:[],stance:'balanced',formation:'line',order:null
 }));
 for(const u of [...troops,...leaders.slice(count)]){
   const squad=squads.find(s=>s.memberIds.length<12);
   if(squad)squad.memberIds.push(u.id);
 }
 for(const s of squads){for(const id of s.memberIds){const u=board.unit(id);if(u)u.squadId=s.id;}r.squads.set(s.id,s);}
 group.squads=squads.map(s=>s.id);group.commanderId=squads[0]?.leaderId??null;
}
