import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
import {createFormationGroup} from '../src/unit-groups.mjs';
const battle={damageMultiplier:1.5,speedMultiplier:1.5,attackPeriod:3.2,impactTime:.07,activeDuration:.32,movingPoise:true,charge:true};
const spear=(b,x,y)=>b.spawn(x,y,null,{team:'A',autoCombat:true,stats:{maxHealth:100,damage:14,attackPeriod:.45},movement:{stepTime:.28},battle});
test('spear strikes promptly for 1.5 sword damage and has a long recovery independent of its thrust animation',()=>{
 const b=new Board(20,10),u=spear(b,5,5),enemy=b.spawn(6,5,null,{team:'B',stats:{maxHealth:1000}});
 b.update(.25);assert.equal(enemy.health.current,979);
 b.update(2);assert.equal(enemy.hits,1);assert.notEqual(u.state,'attack');
 b.update(1.4);assert.equal(enemy.hits,2);
});
test('spear movement is 1.5 times normal and moving damage preserves locomotion and reservations',()=>{
 const b=new Board(20,10),u=spear(b,3,5);b.move(u.id,14,5,{direct:true});const step=u.step;
 assert.ok(Math.abs(step.duration-.28/1.5)<1e-8);
 b.damage(u.id,10);assert.equal(u.health.current,90);assert.equal(u.state,'walk');assert.equal(u.step,step);
 assert.equal(b.reservations.get(step.y*b.width+step.x),u.id);
 b.update(.2);assert.ok(u.x>3);
 b.damage(u.id,1000);assert.equal(u.state,'death');assert.equal(u.step,null);
});
test('assault template replaces shields and sword scouts with spear scouts',()=>{
 const bp=createFormationGroup(12,'squad','','assault');
 assert.equal(bp.members.filter(m=>m.characterId==='shield-guard').length,0);
 const troops=bp.members.filter(m=>m.characterId==='scout');assert.equal(troops.length,10);
 assert.ok(troops.every(m=>m.weapon==='ribbon_spear'&&m.battle.movingPoise));
 assert.equal(bp.members.filter(m=>m.role==='banner').length,1);
 assert.ok(bp.members.every(m=>m.battle.speedMultiplier===1.5),'supporting troops must keep up with the charge');
});
test('equipped spear profile applies through the shared factory without blueprint-specific buffs',async()=>{
 const {readFile}=await import('node:fs/promises');const {createCharacter,equip,layoutCharacter,point}=await import('../src/characters/engine.mjs');
 const equipment=JSON.parse(await readFile(new URL('../assets/equipment/catalog.json',import.meta.url)));
 const rig=JSON.parse(await readFile(new URL('../assets/units/scout/rig.json',import.meta.url)));
 rig.animations={...JSON.parse(await readFile(new URL('../assets/animations/humanoid.json',import.meta.url))),...rig.animations};
 const catalog={characters:{scout:{rig}},equipment};
 const c=createCharacter(catalog,'scout');equip(catalog,c,'ribbon_spear','left');
 const b=new Board(20,10),u=b.spawn(5,5,c,{team:'A',stats:{damage:14,attackPeriod:.45},movement:{stepTime:.28}});
 assert.equal(u.damage,28);assert.ok(Math.abs(u.movement.stepTime-.28/1.5)<1e-8);
 const angles=[];
 for(const t of [0,.08,.14,.3,.5]){
  Object.assign(c.animation,{state:'attack',elapsed:t,attackVector:{x:-72,y:0}});
  const l=layoutCharacter(catalog,c,t),d=l.equipmentDraws.left;
  const grip=point(d.matrix),hand=point(l.sockets.left.matrix);
  assert.ok(Math.hypot(grip[0]-hand[0],grip[1]-hand[1])<1e-8);
  const tip=point(d.matrix,0,-500);assert.ok(tip[0]<grip[0]-400,'spear does not point at the target');
  angles.push(Math.atan2(d.matrix[1],d.matrix[0]));
 }
 assert.ok(Math.max(...angles)-Math.min(...angles)<.01,'spear slashes instead of thrusting');
});
test('a new move can leave contact during spear recovery without resetting its cooldown',()=>{
 const b=new Board(20,10),u=spear(b,5,5),enemy=b.spawn(6,5,null,{team:'B',stats:{maxHealth:1000}});
 b.update(.5);assert.equal(enemy.hits,1);const ready=u.combat.nextAttackAt;
 assert.ok(b.move(u.id,2,5,{replace:true,direct:true}));
 assert.ok(u.step,'long recovery froze the new movement command');assert.equal(u.combat.nextAttackAt,ready);
});
