import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB} from 'fake-indexeddb';
import {createFixture,stepFixture,applyFixtureCommand,saveMatchState,restoreMatchState,validateMatchState,snapshotMetadata} from '../src/online/match-state.mjs';
import {SnapshotBackup} from '../src/online/backup.mjs';
import {saveIdentity,loadIdentity,clearIdentity} from '../src/online/identity.mjs';
import {setOnlineActive,pauseSinglePlayer} from '../src/online/game-gate.mjs';

test('versioned fixture recovery preserves positions, HP, orders, formation, phase and timers with fresh runtime structures',async()=>{
 const state=createFixture('match-1');assert.equal(applyFixtureCommand(state,'guest',{unitId:'A1',x:90,y:40}),false);assert.equal(applyFixtureCommand(state,'guest',{unitId:'B1',x:20,y:40}),true);stepFixture(state,.1);state.units[0].hp=42;state.units[0].formation='column';
 const snapshot=await saveMatchState(state,7);assert.equal(await validateMatchState(snapshot),true);const restored=await restoreMatchState(snapshot);assert.deepEqual(restored,state);assert.notEqual(restored.units,state.units);assert.ok(restored.lookup instanceof Map);assert.equal(restored.lookup.get('B1'),restored.units[1]);const meta=snapshotMetadata(snapshot);assert.equal(meta.sequence,7);
 snapshot.state.units[0].hp=99;assert.equal(await validateMatchState(snapshot),false);
});
test('reject unsupported adapters, malformed state, nonfinite values, oversized snapshots and incompatible versions',async()=>{
 const snap=await saveMatchState(createFixture('x'),0);for(const bad of [{...snap,version:2},{...snap,adapter:'FlagMatch'},null,{...snap,hash:'oops'}])assert.equal(await validateMatchState(bad),false);
 const state=createFixture('x');state.units[0].x=NaN;await assert.rejects(()=>saveMatchState(state,0),/INVALID_STATE/);
 assert.equal(await validateMatchState({...snap,padding:'x'.repeat(65536)}),false);
});
test('IndexedDB keeps latest three match checkpoints and exact committed checkpoint survives newer uncommitted backup',async()=>{
 const backup=new SnapshotBackup({indexedDB,name:'online-test-'+Math.random()});const state=createFixture('persistent');for(let i=0;i<4;i++){state.elapsed=i;await backup.put('ABCDEF',await saveMatchState(state,i));}
 assert.equal((await backup.get('ABCDEF','persistent')).sequence,3);assert.equal((await backup.get('ABCDEF','persistent',{sequence:2,hash:(await saveMatchState({...state,elapsed:2},2)).hash})).sequence,2);assert.equal(await backup.get('ABCDEF','persistent',{sequence:0}),null);await backup.clearRoom('ABCDEF');assert.equal(await backup.get('ABCDEF','persistent'),null);await backup.close();
});
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
test('identity uses same-tab storage with expiring local fallback, expires without changing session, tolerates unavailable storage',()=>{
 const a=memory(),b=memory(),identity={roomCode:'ABCDEF',role:'host',clientId:'a'.repeat(32),reconnectToken:'x'.repeat(43),expiresAt:2000};saveIdentity(identity,a,b);assert.deepEqual(loadIdentity(a,b,1000),identity);a.removeItem('flowerwars-online');assert.deepEqual(loadIdentity(a,b,1000),identity);assert.equal(loadIdentity(a,b,2000),null);saveIdentity(identity,a,b);clearIdentity(a,b);assert.equal(loadIdentity(a,b,1000),null);const broken={getItem(){throw Error();},setItem(){throw Error();},removeItem(){throw Error();}};assert.doesNotThrow(()=>saveIdentity(identity,broken,b));assert.deepEqual(loadIdentity(broken,b,1000),identity);
});
test('single-player gate defaults inactive and is reversible without touching combat mechanics',()=>{assert.equal(pauseSinglePlayer(),false);setOnlineActive(true);assert.equal(pauseSinglePlayer(),true);setOnlineActive(false);assert.equal(pauseSinglePlayer(),false);});

test('trusted checkpoint writes skip redundant validation but restore still checks integrity',async()=>{
 const backup=new SnapshotBackup({indexedDB,name:'online-verified-'+Math.random()});
 try{const snapshot=await saveMatchState(createFixture('trusted'),4);assert.equal(await validateMatchState(snapshot),true);
  await backup.put('ABCDEF',snapshot,{verified:true});assert.equal((await backup.get('ABCDEF','trusted')).sequence,4);
  const tampered={...snapshot,hash:'0'.repeat(64)};await assert.rejects(()=>backup.put('ABCDEF',tampered),/INVALID_SNAPSHOT/);
 }finally{await backup.close();}
});
