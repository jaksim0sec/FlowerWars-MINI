import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
import {createFormationGroup,placeGroup,squadsFor} from '../src/unit-groups.mjs';
import {configureSquad,orderSquad,updateSquadOrders} from '../src/squad-orders.mjs';
function fixture(type='defense',team='A'){
 const b=new Board(60,40),g=placeGroup(b,createFormationGroup(12,'squad','',type),{x:25,y:20},{team,makeCharacter:m=>({characterId:m.characterId})});
 return {b,s:squadsFor(b).get(g.squads[0])};
}
const extent=goals=>{const p=[...goals.values()];return {x:Math.max(...p.map(p=>p.x))-Math.min(...p.map(p=>p.x)),y:Math.max(...p.map(p=>p.y))-Math.min(...p.map(p=>p.y))};};
test('choosing a formation while idle issues physical movement immediately',()=>{
 const {b,s}=fixture();configureSquad(b,s.id,{formation:'column'});
 assert.ok(s.order?.goals.size===12);assert.ok(s.memberIds.some(id=>b.unit(id).command||b.unit(id).step));
});
test('rally honors line and column geometry instead of silently forcing dense formation',()=>{
 const {b,s}=fixture();configureSquad(b,s.id,{formation:'line'});orderSquad(b,s.id,'rally');
 const line=extent(s.order.goals);assert.ok(line.y>line.x,'line spans across its forward axis');
 configureSquad(b,s.id,{formation:'column'});const column=extent(s.order.goals);
 assert.ok(column.x>column.y,'column extends along its forward axis');assert.ok(column.y<=1);
});
test('changing a held formation begins reforming immediately',()=>{
 const {b,s}=fixture();orderSquad(b,s.id,'hold');configureSquad(b,s.id,{formation:'square'});
 assert.notEqual(s.order.type,'hold');assert.equal(s.order.goals.size,12);
});
test('all four formations physically reach their assigned seats after an idle click',()=>{
 for(const type of ['defense','ranged','mobile','mixed','support','assault'])for(const team of ['A','B'])for(const formation of ['line','column','square','spread']){
  const {b,s}=fixture(type,team);configureSquad(b,s.id,{formation});
  for(let i=0;i<800&&s.order.phase!=='arrived';i++){b.update(.05);updateSquadOrders(b);}
  assert.equal(s.order.phase,'arrived',type+' '+team+' '+formation);
  for(const [id,p] of s.order.goals){const u=b.unit(id);assert.deepEqual({x:u.x,y:u.y},p);}
 }
});
