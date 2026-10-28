import test from 'node:test';
import assert from 'node:assert/strict';
import {OnlineSession} from '../src/online/session.mjs';
import {createFixture,saveMatchState} from '../src/online/match-state.mjs';

test('live frames are not queued behind durable checkpoint storage',async()=>{
 const s=new OnlineSession();let release,entered;const gate=new Promise(r=>release=r),inside=new Promise(r=>entered=r);let ack=0;
 try{
  const snapshot=await saveMatchState(createFixture('bg'),1);
  s.identity={role:'guest'};s.room={epoch:1,roomCode:'ABCDEF',matchId:'bg',state:'PLAYING'};
  s.backup.put=async()=>{entered();await gate;};s.rpc=async()=>{ack++;};
  await s.receive({kind:'checkpoint',snapshot},1);
  await inside;assert.equal(ack,0);
  // The original receive() must already be resolved even though IndexedDB is blocked.
  assert.equal(s.room.state,'PLAYING');
  release();await s.backgroundCheckpoints;assert.equal(ack,1);
 }finally{release?.();s.dispose();}
});
