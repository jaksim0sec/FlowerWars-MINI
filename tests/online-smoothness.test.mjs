import test from 'node:test';import assert from 'node:assert/strict';
import {recordGuestFrame,guestRenderTime,sampledGuestVisual} from '../src/online/presentation.mjs';
import {OnlineSession} from '../src/online/session.mjs';import {createBattleState} from '../src/online/battle-state.mjs';
test('buffered presentation crosses authoritative step boundaries smoothly and freezes without inventing movement',()=>{
 const u={id:1,visualX:0,visualY:2,state:'walk',elapsed:0,facing:1},b={byId:new Map([[1,u]])};
 recordGuestFrame(b,{full:true,time:0,units:[[1]]},0);u.visualX=1;u.elapsed=.2;recordGuestFrame(b,{full:false,time:.2,units:[[1]]},200);
 const before=structuredClone(u),a=sampledGuestVisual(b,u,.05,0),c=sampledGuestVisual(b,u,.15,0);assert.equal(a.x,.25);assert.ok(Math.abs(c.x-.75)<1e-9);assert.deepEqual(u,before);
 assert.equal(guestRenderTime(b,2000),.2);assert.equal(sampledGuestVisual(b,u,.2,2000).x,1);
});
test('presentation preserves attack/death state boundaries, strike timing and clears on a full recovery frame',()=>{
 const u={id:1,visualX:0,visualY:2,state:'attack',elapsed:.1,facing:1,strike:{duration:.8}},b={byId:new Map([[1,u]])};recordGuestFrame(b,{full:true,time:1,units:[[1]]},0);
 u.state='death';u.elapsed=0;recordGuestFrame(b,{full:false,time:1.2,units:[[1]]},200);assert.equal(sampledGuestVisual(b,u,1.1,0).state,'attack');assert.equal(sampledGuestVisual(b,u,1.2,0).state,'death');
 u.visualX=7;recordGuestFrame(b,{full:true,time:.5,units:[[1]]},300);assert.equal(sampledGuestVisual(b,u,.5,0).x,7);
});
test('unsent delta retains prior history and tombstones without full-army retransmission',async()=>{
 const s=new OnlineSession();try{s.state=createBattleState('delta-retain',{seed:73});const b=s.state.board;let deployed=false;for(let x=8;x<80&&!deployed;x++)for(let y=8;y<110&&!deployed;y++)deployed=!!b.match.deploy('A','mixed',{x,y});assert.ok(deployed);
 s.room={epoch:1};s.peer={close(){}};const packets=[];let accept=true;s.sendPayload=async p=>{packets.push(p);return accept;};await s.transmitFrame(1);const id=b.units.at(-1).id;b.units=b.units.filter(u=>u.id!==id);accept=false;await s.transmitFrame(1);accept=true;await s.transmitFrame(1);assert.equal(packets[2].value.full,false);assert.deepEqual(packets[2].value.removed,[id]);assert.equal(packets[2].value.created.length,0);
 }finally{s.dispose();}
});

test('live frame Worker can complete while the checkpoint Worker is busy',async()=>{
 const prior=globalThis.Worker,instances=[];
 class FakeWorker{constructor(){instances.push(this);}postMessage(task){this.task=task;if(task.kind==='pack')queueMicrotask(()=>this.onmessage({data:{id:task.id,ok:true,result:task.value}}));}terminate(){}}
 globalThis.Worker=FakeWorker;
 try{const p=await import('../src/online/checkpoint-processor.mjs?isolation=smoothness');const checkpoint=p.sealPackedOffThread({draft:{},final:false});const value={kind:'frame',value:{units:[]}};assert.deepEqual(await p.packOffThread(value),value);assert.equal(instances.length,2);const task=instances[0].task;instances[0].onmessage({data:{id:task.id,ok:true,result:{metadata:{}}}});assert.deepEqual(await checkpoint,{metadata:{}});}
 finally{if(prior===undefined)delete globalThis.Worker;else globalThis.Worker=prior;}
});
