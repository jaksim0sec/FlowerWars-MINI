import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCharacter,equip,layoutCharacter} from '../src/characters/engine.mjs';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url)));
test('sword anticipation, impact and recovery coordinate the head and body with the weapon',()=>{
 const rig=read('../assets/units/scout/rig.json');rig.animations={...read('../assets/animations/humanoid.json'),...rig.animations};
 const catalog={characters:{scout:{rig}},equipment:read('../assets/equipment/catalog.json')};
 const c=createCharacter(catalog,'scout');equip(catalog,c,'basic_sword','left');
 const pose=t=>{Object.assign(c.animation,{state:'attack',elapsed:t});return layoutCharacter(catalog,c,t);};
 const start=pose(0),windup=pose(.22),impact=pose(.3),rest=pose(.65);
 assert.ok(windup.vars.bodyRock>0&&impact.vars.bodyRock<0);
 assert.ok(windup.vars.headRock>0&&impact.vars.headRock<0);
 assert.ok(windup.vars.weapon-impact.vars.weapon>1.8);
 assert.equal(rest.vars.weapon,start.vars.weapon);assert.equal(rest.vars.bodyRock,0);
});

test('non-archer attack poses anticipate, make contact and return with their hands attached',()=>{
 const profile=read('../assets/animations/humanoid.json'),equipment=read('../assets/equipment/catalog.json');
 for(const [id,weapon,side] of [
  ['scout','basic_sword','left'],
  ['shield-guard','shield_guard_shield','left'],
  ['scholar','scholar_book','left'],
  ['clover-mage','clover_mage_staff','right'],
  ['banner-bearer','banner_bearer_banner','left'],
  ['scout','ribbon_spear','left']
 ]) {
  const rig=read(`../assets/units/${id}/rig.json`);
  rig.animations={...profile,...rig.animations};
  const catalog={characters:{[id]:{rig}},equipment};
  const c=createCharacter(catalog,id);equip(catalog,c,weapon,side);
  const pose=(state,t)=>{Object.assign(c.animation,{state,elapsed:t,attackVector:{x:-72,y:0},facing:-1});return layoutCharacter(catalog,c,t);};
  const windup=pose('attack',weapon==='ribbon_spear'?.08:.19);
  const impact=pose('attack',weapon==='ribbon_spear'?.14:.30);
  const recover=pose('attack',.65),idle=pose('idle',.65);
  assert.notDeepEqual(windup.sockets[side].matrix,impact.sockets[side].matrix,`${weapon}: weapon arm remains rigid`);
  assert.ok(Math.hypot(...recover.sockets[side].matrix.slice(4).map((n,i)=>n-idle.sockets[side].matrix[i+4]))<1e-7,`${weapon}: arm does not return to rest`);
  assert.ok(Math.hypot(...impact.equipmentDraws[side].matrix.slice(4).map((n,i)=>n-impact.sockets[side].matrix[i+4]))<1e-7,`${weapon}: grip separates from the palm`);
 }
});

test('archer upper body retains its previous fixed bow posture',()=>{
 const rig=read('../assets/units/archer/rig.json');
 rig.animations={...read('../assets/animations/humanoid.json'),...rig.animations};
 const catalog={characters:{archer:{rig}},equipment:read('../assets/equipment/catalog.json')};
 const c=createCharacter(catalog,'archer');equip(catalog,c,'archer_bow','left');
 const pose=state=>{Object.assign(c.animation,{state,elapsed:.30});return layoutCharacter(catalog,c,.30);};
 const attacking=pose('attack'),idle=pose('idle');
 assert.equal(attacking.vars.attackBodyWeight??0,0);
 assert.equal(attacking.vars.attackHeadWeight??0,0);
 for(const group of ['upper','neck'])assert.ok(attacking.groups[group].matrix.every((v,i)=>Math.abs(v-idle.groups[group].matrix[i])<1e-8),`archer ${group} body motion changed`);
});
