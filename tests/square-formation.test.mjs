import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
import {placeGroup,createFormationGroup,squadsFor} from '../src/unit-groups.mjs';
import {configureSquad,orderSquad} from '../src/squad-orders.mjs';
test('square formation surrounds its commander and assigns distinct valid seats to every role',()=>{
 for(const type of ['defense','ranged','support','mobile','mixed']){
  const b=new Board(60,40),g=placeGroup(b,createFormationGroup(12,'squad','방진',type),{x:15,y:15},{team:'A',makeCharacter:m=>({characterId:m.characterId})});
  const s=squadsFor(b).get(g.squads[0]);configureSquad(b,s.id,{formation:'square'});orderSquad(b,s.id,'advance',{x:40,y:20});
  const goals=s.order.goals,leader=goals.get(s.leaderId);
  assert.deepEqual(leader,{x:40,y:20});assert.equal(goals.size,12);
  assert.equal(new Set([...goals.values()].map(p=>p.x+','+p.y)).size,12);
  const fighters=[...goals].filter(([id])=>id!==s.leaderId).map(([,p])=>p);
  assert.ok(fighters.some(p=>p.x<leader.x)&&fighters.some(p=>p.x>leader.x));
  assert.ok(fighters.some(p=>p.y<leader.y)&&fighters.some(p=>p.y>leader.y));
 }
});
