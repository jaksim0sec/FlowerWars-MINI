import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCharacter,equip,layoutCharacter} from '../src/characters/engine.mjs';
const json=async p=>JSON.parse(await readFile(new URL(p,import.meta.url)));
const manifest=await json('../assets/characters.json'),profile=await json('../assets/animations/humanoid.json');
const catalog={characters:{},equipment:await json('../assets/equipment/catalog.json')};
for(const[id,e]of Object.entries(manifest.characters)){const rig=await json('../assets/'+e.rig);rig.animations={...profile,...rig.animations};catalog.characters[id]={...e,rig};}
test('screen-left arm is immediately behind the torso, except the banner bearer',()=>{
 for(const[id,d]of Object.entries(catalog.characters)){
  const upper=d.rig.nodes[1].children.find(n=>n.id==='upper').children;
  const arm=upper.findIndex(n=>n.id==='leftArm'),body=upper.findIndex(n=>n.part==='body');
  assert.equal(arm,id==='banner-bearer'?body+1:body-1,`${id}: wrong torso/arm layer`);
  for(const state of ['idle','walk','attack','hit'])for(const armed of [false,true]){
   const c=createCharacter(catalog,id);Object.assign(c.animation,{state,elapsed:.2,facing:-1});
   if(armed&&d.recommendedWeapon)equip(catalog,c,d.recommendedWeapon,d.recommendedHand||'left');
   const draws=layoutCharacter(catalog,c,.2).draws,bodyIndex=draws.findIndex(d=>d.part==='body');
   for(const[i,draw]of draws.entries())if(draw.part==='hand_back')assert.ok(id==='banner-bearer'?i>bodyIndex:i<bodyIndex,`${id}/${state}: arm paints over torso`);
  }
 }
});
test('a shield or book is above every character part on either hand, without moving its grip',()=>{
 for(const equipmentId of ['shield_guard_shield','scholar_book'])for(const id of Object.keys(catalog.characters))for(const side of ['left','right'])for(const state of ['idle','walk','attack','hit'])for(const facing of [-1,1]){
  const c=createCharacter(catalog,id);Object.assign(c.animation,{state,elapsed:.2,facing});
  equip(catalog,c,equipmentId,side);
  const l=layoutCharacter(catalog,c,.2),index=l.draws.findIndex(d=>d.socket===side);
  assert.ok(l.draws.every((d,i)=>!d.part||i<index),`${id}/${side}/${state}: ${equipmentId} hidden behind a body part`);
  assert.deepEqual(l.equipmentDraws[side].matrix.slice(4),l.sockets[side].matrix.slice(4),'equipment grip moved');
 }
});
