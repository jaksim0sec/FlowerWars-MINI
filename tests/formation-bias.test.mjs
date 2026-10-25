import test from 'node:test';
import assert from 'node:assert/strict';
import {formationBattle,advanceBattle} from './formation-bias-helpers.mjs';

function positionSnapshot(board,swapped=false){
  const x=value=>Math.round((swapped?board.width-1-value:value)*1e8)/1e8;
  return board.units.map(u=>[u.id,u.health.current,u.state,x(u.visualX),Math.round(u.visualY*1e8)/1e8,u.combat.targetId,u.waitReason]);
}

test('real formation detours are unchanged by swapping physical sides without changing navigation rules',()=>{
  const original=formationBattle(1).board,swapped=formationBattle(1,{swapPositions:true}).board;
  for(let n=0;n<100;n++){
    original.update(.02);swapped.update(.02);
    assert.deepEqual(positionSnapshot(swapped,true),positionSnapshot(original),`positional symmetry at ${original.time.toFixed(2)}s`);
  }
});

test('real formation profiles include sword infantry and equipped movement multipliers',()=>{
  const {board}=formationBattle(1);
  const autumn=board.units.find(u=>u.character.slot.role==='autumn');
  assert.equal(autumn.damage,26);assert.equal(autumn.combat.range,1);assert.equal(autumn.health.max,110);
  const guard=board.units.find(u=>u.character.slot.role==='guard');
  assert.ok(guard.movement.stepTime>.42);
});

test('24 real formation seeds keep the same outcomes when the armies exchange physical sides',()=>{
  const outcomes=[];
  for(let seed=1;seed<=24;seed++){
    const original=advanceBattle(formationBattle(seed).board,40);
    const swapped=advanceBattle(formationBattle(seed,{swapPositions:true}).board,40);
    assert.deepEqual(swapped,original,`seed ${seed}`);
    outcomes.push(original);
  }
  // This checks spatial causality, not a forced 50/50 victory quota.
  assert.ok(outcomes.some(result=>result.leader==='A'));
  assert.ok(outcomes.some(result=>result.leader==='B'));
});

test('formation actors retain their approach direction while yielding along the goal column',()=>{
  // These actors reach their destination column before finishing a side detour.
  for(const seed of [113,370,393,419,715,767,842,863,909]){
    assert.deepEqual(advanceBattle(formationBattle(seed,{swapPositions:true}).board,40),
      advanceBattle(formationBattle(seed).board,40),`seed ${seed}`);
  }
});
