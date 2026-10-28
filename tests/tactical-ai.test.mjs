import test from 'node:test';
import {readFileSync} from 'node:fs';
const profiles=JSON.parse(readFileSync(new URL('../assets/characters.json',import.meta.url))).characters;
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
import {FlagMatch} from '../src/flag-match.mjs';
import {squadsFor,createFormationGroup,placeGroup} from '../src/unit-groups.mjs';
import {updateSquadOrders,orderSquad} from '../src/squad-orders.mjs';
import {deployReserves} from './deployment-helpers.mjs';
import {TacticalController} from '../src/ai/controller.mjs';
import {createRecruitmentCatalog} from '../src/bot-doctrines.mjs';
import {layoutDeployment} from '../src/deployment-layout.mjs';
import {evaluate} from '../src/ai/principles.mjs';
function game(count=144,seed=73){const b=new Board(),m=new FlagMatch(b,{count,seed,aiImplementation:'utility',unitProfiles:profiles,makeCharacter:s=>({characterId:s.characterId}),optionsFor:c=>({stats:profiles[c.characterId].testCombat,movement:profiles[c.characterId].testMovement})});deployReserves(m);m.start();return {b,m,ai:m.command};}
function relocate(b,units,anchor){for(const u of units){b.interrupt(u);b.cells.delete(u.y*b.width+u.x);b.spatial.remove(u);}let i=0;for(let r=0;r<20&&i<units.length;r++)for(let dx=-r;dx<=r&&i<units.length;dx++)for(let dy=-r;dy<=r&&i<units.length;dy++){if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;const x=anchor.x+dx,y=anchor.y+dy;if(!b.inside(x,y)||b.occupied(x,y)||b.navigation.blocked(y*b.width+x))continue;const u=units[i++];u.x=u.visualX=x;u.y=u.visualY=y;b.cells.set(y*b.width+x,u.id);b.spatial.add(u);}assert.equal(i,units.length);}
test('FlagMatch selects utility explicitly and retains the legacy implementation for comparisons',()=>{assert.equal(new FlagMatch(new Board(),{count:12,aiImplementation:'utility'}).command.scenario.id,'utility');assert.notEqual(new FlagMatch(new Board(),{count:12,aiImplementation:'legacy'}).command.scenario.id,'utility');});
test('regional topology uses variable path/room geometry and invalidates once per obstacle revision',()=>{
 const {b,ai}=game();const builds=ai.observer.builds;for(let i=0;i<4;i++)ai.refresh();assert.equal(ai.observer.builds,builds);
 assert.ok(ai.observer.nodes.some(n=>n.kind==='counter'));assert.ok(ai.observer.nodes.some(n=>n.kind==='defense'));
 const p=ai.observer.nodes.find(n=>!b.occupied(n.x,n.y));b.setTerrain(p.x,p.y,'forest');ai.refresh();assert.equal(ai.observer.builds,builds+1);assert.ok(ai.observer.nodes.every(n=>!b.navigation.blocked(n.y*b.width+n.x)));
});
test('impossible candidates are rejected and stronger resistance reduces breakthrough utility',()=>{
 const c={intent:'BREAKTHROUGH',node:{kind:'battle'},local:{A:4,B:0,congestion:0,heal:0},progress:.5,value:0,travel:20,exposure:0},force={power:20,ratio:1,speed:3};
 assert.equal(evaluate({...c,travel:Infinity},force),-Infinity);assert.ok(evaluate(c,force)>evaluate({...c,local:{...c.local,A:40}},force));
});
test('every living bot squad belongs to one persistent operation and unchanging decisions deduplicate',()=>{
 const {m,ai}=game();const before=[...ai.operations.values()].map(o=>[o.index,o.nodeId,o.changedAt]);for(const id of m.squadIds.B){m.think(id);m.think(id);}ai.refresh();
 const ids=[...ai.operations.values()].flatMap(o=>o.squadIds);assert.equal(ids.length,new Set(ids).size);assert.equal(ids.length,m.squadIds.B.length);assert.ok(ai.metrics.deduplicated>0);assert.deepEqual([...ai.operations.values()].map(o=>[o.index,o.nodeId,o.changedAt]),before);
});
test('a single feint leaves attackers committed; flag damage dispatches only sufficient nearby reinforcements',()=>{
 const {b,m,ai}=game(350),intruder=b.units.find(u=>u.team==='A');relocate(b,[intruder],{x:m.flags.B.x-3,y:m.flags.B.y});ai.refresh();assert.equal(ai.mode,'advance');
 m.damageFlag('B',1);ai.refresh();assert.equal(ai.mode,'contract');assert.ok(ai.registry.get('guard').size>0);assert.ok(ai.registry.get('guard').size<m.squadIds.B.length);
});
test('genuine rear breakthrough dispatches defenders even before the flag is damaged',()=>{
 const {b,m,ai}=game(350);relocate(b,b.units.filter(u=>u.team==='A').slice(0,20),{x:m.flags.B.x-6,y:m.flags.B.y});ai.refresh();assert.equal(ai.mode,'contract');assert.ok(ai.registry.get('guard').size>0);
});
test('late support does not halt fighters and orphaned medics acquire a living host',()=>{
 const {b,m,ai}=game(350),op=[...ai.operations.values()].find(o=>o.squadIds.some(id=>ai.states.get(id)?.heal>3));assert.ok(op);
 const support=op.squadIds.map(id=>ai.states.get(id)).find(s=>s.heal>3),front=op.squadIds.map(id=>ai.states.get(id)).find(s=>s.id!==support.id);assert.ok(front);
 relocate(b,support.units,{x:m.flags.B.x-2,y:m.flags.B.y+10});ai.refresh();m.think(front.id);assert.notEqual(front.squad.order?.type,'hold');
 for(const id of [...op.squadIds])if(id!==support.id)for(const uid of squadsFor(b).get(id).memberIds)b.damage(uid,10000);
 // Only medics remaining is the actual orphan condition; mixed squads remain combat-capable.
 for(const u of support.units)if(!u.healing&&u.formationRole!=='banner')b.damage(u.id,10000);
 ai.refresh();assert.notEqual(support.squad.botOperation,op);
});
test('stalls use measured displacement, trigger bounded replanning, and combat is not classified as stalled',()=>{
 const {m,ai}=game(),op=[...ai.operations.values()][0];op.route=[{x:5,y:55}];op.waypoint=0;op.goal={x:5,y:55};op.lastProgressAt=-30;op.bestDistance=0;op.changedAt=-30;m.elapsed=20;ai.refresh();assert.ok(ai.metrics.stalls>0);assert.equal(op.lastProgressAt,20);
 const replans=ai.metrics.replans;ai.refresh();assert.equal(ai.metrics.replans,replans);
});
test('command gateway rejects enemy ownership and disconnected or blocked targets without resetting orders',()=>{
 const {b,m,ai}=game();const state=ai.states.values().next().value;const obstacle=[...b.obstacles.keys()][0],before=state.squad.order;
 assert.equal(ai.gateway.issue(state,'advance',{x:obstacle%b.width,y:Math.floor(obstacle/b.width)}),false);assert.equal(state.squad.order,before);
 const enemy=b.units.find(u=>u.team==='A');assert.equal(ai.gateway.issue(state,'focus',{unitId:state.units[0].id}),false);assert.equal(ai.gateway.issue({...state,squad:{...state.squad,team:enemy.team}},'hold'),false);
});
test('three maximum-size terrain seeds preserve collision, reservation and navigation budget invariants',()=>{
 for(const seed of [17,73,191]){const {b,m}=game(350,seed);assert.equal(m.counts.B,350);assert.equal(m.reserve.B,0);m.charge();for(let tick=0;tick<120;tick++){b.update(.05);m.update(.05);if(tick%2===0)updateSquadOrders(b);assert.ok(b.navigation.stats.lastExpansions<=2048);const cells=new Map();for(const u of b.units)if(u.health.current>0)for(const p of [u,...(u.step?[u.step]:[])]){const key=p.y*b.width+p.x;assert.equal(b.navigation.blocked(key),false);assert.ok(!cells.has(key)||cells.get(key)===u.id);cells.set(key,u.id);}}}
});
test('a terrain cut removes unreachable objectives before scoring without changing Navigation',()=>{
 const {b,m,ai}=game();for(let y=0;y<b.height;y++)b.setObstacle(72,y,{blocked:true});ai.observer.topology();
 assert.equal(ai.observer.travel(m.flags.B,m.flags.A),Infinity);assert.deepEqual(ai.observer.route(m.flags.B,m.flags.A),[]);
});
test('an exposed weak flank scores above an equally distant defended flank',()=>{
 const context={power:20,ratio:1,speed:3,reserve:false,homeDanger:false},candidate={intent:'FLANK',node:{kind:'flank'},travel:25,progress:.5,value:5,exposure:.8,local:{A:2,B:2,heal:0,congestion:0}};
 assert.ok(evaluate(candidate,context)>evaluate({...candidate,local:{...candidate.local,A:40,congestion:15},exposure:.1},context));
});
test('repeated nearby target changes do not interrupt an active strike or replace the strategic objective',()=>{
 const {b,m,ai}=game(),state=ai.states.values().next().value,op=state.squad.botOperation,intent=op.intent,node=op.nodeId;
 const enemy=b.units.find(u=>u.team==='A');state.engaged=1;
 for(let i=0;i<10;i++){assert.equal(ai.gateway.issue(state,'focus',{unitId:enemy.id}),false);m.elapsed+=.1;ai.refresh();}
 assert.equal(op.intent,intent);assert.equal(op.nodeId,node);
});
test('wounded forces without healers stop retreating after a bounded recovery attempt',()=>{
 const {b,m,ai}=game();for(const u of b.units)if(u.team==='B'&&u.healing)b.damage(u.id,10000);ai.refresh();
 const state=[...ai.states.values()].find(s=>s.squad.botRole!=='support');for(const u of state.units)if(u.health.current>0)b.damage(u.id,u.health.max*.8);
 ai.think(state.squad);assert.equal(state.squad.order?.type,'retreat');m.elapsed+=10;b.time+=10;ai.refresh();ai.think(state.squad);assert.equal(state.squad.aiRecovery,null);assert.equal(state.squad.aiRecoverySpent,true);assert.notEqual(state.squad.order?.type,'retreat');
});

test('utility recruitment responds to enemy capabilities without fixed squad type identifiers',()=>{
 const mobility=[];for(const type of ['ranged','defense']){const b=new Board(),m=new FlagMatch(b,{seed:73,aiImplementation:'utility',unitProfiles:profiles,makeCharacter:s=>({characterId:s.characterId}),optionsFor:c=>({stats:profiles[c.characterId].testCombat,movement:profiles[c.characterId].testMovement})});deployReserves(m,type);m.start();assert.equal(m.counts.B,350);mobility.push(m.squadIds.B.reduce((n,id)=>n+m.recruitment.get(squadsFor(b).get(id).type).features.speed,0));}assert.ok(mobility[0]>mobility[1]);
});

test('opposing forces engage in a four-tile passage without collisions or an idle strategic deadlock',()=>{
 const b=new Board(40,24);for(let y=0;y<24;y++)for(let x=0;x<40;x++)if(!(y>=10&&y<=13||x<10&&y>=5&&y<=18||x>=30&&y>=5&&y<=18))b.setObstacle(x,y,{blocked:true});
 b.battlefield={rooms:[{id:'home-A',kind:'staging',x:6,y:12,rx:4,ry:7},{id:'battle',kind:'battle',x:20,y:12,rx:4,ry:2},{id:'home-B',kind:'staging',x:34,y:12,rx:4,ry:7}],paths:[{id:'passage',kind:'main',points:[{x:6,y:12},{x:20,y:12},{x:34,y:12}],minWidth:4}],defenses:[]};
 const bp=layoutDeployment(createFormationGroup(6,'squad','','assault'),6,'');
 const a=placeGroup(b,bp,{x:7,y:12},{team:'A',autoCombat:true}),g=placeGroup(b,bp,{x:32,y:12},{team:'B',autoCombat:true});assert.ok(a&&g);
 const op={index:0,squadIds:g.squads,anchor:{x:32,y:12},needs:['screen']},s=squadsFor(b).get(g.squads[0]);s.botOperation=op;s.botSlot=0;
 const m={board:b,flags:{A:{x:3,y:12,health:{current:0}},B:{x:37,y:12,health:{current:0}}},botOperations:new Map([[0,op]]),squadIds:{A:a.squads,B:g.squads},recruitment:createRecruitmentCatalog([bp]),elapsed:0,limit:350,phase:'battle',refreshStatus(){}};
 b.match=m;const ai=new TacticalController(m);ai.refresh();orderSquad(b,a.squads[0],'advance',{x:32,y:12});let entered=false;
 for(let tick=0;tick<800;tick++){b.update(.05);m.elapsed+=.05;if(m.elapsed>=ai.nextRefresh)ai.refresh();if(tick%4===0)ai.think(s);if(tick%2===0)updateSquadOrders(b);
  const occupied=new Map();for(const u of b.units)if(u.health.current>0){if(u.team==='B'&&u.x<=24)entered=true;for(const p of [u,...(u.step?[u.step]:[])]){const n=p.y*b.width+p.x;assert.equal(b.navigation.blocked(n),false);assert.ok(!occupied.has(n)||occupied.get(n)===u.id);occupied.set(n,u.id);}}assert.ok(b.navigation.stats.lastExpansions<=2048);
 }
 assert.ok(entered);assert.ok(b.combatStats.attacks>0);assert.ok(ai.metrics.progress>0);
});
