import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
import {FlagMatch} from '../src/flag-match.mjs';
import {distanceToPath} from '../src/battlefield-plan.mjs';
import {terrainStepMultiplier} from '../src/battlefield-terrain.mjs';

function reachable(b,start){
 const seen=new Set([start]),queue=[start];
 for(let i=0;i<queue.length;i++){
  const n=queue[i],x=n%b.width,y=Math.floor(n/b.width);
  for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){
   const a=x+dx,c=y+dy,k=c*b.width+a;
   if(b.inside(a,c)&&!seen.has(k)&&!b.navigation.blocked(k)){seen.add(k);queue.push(k);}
  }
 }
 return seen;
}
test('seeded enlarged battlefield keeps bases, central approaches and side entries connected',()=>{
 const shapes=new Set();
 for(let seed=0;seed<32;seed++){
  const b=new Board(),m=new FlagMatch(b,{seed}),field=b.battlefield;
  assert.equal(b.width,144);assert.equal(b.height,112);assert.ok(m.flags.B.x-m.flags.A.x>125);
  const connected=reachable(b,m.flags.A.y*b.width+m.flags.A.x);
  assert.ok(connected.has(m.flags.B.y*b.width+m.flags.B.x));
  assert.equal(connected.size,b.width*b.height-b.obstacles.size,'no isolated walkable islands');
  let water=0,outside=0,asymmetric=0,soil=0;
  for(let y=0;y<b.height;y++)for(let x=0;x<b.width;x++){
   const n=y*b.width+x,t=b.terrain[y][x];
   if(t!==b.terrain[b.height-1-y][b.width-1-x])asymmetric++;
   assert.equal(b.navigation.blocked(n),t==='forest'||t==='void');
   if(field.protectedCells[n])assert.ok(connected.has(n));
   if(t==='forest')water++;if(t==='soil')soil++;if(t==='void'){outside++;assert.equal(b.spawn(x,y),null);}
  }
  assert.ok(water>200&&water<2500);assert.ok(outside>3000);assert.ok(asymmetric>200);assert.ok(soil>100);
  assert.equal(field.paths.length,12);assert.equal(field.defenses.length,8);
  assert.equal(field.rooms.filter(r=>r.kind==='staging').length,8);
  assert.equal(field.rooms.filter(r=>r.kind==='merge').length,8);
  for(const path of field.paths){
   assert.ok(path.minWidth>=(path.kind==='main'?16:path.kind==='flank'?7:6));
   for(let i=1;i<path.points.length-1;i++){
    const a=path.points[i-1],p=path.points[i],c=path.points[i+1],u={x:p.x-a.x,y:p.y-a.y},v={x:c.x-p.x,y:c.y-p.y};
    const angle=Math.atan2(Math.abs(u.x*v.y-u.y*v.x),u.x*v.x+u.y*v.y);
    assert.ok(angle/Math.min(Math.hypot(u.x,u.y),Math.hypot(v.x,v.y))<=1/path.minTurnRadius,path.id+' turn radius');
   }
   for(let k=1;k<path.points.length;k++){
    const a=path.points[k-1],p=path.points[k],dx=p.x-a.x,dy=p.y-a.y,len=Math.hypot(dx,dy);
    for(let t=0;t<=1;t+=1/Math.max(1,Math.ceil(len)))for(let offset=-path.radius;offset<=path.radius;offset+=.5){
     const x=Math.round(a.x+dx*t-dy/len*offset),y=Math.round(a.y+dy*t+dx/len*offset);
     assert.ok(b.inside(x,y)&&!b.navigation.blocked(y*b.width+x),path.id+' full effective width');
     if(path.kind==='flank'&&x>30&&x<113){assert.ok(y-field.upper[x]>=2&&field.lower[x]-y>=2,'coast setback');}
    }
   }
  }
  for(const room of field.rooms){
   for(let y=Math.ceil(room.y-room.ry);y<=room.y+room.ry;y++)for(let x=Math.ceil(room.x-room.rx);x<=room.x+room.rx;x++){
    if(((x-room.x)/room.rx)**2+((y-room.y)/room.ry)**2<=1&&b.inside(x,y))assert.ok(!b.navigation.blocked(y*b.width+x),room.id+' clear staging footprint');
   }
  }
  for(const defense of field.defenses){
   let tiles=0;
   for(let y=0;y<b.height;y++)for(let x=0;x<b.width;x++)if(b.terrain[y][x]==='forest'&&distanceToPath(x,y,defense.points)<defense.radius+1)tiles++;
   assert.ok(tiles>=8,defense.id+' must retain a real separating body');
  }
  const battle=field.rooms.find(r=>r.id==='battle');assert.ok(battle.rx>=21&&battle.ry>=23);
  assert.ok(field.outline.length>200);
  for(const d of field.decorations)for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)assert.equal(field.protectedCells[(d.y+dy)*b.width+d.x+dx],0,'decor does not obscure reserved lanes');
  shapes.add(b.terrain.map(row=>row.join(',')).join(';'));
 }
 assert.equal(shapes.size,32);
});
test('the same seed reproduces terrain and reset drops old strategic metadata',()=>{
 const a=new Board(),b=new Board();new FlagMatch(a,{seed:73});new FlagMatch(b,{seed:73});
 assert.deepEqual(a.terrain,b.terrain);assert.deepEqual(a.battlefield,b.battlefield);
 assert.equal(a.setTerrain(0,0,'grass'),false);
 a.reset();assert.equal(a.battlefield,null);
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

test('compacted soil has the same movement cost as grass',()=>{
 const b=new Board(8,8);b.setTerrain(3,3,'soil');
 assert.equal(terrainStepMultiplier(b,{x:2,y:3},{x:3,y:3}),1);
});
test('all generated deployment grounds admit the full bot army without rearranging troops',()=>{
 for(let seed=0;seed<32;seed++){
  const b=new Board(),m=new FlagMatch(b,{seed});m.start();
  assert.equal(m.reserve.B,0,'seed '+seed);assert.equal(m.counts.B,350);
  assert.ok(b.units.every(u=>m.inTerritory('B',u)));
 }
});
