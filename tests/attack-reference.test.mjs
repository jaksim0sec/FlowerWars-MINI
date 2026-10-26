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
