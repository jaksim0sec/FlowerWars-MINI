import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
import {FlagMatch} from '../src/flag-match.mjs';
import {squadsFor,createFormationGroup} from '../src/unit-groups.mjs';
import {deployReserves} from './deployment-helpers.mjs';
function game(count=240){const b=new Board(),m=new FlagMatch(b,{count,scenario:'envelopment',makeCharacter:s=>({characterId:s.characterId})});deployReserves(m,'mixed');m.start();return {b,m};}
test('every living bot squad has one registered command role and even small armies retain a flag guard',()=>{
 for(const size of [12,48,240,500]){
  const {b,m}=game(size);assert.ok(m.command);
  const ids=[...m.command.registry.values()].flatMap(set=>[...set]);
  assert.equal(new Set(ids).size,ids.length);assert.equal(ids.length,m.squadIds.B.length);
  assert.ok([...m.command.registry.get('guard')].some(id=>squadsFor(b).get(id).memberIds.some(uid=>b.unit(uid).health.current>0)));
 }
});
test('guards ignore distant bait and cannot walk outside their flag defense leash',()=>{
 const {b,m}=game(),id=[...m.command.registry.get('guard')][0],s=squadsFor(b).get(id);
 m.think(id);assert.notEqual(s.order?.type,'focus');
 const u=b.unit(s.memberIds[0]);
 assert.equal(b.movementPolicy.beforeStep({unit:u,to:{x:50,y:20}}),'wait');
});
test('scenario reserves wait, then exploit a sustained supported gap; a home breach contracts defense',()=>{
 const {b,m}=game();m.command.refresh();
 assert.equal(m.command.scenario.id,'envelopment');
 const mobile=[...m.command.operations.values()].find(o=>o.role==='mobile');assert.ok(mobile);
 assert.equal(m.command.planFor(mobile).stage,'reserve');
 for(let i=0;i<8;i++){m.elapsed+=1;m.command.refresh();}
 assert.ok(m.command.events.some(e=>e.type==='gap-opened'));
 const intruder=b.units.find(u=>u.team==='A');b.cells.delete(intruder.y*100+intruder.x);intruder.x=intruder.visualX=95;intruder.y=intruder.visualY=50;b.spatial.move(intruder);b.cells.set(5095,intruder.id);
 m.command.refresh();assert.equal(m.command.mode,'contract');
 assert.ok([...m.command.operations.values()].filter(o=>o.role==='guard').every(o=>m.command.planFor(o).goal.x>=86));
});
test('recruitment accepts updated shared blueprints without fixed bot type IDs',()=>{
 const blueprint=createFormationGroup(12,'squad','수정 편성','defense');blueprint.squadType='updated-formation';
 const b=new Board(),m=new FlagMatch(b,{count:48,blueprints:[blueprint],makeCharacter:s=>({characterId:s.characterId})});
 m.start();assert.equal(m.counts.B,48);assert.ok(m.squadIds.B.every(id=>squadsFor(b).get(id).type==='updated-formation'));
});
test('updated eight-member templates spend actual reserves and still deploy the exact army cap',()=>{
 const bp=createFormationGroup(8,'squad','','defense');bp.squadType='smaller-template';
 const b=new Board(),m=new FlagMatch(b,{count:48,blueprints:[bp],makeCharacter:s=>({characterId:s.characterId})});
 m.start();assert.equal(m.reserve.B,0);assert.equal(m.counts.B,48);assert.equal(m.squadIds.B.length,6);
});
test('a middle front advances when there is no wing army to wait for',()=>{
 const {m}=game(96);assert.ok(m.command.frontX[1]<64);
});
test('reinforced flag-defense destinations remain inside the leash after contraction ends',()=>{
 const {b,m}=game(500),u=b.units.find(u=>u.team==='A'),original={x:u.x,y:u.y};
 const move=p=>{b.cells.delete(u.y*100+u.x);u.x=u.visualX=p.x;u.y=u.visualY=p.y;b.cells.set(p.y*100+p.x,u.id);b.spatial.move(u);};
 move({x:94,y:50});m.command.refresh();move(original);m.elapsed+=7;m.command.refresh();
 const guards=[...m.command.operations.values()].filter(o=>o.role==='guard');assert.ok(guards.length>=3);
 for(const op of guards)for(const id of op.liveIds){
  const goal=m.command.planFor(op).guardGoals.get(id),count=m.command.states.get(id).count;
  assert.ok(goal);assert.ok(goal.x+Math.ceil((count-1)/2)<=99);
  assert.ok(Math.max(Math.abs(goal.x-95),Math.abs(goal.y-50),Math.abs(goal.x+Math.ceil((count-1)/2)-95),Math.abs(goal.y+1-50))<=16);
  m.think(id);const s=squadsFor(b).get(id);assert.ok([...s.order.goals.values()].every(p=>Math.max(Math.abs(p.x-95),Math.abs(p.y-50))<=16));
 }
});
test('lost guard operations are replaced using existing living IDs without spawning soldiers',()=>{
 const {b,m}=game(),before=b.units.length;
 for(const op of m.command.operations.values())if(op.role==='guard')for(const id of op.squadIds)for(const uid of squadsFor(b).get(id).memberIds)b.damage(uid,10000);
 m.command.refresh();assert.equal(b.units.length,before);
 assert.ok([...m.command.registry.get('guard')].some(id=>squadsFor(b).get(id).memberIds.some(uid=>b.unit(uid)?.health.current>0)));
});
test('penetration transitions to a rear attack only after the raiders pass the opposing front',()=>{
 const {b,m}=game();for(let i=0;i<8;i++){m.elapsed++;m.command.refresh();}
 const op=[...m.command.operations.values()].find(o=>o.role==='mobile'),screen=squadsFor(b).get(op.squadIds[0]);
 assert.equal(m.command.planFor(op).stage,'penetrate');
 const units=screen.memberIds.map(id=>b.unit(id));for(const u of units)b.cells.delete(u.y*100+u.x);
 units.forEach((u,i)=>{u.x=u.visualX=8+i%4;u.y=u.visualY=50+Math.floor(i/4);b.cells.set(u.y*100+u.x,u.id);b.spatial.move(u);});
 m.command.refresh();assert.equal(m.command.planFor(op).stage,'rear-attack');assert.ok(m.command.events.some(e=>e.type==='rear-attack'));
});
