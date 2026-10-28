import {groupsFor,squadsFor} from '../unit-groups.mjs';
const round=n=>Math.round(n*1000)/1000;
const select=(o,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(o,k)).map(k=>[k,o[k]]));
export function wireActor(u){const a=select(u,'id unitType health priorityKey movement capabilities team combat strike damage x y visualX visualY state elapsed facing path target command step route waitReason hits impacted healing groupId memberIndex formationRole squadId attackVector deathDirection'.split(' '));a.character=u.character?select(u.character,'characterId equipment appearance testName testStats testMovement'.split(' ')):null;return structuredClone(a);}
function row(u){return [u.id,u.x,u.y,round(u.visualX),round(u.visualY),u.state,u.state==='idle'?0:round(u.elapsed),u.facing,u.health.current,round(u.health.injury||0),round(u.health.critical||0),u.hits,u.target,u.command,u.strike,u.impacted,u.attackVector||null,u.deathDirection||0,u.step||null,u.waitReason||null];}
function squadWire(s){const o=s.order;return {...select(s,'id groupId name team type platoonIndex platoonId leaderId memberIds stance formation actingLeaderId matchIndex'.split(' ')),order:o?{...select(o,'type source target phase forward facing formed total after waypoints'.split(' ')),goals:[...o.goals],travelOffsets:o.travelOffsets?[...o.travelOffsets]:null}:null};}
export class BattleFrames {
 constructor(){this.reset();}
 reset(){this.full=true;this.actors=new Map();this.squads=new Map();this.equipment=new Map();this.groups=new Set();}
 build(state){const b=state.board,m=b.match,units=[],created=[],equipment=[],squads=[],groups=[],ids=new Set();
  for(const u of b.units){ids.add(u.id);if(!this.actors.has(u.id))created.push(wireActor(u));const values=row(u),key=JSON.stringify(values);if(this.actors.get(u.id)!==key){units.push(values);this.actors.set(u.id,key);}if(u.character){const signature=JSON.stringify(u.character.equipment);if(this.equipment.has(u.id)&&this.equipment.get(u.id)!==signature)equipment.push([u.id,structuredClone(u.character.equipment)]);this.equipment.set(u.id,signature);}}
  const removed=[...this.actors.keys()].filter(id=>!ids.has(id));for(const id of removed){this.actors.delete(id);this.equipment.delete(id);}
  for(const s of squadsFor(b).values()){const value=squadWire(s),key=JSON.stringify(value);if(this.squads.get(s.id)!==key){squads.push(value);this.squads.set(s.id,key);}}
  for(const g of groupsFor(b).values())if(!this.groups.has(g.id)){groups.push(structuredClone(g));this.groups.add(g.id);}
  const full=this.full;this.full=false;return {full,matchId:state.matchId,time:b.time,nextId:b.nextId,created,units,removed,equipment,squads,groups,match:structuredClone(select(m,'phase remaining elapsed winner counts reserve squadIds centers statusRevision flags'.split(' ')))};
 }
}
export function applyBattleFrame(state,frame){
 const b=state?.board,m=b?.match;
 try{
  if(!b||typeof frame?.full!=='boolean'||frame?.matchId!==state.matchId||!Number.isFinite(frame.time)||frame.time<0||!Number.isSafeInteger(frame.nextId)||!Array.isArray(frame.units)||frame.units.length>700||!Array.isArray(frame.created)||frame.created.length>700||!Array.isArray(frame.removed)||frame.removed.length>1400||!Array.isArray(frame.squads)||frame.squads.length>256||!Array.isArray(frame.groups)||frame.groups.length>256||!Array.isArray(frame.equipment)||frame.equipment.length>700||!['preparation','battle','finished'].includes(frame.match?.phase))return false;
  const fresh=new Map(),removed=new Set();
  for(const u of frame.created){
   if(!Number.isSafeInteger(u?.id)||u.id<1||fresh.has(u.id)||!['A','B'].includes(u.team)||!b.inside(u.x,u.y)||!u.health||!Number.isFinite(u.health.max)||u.health.max<=0||!u.combat||!u.movement||!frame.full&&b.byId.has(u.id))return false;
   fresh.set(u.id,u);
  }
  const actor=id=>fresh.get(id)||(frame.full?null:b.byId.get(id));
  const seen=new Set();
  for(const r of frame.units){
   const u=actor(r?.[0]);
   if(!Array.isArray(r)||r.length!==20||!Number.isSafeInteger(r[0])||r[0]<1||!u||seen.has(r[0])||!b.inside(r[1],r[2])||![r[3],r[4],r[6],r[8],r[9],r[10]].every(Number.isFinite)||r[3]<0||r[3]>b.width-1||r[4]<0||r[4]>b.height-1||r[8]<0||r[8]>u.health.max||!['idle','walk','attack','hit','death'].includes(r[5])||![-1,1].includes(r[7]))return false;
   if(r[18]&&(!b.inside(r[18].x,r[18].y)||!Number.isFinite(r[18].elapsed)||!Number.isFinite(r[18].duration)||r[18].duration<=0))return false;
   seen.add(r[0]);
  }
  for(const id of frame.removed){if(!Number.isSafeInteger(id)||id<1||removed.has(id)||seen.has(id)||fresh.has(id))return false;removed.add(id);}
  for(const s of frame.squads)if(typeof s.id!=='string'||!['A','B'].includes(s.team)||!Array.isArray(s.memberIds)||s.order&&!Array.isArray(s.order.goals))return false;
  for(const g of frame.groups)if(typeof g.id!=='string'||!['A','B'].includes(g.team)||!Array.isArray(g.memberIds))return false;
  for(const team of ['A','B'])if(!Number.isFinite(frame.match.flags?.[team]?.health?.current)||frame.match.flags[team].health.current<0||frame.match.flags[team].health.current>m.flags[team].health.max)return false;
  // Full frames are recovery boundaries; ordinary deltas retain existing object/index identities.
  const cell=(x,y)=>y*b.width+x;
  if(frame.full){
   for(const u of fresh.values())if(u.character){u.character.health=u.health;u.character.animation={state:u.state,elapsed:u.elapsed,facing:u.facing,phase:u.id};}
   for(const r of frame.units){const u=fresh.get(r[0]);Object.assign(u,{x:r[1],y:r[2],visualX:r[3],visualY:r[4],state:r[5],elapsed:r[6],facing:r[7],hits:r[11],target:r[12],command:r[13],strike:r[14],impacted:r[15],attackVector:r[16],deathDirection:r[17],step:r[18],waitReason:r[19]});Object.assign(u.health,{current:r[8],injury:r[9],critical:r[10]});}
   b.units=[...fresh.values()];b.byId.clear();b.cells.clear();b.reservations.clear();b.spatial.clear();
   for(const u of b.units){b.byId.set(u.id,u);if(u.health.current>0){b.cells.set(cell(u.x,u.y),u.id);if(u.step)b.reservations.set(cell(u.step.x,u.step.y),u.id);b.spatial.add(u);}}
  }else{
   // Two-phase footprint update handles simultaneous movements and reservations.
   const relocated=new Set();
   const release=u=>{
    if(u.health.current>0){
     const k=cell(u.x,u.y);if(b.cells.get(k)===u.id)b.cells.delete(k);
     if(u.step){const dest=cell(u.step.x,u.step.y);if(b.reservations.get(dest)===u.id)b.reservations.delete(dest);}
    }
   };
   for(const id of removed){const u=b.byId.get(id);if(u){release(u);b.spatial.remove(u);b.byId.delete(id);}}
   for(const r of frame.units){const u=b.byId.get(r[0]);if(!u)continue;const a=u.step,z=r[18],alive=u.health.current>0,next=r[8]>0;
    if(alive!==next||alive&&next&&(u.x!==r[1]||u.y!==r[2]||a?.x!==z?.x||a?.y!==z?.y)){release(u);relocated.add(u.id);}
   }
   for(const u of fresh.values())if(u.character){u.character.health=u.health;u.character.animation={state:u.state,elapsed:u.elapsed,facing:u.facing,phase:u.id};}
   for(const r of frame.units){const u=actor(r[0]);Object.assign(u,{x:r[1],y:r[2],visualX:r[3],visualY:r[4],state:r[5],elapsed:r[6],facing:r[7],hits:r[11],target:r[12],command:r[13],strike:r[14],impacted:r[15],attackVector:r[16],deathDirection:r[17],step:r[18],waitReason:r[19]});Object.assign(u.health,{current:r[8],injury:r[9],critical:r[10]});}
   if(removed.size)b.units=b.units.filter(u=>!removed.has(u.id));
   for(const u of fresh.values()){b.units.push(u);b.byId.set(u.id,u);}
   const claim=u=>{if(u.health.current>0){b.cells.set(cell(u.x,u.y),u.id);if(u.step)b.reservations.set(cell(u.step.x,u.step.y),u.id);b.spatial.move(u);}else b.spatial.remove(u);};
   for(const id of relocated)claim(b.byId.get(id));
   for(const u of fresh.values())claim(u);
  }
  for(const [id,equipment] of frame.equipment){const u=b.byId.get(id);if(u?.character)u.character.equipment=equipment;}
  for(const g of frame.groups)groupsFor(b).set(g.id,g);
  for(const s of frame.squads){if(s.order){s.order.goals=new Map(s.order.goals);if(s.order.travelOffsets)s.order.travelOffsets=new Map(s.order.travelOffsets);}squadsFor(b).set(s.id,s);}
  const flags=frame.match.flags;Object.assign(m,frame.match);
  for(const team of ['A','B'])b.byId.set(m.flags[team].id,flags[team]);
  b.time=frame.time;b.nextId=frame.nextId;
  return true;
 }catch{return false;}
}
