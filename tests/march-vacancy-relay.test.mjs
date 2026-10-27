import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
import {registerPlacedGroup,squadsFor} from '../src/unit-groups.mjs';
import {updateSquadOrders} from '../src/squad-orders.mjs';
test('ordinary arrival passes a same-kind vacancy one cell at a time without detouring the far soldier',()=>{
 const b=new Board(20,12),lead=b.spawn(2,4,{characterId:'banner-bearer'},{team:'A'}),troops=[3,4,5].map(x=>b.spawn(x,5,{characterId:'scout'},{team:'A'}));
 const g=registerPlacedGroup(b,[lead.id,...troops.map(u=>u.id)],{team:'A'}),s=squadsFor(b).get(g.squads[0]);
 s.order={type:'move',source:'move',target:{x:6,y:5},previous:'6,5,line',dirty:false,lastMembers:4,goals:new Map([[lead.id,{x:2,y:4}],[troops[0].id,{x:6,y:5}],[troops[1].id,{x:4,y:5}],[troops[2].id,{x:5,y:5}]]),waypoints:[],phase:'moving'};
 let distance=0;for(let i=0;i<200&&s.order.phase!=='arrived';i++){
  const before=troops.map(u=>[u.x,u.y]);b.update(.05);updateSquadOrders(b);
  distance+=troops.reduce((sum,u,j)=>sum+Math.abs(u.x-before[j][0])+Math.abs(u.y-before[j][1]),0);
 }
 assert.equal(s.order.phase,'arrived');assert.equal(distance,3);assert.deepEqual(troops.map(u=>[u.x,u.y]),[[4,5],[5,5],[6,5]]);
});
