import test from 'node:test';import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';import{advanceHealth,createHealth}from'../src/characters/vitality.mjs';
test('damage lands once, death cannot act or be targeted, and exits after animation',()=>{
 const b=new Board(4,4),a=b.spawn(0,0),v=b.spawn(1,0);v.health.current=25;b.attack(a.id,v.id);b.update(.31);assert.equal(v.health.current,0);assert.equal(v.state,'death');assert.equal(b.at(1,0),undefined);assert.equal(b.attack(v.id,a.id),false);assert.equal(b.attack(a.id,v.id),false);assert.ok(b.unit(v.id));b.update(2);assert.equal(b.unit(v.id),undefined);
});
test('healing is clamped, independent, and health poses ease back without stat penalties',()=>{
 const b=new Board(),a=b.spawn(0,0),v=b.spawn(1,0);assert.notEqual(a.health,v.health);a.health.current=20;b.update(.2);assert.ok(a.health.critical>0);assert.equal(b.heal(a.id,200),80);assert.equal(a.health.current,100);b.update(2);assert.ok(a.health.critical<.001);assert.equal(v.health.current,100);
 const h=createHealth();h.current=50;advanceHealth(h,.02);assert.ok(h.injury>0&&h.injury<1);
});
import {readFile}from'node:fs/promises';
import{createCharacter,equip,layoutCharacter,point}from'../src/characters/engine.mjs';
const load=async p=>JSON.parse(await readFile(new URL(p,import.meta.url)));
const profile=await load('../assets/animations/humanoid.json'),manifest=await load('../assets/characters.json');
const catalog={characters:{},equipment:await load('../assets/equipment/catalog.json')};
for(const[id,e]of Object.entries(manifest.characters)){const rig=await load('../assets/'+e.rig);rig.animations={...profile,...rig.animations};catalog.characters[id]={...e,rig};}
test('wounded equipment stays on palms, healing restores poses, death scatters and fades existing parts',()=>{
 for(const[id,def]of Object.entries(catalog.characters)){
  const c=createCharacter(catalog,id);equip(catalog,c,'basic_sword','left');
  const healthy=layoutCharacter(catalog,c,1);c.health.current=20;advanceHealth(c.health,1);const hurt=layoutCharacter(catalog,c,1);
  assert.notDeepEqual(hurt.draws.find(d=>d.part==='head').matrix,healthy.draws.find(d=>d.part==='head').matrix);
  assert.deepEqual(point(hurt.sockets.left.matrix),point(hurt.equipmentDraws.left.matrix));
  c.health.current=100;advanceHealth(c.health,4);const restored=layoutCharacter(catalog,c,1);
  assert.ok(Math.abs(restored.draws.find(d=>d.part==='head').matrix[4]-healthy.draws.find(d=>d.part==='head').matrix[4])<1e-6);
  c.animation.state='death';c.animation.elapsed=.1;const early=layoutCharacter(catalog,c,1);c.animation.elapsed=1.1;const late=layoutCharacter(catalog,c,1);
  assert.notDeepEqual(early.draws.find(d=>d.part==='head_deco').matrix,late.draws.find(d=>d.part==='head_deco').matrix);
  for(const d of late.draws)if(d.matrix){
    assert.ok(d.matrix.every(Number.isFinite),id);
    if(d.part!=='shadow'){
      const p=def.rig.parts[d.part];
      for(const[x,y]of [[0,0],[1,0],[1,1],[0,1]])assert.ok(point(d.matrix,(x-p.origin[0])*p.w,(y-p.origin[1])*p.h)[1]<=def.rig.foot[1]+1e-6,`${id}/${d.part}: debris fell below ground`);
    }
  }
  c.animation.elapsed=1.7;assert.equal(layoutCharacter(catalog,c,1).draws.find(d=>d.part==='head').alpha,0);
 }
});
test('injury changes neither movement duration nor attack damage',()=>{
 for(const hp of [100,20]){const b=new Board(),a=b.spawn(0,0),v=b.spawn(2,0);a.health.current=hp;b.move(a.id,1,0);b.update(.34);assert.equal(a.state,'idle');assert.equal(a.x,1);b.attack(a.id,v.id);b.update(.3);assert.equal(v.health.current,75);}
});
