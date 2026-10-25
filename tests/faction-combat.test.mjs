import test from 'node:test';import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
const soldier=(b,x,y,team='A',stats={},autoCombat=true)=>b.spawn(x,y,null,{team,autoCombat,stats:{maxHealth:300,damage:25,attackPeriod:.65,range:1,rangeShape:'king',...stats}});
function safe(b){const occupied=new Map();for(const u of b.units.filter(u=>u.health.current>0))for(const p of [{x:u.x,y:u.y},...(u.step?[u.step]:[])]){const n=p.y*b.width+p.x;assert.ok(!occupied.has(n)||occupied.get(n)===u.id);occupied.set(n,u.id);}}
function run(b,seconds){for(let i=0;i<seconds*50;i++){b.update(.02);safe(b);}}

test('shared destination has one occupant; other commands wait without overlap',()=>{
 const b=new Board(9,9),units=[b.spawn(0,0),b.spawn(8,0),b.spawn(0,8)];for(const u of units)b.move(u.id,4,4);run(b,12);
 assert.equal(units.filter(u=>u.x===4&&u.y===4).length,1);assert.equal(units.filter(u=>u.command).length,2);assert.ok(units.filter(u=>u.command).every(u=>u.waitReason));
});
test('opposite test factions attack diagonal neighbors while allies and neutrals remain safe',()=>{
 const b=new Board(8,8),a=soldier(b,2,2),foe=soldier(b,3,3,'B'),ally=soldier(b,1,2),neutral=b.spawn(2,1);
 run(b,.6);assert.ok(foe.health.current<300);assert.ok(a.health.current<300||ally.health.current<300);assert.equal(neutral.health.current,100);
 const c=new Board(5,5),u=soldier(c,1,1),v=soldier(c,2,1);assert.equal(c.attack(u.id,v.id),false);run(c,2);assert.equal(v.hits,0);
});
test('out of king range, test actors neither attack nor autonomously chase',()=>{
 const b=new Board(10,10),a=soldier(b,1,1),c=soldier(b,3,3,'B');run(b,4);
 assert.equal(a.hits+c.hits,0);assert.deepEqual([a.x,a.y,c.x,c.y],[1,1,3,3]);
});
test('travel stops after its reserved step, attacks and resumes original destination',()=>{
 const b=new Board(10,5),a=soldier(b,0,1,'A',{damage:100}),foe=soldier(b,3,2,'B',{maxHealth:25},false);
 assert.ok(b.move(a.id,8,1));let attacking=false;
 for(let i=0;i<500;i++){b.update(.02);safe(b);if(a.state==='attack'){attacking=true;assert.equal(a.step,null);assert.equal(a.command.type,'move');assert.equal(a.command.x,8);}}
 assert.ok(attacking);assert.equal(foe.health.current,0);assert.equal(a.x,8);assert.equal(a.y,1);
});
test('incoming damage preserves an automatic mover goal and its active step',()=>{
 const b=new Board(10,3),u=soldier(b,0,1);b.move(u.id,8,1);b.update(.1);b.damage(u.id,25);assert.ok(u.command);assert.ok(u.step);run(b,5);assert.equal(u.x,8);
});
test('data-defined attack periods control hit frequency without interrupting heavy committed attacks',()=>{
 const hits=[];for(const period of [.45,1.25]){const b=new Board(5,5),a=soldier(b,1,1,'A',{attackPeriod:period,damage:10}),v=soldier(b,2,1,'B',{maxHealth:10000,damage:1,attackPeriod:.45});run(b,6);hits.push(v.hits);assert.ok(a.health.current>0);}
 assert.ok(hits[0]>=2*hits[1],String(hits));assert.ok(hits[1]>=3,'heavy attacks cannot be stun locked');
});
test('lethal strikes committed in the same simulation slice trade fairly',()=>{
 const b=new Board(5,5),a=soldier(b,1,1,'A',{maxHealth:25}),v=soldier(b,2,1,'B',{maxHealth:25});run(b,.6);
 assert.equal(a.health.current,0);assert.equal(v.health.current,0);assert.equal(b.reservations.size,0);
});
test('a moving target leaving range before impact avoids damage',()=>{
 const b=new Board(10,5),a=soldier(b,2,1,'A',{attackPeriod:1}),v=soldier(b,3,2,'B',{},false);b.update(.12);assert.equal(a.state,'attack');
 assert.ok(b.move(v.id,8,2));run(b,1);assert.equal(v.hits,0);
});
test('king manual approach can stop diagonally and reset cancels combat',()=>{
 const b=new Board(8,8),a=soldier(b,0,0,'A',{},false),v=soldier(b,4,4,'B',{},false);b.attack(a.id,v.id);run(b,4);assert.equal(v.hits,1);
 const c=new Board(5,5);soldier(c,1,1);soldier(c,2,1,'B');c.update(.12);c.reset();c.update(3);assert.equal(c.units.length,0);assert.equal(c.effects.length,0);
});
test('1000 actors probe a bounded local neighborhood and keep acting without renderer',()=>{
 const b=new Board(100,100);for(let i=0;i<1000;i++)soldier(b,(i%25)*3,Math.floor(i/25)*2,i%2?'B':'A');
 b.update(.12);assert.ok(b.combatStats.probes<=18000);assert.equal(b.combatStats.checks,1000);
});
import {readFile} from 'node:fs/promises';
import {combatAnimationElapsed} from '../src/combat.mjs';
const manifest=JSON.parse(await readFile(new URL('../assets/characters.json',import.meta.url)));
test('visible test classes have independent configured health, damage and attack speed',()=>{
 const defs=Object.values(manifest.characters).filter(d=>!d.hidden);
 for(const d of defs){assert.ok(d.testCombat);assert.ok(d.testCombat.maxHealth>0&&d.testCombat.damage>0&&d.testCombat.attackPeriod>0);assert.equal(d.testCombat.range,1);assert.equal(d.testCombat.rangeShape,'king');}
 const guard=manifest.characters['shield-guard'].testCombat,scout=manifest.characters.scout.testCombat;
 assert.ok(guard.maxHealth>scout.maxHealth*2&&guard.damage>scout.damage&&guard.attackPeriod>scout.attackPeriod*2);
 const b=new Board(),u=soldier(b,1,1,'A',guard),v=soldier(b,2,1,'B',{},false);b.update(.12);u.elapsed=u.strike.duration/2;
 assert.equal(combatAnimationElapsed(u),.325);assert.equal(u.health.max,guard.maxHealth);u.combat.period=5;assert.equal(guard.attackPeriod,1.25);
});
