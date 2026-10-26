import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
import {FlagMatch} from '../src/flag-match.mjs';
import {squadsFor,createFormationGroup} from '../src/unit-groups.mjs';
import {availableSquadBlueprints,createFormationGroup as squadBlueprint} from '../src/unit-groups.mjs';
const legacyBlueprints=()=>availableSquadBlueprints().map(bp=>squadBlueprint(12,'squad','',bp.squadType));
import {deployReserves} from './deployment-helpers.mjs';
function game(count=240){const b=new Board(),m=new FlagMatch(b,{blueprints:legacyBlueprints(),count,scenario:'envelopment',makeCharacter:s=>({characterId:s.characterId})});deployReserves(m,'mixed');m.start();return {b,m};}
function breachHome(b,m){
 const intruders=b.units.filter(u=>u.team==='A').slice(0,2);
 intruders.forEach((u,i)=>{b.cells.delete(u.y*100+u.x);u.x=u.visualX=94-i;u.y=u.visualY=50;b.spatial.move(u);b.cells.set(50*100+u.x,u.id);});
 m.command.refresh();
}
test('bot commits available squads to the front until its rear is breached',()=>{
 for(const size of [12,48,240,350]){
  const {b,m}=game(size),ids=[...m.command.registry.values()].flatMap(set=>[...set]);
  assert.equal(new Set(ids).size,ids.length);assert.equal(ids.length,m.squadIds.B.length);
  assert.equal(m.command.registry.get('guard').size,0);
  assert.ok([...m.command.registry.get('front'),...m.command.registry.get('breach')].length>0);
 }
});
test('rear breach promotes existing squads to guard within the flag leash',()=>{
 const {b,m}=game();breachHome(b,m);assert.equal(m.command.mode,'contract');
 const id=[...m.command.registry.get('guard')][0],s=squadsFor(b).get(id);assert.ok(s);
 m.think(id);assert.notEqual(s.order?.type,'focus');
 const u=b.unit(s.memberIds[0]);assert.equal(b.movementPolicy.beforeStep({unit:u,to:{x:50,y:20}}),'wait');
});
test('mobile reserves exploit a gap, then react only to a serious home breach',()=>{
 const {b,m}=game();m.command.refresh();
 assert.equal(m.command.scenario.id,'envelopment');
 const mobile=[...m.command.operations.values()].find(o=>o.role==='mobile');assert.ok(mobile);
 assert.equal(m.command.planFor(mobile).stage,'reserve');
 for(let i=0;i<8;i++){m.elapsed+=1;m.command.refresh();}
 assert.ok(m.command.events.some(e=>e.type==='gap-opened'));
 breachHome(b,m);assert.equal(m.command.mode,'contract');
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
test('emergency guard destinations stay inside the flag leash',()=>{
 const {b,m}=game(350);breachHome(b,m);
 const guards=[...m.command.operations.values()].filter(o=>o.role==='guard');assert.ok(guards.length);
 for(const op of guards)for(const id of op.liveIds){
  const goal=m.command.planFor(op).guardGoals.get(id),count=m.command.states.get(id).count;
  assert.ok(goal);assert.ok(goal.x+Math.ceil((count-1)/2)<=99);
  assert.ok(Math.max(Math.abs(goal.x-95),Math.abs(goal.y-50),Math.abs(goal.x+Math.ceil((count-1)/2)-95),Math.abs(goal.y+1-50))<=16);
 }
});
test('lost emergency guards are replaced with existing living squads',()=>{
 const {b,m}=game(),before=b.units.length;breachHome(b,m);
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
test('flag damage alone recalls reinforcements without multiple intruders',()=>{
 const {m}=game();assert.equal(m.command.mode,'advance');
 m.command.nextRefresh=99;m.damageFlag('B',1);assert.equal(m.command.nextRefresh,0);
 m.command.refresh();assert.equal(m.command.mode,'contract');assert.ok(m.command.registry.get('guard').size>0);
});
