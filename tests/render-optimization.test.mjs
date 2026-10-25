import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';
import{cachedPose,onScreen,characterRadius}from'../src/character-render-cache.mjs';import{createCharacter,equip,point,layoutCharacter}from'../src/characters/engine.mjs';
const load=async p=>JSON.parse(await readFile(new URL(p,import.meta.url)));
const m=await load('../assets/characters.json'),profile=await load('../assets/animations/humanoid.json'),lib={characters:{},equipment:await load('../assets/equipment/catalog.json')};
for(const[id,d]of Object.entries(m.characters)){const r=await load('../assets/'+d.rig);r.animations={...profile,...r.animations};lib.characters[id]={...d,rig:r};}
test('pose reuse preserves fast combat and invalidates changed loadouts',()=>{
 const c=createCharacter(lib,'archer');assert.ok(cachedPose(lib,c,1,1).computed);assert.equal(cachedPose(lib,c,1.001,1).computed,false);
 equip(lib,c,'basic_sword','left');assert.ok(cachedPose(lib,c,1.002,1).computed);c.animation.state='attack';assert.ok(cachedPose(lib,c,1.003,1).computed);assert.ok(cachedPose(lib,c,1.004,1).computed);
 assert.ok(characterRadius(lib,c)>100);assert.equal(onScreen(-10000,-10000,characterRadius(lib,c),{x:0,y:0,scale:1},800,600),false);
});
test('resting swords point outward on both hands for every rig',()=>{
 for(const id of Object.keys(lib.characters))for(const side of ['left','right'])for(const state of ['idle','walk','hit']){
  const c=createCharacter(lib,id);c.animation.state=state;c.animation.elapsed=.1;equip(lib,c,'basic_sword',side);const l=layoutCharacter(lib,c,.1),d=l.equipmentDraws[side],e=lib.equipment.basic_sword;
  const palm=point(d.matrix),tip=point(d.matrix,(.05-e.grip[0])*e.w,(.05-e.grip[1])*e.h);
  assert.ok(side==='left'?tip[0]<palm[0]-50:tip[0]>palm[0]+50,`${id}/${side}/${state}: blade towards neck`);
 }
});
