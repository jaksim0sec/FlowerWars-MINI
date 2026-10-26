import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
import {FlagMatch} from '../src/flag-match.mjs';
import {availableSquadBlueprints,placeGroup,squadsFor} from '../src/unit-groups.mjs';
import {layoutDeployment} from '../src/deployment-layout.mjs';
import {configureSquad,updateSquadOrders} from '../src/squad-orders.mjs';

test('default squads use one real commander for every 24 troops and retain offensive operations',()=>{
 const b=new Board(),m=new FlagMatch(b);m.start();assert.equal(m.counts.B,200);
 assert.ok(m.squadIds.B.length>=9);
 for(const id of m.squadIds.B){const s=squadsFor(b).get(id);assert.equal(s.memberIds.filter(id=>b.unit(id).formationRole==='banner').length,1);assert.ok(b.unit(s.leaderId));}
 for(const role of ['guard','front','mobile','breach'])assert.ok([...m.command.operations.values()].some(op=>op.role===role),role);
 assert.ok([...m.command.registry.get('guard')].reduce((n,id)=>n+squadsFor(b).get(id).memberIds.length,0)<=48);
});
test('24-member default formations finish without duplicate seats or parallel reform movement',()=>{
 for(const bp of availableSquadBlueprints())for(const team of ['A','B'])for(const formation of ['line','column','square','spread']){
  const size=bp.members.length,b=new Board(80,60),g=placeGroup(b,layoutDeployment(bp,size,''),{x:35,y:30},{team,makeCharacter:m=>({characterId:m.characterId})}),s=squadsFor(b).get(g.squads[0]);
  assert.equal(s.memberIds.length,size);configureSquad(b,s.id,{formation});
  assert.equal(new Set([...s.order.goals.values()].map(p=>p.x+','+p.y)).size,size);
  for(let i=0;i<2400&&s.order.phase!=='arrived';i++){b.update(.05);updateSquadOrders(b);assert.ok(b.units.filter(u=>u.step).length<=1);}
  assert.equal(s.order.phase,'arrived',bp.squadType+':'+team+':'+formation);
 }
});
