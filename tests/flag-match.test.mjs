import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
import {FlagMatch} from '../src/flag-match.mjs';
import {squadsFor} from '../src/unit-groups.mjs';
test('automatic armies obey the 500 cap and deploy on their own half',()=>{
 const b=new Board(),m=new FlagMatch(b,{count:900});assert.deepEqual(m.counts,{A:500,B:500});assert.equal(b.units.length,1000);
 assert.ok(b.units.every(u=>m.inTerritory(u.team,u)));assert.equal(new Set(b.units.map(u=>u.y*b.width+u.x)).size,1000);
 assert.equal(b.spawn(0,0,null,{team:'A'}),null);
});
test('small and uneven requested armies remain exact and timers transition once',()=>{
 for(const count of [1,13,24]){const b=new Board(),m=new FlagMatch(b,{count});assert.deepEqual(m.counts,{A:count,B:count});m.update(299);assert.equal(m.phase,'preparation');m.update(1);assert.equal(m.phase,'battle');assert.equal(m.start(),false);}
});
test('preparation rejects crossing, hostile orders and attacks; skip starts combat',()=>{
 const b=new Board(),m=new FlagMatch(b,{count:24}),a=b.units.find(u=>u.team==='A'),enemy=b.units.find(u=>u.team==='B');
 assert.equal(b.move(a.id,60,20),false);assert.equal(b.attack(a.id,enemy.id),false);assert.equal(m.canCommand('B','move',{x:70,y:20}),false);assert.equal(m.canCommand('A','move',{x:20,y:20}),true);
 m.start();assert.equal(m.phase,'battle');assert.ok(b.units.every(u=>u.combat.auto));m.update(.1);assert.ok(m.decisions>0);assert.ok(m.squadIds.B.some(id=>squadsFor(b).get(id).order));
});
test('reaching the opposing flag wins and freezes battle; the home flag does not',()=>{
 const b=new Board(),m=new FlagMatch(b,{count:12}),a=b.units.find(u=>u.team==='A');m.start();
 a.visualX=m.flags.A.x;a.visualY=m.flags.A.y;m.refreshStatus();assert.equal(m.phase,'battle');
 a.visualX=m.flags.B.x;a.visualY=m.flags.B.y;m.refreshStatus();assert.equal(m.winner,'A');assert.equal(m.phase,'finished');const t=b.time;b.update(1);assert.equal(b.time,t);
});
test('a dead soldier cannot capture and simultaneous flag arrivals draw fairly',()=>{
 const b=new Board(),m=new FlagMatch(b,{count:12}),a=b.units.find(u=>u.team==='A'),enemy=b.units.find(u=>u.team==='B');m.start();
 b.damage(a.id,10000);a.visualX=95;a.visualY=50;m.refreshStatus();assert.equal(m.phase,'battle');
 const live=b.units.find(u=>u.team==='A'&&u.health.current>0);live.visualX=95;live.visualY=50;enemy.visualX=4;enemy.visualY=50;m.refreshStatus();assert.equal(m.winner,'draw');
});
test('reset invalidates the match without retaining capture state',()=>{
 const b=new Board(),m=new FlagMatch(b,{count:12});b.reset();m.update(400);assert.equal(b.match,null);assert.equal(b.units.length,0);assert.equal(b.movementPolicy,undefined);
});
