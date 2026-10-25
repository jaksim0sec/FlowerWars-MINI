import test from 'node:test';import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
import {setupMovementScenario,startMovementScenario,movementStats} from '../src/movement-scenarios.mjs';
for(const type of ['crossing','bottleneck','obstacles','crowd'])test(`test setting ${type} is deterministic and starts all commands`,()=>{
 const b=new Board(),s=setupMovementScenario(b,type,16,()=>null);
 assert.equal(b.units.length,16);assert.equal(s.orders.length,16);assert.equal(movementStats(b,s).arrived,0);
 assert.equal(startMovementScenario(b,s),16);
 for(let frame=0;frame<6000;frame++)b.update(.02);
 assert.equal(movementStats(b,s).arrived,16);
 const c=new Board(),other=setupMovementScenario(c,type,16,()=>null);
 assert.deepEqual(other.orders,s.orders);assert.equal(c.navigation.stats.fieldBuilds,0);
});
test('1000-unit setting uses unique valid positions/goals and begins in parallel',()=>{
 const b=new Board(),s=setupMovementScenario(b,'crowd',1000,()=>null);assert.equal(b.units.length,1000);
 assert.equal(new Set(s.orders.map(o=>`${o.x},${o.y}`)).size,1000);
 assert.equal(startMovementScenario(b,s),1000);b.update(.1);
 assert.ok(b.units.filter(u=>u.step).length>10);
 assert.equal(b.navigation.stats.fieldBuilds,0,'open terrain uses an analytic distance without full map searches');
 for(let i=0;i<6000;i++)b.update(.02);
 assert.equal(movementStats(b,s).arrived,1000,'temporary yields must not leave a unit stranded far from its route');
});
test('test factions are assigned before start, then optional combat activates on start',()=>{
 const b=new Board(),s=setupMovementScenario(b,'skirmish',16,()=>null,{combat:true,statsFor:()=>({maxHealth:60,damage:25,attackPeriod:.65})});
 assert.equal(s.type,'skirmish');assert.equal(s.combat,true);assert.equal(b.units.filter(u=>u.team==='A').length,8);assert.equal(b.units.filter(u=>u.team==='B').length,8);
 b.update(1);assert.equal(b.combatStats.attacks,0);assert.ok(b.units.every(u=>u.health.current===60));
 startMovementScenario(b,s);b.update(.5);assert.ok(b.combatStats.hits>0);assert.ok(movementStats(b,s).teams.A>0);b.update(5);assert.ok(movementStats(b,s).casualties>0);
});
