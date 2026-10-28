import test from 'node:test';import assert from 'node:assert/strict';
import {createBattleState,saveBattleState,restoreBattleState} from '../src/online/battle-state.mjs';
import {BattleFrames,applyBattleFrame} from '../src/online/battle-wire.mjs';
function deploy(s,team){const m=s.board.match;for(let x=team==='A'?8:110;x<(team==='A'?80:170);x++)for(let y=10;y<117;y++){const result=m.deploy(team,'mixed',{x,y});if(result)return result;}throw Error('no space');}
test('guest frames add deployments, apply positions/HP/formation/flags, delete deaths without simulating',async()=>{const host=createBattleState('frame',{seed:73}),guest=await restoreBattleState(await saveBattleState(host,0)),stream=new BattleFrames();const a=deploy(host,'A'),b=deploy(host,'B');const packet=stream.build(host);assert.equal(applyBattleFrame(guest,packet),true);assert.equal(guest.board.units.length,host.board.units.length);const u=host.board.unit(b.memberIds[1]);u.health.current=12;host.board.match.flags.A.health.current=900;const next=stream.build(host);assert.equal(applyBattleFrame(guest,next),true);assert.equal(guest.board.unit(u.id).health.current,12);assert.equal(guest.board.match.flags.A.health.current,900);assert.equal(guest.board.time,0);assert.equal(stream.build(host).units.length,0);assert.equal(guest.board.match.squadIds.B[0],b.id);host.board.units=host.board.units.filter(x=>x.id!==u.id);assert.equal(applyBattleFrame(guest,stream.build(host)),true);assert.equal(guest.board.unit(u.id),undefined);});
test('bad frames reject before partial mutation and do not install malicious IDs or coordinates',()=>{const state=createBattleState('bad',{seed:17}),stream=new BattleFrames();deploy(state,'A');const frame=stream.build(state),before=state.board.units[0].health.current;frame.units[0][1]=-99;assert.equal(applyBattleFrame(state,frame),false);assert.equal(state.board.units[0].health.current,before);});
test('full frame after backpressure reset removes actors whose tombstone was not delivered',async()=>{const host=createBattleState('drop',{seed:73});deploy(host,'A');const guest=await restoreBattleState(await saveBattleState(host,0)),stream=new BattleFrames();assert.equal(applyBattleFrame(guest,stream.build(host)),true);const dead=host.board.units.at(-1).id;host.board.units=host.board.units.filter(u=>u.id!==dead);stream.build(host);stream.reset();assert.equal(applyBattleFrame(guest,stream.build(host)),true);assert.equal(guest.board.units.length,host.board.units.length);assert.equal(guest.board.unit(dead),undefined);});

test('unchanged incremental frames preserve spatial index identity and cached queries',async()=>{
 const host=createBattleState('incremental-stable',{seed:73}),guest=await restoreBattleState(await saveBattleState(host,0)),stream=new BattleFrames();
 deploy(host,'A');assert.equal(applyBattleFrame(guest,stream.build(host)),true);
 const b=guest.board,originalUnits=b.units;
 let clears=0;const clear=b.spatial.clear.bind(b.spatial);b.spatial.clear=()=>{clears++;clear();};
 const unit=host.board.units[0],view=guest.board.unit(unit.id);
 const before=b.spatial.memberships.get(unit.id);
 unit.elapsed+=.05;unit.state='walk';
 assert.equal(applyBattleFrame(guest,stream.build(host)),true);
 assert.equal(b.units,originalUnits,'an actor-only frame must not allocate an entire unit array');
 assert.equal(b.unit(unit.id),view,'existing actor identity must remain stable');
 assert.equal(b.spatial.memberships.get(unit.id),before,'unchanged geometry must preserve membership');
 assert.equal(clears,0,'incremental frames must never clear the entire spatial index');
});
test('incremental movement, death and removal update only affected occupancy',async()=>{
 const host=createBattleState('incremental-move',{seed:73}),guest=await restoreBattleState(await saveBattleState(host,0)),stream=new BattleFrames();
 deploy(host,'A');deploy(host,'B');assert.equal(applyBattleFrame(guest,stream.build(host)),true);
 const hb=host.board,gb=guest.board,u=hb.units[0],other=hb.units.at(-1);
 const before=gb.spatial.memberships.get(other.id);
 const key=(x,y)=>y*gb.width+x,oldKey=key(u.x,u.y);
 const nextX=u.x+1,nextY=u.y;
 assert.ok(hb.inside(nextX,nextY));
 u.step={x:nextX,y:nextY,elapsed:0,duration:.4};u.state='walk';
 assert.equal(applyBattleFrame(guest,stream.build(host)),true);
 assert.equal(gb.reservations.get(key(nextX,nextY)),u.id);
 assert.equal(gb.cells.get(oldKey),u.id);
 assert.equal(gb.spatial.memberships.get(other.id),before,'unaffected membership must not be touched');
 u.health.current=0;u.state='death';u.step=null;
 assert.equal(applyBattleFrame(guest,stream.build(host)),true);
 assert.equal(gb.cells.has(oldKey),false);
 assert.equal(gb.reservations.has(key(nextX,nextY)),false);
 assert.equal(gb.spatial.memberships.has(u.id),false);
 hb.units=hb.units.filter(a=>a.id!==u.id);
 assert.equal(applyBattleFrame(guest,stream.build(host)),true);
 assert.equal(gb.byId.has(u.id),false);
 assert.equal(gb.units.length,hb.units.length);
});

test('700 unchanged actors incur zero spatial updates on small state-only deltas',async()=>{
 const host=createBattleState('delta-700',{seed:71}),guest=await restoreBattleState(await saveBattleState(host,0)),stream=new BattleFrames();
 for(const team of ['A','B']){let n=0;for(let y=8;y<host.board.height&&n<350;y++)for(let x=team==='A'?8:100;x<(team==='A'?76:169)&&n<350;x++){
  if(host.board.navigation.blocked(y*host.board.width+x)||host.board.occupied(x,y))continue;
  if(host.board.spawn(x,y,null,{team}))n++;
 }assert.equal(n,350);}
 assert.equal(applyBattleFrame(guest,stream.build(host)),true);
 assert.equal(guest.board.units.length,700);
 const b=guest.board,units=b.units,keep=b.units[699],membership=b.spatial.memberships.get(keep.id);
 let moves=0,clears=0;const originalMove=b.spatial.move.bind(b.spatial),originalClear=b.spatial.clear.bind(b.spatial);
 b.spatial.move=u=>{moves++;return originalMove(u);};b.spatial.clear=()=>{clears++;return originalClear();};
 for(const u of host.board.units.slice(0,5)){u.state='hit';u.elapsed=.07;}
 const delta=stream.build(host);assert.equal(delta.units.length,5);
 assert.equal(applyBattleFrame(guest,delta),true);
 assert.equal(b.units,units);
 assert.equal(b.units[699],keep);
 assert.equal(b.spatial.memberships.get(keep.id),membership);
 assert.equal(moves,0);assert.equal(clears,0);
 assert.equal(b.cells.size,700);
});
test('two-phase spatial updates do not delete another actor on simultaneous movements',async()=>{
 const host=createBattleState('delta-swap',{seed:71}),guest=await restoreBattleState(await saveBattleState(host,0)),stream=new BattleFrames();
 const b=host.board;b.obstacles.clear();for(const row of b.terrain)row.fill('grass');
 const left=b.spawn(20,40,null,{team:'A'}),right=b.spawn(21,40,null,{team:'B'});
 assert.ok(left&&right);assert.equal(applyBattleFrame(guest,stream.build(host)),true);
 [left.x,right.x]=[right.x,left.x];
 left.visualX=left.x;right.visualX=right.x;
 assert.equal(applyBattleFrame(guest,stream.build(host)),true);
 const g=guest.board;
 assert.equal(g.cells.get(40*g.width+20),right.id);
 assert.equal(g.cells.get(40*g.width+21),left.id);
 assert.equal(g.spatial.memberships.size,2);
});
