import test from 'node:test';
import assert from 'node:assert/strict';
import {createCharacter, equip, unequip} from '../src/characters/engine.mjs';
const catalog={characters:{a:{rig:{twoHandedPoses:{hold:{}}},recommendedWeapon:'sword'}},equipment:{sword:{hands:1},staff:{hands:1,secondaryGrip:[.5,.6],twoHandedPose:'hold'}}};
test('instances have no forced equipment and own all mutable state',()=>{
 const a=createCharacter(catalog,'a'),b=createCharacter(catalog,'a');
 assert.deepEqual(a.equipment,{left:null,right:null});
 a.appearance.parts.head='other'; a.animation.state='hit';equip(catalog,a,'sword','left');
 assert.deepEqual(b.appearance.parts,{});assert.equal(b.animation.state,'idle');assert.equal(b.equipment.left,null);
});
test('left, right, dual and shared two-hand equipment replace atomically',()=>{
 const a=createCharacter(catalog,'a');
 equip(catalog,a,'sword','left');equip(catalog,a,'staff','right');assert.notEqual(a.equipment.left,a.equipment.right);
 equip(catalog,a,'staff','both');assert.equal(a.equipment.left,a.equipment.right);
 equip(catalog,a,'sword','left');assert.equal(a.equipment.right,null);
 equip(catalog,a,'staff','both');unequip(a,'right');assert.deepEqual(a.equipment,{left:null,right:null});
});
test('bad equipment or hands leave a valid loadout untouched',()=>{
 const a=createCharacter(catalog,'a');equip(catalog,a,'sword','right');const before=structuredClone(a.equipment);
 assert.throws(()=>equip(catalog,a,'missing','left'));assert.throws(()=>equip(catalog,a,'sword','both'));assert.throws(()=>equip(catalog,a,'sword','foot'));
 assert.deepEqual(a.equipment,before);assert.throws(()=>createCharacter(catalog,'missing'));
});

import {readFile} from 'node:fs/promises';
import {layoutCharacter,point} from '../src/characters/engine.mjs';
const load=async path=>JSON.parse(await readFile(new URL(path,import.meta.url)));
const profile=await load('../assets/animations/humanoid.json');
const rigs={};
for(const id of ['gynari-warrior','sprout-healer']) {const rig=await load(`../assets/units/${id}/rig.json`);rig.animations={...profile,...rig.animations};rigs[id]={rig};}
const real={characters:rigs,equipment:await load('../assets/equipment/catalog.json')};
const near=(a,b)=>assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-8,`${a} != ${b}`);
test('every rig keeps independent and shared weapon grips on both animated hands',()=>{
 for(const id of Object.keys(rigs))for(const state of ['idle','walk','attack','hit'])for(const elapsed of [0,.1,.2,.3])for(const facing of [-1,1]) {
  const c=createCharacter(real,id);Object.assign(c.animation,{state,elapsed,facing,phase:2});
  equip(real,c,'clover_staff','both');
  let layout=layoutCharacter(real,c,elapsed),item=layout.equipmentDraws.left,e=real.equipment.clover_staff;
  near(point(item.matrix),point(layout.sockets.left.matrix));
  near(point(item.matrix,(e.secondaryGrip[0]-e.grip[0])*e.w,(e.secondaryGrip[1]-e.grip[1])*e.h),point(layout.sockets.right.matrix));
  const p=rigs[id].rig.parts.hand_front,d=layout.draws.find(x=>x.part==='hand_front'),s=rigs[id].rig.sockets.right;
  near(point(d.matrix,(s.grip[0]-p.origin[0])*p.w,(s.grip[1]-p.origin[1])*p.h),point(layout.sockets.right.matrix));
  equip(real,c,'basic_sword','left');equip(real,c,'clover_staff','right');layout=layoutCharacter(real,c,elapsed);
  assert.equal(Object.keys(layout.equipmentDraws).length,2);
  for(const side of ['left','right'])near(point(layout.equipmentDraws[side].matrix),point(layout.sockets[side].matrix));
 }
});
test('rendering changes do not mutate definitions or other instances',()=>{
 const before=JSON.stringify(real),a=createCharacter(real,'sprout-healer');equip(real,a,'clover_staff','both');
 layoutCharacter(real,a,.2);assert.equal(JSON.stringify(real),before);
});
test('one weapon animation override cannot change the other weapon during dual wield',()=>{
 const a=createCharacter(real,'gynari-warrior');Object.assign(a.animation,{state:'attack',elapsed:.2});equip(real,a,'basic_sword','left');
 const before=layoutCharacter(real,a,.2).equipmentDraws.left.matrix;
 equip(real,a,'clover_staff','right');
 assert.deepEqual(layoutCharacter(real,a,.2).equipmentDraws.left.matrix,before);
});
