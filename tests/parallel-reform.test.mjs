import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
import {reformFormation} from '../src/formation-reform.mjs';
import {relayFormationVacancies} from '../src/formation-planner.mjs';

test('independent soldiers start together while another soldier is still moving',()=>{
 const b=new Board(20,20),units=[b.spawn(3,3,null,{team:'A'}),b.spawn(3,7,null,{team:'A'}),b.spawn(3,11,null,{team:'A'})];
 const s={id:'test',order:{goals:new Map(units.map(u=>[u.id,{x:5,y:u.y}]))}};
 reformFormation(b,s,units,units[0]);assert.ok(units.every(u=>u.step));
 assert.equal(b.reservations.size,3);
});
test('same-kind vacancy relays use single steps instead of sending the far soldier around the row',()=>{
 const b=new Board(20,20),units=[1,2,3].map(x=>b.spawn(x,5,null,{team:'A',unitType:'scout'}));
 const goals=new Map([[units[0].id,{x:4,y:5}],[units[1].id,{x:2,y:5}],[units[2].id,{x:3,y:5}]]);
 relayFormationVacancies(b,units,goals);
 assert.deepEqual(goals.get(units[2].id),{x:4,y:5});assert.deepEqual(goals.get(units[0].id),{x:3,y:5});
 const s={id:'test',order:{goals}};let steps=0,moved=0;
 for(let i=0;i<80&&s.order.phase!=='arrived';i++){
  const previous=units.map(u=>[u.x,u.y]),moving=units.filter(u=>u.step).length;b.update(.05);
  moved+=units.reduce((n,u,i)=>n+Math.abs(u.x-previous[i][0])+Math.abs(u.y-previous[i][1]),0);
  reformFormation(b,s,units,null);
  if(units.some(u=>u.step)&&!moving)steps++;
 }
 assert.equal(s.order.phase,'arrived');assert.equal(units[0].x,2);assert.ok(steps<=3);assert.equal(moved,3,'three one-tile relays, without circling');
});

test('a blocked commander does not prevent independent followers from reforming',()=>{
 const b=new Board(20,20),lead=b.spawn(3,3,null,{team:'A'}),a=b.spawn(3,7,null,{team:'A'}),c=b.spawn(3,11,null,{team:'A'});
 b.spawn(5,3,null,{team:'B'});
 const s={id:'test',order:{goals:new Map([[lead.id,{x:5,y:3}],[a.id,{x:5,y:7}],[c.id,{x:5,y:11}]])}};
 reformFormation(b,s,[lead,a,c],lead);assert.equal(lead.step,null);assert.ok(a.step);assert.ok(c.step);
});
