import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
import {FlagMatch} from '../src/flag-match.mjs';

test('match has mirrored traversable roads, forests and broad clearings instead of walls',()=>{
 const b=new Board();new FlagMatch(b);
 const counts={grass:0,road:0,forest:0};
 for(let y=0;y<100;y++)for(let x=0;x<100;x++){
  counts[b.terrain[y][x]]++;assert.equal(b.terrain[y][x],b.terrain[y][99-x]);
  assert.equal(b.navigation.blocked(y*100+x),b.terrain[y][x]==='forest');
 }
 assert.ok(counts.road>500&&counts.forest>1000&&counts.grass>4000);
 for(const [x,y]of [[4,50],[95,50],[28,50],[71,50],[50,50]])assert.notEqual(b.terrain[y][x],'forest');
});
test('roads speed movement while X rejects movement and placement for both factions',()=>{
 const b=new Board(12,8),a=b.spawn(2,2,null,{team:'A'}),enemy=b.spawn(9,5,null,{team:'B'});
 assert.ok(b.setTerrain(3,2,'road'));assert.ok(b.setTerrain(8,5,'forest'));
 b.beginStep(a,{x:3,y:2});assert.ok(a.step.duration<a.movement.stepTime);
 assert.equal(b.move(enemy.id,8,5),false);assert.equal(b.spawn(8,5),null);
});
test('X cannot replace occupied ground and removing X restores navigation',()=>{
 const b=new Board(12,8);b.spawn(5,3);
 assert.equal(b.setTerrain(5,3,'forest'),false);
 assert.ok(b.setTerrain(6,3,'forest'));assert.ok(b.navigation.blocked(42));
 assert.ok(b.setTerrain(6,3,'grass'));assert.equal(b.navigation.blocked(42),false);
});
