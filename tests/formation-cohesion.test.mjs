import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
import {settleFormation} from '../src/formation-planner.mjs';
import {createFormationGroup,placeGroup,squadsFor} from '../src/unit-groups.mjs';
import {orderSquad,updateSquadOrders} from '../src/squad-orders.mjs';

test('identical soldiers standing on each other slots count as arrived without a move',()=>{
 const b=new Board(20,12),a=b.spawn(8,5,{characterId:'shield-guard'}),c=b.spawn(8,6,{characterId:'shield-guard'});
 const goals=new Map([[a.id,{x:8,y:6}],[c.id,{x:8,y:5}]]);
 settleFormation([a,c],goals);
 assert.deepEqual(goals.get(a.id),{x:8,y:5});assert.deepEqual(goals.get(c.id),{x:8,y:6});
 assert.equal(a.step,null);assert.equal(c.step,null);
});
test('a different role cannot claim another role defensive position',()=>{
 const b=new Board(20,12),a=b.spawn(8,5,{characterId:'shield-guard'}),c=b.spawn(8,6,{characterId:'archer'});
 const goals=new Map([[a.id,{x:8,y:6}],[c.id,{x:8,y:5}]]);settleFormation([a,c],goals);
 assert.deepEqual(goals.get(a.id),{x:8,y:6});
});
test('squad arrival accepts already filled interchangeable seats without a reshuffle',()=>{
 const b=new Board(70,40),g=placeGroup(b,createFormationGroup(12,'squad','수비','defense'),{x:15,y:15},{team:'A',makeCharacter:m=>({characterId:m.characterId})}),s=squadsFor(b).get(g.squads[0]);
 orderSquad(b,s.id,'move',{x:40,y:20});
 for(let i=0;i<1000;i++){b.update(.05);updateSquadOrders(b);}
 assert.equal(s.order.phase,'arrived');
 const guards=s.memberIds.map(id=>b.unit(id)).filter(u=>u.character.characterId==='shield-guard'),a=guards[0],c=guards[1];
 const first=s.order.goals.get(a.id),second=s.order.goals.get(c.id);s.order.goals.set(a.id,second);s.order.goals.set(c.id,first);
 updateSquadOrders(b);
 assert.equal(s.order.phase,'arrived');assert.equal(a.command,null);assert.equal(c.command,null);
 assert.deepEqual(s.order.goals.get(a.id),{x:a.x,y:a.y});
});
test('a vertical advance places the commander behind the front instead of beside it',()=>{
 const b=new Board(70,70),g=placeGroup(b,createFormationGroup(12,'squad','수비','defense'),{x:20,y:15},{team:'A',makeCharacter:m=>({characterId:m.characterId})}),s=squadsFor(b).get(g.squads[0]);
 orderSquad(b,s.id,'move',{x:20,y:45});
 const lead=s.order.goals.get(s.leaderId),others=[...s.order.goals].filter(([id])=>id!==s.leaderId).map(([,p])=>p);
 assert.ok(others.every(p=>p.y>lead.y));
});
test('a stranded focus commander regroups with the actual troops and a nearby escort',()=>{
 const b=new Board(80,40),g=placeGroup(b,createFormationGroup(12,'squad','기동','mobile'),{x:12,y:15},{team:'A',makeCharacter:m=>({characterId:m.characterId})}),s=squadsFor(b).get(g.squads[0]);
 // Send the formation forward, leave its flag behind, then focus a remote mark.
 const troops=s.memberIds.filter(id=>id!==s.leaderId).map(id=>b.unit(id));
 b.batchCommands(()=>troops.forEach((u,i)=>b.move(u.id,35+Math.floor(i/4),12+i%4)));
 for(let i=0;i<900;i++)b.update(.05);
 const enemy=b.spawn(65,15,null,{team:'B',stats:{maxHealth:10000}}),lead=b.unit(s.leaderId),before=lead.x;
 orderSquad(b,s.id,'focus',{unitId:enemy.id});
 for(let i=0;i<150;i++){b.update(.05);updateSquadOrders(b);}
 assert.ok(lead.x>before+5,'flag follows the fighting body rather than remaining isolated');
 assert.ok(troops.some(u=>Math.abs(u.x-lead.x)+Math.abs(u.y-lead.y)<=4),'escort remains close');
});
