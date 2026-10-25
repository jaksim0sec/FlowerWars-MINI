import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCharacter,equip,layoutCharacter,point} from '../src/characters/engine.mjs';
const load=async path=>JSON.parse(await readFile(new URL(path,import.meta.url)));
const manifest=await load('../assets/characters.json'),equipment=await load('../assets/equipment/catalog.json'),characters={};
const profile=await load('../assets/animations/humanoid.json');
for(const[id,entry]of Object.entries(manifest.characters)){const rig=await load('../assets/'+entry.rig);rig.animations={...profile,...rig.animations};characters[id]={rig};}
const catalog={characters,equipment};
test('corrected banner and archer keep left and right hands on their own side, armed or bare',()=>{
 for(const id of ['banner-bearer','archer'])for(const armed of [false,true]){
  const c=createCharacter(catalog,id),entry=manifest.characters[id];
  if(armed)equip(catalog,c,entry.recommendedWeapon,entry.recommendedHand||'left');
  const l=layoutCharacter(catalog,c,0);
  assert.ok(point(l.sockets.left.matrix)[0]<point(l.sockets.right.matrix)[0],`${id}: crossed hand identities`);
 }
});
test('banner grip is on its pole and bow grip is on the wrapped handle',()=>{
 assert.ok(Math.abs(equipment.banner_bearer_banner.grip[0]-.2)<.04,'banner attaches to fabric');
 assert.ok(Math.abs(equipment.archer_bow.grip[0]-.73)<.06&&Math.abs(equipment.archer_bow.grip[1]-.54)<.06,'bow misses the handle');
});
test('recommended banner, bow and staff keep an upright grip frame through motion',()=>{
 for(const id of ['banner-bearer','archer','clover-mage'])for(const state of ['idle','walk','attack','hit']){
  const c=createCharacter(catalog,id),entry=manifest.characters[id],side=entry.recommendedHand||'left';
  Object.assign(c.animation,{state,elapsed:.2});equip(catalog,c,entry.recommendedWeapon,side);
  const m=layoutCharacter(catalog,c,.2).equipmentDraws[side].matrix;
  assert.ok(Math.abs(Math.atan2(m[1],m[0]))<.5,`${id}/${state}: weapon tipped sideways`);
 }
 const c=createCharacter(catalog,'banner-bearer');equip(catalog,c,'banner_bearer_banner','both');
 const m=layoutCharacter(catalog,c,0).equipmentDraws.left.matrix;
 assert.ok(Math.abs(Math.atan2(m[1],m[0]))<.1,'two-handed banner lost its upright primary grip');
});
test('socket orientation changes equipment without displacing its painted palm',()=>{
 const rig={parts:{arm:{x:10,y:20,w:100,h:100,origin:[.5,.2],rotation:.9}},sockets:{left:{part:'arm',group:'arm',grip:[.3,.8],rotation:-.9}},nodes:[{id:'arm',children:[{socket:'left'},{part:'arm'}]}],animations:{}};
 const lib={characters:{a:{rig}},equipment:{tool:{hands:1,w:20,h:50,grip:[.5,.5]}}};
 const c=createCharacter(lib,'a');equip(lib,c,'tool','left');const l=layoutCharacter(lib,c,0),d=l.draws.find(d=>d.part),s=rig.sockets.left,p=rig.parts.arm;
 assert.ok(Math.abs(Math.atan2(l.equipmentDraws.left.matrix[1],l.equipmentDraws.left.matrix[0]))<1e-8,'hand rotation tips the weapon');
 const palm=point(d.matrix,(s.grip[0]-p.origin[0])*p.w,(s.grip[1]-p.origin[1])*p.h),anchor=point(l.equipmentDraws.left.matrix);
 assert.ok(Math.hypot(palm[0]-anchor[0],palm[1]-anchor[1])<1e-8);
});
