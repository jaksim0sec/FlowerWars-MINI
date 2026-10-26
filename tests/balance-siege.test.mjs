import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Board} from '../src/model.mjs';
import {FlagMatch} from '../src/flag-match.mjs';
const profiles=JSON.parse(await readFile(new URL('../assets/characters.json',import.meta.url))).characters;
test('archer recovery limits repeated shots while a shield soldier can close and strike',()=>{
 const b=new Board(20,10),archer=b.spawn(6,5,{characterId:'archer'},{team:'B',autoCombat:true,stats:profiles.archer.testCombat,movement:profiles.archer.testMovement});
 const shield=b.spawn(1,5,{characterId:'shield-guard'},{team:'A',autoCombat:true,stats:profiles['shield-guard'].testCombat,movement:profiles['shield-guard'].testMovement});
 b.attack(shield.id,archer.id);let struck=false;
 for(let i=0;i<400;i++){b.update(.05);if(archer.health.current<archer.health.max)struck=true;}
 assert.ok(struck,'shield must survive the approach and land a melee hit');
 const c=new Board(12,8),a=c.spawn(3,3,null,{team:'A',autoCombat:true,stats:profiles.archer.testCombat}),target=c.spawn(5,3,null,{team:'B',stats:{maxHealth:5000}});
 for(let i=0;i<84;i++)c.update(.05);
 assert.ok(target.hits<=3,'recovery must leave a real gap between volleys');
});
test('touching a flag does not win; soldiers must land real attacks and destroy its health',()=>{
 const b=new Board(),m=new FlagMatch(b,{count:1});m.deploy('A','mobile',{x:20,y:20});m.start();
 const a=b.units.find(u=>u.team==='A'),flag=m.flags.B;
 b.cells.delete(a.y*100+a.x);a.x=a.visualX=94;a.y=a.visualY=50;b.cells.set(5094,a.id);b.spatial.move(a);
 m.refreshStatus();assert.equal(m.phase,'battle');
 assert.ok(b.attack(a.id,flag.id));
 for(let i=0;i<20;i++){b.update(.05);m.update(.05);}
 assert.ok(flag.health.current<flag.health.max&&flag.health.current>0);assert.equal(m.phase,'battle');
 b.damage(flag.id,flag.health.max);m.refreshStatus();assert.equal(m.winner,'A');
});
test('automatic attacks acquire enemy flags without counting flags as soldiers',()=>{
 const b=new Board(),m=new FlagMatch(b,{count:1});m.deploy('A','mobile',{x:20,y:20});m.start();
 const a=b.units.find(u=>u.team==='A');b.cells.delete(a.y*100+a.x);a.x=a.visualX=94;a.y=a.visualY=50;b.cells.set(5094,a.id);b.spatial.move(a);
 for(let i=0;i<20;i++){b.update(.05);m.update(.05);}
 assert.ok(m.flags.B.health.current<m.flags.B.health.max);assert.deepEqual(m.counts,{A:1,B:1});assert.equal(b.units.length,2);
});
test('simultaneous killing impacts draw in the same combat batch, without waiting for the status poll',()=>{
 const b=new Board(),m=new FlagMatch(b,{count:1});m.deploy('A','mobile',{x:20,y:20});m.start();
 const a=b.units.find(u=>u.team==='A'),enemy=b.units.find(u=>u.team==='B');
 for(const u of [a,enemy])b.cells.delete(u.y*100+u.x);
 Object.assign(a,{x:94,visualX:94,y:50,visualY:50});Object.assign(enemy,{x:5,visualX:5,y:50,visualY:50});
 for(const u of [a,enemy]){b.cells.set(u.y*100+u.x,u.id);b.spatial.move(u);}
 m.flags.A.health.current=m.flags.B.health.current=25;
 assert.ok(b.beginAttack(a,m.flags.B.id));assert.ok(b.beginAttack(enemy,m.flags.A.id));b.update(.4);
 assert.equal(m.phase,'finished');assert.equal(m.winner,'draw');
 assert.ok(b.time<.4,'remaining integration slices must stop at destruction');
 const stopped=b.time;b.update(1);assert.equal(b.time,stopped);
});
