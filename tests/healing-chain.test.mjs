import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
import {createFormationGroup,placeGroup,squadsFor} from '../src/unit-groups.mjs';
import {orderSquad,updateSquadOrders,squadSummary} from '../src/squad-orders.mjs';
test('healers restore injured allies, respect cooldown and never damage enemies',()=>{
 const b=new Board(20,12),h=b.spawn(5,5,{characterId:'clover-mage'},{team:'A',autoCombat:true});
 const ally=b.spawn(6,5,null,{team:'A'}),enemy=b.spawn(5,6,null,{team:'B'});
 b.damage(ally.id,55);b.update(.8);assert.equal(ally.health.current,69);assert.equal(enemy.health.current,100);
 b.update(.5);assert.equal(ally.health.current,69);b.update(1);assert.equal(ally.health.current,93);
 assert.ok(b.effects.some(e=>e.healing));assert.ok(h.healing);
});
test('healing does not cross walls or revive a corpse',()=>{
 const b=new Board(12,10);b.spawn(3,5,{characterId:'clover-mage'},{team:'A'});
 const ally=b.spawn(5,5,null,{team:'A'});b.damage(ally.id,50);b.setObstacle(4,5,{blocked:true});b.update(3);assert.equal(ally.health.current,50);
 b.setObstacle(4,5,null);b.damage(ally.id,100);b.update(3);assert.equal(ally.health.current,0);
});
test('healing status is not a path wait and clears after a cast finishes',()=>{
 const b=new Board(60,35),g=placeGroup(b,createFormationGroup(12,'squad','지원','support'),{x:20,y:15},{team:'A',makeCharacter:m=>({characterId:m.characterId})}),s=squadsFor(b).get(g.squads[0]);
 const healer=s.memberIds.map(id=>b.unit(id)).find(u=>u.healing);healer.waitReason='healing';
 assert.equal(squadSummary(b,s.id).waiting,0);
 const patient=b.spawn(healer.x,healer.y+2,null,{team:'A'})||b.unit(s.memberIds[0]);b.damage(patient.id,10);
 b.update(1);assert.notEqual(healer.waitReason,'healing');
});
test('a new focus command replaces an unfinished flank immediately',()=>{
 const b=new Board(65,35),g=placeGroup(b,createFormationGroup(8,'squad','기동','mobile'),{x:12,y:15},{team:'A'});
 const s=squadsFor(b).get(g.squads[0]),enemy=b.spawn(48,15,null,{team:'B',stats:{maxHealth:10000}});
 orderSquad(b,s.id,'flank',{x:42,y:15});
 assert.ok(orderSquad(b,s.id,'focus',{unitId:enemy.id}));
 assert.equal(s.order.type,'focus');assert.equal(s.order.after,undefined);
 assert.ok(s.memberIds.some(id=>b.unit(id).command?.target===enemy.id));
});
test('only an explicitly targeted flank chains its attack, and a move clears the chain',()=>{
 const b=new Board(65,35),g=placeGroup(b,createFormationGroup(8,'squad','기동','mobile'),{x:12,y:15},{team:'A'});
 const s=squadsFor(b).get(g.squads[0]),enemy=b.spawn(48,15,null,{team:'B',stats:{maxHealth:10000}});
 orderSquad(b,s.id,'flank',{x:42,y:15,attackTarget:{unitId:enemy.id}});
 assert.equal(s.order.after.type,'focus');
 orderSquad(b,s.id,'advance',{x:25,y:20});
 assert.equal(s.order.type,'advance');assert.equal(s.order.after,undefined);assert.equal(s.order.waypoints.length,0);
 for(let i=0;i<700;i++){b.update(.05);updateSquadOrders(b);}
 assert.equal(s.order.type,'advance');assert.equal(s.order.phase,'arrived');
});
