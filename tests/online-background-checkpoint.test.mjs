import test from 'node:test';
import assert from 'node:assert/strict';
import {OnlineSession} from '../src/online/session.mjs';
import {createFixture,saveMatchState} from '../src/online/match-state.mjs';

test('live messages are not queued behind durable checkpoint storage',async()=>{
 const s=new OnlineSession();let release,entered;const gate=new Promise(r=>release=r),inside=new Promise(r=>entered=r);let ack=0;
 try{
  const snapshot=await saveMatchState(createFixture('bg'),1);
  s.identity={role:'guest'};s.room={epoch:1,roomCode:'ABCDEF',matchId:'bg',state:'PLAYING'};
  s.backup.put=async()=>{entered();await gate;};s.rpc=async()=>{ack++;};
  await s.receive({kind:'checkpoint',snapshot},1);
  await inside;assert.equal(ack,0);
  s.pendingCommands.set(1,{at:0});await s.receive({kind:'command:result',sequence:1,result:{ok:true}},1);
  assert.equal(s.pendingCommands.size,0,'a later live acknowledgement must finish during checkpoint storage');
  // The original receive() must already be resolved even though IndexedDB is blocked.
  assert.equal(s.room.state,'PLAYING');
  release();await s.backgroundCheckpoints;assert.equal(ack,1);
 }finally{release?.();s.dispose();}
});
