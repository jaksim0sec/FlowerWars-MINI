import test from 'node:test';
import {readFileSync} from 'node:fs';
const profiles=JSON.parse(readFileSync(new URL('../assets/characters.json',import.meta.url))).characters;
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
import {FlagMatch} from '../src/flag-match.mjs';
import {choose} from '../src/ai/planner.mjs';
import {trackProgress} from '../src/ai/operations.mjs';
import {availableSquadBlueprints,createFormationGroup,placeGroup,squadsFor} from '../src/unit-groups.mjs';

test('manual mobile sizes and multi-squad platoons have distinct deployable seats and real commanders',()=>{
 for(const [count,kind,type]of [[8,'squad','mobile'],[10,'squad','mobile'],[12,'squad','mobile'],[32,'platoon','mixed']]){
  const plan=createFormationGroup(count,kind,'',type),b=new Board(90,50),g=placeGroup(b,plan,{x:30,y:15},{team:'A'});
  assert.ok(g,`${count} ${kind} must be deployable`);assert.equal(g.memberIds.length,count);assert.equal(b.cells.size,count);
  for(const id of g.squads)assert.ok(b.unit(squadsFor(b).get(id).leaderId));
 }
 const sizes=Object.fromEntries(availableSquadBlueprints().map(p=>[p.squadType,p.members.length]));assert.deepEqual(sizes,{mixed:12,defense:6,ranged:11,assault:12,mobile:10,support:12});
});
test('cached regional influence equals direct route-weighted observation and refreshes after terrain changes',()=>{
 const b=new Board(),m=new FlagMatch(b,{aiImplementation:'utility',count:96});m.start();const ai=m.command,o=ai.observer;
 for(const radius of [14,24])for(const p of o.nodes){const expected={A:0,B:0,heal:0,congestion:0};for(const r of ai.snapshot.regions){const d=o.travel(p,r.node);if(d>radius)continue;const w=1-d/(radius+1);expected.A+=r.A*w;expected.B+=r.B*w;expected.heal+=r.healingB*w;expected.congestion+=r.congestion*w;}assert.deepEqual(o.local(ai.snapshot,p,radius),expected);}
 const route=o.route(m.flags.B,m.flags.A);assert.ok(route.length);route.length=0;assert.ok(o.route(m.flags.B,m.flags.A).length);
 const cache=o.influence;const node=o.nodes.find(n=>!b.occupied(n.x,n.y));b.setObstacle(node.x,node.y,{blocked:true});ai.refresh();assert.notEqual(o.influence,cache);
});
test('protected firing squads keep useful attacks instead of following incidental screen movement',()=>{
 const b=new Board(),m=new FlagMatch(b,{aiImplementation:'utility',count:144,unitProfiles:profiles,makeCharacter:s=>({characterId:s.characterId}),optionsFor:c=>({stats:profiles[c.characterId].testCombat,movement:profiles[c.characterId].testMovement})});m.start();const ai=m.command,state=[...ai.states.values()].find(s=>s.fire>s.melee),screen=[...ai.states.values()].find(s=>s.shield>0);assert.ok(state&&screen);
 // Shared tactical estimates: the gun line is already screened and firing.
 state.x=screen.x+3;state.y=screen.y;for(const u of state.units)u.state='attack';let calls=0;ai.gateway.issue=()=>{calls++;return true;};ai.think(state.squad);assert.equal(calls,0);
});
test('spatial query caching stays exact across bucket crossings, reservations, death and reset',()=>{
 const b=new Board(40,30),a=b.spawn(7,8),c=b.spawn(10,8);const query=()=>[...b.spatial.candidates(8,8,4)];const initial=query();assert.deepEqual(query(),initial);
 assert.ok(b.spatial.queryStats.hits>0);b.beginStep(a,{x:8,y:8});assert.ok(a.step);assert.deepEqual(query(),initial);b.damage(c.id,10000);assert.ok(!query().includes(c.id));b.spatial.remove(a);assert.deepEqual(query(),[]);b.spatial.add(a);assert.deepEqual(query(),[a.id]);b.spatial.clear();assert.deepEqual(query(),[]);
});

test('valid committed operations skip candidate routes while emergency defense still replans',()=>{
 const m=new FlagMatch(new Board(),{aiImplementation:'utility',count:96}),ai=m.command;m.start();const op=[...ai.operations.values()][0],force=trackProgress(op,ai.states,ai.observer,m.elapsed,ai.metrics);op.arrived=false;
 let routes=0;const route=ai.observer.route.bind(ai.observer);ai.observer.route=(...args)=>{routes++;return route(...args);};
 const kept=choose(ai.observer,ai.snapshot,force,op,{homeDanger:false,reserve:false,claimed:new Map()});assert.equal(kept.intent,op.intent);assert.equal(kept.node.id,op.nodeId);assert.equal(routes,0);
 choose(ai.observer,ai.snapshot,force,op,{homeDanger:true,reserve:false,claimed:new Map()});assert.ok(routes>0);
 op.intent='COUNTERATTACK';op.nodeId='front-B';op.arrived=false;const next=choose(ai.observer,ai.snapshot,force,op,{homeDanger:false,reserve:false,claimed:new Map()});assert.notEqual(next.intent,'COUNTERATTACK');
});
