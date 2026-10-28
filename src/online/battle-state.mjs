import {Board} from '../model.mjs';
import {combatAnimationElapsed} from '../combat.mjs';
import {FlagMatch} from '../flag-match.mjs';
import {Navigation} from '../navigation.mjs';
import {SpatialIndex} from '../spatial-index.mjs';
import {updateSquadOrders} from '../squad-orders.mjs';
import {exportGroupRegistry,importGroupRegistry} from '../unit-groups.mjs';
import {encodeStateGraph,decodeStateGraph} from './state-graph.mjs';

export const MAX_BATTLE_SNAPSHOT_BYTES=8*1024*1024-1024;
const VERSION=1,ADAPTER='battle-v1';
// The durable schema deliberately excludes navigation work queues, render data,
// DOM/catalog references and character.animation (the renderer puts a unit copy
// there, including a cycle through character). Search caches restart cold.
const UNIT_FIELDS='character unitType health priorityKey movement capabilities team combat strike damage id x y visualX visualY state elapsed facing path target command step route waitReason hits impacted healing groupId memberIndex formationRole squadId formationSquadIndex formationSquadLabel formationSquadType formationPlatoonIndex attackVector deathDirection lastMoveGoal marchStepTime squadRoute guide guideKey retryAt waitSince yieldUntil courtesy remoteCourtesy courtesyReturn coopRetryAt congestionReplan nextCongestionReplan recoveryRetryAt'.split(' ');
const CHARACTER_FIELDS='characterId health equipment appearance testName testStats testMovement testCapabilities'.split(' ');
const BOARD_FIELDS='width height seed navigationOrientation time nextId navClock decisionEpoch flows terrain obstacles terrainRevision obstacleRevision battlefield combatStats effects'.split(' ');
const MATCH_FIELDS='phase remaining winner flags counts squadIds elapsed nextStatus nextDecision cursor decisions statusRevision nextSurvey limit reserve centers recruitment squadSize operationSize'.split(' ');
const GROUP_FIELDS='id name kind team anchor blueprint memberIds squads commanderId platoons'.split(' ');
const SQUAD_FIELDS='id groupId name team type platoonIndex platoonId leaderId memberIds stance formation order actingLeaderId matchIndex'.split(' ');
const ORDER_FIELDS='type source target dirty previous goals lastMembers facing phase waypoints forward after travelOffsets cover coverAt nextOccupancyCheck nextRelayAt nextPassingAt marchRoute formed total reformRetryAt activeReformId reformBuffer reformFailed reformOccupancy'.split(' ');
const select=(object,fields)=>Object.fromEntries(fields.filter(k=>Object.hasOwn(object,k)&&object[k]!==undefined).map(k=>[k,object[k]]));
const finite=(v,min=0,max=1e12)=>Number.isFinite(v)&&v>=min&&v<=max;
const integer=(v,min=0,max=1e12)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const identifier=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(v);
const exact=(o,keys)=>o&&typeof o==='object'&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
const only=(o,fields)=>o&&Object.getPrototypeOf(o)===Object.prototype&&Object.keys(o).every(k=>fields.includes(k));
const health=h=>h&&finite(h.max,1,1e9)&&finite(h.current,0,h.max)&&(h.injury===undefined||finite(h.injury,0,1))&&(h.critical===undefined||finite(h.critical,0,1));
const fail=()=>{throw new Error('INVALID_STATE');};
export function createBattleState(matchId,{seed=1,makeCharacter,optionsFor,unitProfiles}={}){
 if(!identifier(matchId)||!integer(seed,0,4294967295))fail();
 const board=new Board();new FlagMatch(board,{seed,makeCharacter,optionsFor,unitProfiles,multiplayer:true});return {matchId,board};
}
export function stepBattle(state,dt){
 if(!state?.board||!Number.isFinite(dt)||dt<=0)return;
 while(dt>1e-9){const slice=Math.min(dt,.05);state.board.update(slice);state.board.match.update(slice);updateSquadOrders(state.board);dt-=slice;}
}
// Produce a self-contained data-only graph while the host is at one tick.
// The Worker can then encode, validate, hash and size-check without live state.
function cloneProjected(value,projections,seen=new Map()){
 if(value===null||typeof value!=='object')return value;
 if(seen.has(value))return seen.get(value);
 const projected=projections.get(value)||value;let copy;
 if(Array.isArray(projected))copy=[];
 else if(projected instanceof Map)copy=new Map();
 else if(projected instanceof Set)copy=new Set();
 else if(ArrayBuffer.isView(projected))copy=new projected.constructor(projected);
 else if(Object.getPrototypeOf(projected)===Object.prototype||Object.getPrototypeOf(projected)===null)copy={};
 else fail();
 seen.set(value,copy);
 if(Array.isArray(projected)){for(const item of projected)copy.push(cloneProjected(item,projections,seen));}
 else if(projected instanceof Map){for(const[k,v]of projected)copy.set(cloneProjected(k,projections,seen),cloneProjected(v,projections,seen));for(const[k,v]of Object.entries(projected))copy[k]=cloneProjected(v,projections,seen);}
 else if(projected instanceof Set){for(const item of projected)copy.add(cloneProjected(item,projections,seen));}
 else if(!ArrayBuffer.isView(projected)){for(const[k,v]of Object.entries(projected))copy[k]=cloneProjected(v,projections,seen);}
 return copy;
}
function durable(state){
 const b=state.board,m=b?.match;if(!(b instanceof Board)||!(m instanceof FlagMatch)||!m.multiplayer||b.navigation.collecting)fail();
 const registry=exportGroupRegistry(b),projections=new Map();
 for(const u of b.units){projections.set(u,select(u,UNIT_FIELDS));if(u.character)projections.set(u.character,select(u.character,CHARACTER_FIELDS));}
 for(const g of registry.groups.values())projections.set(g,select(g,GROUP_FIELDS));
 for(const s of registry.squads.values()){projections.set(s,select(s,SQUAD_FIELDS));if(s.order)projections.set(s.order,select(s.order,ORDER_FIELDS));}
 const root={board:select(b,BOARD_FIELDS),match:select(m,MATCH_FIELDS),units:b.units,registry,cooperations:b.navigation.cooperations,navigation:{cursor:b.navigation.cursor,remaining:b.navigation.remaining}};
 for(const chain of b.navigation.cooperations)if(chain.remote?.order&&!projections.has(chain.remote.order))projections.set(chain.remote.order,select(chain.remote.order,ORDER_FIELDS));
 return {source:cloneProjected(root,projections)};
}
function assertDurable(root){
 if(!exact(root,['board','match','units','registry','cooperations','navigation']))fail();
 const {board:b,match:m,units,registry:r}=root;
 if(!only(b,BOARD_FIELDS)||b.width!==176||b.height!==128||!integer(b.seed,0,4294967295)||!integer(b.nextId,1)||!finite(b.time)||!finite(b.navClock,0,1)||!integer(b.decisionEpoch)||![1,-1].includes(b.navigationOrientation)||!Array.isArray(b.effects)||b.effects.length>10000||!Array.isArray(units)||units.length>1400)fail();
 if(!Array.isArray(b.terrain)||b.terrain.length!==b.height||!b.terrain.every(row=>Array.isArray(row)&&row.length===b.width&&row.every(t=>['grass','soil','forest','road','void'].includes(t)))||!(b.obstacles instanceof Map)||b.obstacles.size>b.width*b.height)fail();
 for(const[k,v]of b.obstacles)if(!integer(k,0,b.width*b.height-1)||!v||typeof v.kind!=='string'||v.blocked!==undefined&&typeof v.blocked!=='boolean')fail();
 if(!only(m,MATCH_FIELDS)||!['preparation','battle','finished'].includes(m.phase)||!finite(m.elapsed)||!finite(m.remaining,0,300)||![null,'A','B','draw'].includes(m.winner)||!integer(m.limit,1,350)||!(m.recruitment instanceof Map)||m.recruitment.size<1||m.recruitment.size>32)fail();
 for(const team of ['A','B']){
  if(!integer(m.reserve?.[team],0,m.limit)||!integer(m.counts?.[team],0,m.limit)||!Array.isArray(m.squadIds?.[team]))fail();
  const f=m.flags?.[team];if(!f||f.id!==(team==='A'?-1:-2)||f.team!==team||f.structure!=='flag'||!health(f.health)||!integer(f.x,0,b.width-1)||!integer(f.y,0,b.height-1))fail();
 }
 if(!exact(r,['groups','squads','next'])||!(r.groups instanceof Map)||!(r.squads instanceof Map)||!integer(r.next,1)||r.groups.size>2048||r.squads.size>2048||!(root.cooperations instanceof Set)||root.cooperations.size>16||!exact(root.navigation,['cursor','remaining'])||!integer(root.navigation.cursor)||!integer(root.navigation.remaining,0,2048))fail();
 const ids=new Set(),cells=new Map(),reservations=new Map(),counts={A:0,B:0};
 const point=p=>p&&integer(p.x,0,b.width-1)&&integer(p.y,0,b.height-1);
 for(const u of units){
  if(!only(u,UNIT_FIELDS)||!integer(u.id,1)||u.id>=b.nextId||ids.has(u.id)||!['A','B'].includes(u.team)||!point(u)||!finite(u.visualX,0,b.width-1)||!finite(u.visualY,0,b.height-1)||!health(u.health)||!['idle','walk','attack','hit','death'].includes(u.state)||!finite(u.elapsed)||![-1,1].includes(u.facing)||!finite(u.damage,0,1e9)||!u.combat||!finite(u.combat.period,.001,1e5)||!finite(u.combat.range,0,512)||!finite(u.combat.nextAttackAt)||!finite(u.combat.nextSearchAt)||!u.movement||!finite(u.movement.stepTime,.001,1e5)||!Array.isArray(u.capabilities)||!Array.isArray(u.path)||!Array.isArray(u.route))fail();
  if(u.character&&(!only(u.character,CHARACTER_FIELDS)||typeof u.character.characterId!=='string'||u.character.health!==u.health||!u.character.equipment||!u.character.appearance))fail();
  if(u.command&&(!['move','attack'].includes(u.command.type)||u.command.type==='move'&&!point(u.command)||u.command.type==='attack'&&!integer(u.command.target,-2)))fail();
  if(u.strike&&(!integer(u.strike.target,-2)||!finite(u.strike.duration,.001,1e5)||!finite(u.strike.impactTime,0,u.strike.duration)))fail();
  ids.add(u.id);
  if(u.health.current>0){counts[u.team]++;const key=u.y*b.width+u.x;if(cells.has(key)||b.obstacles.get(key)?.blocked!==false&&b.obstacles.has(key))fail();cells.set(key,u.id);}
  if(u.step){if(!point(u.step)||u.health.current<=0||!finite(u.step.duration,.001,1e5)||!finite(u.step.elapsed,0,u.step.duration)||Math.abs(u.step.x-u.x)+Math.abs(u.step.y-u.y)!==1)fail();const key=u.step.y*b.width+u.step.x;if(reservations.has(key)||b.obstacles.get(key)?.blocked!==false&&b.obstacles.has(key))fail();reservations.set(key,u.id);}
 }
 if(counts.A>m.limit||counts.B>m.limit)fail();for(const[key,id]of reservations)if(cells.has(key)&&cells.get(key)!==id)fail();
 for(const[id,g]of r.groups){if(!only(g,GROUP_FIELDS)||id!==g.id||typeof id!=='string'||!['A','B'].includes(g.team)||!Array.isArray(g.memberIds)||g.memberIds.some(n=>!integer(n,1)))fail();}
 for(const[id,s]of r.squads){if(!only(s,SQUAD_FIELDS)||id!==s.id||typeof id!=='string'||!r.groups.has(s.groupId)||!['A','B'].includes(s.team)||!Array.isArray(s.memberIds)||s.memberIds.some(n=>!integer(n,1)))fail();if(s.order&&(!only(s.order,ORDER_FIELDS)||!(s.order.goals instanceof Map)||s.order.travelOffsets&&!(s.order.travelOffsets instanceof Map)))fail();if(s.order)for(const[n,p]of s.order.goals)if(!integer(n,1)||!point(p))fail();}
 for(const u of units)if(u.squadId&&!r.squads.has(u.squadId)||u.groupId&&!r.groups.has(u.groupId))fail();
 for(const c of root.cooperations){if(!units.includes(c?.root)||!Array.isArray(c.records)||c.records.length>32||!integer(c.cursor,-1,32)||!finite(c.until))fail();for(const record of c.records){const u=units.find(u=>u.id===record.id);if(!u||record.command!==u.command||u.courtesy?.chain!==c)fail();}if(c.remote&&(![...r.squads.values()].includes(c.remote.squad)||!only(c.remote.order,ORDER_FIELDS)||!(c.remote.order.goals instanceof Map)||!point(c.remote.goal)))fail();}
 return root;
}
async function digest(body){const result=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(body)));return Array.from(new Uint8Array(result),n=>n.toString(16).padStart(2,'0')).join('');}
// Capture one consistent simulation instant; heavy verification and hashing may run in a Worker.
export function captureBattleState(state,sequence){
 if(!identifier(state?.matchId)||!integer(sequence))fail();
 let data;try{data=durable(state);}catch(cause){throw new Error('INVALID_STATE',{cause});}
 return {version:VERSION,adapter:ADAPTER,matchId:state.matchId,sequence,state:data};
}
export async function sealBattleState(draft){
 if(!exact(draft,['version','adapter','matchId','sequence','state'])||draft.version!==VERSION||draft.adapter!==ADAPTER||!identifier(draft.matchId)||!integer(draft.sequence)||!exact(draft.state,['source']))fail();
 let graph;try{graph=encodeStateGraph(draft.state.source);assertDurable(decodeStateGraph(graph));}catch(cause){throw new Error('INVALID_STATE',{cause});}
 const snapshot={version:VERSION,adapter:ADAPTER,matchId:draft.matchId,sequence:draft.sequence,state:{graph}};
 snapshot.hash=await digest(snapshot);
 if(new TextEncoder().encode(JSON.stringify(snapshot)).length>MAX_BATTLE_SNAPSHOT_BYTES)fail();
 return snapshot;
}
export async function saveBattleState(state,sequence){return sealBattleState(captureBattleState(state,sequence));}
async function validated(snapshot){
 if(!exact(snapshot,['version','adapter','matchId','sequence','state','hash'])||snapshot.version!==VERSION||snapshot.adapter!==ADAPTER||!identifier(snapshot.matchId)||!integer(snapshot.sequence)||typeof snapshot.hash!=='string'||!/^[a-f0-9]{64}$/.test(snapshot.hash)||new TextEncoder().encode(JSON.stringify(snapshot)).length>MAX_BATTLE_SNAPSHOT_BYTES||!exact(snapshot.state,['graph']))throw new Error('INVALID_SNAPSHOT');
 const {hash,...body}=snapshot;if(hash!==await digest(body))throw new Error('INVALID_SNAPSHOT');return assertDurable(decodeStateGraph(snapshot.state.graph));
}
export async function validateBattleState(snapshot){try{await validated(snapshot);return true;}catch{return false;}}
export async function restoreBattleState(snapshot){
 let data;try{data=await validated(snapshot);}catch{throw new Error('INVALID_SNAPSHOT');}
 const state=createBattleState(snapshot.matchId,{seed:data.board.seed}),b=state.board,m=b.match;Object.assign(b,data.board);Object.assign(m,data.match);m.board=b;m.epoch=b.byId;b.units=data.units;b.byId=new Map(b.units.map(u=>[u.id,u]));m.epoch=b.byId;
 for(const f of Object.values(m.flags))b.byId.set(f.id,f);
 b.cells=new Map();b.reservations=new Map();b.navigation=new Navigation(b);b.spatial=new SpatialIndex(b.width,b.height);Object.assign(b.navigation,data.navigation);b.navigation.cooperations=data.cooperations;importGroupRegistry(b,data.registry);
 for(const u of b.units){
  if(u.character)u.character.animation={state:u.state,elapsed:combatAnimationElapsed(u),facing:u.facing,phase:u.id,attackVector:u.attackVector};
  if(u.health.current<=0)continue;b.cells.set(u.y*b.width+u.x,u.id);if(u.step)b.reservations.set(u.step.y*b.width+u.step.x,u.id);b.spatial.add(u);b.navigation.touch(u.x,u.y);if(u.step)b.navigation.touch(u.step.x,u.step.y);
 }
 return state;
}
