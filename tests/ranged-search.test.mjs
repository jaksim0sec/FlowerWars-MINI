import test from 'node:test';
import assert from 'node:assert/strict';
import {SpatialIndex} from '../src/spatial-index.mjs';
import {Board} from '../src/model.mjs';
import {combatOptions,findLocalEnemy,tryAutoAttack} from '../src/combat.mjs';

function arena(width=200,height=200) {
  const units=new Map();
  return {width,height,seed:41,decisionEpoch:0,time:0,cells:new Map(),reservations:new Map(),obstacles:new Map(),
    spatial:new SpatialIndex(width,height),combatStats:{checks:0,probes:0},
    inside:(x,y)=>x>=0&&y>=0&&x<width&&y<height,unit:id=>units.get(id),
    beginAttack(actor,id){actor.lastAttack=id;return true;},
    add(id,x,y,team='A',stats={}) {
      const actor={id,x,y,visualX:x,visualY:y,priorityKey:id*7919,team,health:{current:100},combat:combatOptions({autoCombat:true,stats})};
      units.set(id,actor);this.cells.set(y*width+x,id);this.spatial.add(actor);return actor;
    }};
}

test('spatial buckets retrieve large ranges without probing each empty cell',()=>{
  const b=arena(1000,1000),a=b.add(1,500,500,'A',{range:80}),near=b.add(2,560,500,'B');
  for(let i=3;i<1003;i++)b.add(i,i%100,Math.floor(i/100),'B');
  assert.equal(findLocalEnemy(b,a),near);
  assert.ok(b.combatStats.probes<10,`probed ${b.combatStats.probes} candidates`);
});

test('spatial membership includes source and reservation, updates and removes without duplicates',()=>{
  const index=new SpatialIndex(100,100,4),u={id:7,x:3,y:3,step:{x:4,y:3}};
  index.add(u);
  assert.deepEqual([...index.candidates(2,2,5)],[7]);
  assert.deepEqual([...index.candidates(4,3,0)],[7]);
  u.x=4;u.step=null;index.move(u);
  assert.deepEqual([...index.candidates(0,0,0)],[]);
  u.x=40;u.y=40;index.move(u);
  assert.deepEqual([...index.candidates(4,3,1)],[]);
  assert.deepEqual([...index.candidates(40,40,0)],[7]);
  index.remove(u);assert.deepEqual([...index.candidates(40,40,0)],[]);
  index.add(u);index.clear();assert.deepEqual([...index.candidates(40,40,0)],[]);
});

test('a moving enemy entering range from an adjacent bucket is discoverable',()=>{
  const b=arena(),a=b.add(1,4,4,'A',{range:3}),v=b.add(2,8,4,'B');
  v.step={x:7,y:4};v.visualX=7;b.spatial.move(v);
  assert.equal(findLocalEnemy(b,a),v);
});

test('automatic attacks retain valid targets without rescanning even when a nearer enemy appears',()=>{
  const b=arena(),a=b.add(1,20,20,'A',{range:8}),v=b.add(2,25,20,'B');
  assert.equal(tryAutoAttack(b,a),true);const checks=b.combatStats.checks;
  b.add(3,21,20,'B');b.time=1;
  assert.equal(tryAutoAttack(b,a),true);assert.equal(a.lastAttack,v.id);assert.equal(b.combatStats.checks,checks);
  v.health.current=0;b.time=2;
  assert.equal(tryAutoAttack(b,a),true);assert.equal(a.lastAttack,3);assert.equal(b.combatStats.checks,checks+1);
});

test('misses delay rescans and spread retries across the configured interval',()=>{
  const b=arena(),actors=Array.from({length:16},(_,i)=>b.add(i+1,i*10,30,'A',{range:5,searchInterval:.24}));
  for(const a of actors)tryAutoAttack(b,a);
  assert.equal(b.combatStats.checks,16);
  assert.ok(new Set(actors.map(a=>a.combat.nextSearchAt)).size>8);
  for(const a of actors){assert.ok(a.combat.nextSearchAt>0&&a.combat.nextSearchAt<=.24);tryAutoAttack(b,a);}
  assert.equal(b.combatStats.checks,16);
  b.time=.12;for(const a of actors)tryAutoAttack(b,a);
  assert.ok(b.combatStats.checks>16&&b.combatStats.checks<32);
});

test('equal-distance targeting uses seeded neutral priorities rather than lowest IDs or team names',()=>{
  const chosen=new Set();
  for(let seed=1;seed<=32;seed++) {
    const b=arena();b.seed=seed;const a=b.add(10,20,20,'A',{range:5}),low=b.add(1,18,20,'B'),high=b.add(99,22,20,'B');
    const target=findLocalEnemy(b,a);chosen.add(target.id);
    a.team='B';low.team=high.team='A';assert.equal(findLocalEnemy(b,a),target);
  }
  assert.deepEqual(chosen,new Set([1,99]));
});

test('preferred range is configurable and line of sight filters obstacles after range and faction checks',()=>{
  const b=arena(),a=b.add(1,20,20,'A',{range:8,preferredRange:6,lineOfSight:true}),near=b.add(2,21,20,'B'),far=b.add(3,26,20,'B');
  assert.equal(findLocalEnemy(b,a),far);
  b.obstacles.set(23+20*b.width,{blocked:true});assert.equal(findLocalEnemy(b,a),near);
  b.obstacles.set(23+20*b.width,{blocked:false});assert.equal(findLocalEnemy(b,a),far);
  b.obstacles.set(23+20*b.width,{blocked:true});a.combat.lineOfSight=false;assert.equal(findLocalEnemy(b,a),far);
});

test('retained enemies lose engagement when sight is blocked and ranged Manhattan queries filter corners',()=>{
  const b=arena(),a=b.add(1,20,20,'A',{range:6,lineOfSight:true}),v=b.add(2,25,20,'B');
  b.add(3,25,25,'B');assert.equal(tryAutoAttack(b,a),true);
  b.obstacles.set(22+20*b.width,{blocked:true});b.time=1;
  assert.equal(tryAutoAttack(b,a),false);assert.equal(a.combat.targetId,null);
  b.obstacles.clear();v.team='A';assert.equal(findLocalEnemy(b,a),null);
});

test('Board indexes spawn, reserved movement, arrivals, lethal damage and reset',()=>{
  const b=new Board(32,16),u=b.spawn(7,3);
  assert.deepEqual([...b.spatial.candidates(7,3,0)],[u.id]);
  assert.deepEqual([...b.spatial.candidates(8,3,0)],[]);
  assert.equal(b.move(u.id,8,3),true);
  assert.ok(u.step);
  assert.deepEqual([...b.spatial.candidates(7,3,0)],[u.id]);
  assert.deepEqual([...b.spatial.candidates(8,3,0)],[u.id]);
  assert.deepEqual([...b.spatial.candidates(7,3,2)],[u.id]);
  b.update(u.step.duration);
  assert.deepEqual([u.x,u.y],[8,3]);assert.equal(u.step,null);
  assert.deepEqual([...b.spatial.candidates(7,3,0)],[]);
  assert.deepEqual([...b.spatial.candidates(8,3,0)],[u.id]);
  assert.equal(b.damage(u.id,u.health.max),true);
  assert.equal(b.unit(u.id),u,'death animation may remain addressable');
  assert.deepEqual([...b.spatial.candidates(8,3,0)],[]);
  const v=b.spawn(15,3);
  assert.equal(b.move(v.id,16,3),true);
  assert.equal(b.damage(v.id,v.health.max),true);
  assert.deepEqual([...b.spatial.candidates(15,3,0)],[]);
  assert.deepEqual([...b.spatial.candidates(16,3,0)],[]);
  const survivor=b.spawn(24,3);assert.ok(survivor);
  b.reset();assert.deepEqual([...b.spatial.candidates(16,8,32)],[]);
  const fresh=b.spawn(0,0);assert.equal(fresh.id,1);
  assert.deepEqual([...b.spatial.candidates(0,0,0)],[fresh.id]);
});

test('a real ranged actor acquires an interpolating target across a bucket boundary',()=>{
  const b=new Board(20,10),a=b.spawn(4,4,null,{team:'A',autoCombat:true,stats:{range:3}}),v=b.spawn(8,4,null,{team:'B'});
  assert.equal(b.move(v.id,7,4),true);assert.equal(findLocalEnemy(b,a),null);
  b.update(.17);assert.equal(findLocalEnemy(b,a),null);
  b.update(.17);assert.equal(findLocalEnemy(b,a),v);
  b.update(.3);assert.equal(a.combat.targetId,v.id);
});

test('an obstacle added after a ranged shot starts prevents its impact',()=>{
  const b=new Board(16,8),a=b.spawn(2,3,null,{team:'A',autoCombat:true,stats:{range:7,lineOfSight:true}}),v=b.spawn(8,3,null,{team:'B'});
  b.update(.12);assert.equal(a.state,'attack');assert.equal(a.strike.target,v.id);
  assert.equal(b.setObstacle(5,3,{blocked:true}),true);
  b.update(.31);assert.equal(v.health.current,v.health.max);assert.equal(v.hits,0);assert.equal(b.combatStats.hits,0);
  b.setObstacle(5,3,null);b.update(1);
  assert.ok(v.hits>0,'later unobstructed shots still land');
});
