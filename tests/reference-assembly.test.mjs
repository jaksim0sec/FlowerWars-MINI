import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCharacter,equip,layoutCharacter,point} from '../src/characters/engine.mjs';
const load=async p=>JSON.parse(await readFile(new URL(p,import.meta.url)));
const ids=["shield-guard","scholar","banner-bearer","clover-mage","archer","scout"];
const roster=(await load('../assets/characters.json')).characters,equipment=await load('../assets/equipment/catalog.json'),characters={};
for(const id of ids){const rig=await load('../assets/units/'+id+'/rig.json');rig.animations={};characters[id]={rig};}
const catalog={characters,equipment};
test('six reference-matched characters have common ground and single-layer crowns',()=>{
 for(const id of ids){const r=characters[id].rig;assert.deepEqual(r.foot,[505,1228]);assert.equal(r.scale,.115);
  const top=1228-r.parts.head_deco.y;assert.ok(top>=(id==='banner-bearer'?700:800)&&top<1150,id+' height');
  const upper=r.nodes[1].children.find(n=>n.id==='upper'),neck=upper.children.at(-1);
  assert.equal(neck.id,'neck');assert.deepEqual(neck.children,id==='shield-guard'?[{part:'head_deco'}]:[{part:'head'},{part:'head_deco'}]);
 }
});
test('recommended equipment attaches to its reference socket in idle',()=>{
 for(const id of ids){const key=roster[id].recommendedWeapon;if(!key)continue;
  const c=createCharacter(catalog,id),side=roster[id].recommendedHand||'left';equip(catalog,c,key,side);
  const layout=layoutCharacter(catalog,c,0),a=point(layout.sockets[side].matrix),b=point(layout.equipmentDraws[side].matrix);
  assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-6,id+' disconnected gear');
 }
});
