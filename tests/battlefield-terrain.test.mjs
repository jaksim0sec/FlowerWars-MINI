import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
import {FlagMatch} from '../src/flag-match.mjs';

test('match has mirrored traversable roads, forests and broad clearings instead of walls',()=>{
 const b=new Board();new FlagMatch(b);
 const counts={grass:0,road:0,forest:0};
 for(let y=0;y<100;y++)for(let x=0;x<100;x++){
  counts[b.terrain[y][x]]++;assert.equal(b.terrain[y][x],b.terrain[y][99-x]);
  assert.equal(b.navigation.blocked(y*100+x),false);
 }
 assert.ok(counts.road>500&&counts.forest>1000&&counts.grass>4000);
 for(const [x,y]of [[4,50],[95,50],[28,50],[71,50],[50,50]])assert.notEqual(b.terrain[y][x],'forest');
});
test('roads speed movement while passable forest slows it equally for both factions',()=>{
 const b=new Board(12,8),a=b.spawn(2,2,null,{team:'A'}),enemy=b.spawn(9,5,null,{team:'B'});
 assert.ok(b.setTerrain(3,2,'road'));assert.ok(b.setTerrain(8,5,'forest'));
 b.beginStep(a,{x:3,y:2});b.beginStep(enemy,{x:8,y:5});
 assert.ok(a.step.duration<a.movement.stepTime);assert.ok(enemy.step.duration>enemy.movement.stepTime);
});
test('forest cover reduces incoming ranged hits but leaves melee hits unchanged',()=>{
 const b=new Board(12,8),archer=b.spawn(2,3,null,{team:'A',stats:{range:5,damage:40}}),target=b.spawn(5,3,null,{team:'B'});
 b.setTerrain(5,3,'forest');assert.ok(b.beginAttack(archer,target.id));b.update(.4);
 assert.equal(target.health.max-target.health.current,30);
 const melee=b.spawn(6,3,null,{team:'A',stats:{damage:40}});assert.ok(b.beginAttack(melee,target.id));b.update(.4);
 assert.equal(target.health.max-target.health.current,70);
});
