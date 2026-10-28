import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
import {FlagMatch} from '../src/flag-match.mjs';
import {registerPlacedGroup,squadsFor,groupsFor} from '../src/unit-groups.mjs';
import {orderSquad} from '../src/squad-orders.mjs';
import * as dispatcher from '../src/online/match-state.mjs';

let api;
async function adapter(){api ||= await import('../src/online/battle-state.mjs').catch(()=>({}));assert.equal(typeof api.createBattleState,'function','real battle adapter must be available');return api;}
const character=()=>({characterId:'scout',health:{current:100,max:100,injury:0,critical:0},equipment:{left:null,right:null},appearance:{parts:{}},animation:{}});
function spawn(board,x,y,team,settings={}){return board.spawn(x,y,character(),{team,autoCombat:false,...settings});}
function open(board){board.obstacles.clear();for(const row of board.terrain)row.fill('grass');board.obstacleRevision++;board.navigation.invalidate();}
function occupancy(board){const cells=new Set(),reserved=new Set();for(const u of board.units){if(u.health.current<=0)continue;const p=u.y*board.width+u.x;assert.ok(!cells.has(p));cells.add(p);assert.equal(board.at(u.x,u.y),u);if(u.step){const n=u.step.y*board.width+u.step.x;assert.ok(!reserved.has(n));reserved.add(n);assert.equal(board.reservations.get(n),u.id);}}}
async function rehash(s){const {hash,...body}=s;s.hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(body)))).toString('hex');return s;}

test('real battle adapter restores all 700 original soldiers and fresh runtime indexes',async()=>{
 const a=await adapter(),state=a.createBattleState('full',{seed:34}),{board}=state;assert.ok(board instanceof Board);assert.ok(board.match instanceof FlagMatch);assert.equal(board.match.multiplayer,true);assert.equal(board.width,176);assert.equal(board.height,128);
 for(const team of ['A','B']){const ids=[];for(let y=0;y<board.height&&ids.length<350;y++)for(let x=team==='A'?1:88;x<(team==='A'?88:175)&&ids.length<350;x++){if(board.navigation.blocked(y*board.width+x)||board.occupied(x,y))continue;const u=spawn(board,x,y,team);if(u)ids.push(u.id);}assert.equal(ids.length,350);for(let i=0;i<ids.length;i+=12)registerPlacedGroup(board,ids.slice(i,i+12),{team});board.match.reserve[team]=0;}
 board.match.refreshStatus();const snap=await a.saveBattleState(state,18);assert.ok(new TextEncoder().encode(JSON.stringify(snap)).length<a.MAX_BATTLE_SNAPSHOT_BYTES);assert.equal(await dispatcher.validateMatchState(snap),true);const restored=await dispatcher.restoreMatchState(snap);assert.equal(restored.board.units.length,700);assert.notEqual(restored.board.byId,board.byId);assert.equal(groupsFor(restored.board).size,groupsFor(board).size);assert.equal(squadsFor(restored.board).size,squadsFor(board).size);assert.deepEqual(restored.board.terrain,board.terrain);assert.equal(restored.board.match.flags.A,restored.board.unit(-1));occupancy(restored.board);
 const savedAgain=await dispatcher.saveMatchState(restored,18);assert.equal(savedAgain.adapter,'battle-v1');assert.equal(savedAgain.hash,snap.hash);
});

test('in-flight movement, attacks, heal strikes, formation Maps and aliases survive and continue',async()=>{
 const a=await adapter(),state=a.createBattleState('ongoing'),b=state.board;open(b);b.match.start();
 const mover=spawn(b,20,40,'A'),attacker=spawn(b,40,40,'A'),enemy=spawn(b,41,40,'B'),healer=spawn(b,45,40,'A',{unitType:'clover-mage'}),wounded=spawn(b,46,40,'A');wounded.health.current=30;
 const partner=spawn(b,20,41,'A'),group=registerPlacedGroup(b,[mover.id,partner.id],{team:'A'}),s=squadsFor(b).get(group.squads[0]);assert.equal(orderSquad(b,s.id,'advance',{x:25,y:45}),true);s.order.goals.handoffs=new Map([[mover.id,attacker.id]]);
 b.interrupt(mover);b.move(mover.id,23,40,{direct:true,replace:true});if(!mover.step)b.beginStep(mover,{x:21,y:40});mover.step.elapsed=.1;mover.combat.chargeSteps=3;
 b.interrupt(attacker);assert.equal(b.beginAttack(attacker,enemy.id),true);attacker.elapsed=.05;healer.state='attack';healer.elapsed=.05;healer.healing={range:4,amount:25,period:1,nextAt:2};healer.strike={target:wounded.id,healing:true,automatic:true,impactTime:.15,duration:.4};
 mover.character.animation={...mover};mover.character.animation.self=mover.character.animation;
 b.terrain[50][50]='road';b.setObstacle(51,50,{kind:'custom',blocked:true});
 const snap=await a.saveBattleState(state,9),restored=await a.restoreBattleState(snap),r=restored.board;assert.deepEqual(r.unit(mover.id).step,mover.step);assert.equal(r.unit(mover.id).combat.chargeSteps,3);assert.equal(r.unit(mover.id).health,r.unit(mover.id).character.health);assert.equal(r.unit(mover.id).character.animation.state,mover.state);assert.equal(r.unit(mover.id).character.animation.phase,mover.id);assert.equal(r.unit(mover.id).character.animation.character,undefined);assert.equal(r.terrain[50][50],'road');assert.deepEqual(r.obstacles.get(50*r.width+51),{kind:'custom',blocked:true});assert.ok(squadsFor(r).get(s.id).order.goals instanceof Map);assert.deepEqual(squadsFor(r).get(s.id).order.goals.handoffs,new Map([[mover.id,attacker.id]]));
 for(let i=0;i<8;i++){a.stepBattle(state,.05);a.stepBattle(restored,.05);occupancy(r);}assert.equal(r.unit(enemy.id).health.current,b.unit(enemy.id).health.current);assert.equal(r.unit(wounded.id).health.current,b.unit(wounded.id).health.current);assert.ok(r.unit(wounded.id).health.current>30);assert.deepEqual([r.unit(mover.id).x,r.unit(mover.id).y],[b.unit(mover.id).x,b.unit(mover.id).y]);
});

test('courtesy graph keeps root, command, squad and order identity without live objects',async()=>{
 const a=await adapter(),state=a.createBattleState('courtesy'),b=state.board;open(b);const u=spawn(b,20,40,'A'),v=spawn(b,21,40,'A'),group=registerPlacedGroup(b,[u.id,v.id],{team:'A'}),s=squadsFor(b).get(group.squads[0]);orderSquad(b,s.id,'hold');u.command={type:'move',x:22,y:40,direct:true};const chain={root:u,records:[{id:v.id,command:v.command}],cursor:0,remote:{squad:s,order:s.order,goal:{x:22,y:40}},until:20};u.remoteCourtesy=chain;v.courtesy={chain,command:v.command};b.navigation.cooperations.add(chain);
 const r=(await a.restoreBattleState(await a.saveBattleState(state,0))).board,c=r.unit(u.id).remoteCourtesy;assert.equal(c.root,r.unit(u.id));assert.equal(c.remote.squad,squadsFor(r).get(s.id));assert.equal(c.remote.order,squadsFor(r).get(s.id).order);assert.equal(r.unit(v.id).courtesy.chain,c);assert.equal(c.records[0].command,r.unit(v.id).command);assert.ok(r.navigation.cooperations.has(c));
});

test('battle snapshot rejects metadata, hash, oversized, graph and semantic tampering',async()=>{
 const a=await adapter(),state=a.createBattleState('valid'),b=state.board;open(b);spawn(b,20,40,'A');const snap=await a.saveBattleState(state,1);assert.equal(await a.validateBattleState(snap),true);assert.deepEqual(dispatcher.snapshotMetadata(snap),{version:1,adapter:'battle-v1',matchId:'valid',sequence:1,hash:snap.hash});
 for(const bad of [{...snap,version:2},{...snap,adapter:'bad'},{...snap,sequence:-1},{...snap,matchId:'../bad'},{...snap,hash:'0'.repeat(64)},{...snap,extra:'x'},{...snap,state:{}},{...snap,padding:'x'.repeat(a.MAX_BATTLE_SNAPSHOT_BYTES)}])assert.equal(await a.validateBattleState(bad),false);
 const corrupt=structuredClone(snap);corrupt.state.graph.nodes[0]={type:'Date',value:[]};await rehash(corrupt);assert.equal(await a.validateBattleState(corrupt),false);await assert.rejects(()=>a.restoreBattleState(corrupt),/INVALID_SNAPSHOT/);
 const semantic=structuredClone(snap);const node=semantic.state.graph.nodes.find(n=>n.type==='object'&&n.entries?.some(([k,v])=>k==='id'&&v===1));assert.ok(node);node.entries.find(([k])=>k==='x')[1]=-1;await rehash(semantic);assert.equal(await a.validateBattleState(semantic),false);
 b.units[0].health.current=NaN;await assert.rejects(()=>a.saveBattleState(state,0),/INVALID_STATE/);
});

test('a superseded remote order remains recoverable until navigation cancels its courtesy chain',async()=>{
 const a=await adapter(),state=a.createBattleState('superseded'),b=state.board;open(b);const root=spawn(b,20,40,'A'),blocker=spawn(b,21,40,'A'),g=registerPlacedGroup(b,[root.id],{team:'A'}),s=squadsFor(b).get(g.squads[0]);
 orderSquad(b,s.id,'hold');const oldOrder=s.order;const chain={root,records:[{id:blocker.id,command:blocker.command,to:{x:21,y:41}}],cursor:0,remote:{squad:s,order:oldOrder,goal:{x:22,y:40}},until:20};root.remoteCourtesy=chain;blocker.courtesy={chain,command:blocker.command};b.navigation.cooperations.add(chain);
 orderSquad(b,s.id,'wait');assert.notEqual(s.order,oldOrder);assert.ok(b.navigation.cooperations.has(chain));
 const r=(await a.restoreBattleState(await a.saveBattleState(state,0))).board,c=r.unit(root.id).remoteCourtesy;assert.notEqual(c.remote.order,squadsFor(r).get(s.id).order);assert.equal(c.remote.order.type,'hold');r.navigation.serviceCooperation(r.unit(blocker.id));assert.equal(r.navigation.cooperations.size,0);
});

test('elapsed battle steps retain all wall time while integrating preparations in small slices',async()=>{
 const a=await adapter(),state=a.createBattleState('elapsed');a.stepBattle(state,1.25);assert.ok(Math.abs(state.board.time-1.25)<1e-9);assert.ok(Math.abs(state.board.match.elapsed-1.25)<1e-9);assert.ok(Math.abs(state.board.match.remaining-298.75)<1e-9);assert.equal(state.board.units.length,0);
});
