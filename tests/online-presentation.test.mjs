import test from 'node:test';
import assert from 'node:assert/strict';
import {guestVisual} from '../src/online/game-gate.mjs';

test('guest independently renders between received movement frames without changing the unit',()=>{
 const unit={x:10,y:20,visualX:10.25,visualY:20,state:'walk',elapsed:.1,step:{x:11,y:20,elapsed:.1,duration:.4}};
 const before=structuredClone(unit);
 assert.equal(guestVisual(unit,100).x,.5+10);
 assert.deepEqual(unit,before);
 assert.equal(guestVisual(unit,300).x,10.75,'extrapolation is capped at 200ms');
});
test('presentation never advances beyond the reserved single step or invents a next step',()=>{
 const u={x:10,y:20,visualX:10.8,visualY:20,state:'walk',elapsed:.2,step:{x:11,y:20,elapsed:.35,duration:.4}};
 assert.deepEqual([guestVisual(u,150).x,guestVisual(u,10000).x],[11,11]);
 assert.equal(guestVisual({...u,step:null},150).x,10.8);
});
test('local elapsed animation advances while positions and combat stay authoritative',()=>{
 const u={x:4,y:9,visualX:4,visualY:9,state:'attack',elapsed:.12,step:null};
 assert.equal(guestVisual(u,140).elapsed,.26);
 assert.equal(guestVisual(u,-40).elapsed,.12);
 assert.equal(guestVisual(u,Infinity).elapsed,.12);
 assert.equal(u.elapsed,.12);
});
