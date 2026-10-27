import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
import {availableSquadBlueprints,placeGroup,squadsFor} from '../src/unit-groups.mjs';
import {layoutDeployment} from '../src/deployment-layout.mjs';
import {configureSquad,orderSquad,updateSquadOrders} from '../src/squad-orders.mjs';
function finish(b,s){for(let i=0;i<2400&&s.order.phase!=='arrived';i++){b.update(.05);updateSquadOrders(b);}assert.equal(s.order.phase,'arrived');}
test('square and column geometry survive a diagonal march and another movement order',()=>{
 for(const formation of ['square','column']){
  const b=new Board(80,70),bp=availableSquadBlueprints().find(bp=>bp.squadType==='defense'),g=placeGroup(b,layoutDeployment(bp,14,''),{x:20,y:20},{team:'A'}),s=squadsFor(b).get(g.squads[0]);
  configureSquad(b,s.id,{formation});finish(b,s);
  const shape=goals=>[...goals.values()].map(p=>[p.x,p.y]);
  const before=shape(s.order.goals),lead=b.unit(s.leaderId),origin={x:lead.x,y:lead.y};
  orderSquad(b,s.id,'move',{x:45,y:40});
  assert.deepEqual(shape(s.order.goals).sort(),before.map(([x,y])=>[x+45-origin.x,y+40-origin.y]).sort());
  const remembered=[...s.order.travelOffsets];b.update(.15);updateSquadOrders(b);
  orderSquad(b,s.id,'move',{x:50,y:45});assert.deepEqual([...s.order.travelOffsets],remembered);
  finish(b,s);assert.equal(s.formation,formation);
  const pace=new Set(s.memberIds.map(id=>b.unit(id).marchStepTime));assert.equal(pace.size,1);
 }
});
