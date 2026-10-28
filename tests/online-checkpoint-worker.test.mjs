import test from 'node:test';
import assert from 'node:assert/strict';
import {packOffThread,validateOffThread} from '../src/online/checkpoint-processor.mjs';
import {createFixture,saveMatchState} from '../src/online/match-state.mjs';

test('fallback without browser Workers preserves snapshot integrity checks',async()=>{
 const snapshot=await saveMatchState(createFixture('worker-fallback'),1);
 assert.equal(await validateOffThread(snapshot),true);
 assert.equal(await validateOffThread({...snapshot,hash:'0'.repeat(64)}),false);
});
test('fallback preserves canonical small real-time packets',async()=>{
 const data={kind:'frame',value:{units:[[1,2,3]]}};
 assert.deepEqual(await packOffThread(data),data);
});

test('worker fallback seals battle snapshots with valid deterministic hashes',async()=>{
 const {captureBattleState,saveBattleState,validateBattleState,createBattleState}=await import('../src/online/battle-state.mjs');
 const {sealOffThread}=await import('../src/online/checkpoint-processor.mjs');
 const state=createBattleState('worker-seal',{seed:51});
 const sealed=await sealOffThread(captureBattleState(state,2));
 const direct=await saveBattleState(state,2);
 assert.equal(sealed.hash,direct.hash);
 assert.equal(await validateBattleState(sealed),true);
});
