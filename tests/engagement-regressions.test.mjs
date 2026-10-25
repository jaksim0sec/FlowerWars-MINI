import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
import {createFormationGroup,placeGroup,squadsFor} from '../src/unit-groups.mjs';
import {orderSquad,updateSquadOrders} from '../src/squad-orders.mjs';
test('focus on a distant mark still strikes an adjacent enemy without losing the focus command',()=>{
 const b=new Board(30,12),u=b.spawn(5,5,null,{team:'A',autoCombat:true}),near=b.spawn(6,5,null,{team:'B'}),far=b.spawn(24,5,null,{team:'B'});
 b.attack(u.id,far.id);b.update(.8);
 assert.ok(near.hits>0,'the adjacent enemy must be attacked');assert.equal(u.command?.target,far.id);
});
test('a protected commander can finish a local defensive strike during focus orders',()=>{
 const b=new Board(60,35),g=placeGroup(b,createFormationGroup(8,'squad','A','mobile'),{x:12,y:15},{team:'A',makeCharacter:m=>({characterId:m.characterId})});
 const s=squadsFor(b).get(g.squads[0]),lead=b.unit(s.leaderId),near=b.spawn(lead.x+1,lead.y,null,{team:'B',stats:{maxHealth:1000}}),far=b.spawn(45,24,null,{team:'B'});
 orderSquad(b,s.id,'focus',{unitId:far.id});for(let i=0;i<30;i++){b.update(.05);updateSquadOrders(b);}
 assert.ok(near.hits>0,'focus updates must not repeatedly interrupt defensive attacks');
});
test('squad destinations on a large map start without serial full-map distance fields',()=>{
 const b=new Board(100,100);b.setObstacle(70,70,{blocked:true});
 const g=placeGroup(b,createFormationGroup(12,'squad','A','mobile'),{x:20,y:20},{team:'A',makeCharacter:m=>({characterId:m.characterId})}),s=squadsFor(b).get(g.squads[0]);
 const before=new Map(s.memberIds.map(id=>{const u=b.unit(id);return [id,{x:u.x,y:u.y}];}));
 orderSquad(b,s.id,'move',{x:42,y:22});b.update(.5);
 assert.ok(s.memberIds.filter(id=>{const u=b.unit(id),p=before.get(id);return Math.hypot(u.visualX-p.x,u.visualY-p.y)>.2;}).length>=8,'most fighters should already be moving');
 assert.ok(b.navigation.stats.lastExpansions<=2048);
});
test('a ranged focus moves to a clear firing position instead of shooting a wall',()=>{
 const b=new Board(15,12),u=b.spawn(2,5,null,{team:'A',autoCombat:true,stats:{range:4,rangeShape:'king',lineOfSight:true}}),target=b.spawn(6,5,null,{team:'B'});
 for(let y=3;y<=7;y++)b.setObstacle(4,y,{blocked:true});
 b.attack(u.id,target.id);b.update(10);assert.ok(target.hits>0,'must find a firing position with line of sight');
});
