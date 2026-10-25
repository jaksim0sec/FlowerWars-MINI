import test from 'node:test';import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';import {setupMovementScenario} from '../src/movement-scenarios.mjs';
test('battle formation is mirrored, scout-heavy, with shield front and sparse support',()=>{
 const b=new Board(),slots=[];setupMovementScenario(b,'formation',64,(i,slot)=>{slots.push(slot);return null;});
 assert.equal(b.units.length,64);assert.ok(slots.every(Boolean));
 for(const team of ['A','B']){
  const units=b.units.filter(u=>u.team===team),roles=slots.filter((_,i)=>b.units[i].team===team),counts={};for(const s of roles)counts[s.role]=(counts[s.role]||0)+1;
  assert.ok(counts.scout>=20);for(const role of ['guard','banner','archer','autumn'])assert.ok(counts[role]>0);assert.ok(counts.archer<=3&&counts.autumn<=3);
  const guards=units.filter((_,i)=>roles[i].role==='guard'),archers=units.filter((_,i)=>roles[i].role==='archer');assert.ok(guards.every(g=>archers.every(a=>team==='A'?g.x>a.x:g.x<a.x)));
 }
 for(let i=0;i<64;i+=2){assert.equal(b.units[i].x+b.units[i+1].x,b.width-1);assert.equal(b.units[i].y,b.units[i+1].y);assert.equal(slots[i].role,slots[i+1].role);}
});
