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
