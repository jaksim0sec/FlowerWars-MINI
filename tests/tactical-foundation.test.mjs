import test from 'node:test';import assert from 'node:assert/strict';import {Board} from '../src/model.mjs';
function advance(b,n=100){for(let i=0;i<n;i++)b.update(.02);}
test('batch orders arbitrate contested cells independently of submission order',()=>{
 function sample(reverse){const b=new Board(5,5,{seed:42}),a=b.spawn(1,2),c=b.spawn(3,2);b.batchCommands(()=>{for(const u of reverse?[c,a]:[a,c])b.move(u.id,2,2);});return b.reservations.get(12);}
 assert.equal(sample(false),sample(true));
});
test('seeded ties do not always favor the first actor',()=>{
 const wins=new Set();for(let seed=1;seed<=30;seed++){const b=new Board(5,5,{seed}),a=b.spawn(1,2),c=b.spawn(3,2);b.batchCommands(()=>{b.move(a.id,2,2);b.move(c.id,2,2);});wins.add(b.reservations.get(12));}assert.equal(wins.size,2);
});
test('movement personality controls actual step time without shared state',()=>{
 const b=new Board(8,8),slow=b.spawn(1,1,null,{movement:{stepTime:.6}}),fast=b.spawn(1,5,null,{movement:{stepTime:.2}});b.move(slow.id,2,1);b.move(fast.id,2,5);b.update(.25);assert.equal(fast.x,2);assert.equal(slow.x,1);advance(b);assert.equal(slow.x,2);
});
test('mirror orientation preserves paired paths and contention outcomes',()=>{
 function sample(mirror){const b=new Board(12,10,{seed:9});b.navigationOrientation=mirror?-1:1;const X=x=>mirror?11-x:x;const a=b.spawn(X(1),3),c=b.spawn(X(10),3);b.batchCommands(()=>{b.move(a.id,X(10),3);b.move(c.id,X(1),3);});const out=[];for(let i=0;i<150;i++){b.update(.02);out.push([X(a.visualX),a.visualY,X(c.visualX),c.visualY].map(n=>Math.round(n*1e9)/1e9));}return out;}assert.deepEqual(sample(false),sample(true));
});
test('ranged spacing respects step policies and explicit attacks',()=>{
 for(const manual of [false,true]){
 const b=new Board(15,10),a=b.spawn(4,4,null,{team:'A',autoCombat:true,stats:{range:5,rangeShape:'king',preferredRange:4}}),near=b.spawn(6,4,null,{team:'B'}),far=b.spawn(9,4,null,{team:'B'});a.combat.targetId=near.id;
 if(manual){b.attack(a.id,far.id);assert.equal(a.state,'attack');assert.equal(a.step,null);}
 else {b.movementPolicy={beforeStep:()=> 'wait'};b.update(.12);assert.equal(a.step,null);}
 }
});
test('Manhattan spacing never chooses a retreat beyond attack range',()=>{
 const b=new Board(15,15),a=b.spawn(5,5,null,{team:'A',autoCombat:true,stats:{range:3,preferredRange:3}}),near=b.spawn(6,6,null,{team:'B'});a.combat.targetId=near.id;b.update(.12);
 if(a.step)assert.ok(Math.abs(a.step.x-near.x)+Math.abs(a.step.y-near.y)<=3);
});
import {readFile} from 'node:fs/promises';import {setupMovementScenario,startMovementScenario} from '../src/movement-scenarios.mjs';
const roster=JSON.parse(await readFile(new URL('../assets/characters.json',import.meta.url))).characters;
test('formation outcomes are unchanged by faction names and mirrored coordinates',()=>{
 function battle(seed,mirror,swap){const b=new Board(),s=setupMovementScenario(b,'formation',32,(_,slot)=>({characterId:slot.characterId}),{seed,mirror,combat:true,statsFor:c=>roster[c.characterId].testCombat,movementFor:c=>roster[c.characterId].testMovement});if(swap)for(const u of b.units)u.team=u.team==='A'?'B':'A';startMovementScenario(b,s);advance(b,1000);return b.units.map(u=>[u.id,u.health.current,u.state,Math.round((mirror?b.width-1-u.visualX:u.visualX)*1e5)/1e5,Math.round(u.visualY*1e5)/1e5]);}
 for(const seed of [1,7,31]){const base=battle(seed,false,false);assert.deepEqual(battle(seed,false,true),base);assert.deepEqual(battle(seed,true,false),base);}
});
test('a pending intent cannot overwrite hit state caused by another actor hook',()=>{
 const b=new Board(10,10),a=b.spawn(0,0,null,{team:'A',autoCombat:true}),c=b.spawn(0,5);
 b.movementPolicy={beforeStep:({unit})=>{if(unit===c)b.damage(a.id,1);return 'move';}};
 b.batchCommands(()=>{b.move(a.id,5,0);b.move(c.id,5,5);});assert.equal(a.state,'hit');assert.equal(a.step,null);assert.ok(a.command);
});
test('mirror controls reflect obstacles as well as actors',()=>{
 for(const type of ['bottleneck','obstacles']){const a=new Board(),b=new Board();setupMovementScenario(a,type,64,()=>null);setupMovementScenario(b,type,64,()=>null,{mirror:true});assert.deepEqual([...a.obstacles.keys()].map(n=>Math.floor(n/a.width)*a.width+a.width-1-n%a.width).sort((x,y)=>x-y),[...b.obstacles.keys()].sort((x,y)=>x-y));}
});
test('batch reset leaves no stale reservation or exception',()=>{const b=new Board(),u=b.spawn(0,0);b.batchCommands(()=>{b.move(u.id,5,0);b.reset();});assert.equal(b.units.length,0);assert.equal(b.reservations.size,0);});
test('spacing hook damage cannot be overwritten by automatic attack in same decision',()=>{
 const b=new Board(15,10),a=b.spawn(4,4,null,{team:'A',autoCombat:true,stats:{range:5,rangeShape:'king',preferredRange:4}}),v=b.spawn(6,4,null,{team:'B'});a.combat.targetId=v.id;b.movementPolicy={beforeStep:()=>{b.damage(a.id,1);return 'move';}};b.update(.12);assert.equal(a.state,'hit');assert.equal(a.step,null);
});
