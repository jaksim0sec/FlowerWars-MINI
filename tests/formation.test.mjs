import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
import {setupMovementScenario} from '../src/movement-scenarios.mjs';
import {groupsFor,squadsFor} from '../src/unit-groups.mjs';

test('battle test uses paired mirrored battalions with real specialized squads',()=>{
 for(const count of [16,64,256,1000]){
  const board=new Board(),slots=[];
  const scenario=setupMovementScenario(board,'formation',count,(i,slot)=>{slots.push(slot);return null;});
  assert.equal(board.units.length,count);
  assert.ok(slots.every(Boolean));
  assert.equal(scenario.groupIds.length,2);
  for(let i=0;i<count-1;i+=2){
   assert.equal(board.units[i].x+board.units[i+1].x,board.width-1);
   assert.equal(board.units[i].y,board.units[i+1].y);
   assert.equal(slots[i].role,slots[i+1].role);
   assert.equal(slots[i].squadType,slots[i+1].squadType);
  }
  for(const team of ['A','B']){
   const group=[...groupsFor(board).values()].find(g=>g.team===team);
   assert.equal(group.kind,'battalion');
   assert.match(group.name,/대대/);
   assert.equal(group.memberIds.length,Math.floor((count+(team==='A'?1:0))/2));
   assert.equal(group.squads.length,Math.ceil(group.memberIds.length/12));
   assert.equal(group.platoons.length,Math.ceil(group.squads.length/4));
   assert.ok(group.platoons.every(p=>p.squadIds.length<=4));
   const all=new Set();
   for(const id of group.squads){
    const squad=squadsFor(board).get(id),leader=board.unit(squad.leaderId);
    assert.ok(['defense','assault','ranged','mobile','mixed','support'].includes(squad.type));
    assert.equal(leader.formationRole,'banner');
    assert.ok(squad.memberIds.length>0&&squad.memberIds.length<=12);
    assert.ok(squad.memberIds.every(uid=>board.unit(uid).squadId===id));
    for(const uid of squad.memberIds){assert.equal(all.has(uid),false);all.add(uid);}
    const soldiers=squad.memberIds.map(uid=>board.unit(uid));
    const guards=soldiers.filter(u=>u.formationRole==='guard');
    const archers=soldiers.filter(u=>u.formationRole==='archer');
    // Shield front ranks should be nearer the enemy than their own archers.
    for(const guard of guards)for(const archer of archers)
     assert.ok(team==='A'?guard.x>archer.x:guard.x<archer.x);
   }
   assert.equal(all.size,group.memberIds.length);
  }
  if(count>=64){
   const types=new Set([...squadsFor(board).values()].map(s=>s.type));
   assert.ok(types.has('defense')&&types.has('assault')&&types.has('ranged'));
  }
 }
});
