import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
import {createFormationGroup,placeGroup,squadsFor,registerPlacedGroup} from '../src/unit-groups.mjs';
import {createBattlefield} from '../src/battlefield-terrain.mjs';
import {deploymentBlueprint} from '../src/deployment-layout.mjs';
import {configureSquad,orderSquad,updateSquadOrders,squadSummary} from '../src/squad-orders.mjs';
function fixture(type='defense',team='A'){
 const b=new Board(60,40),g=placeGroup(b,createFormationGroup(12,'squad','',type),{x:25,y:20},{team,makeCharacter:m=>({characterId:m.characterId})});
 return {b,s:squadsFor(b).get(g.squads[0])};
}
const extent=goals=>{const p=[...goals.values()];return {x:Math.max(...p.map(p=>p.x))-Math.min(...p.map(p=>p.x)),y:Math.max(...p.map(p=>p.y))-Math.min(...p.map(p=>p.y))};};
test('choosing a formation while idle issues physical movement immediately',()=>{
 const {b,s}=fixture();configureSquad(b,s.id,{formation:'column'});
 assert.ok(s.order?.goals.size===12);assert.ok(s.memberIds.some(id=>b.unit(id).command||b.unit(id).step));
});
test('reform finds a clear footprint beside X rather than circling across blocked seats',()=>{
 const b=new Board(100,100);createBattlefield(b);
 const group=placeGroup(b,deploymentBlueprint(12,'defense',''),{x:69,y:24},{team:'A',makeCharacter:m=>({characterId:m.characterId})});
 const s=squadsFor(b).get(group.squads[0]);configureSquad(b,s.id,{formation:'column'});
 for(let i=0;i<1000&&s.order.phase!=='arrived';i++){b.update(.05);updateSquadOrders(b);assert.equal(new Set(b.units.filter(u=>u.step).map(u=>u.step.x+','+u.step.y)).size,b.units.filter(u=>u.step).length);}
 assert.equal(s.order.phase,'arrived');assert.ok([...s.order.goals.values()].every(p=>!b.navigation.blocked(p.y*100+p.x)));
});
test('distant soldiers resume budgeted reform searches across ticks',()=>{
 const b=new Board(100,100);createBattlefield(b);
 const lead=b.spawn(3,3,{characterId:'banner-bearer'},{team:'A'}),scout=b.spawn(96,96,{characterId:'scout'},{team:'A'});
 const g=registerPlacedGroup(b,[lead.id,scout.id],{team:'A'}),s=squadsFor(b).get(g.squads[0]);
 configureSquad(b,s.id,{formation:'line'});
 for(let i=0;i<1800&&s.order.phase!=='arrived';i++){b.update(.05);updateSquadOrders(b);}
 assert.equal(s.order.phase,'arrived');assert.equal(squadSummary(b,s.id).formationProgress,100);
});
test('no available formation space reports waiting without crashing',()=>{
 const b=new Board(20,4),lead=b.spawn(4,2,{characterId:'banner-bearer'},{team:'A'}),ids=[lead.id];
 for(let x=5;x<=15;x++)ids.push(b.spawn(x,2,{characterId:'scout'},{team:'A'}).id);
 const g=registerPlacedGroup(b,ids,{team:'A'}),s=squadsFor(b).get(g.squads[0]);
 for(let y=0;y<4;y++)for(let x=0;x<20;x++)if(!b.at(x,y))b.spawn(x,y,null,{team:'B'});
 assert.doesNotThrow(()=>{configureSquad(b,s.id,{formation:'line'});for(let i=0;i<20;i++){b.update(.05);updateSquadOrders(b);}});
 assert.ok(Number.isFinite(squadSummary(b,s.id).formationProgress));
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
  const leader=b.unit(s.leaderId);assert.deepEqual(s.order.goals.get(leader.id),{x:leader.x,y:leader.y});
  for(let i=0;i<800&&s.order.phase!=='arrived';i++){
   b.update(.05);updateSquadOrders(b);
   assert.equal(new Set(b.units.filter(u=>u.step).map(u=>u.step.x+','+u.step.y)).size,b.units.filter(u=>u.step).length,'parallel steps must reserve distinct cells');
  }
  assert.equal(s.order.phase,'arrived',type+' '+team+' '+formation);
  for(const [id,p] of s.order.goals){const u=b.unit(id);assert.deepEqual({x:u.x,y:u.y},p);}
  assert.equal(squadSummary(b,s.id).formationProgress,100);
 }
});
test('an incomplete blocked reform can be superseded by a move without losing its commander anchor',()=>{
 const b=new Board(20,4),lead=b.spawn(4,2,{characterId:'banner-bearer'},{team:'A'}),ids=[lead.id];
 for(let x=5;x<=15;x++)ids.push(b.spawn(x,2,{characterId:'scout'},{team:'A'}).id);
 const g=registerPlacedGroup(b,ids,{team:'A'}),s=squadsFor(b).get(g.squads[0]);
 for(let y=0;y<4;y++)for(let x=0;x<20;x++)if(!b.at(x,y))b.spawn(x,y,null,{team:'B'});
 configureSquad(b,s.id,{formation:'line'});
 assert.doesNotThrow(()=>orderSquad(b,s.id,'move',{x:18,y:2}));
 assert.ok(s.order);assert.ok(Number.isFinite(squadSummary(b,s.id).formationProgress));
});
