import test from 'node:test';
import assert from 'node:assert/strict';
import {selectFront,trackProgress} from '../src/ai/operations.mjs';
import {evaluate,INTENTS} from '../src/ai/principles.mjs';
import {Board} from '../src/model.mjs';
import {FlagMatch} from '../src/flag-match.mjs';
const squad=(id,type,melee,shield=0,spear=0)=>({id,squad:{type},melee,shield,spear,fire:0,heal:0,count:melee+1,ratio:1,power:20,x:20,y:20,health:100,maxHealth:100,speed:2});
test('front selection favors shields for defense and spears for penetration instead of melee headcount',()=>{
 const shield=squad('shield','defense',5,5),infantry=squad('infantry','mixed',11),assault=squad('spear','assault',11,0,11);
 for(const intent of ['HOLD','DEFEND','ADVANCE','COUNTERATTACK'])assert.equal(selectFront([infantry,assault,shield],intent),shield);
 for(const intent of ['BREAKTHROUGH','FLANK','CAPTURE'])assert.equal(selectFront([infantry,shield,assault],intent),assault);
 shield.shield=0;shield.melee=0;assert.notEqual(selectFront([shield,assault],'DEFEND'),shield);
});
test('all intents reject unreachable routes and do not penalize additional friendly combat strength',()=>{
 for(const intent of INTENTS){const c={intent,node:{kind:'battle'},travel:30,progress:.5,value:0,local:{A:20,B:0,heal:0,congestion:0},exposure:.3},ctx={power:10,ratio:.6,speed:2,homeDanger:true};assert.equal(evaluate({...c,travel:Infinity},ctx),-Infinity);assert.ok(evaluate(c,{...ctx,power:30})>=evaluate(c,ctx),intent);}
});
test('losses with no actual progress invalidate an operation even when surviving squads are attacking',()=>{
 const s=squad('a','mixed',11),states=new Map([['a',s]]),op={squadIds:['a'],intent:'ADVANCE',goal:{x:0,y:20},route:[],waypoint:0,lastProgressAt:0,bestDistance:20,windowPower:40,lossWindow:0},metrics={progress:0,completed:0,stalls:0};s.engaged=3;
 trackProgress(op,states,null,6,metrics);assert.equal(op.ineffective,true);assert.equal(op.stalled,true);assert.equal(metrics.progress,0);
});
test('current recruitment places complete operations within supporting distance without duplicate cells on 176x128',()=>{
 for(const seed of [17,73,191]){const b=new Board(),m=new FlagMatch(b,{seed,aiImplementation:'utility'});m.start();assert.deepEqual([b.width,b.height],[176,128]);assert.equal(m.counts.B,350);const ops=[...m.botOperations.values()];for(let i=1;i<ops.length;i++)assert.ok(ops.slice(0,i).some(o=>Math.hypot(o.anchor.x-ops[i].anchor.x,o.anchor.y-ops[i].anchor.y)<=30));assert.equal(new Set(b.units.map(u=>u.y*b.width+u.x)).size,b.units.length);}
});
test('combat redirects pass the gateway after cooldown and identical redirects retain the same order',()=>{
 const b=new Board(),m=new FlagMatch(b,{aiImplementation:'utility',count:72,makeCharacter:s=>({characterId:s.characterId})});m.start();const ai=m.command,state=ai.states.values().next().value;
 assert.ok(ai.gateway.issue(state,'advance',m.flags.B,{urgent:true}));const before=state.squad.order;b.time+=4;state.engaged=1;state.redirect=true;
 const goal=b.battlefield.rooms.find(r=>r.id==='battle');assert.ok(ai.gateway.issue(state,'advance',goal));assert.notEqual(state.squad.order,before);const order=state.squad.order;assert.ok(ai.gateway.issue(state,'advance',goal));assert.equal(state.squad.order,order);
});
test('map-scale travel is a cost rather than an arbitrary hard rejection',()=>{
 const c={intent:'CAPTURE',node:{kind:'objective'},travel:400,progress:1,value:8,local:{A:0,B:0,heal:0,congestion:0},exposure:1};assert.ok(Number.isFinite(evaluate(c,{power:30,ratio:1,speed:3,routeScale:200})));
});
