import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
import {FlagMatch} from '../src/flag-match.mjs';

test('kingdom battlefield is mirrored and bounded by two gate-bearing barriers',()=>{
 const b=new Board(),m=new FlagMatch(b);
 const counts={grass:0,road:0,pond:0,grove:0,wall:0,gate:0};
 for(let y=0;y<100;y++)for(let x=0;x<100;x++){
  const kind=b.terrain[y][x];
  counts[kind]=(counts[kind]||0)+1;
  assert.equal(kind,b.terrain[y][99-x]);
  assert.equal(b.navigation.blocked(y*100+x),kind==='pond'||kind==='wall');
 }
 assert.equal(counts.gate,40);
 assert.ok(counts.grove>100&&counts.grass>4000&&counts.road>100);
 assert.ok(counts.pond>100&&counts.wall>0);
 assert.equal(m.gates.A.length,5);
 for(const [x,y] of [[4,50],[95,50],[28,50],[71,50],[50,50]])
  assert.ok(!b.navigation.blocked(y*100+x));
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
