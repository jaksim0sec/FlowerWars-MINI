import test from 'node:test';import assert from 'node:assert/strict';
import {OnlineSession} from '../src/online/session.mjs';

test('missing consistent host checkpoint is reported instead of silently creating a new match',async()=>{
 const s=new OnlineSession();try{s.identity={role:'host'};s.room={epoch:3,roomCode:'ABCDEF',matchId:'existing',checkpoint:null};s.peer={channel:{readyState:'open'},send:()=>true,close(){}};await s.ensureSync();assert.equal(s.state,null);assert.equal(s.status,'NO_CHECKPOINT');}finally{s.dispose();}
});
test('repeated authentication recovery reuses a connected socket rather than waiting forever for another connect event',async()=>{
 const s=new OnlineSession();try{let recovered=0;s.identity={roomCode:'ABCDEF',role:'host'};s.socket={connected:true,disconnect(){}};s.authenticate=async(event,data)=>{assert.equal(event,'participant:recover');assert.equal(data,s.identity);recovered++;};await s.recover();assert.equal(recovered,1);}finally{s.dispose();}
});
test('late asynchronous restore cannot synchronize a newer epoch or revive an ended room',async()=>{
 const s=new OnlineSession();try{const old={epoch:1,roomCode:'ABCDEF',matchId:'existing',checkpoint:{sequence:1,hash:'a'}};s.identity={role:'host'};s.room=old;s.peer={channel:{readyState:'open'},send(){},close(){}};let release;const pending=new Promise(r=>release=r);s.backup.get=()=>pending;const sync=s.ensureSync();s.room=null;release(null);await sync;assert.equal(s.room,null);assert.equal(s.state,null);}finally{s.dispose();}
});
test('transient active-slot rejection and transport timeout retain credentials and local checkpoint for retry',()=>{
 for(const code of ['ALREADY_CONNECTED','SERVER_TIMEOUT']){const s=new OnlineSession();try{const identity={roomCode:'ABCDEF',role:'host',clientId:'a'};s.identity=identity;s.backup.clearRoom=()=>assert.fail('must preserve backup');s.authFailed(new Error(code));assert.equal(s.identity,identity);assert.equal(s.status,code);}finally{s.dispose();}}
});
test('ending a room during asynchronous snapshot digest cannot revive state or send synchronization',async()=>{
 const {saveMatchState,createFixture}=await import('../src/online/match-state.mjs');const snapshot=await saveMatchState(createFixture('old'),1),s=new OnlineSession();const original=crypto.subtle.digest;let release,entered;const gate=new Promise(r=>release=r),waiting=new Promise(r=>entered=r);let rpcCount=0;
 try{s.identity={role:'host',clientId:'a',roomCode:'ABCDEF'};s.room={epoch:1,roomCode:'ABCDEF',matchId:'old',checkpoint:{sequence:1,hash:snapshot.hash}};s.peer={channel:{readyState:'open'},close(){}};s.backup.get=async()=>snapshot;s.backup.clearRoom=async()=>{};s.rpc=async()=>{rpcCount++;};crypto.subtle.digest=async(...args)=>{entered();await gate;return original.apply(crypto.subtle,args);};const restoring=s.ensureSync();await waiting;s.ended('ROOM_FINISHED');release();await restoring;assert.equal(s.state,null);assert.equal(s.appliedEpoch,-1);assert.equal(rpcCount,0);}finally{crypto.subtle.digest=original;s.dispose();}
});
test('a late match-start acknowledgement cannot recreate fixture state after leaving',async()=>{const s=new OnlineSession();let release;try{s.identity={clientId:'host',roomCode:'ABCDEF',role:'host'};s.room={roomCode:'ABCDEF'};s.peer={close(){}};s.backup.clearRoom=async()=>{};s.rpc=()=>new Promise(r=>release=r);const starting=s.start();s.ended('ROOM_FINISHED');release({room:{matchId:'orphan'}});await starting;assert.equal(s.state,null);}finally{s.dispose();}});
