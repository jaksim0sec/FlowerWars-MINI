import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
import {FlagMatch} from '../src/flag-match.mjs';

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
  let water=0,outside=0,asymmetric=0;
  for(let y=0;y<b.height;y++)for(let x=0;x<b.width;x++){
   const n=y*b.width+x,t=b.terrain[y][x];
   if(t!==b.terrain[b.height-1-y][b.width-1-x])asymmetric++;
   assert.equal(b.navigation.blocked(n),t==='forest'||t==='void');
   if(field.protectedCells[n])assert.ok(connected.has(n));
   if(t==='forest')water++;if(t==='void'){outside++;assert.equal(b.spawn(x,y),null);}
  }
  assert.ok(water>800&&water<2500);assert.ok(outside>5000);assert.ok(asymmetric>500);
  // Verify tactical topology, not just connectivity: one medium sortie mouth
  // and two small flank apertures, with no unrestricted edge bypass.
  for(const gate of field.gates){
   const openings=[];let start=null;
   for(let y=0;y<=b.height;y++){
    const free=y<b.height&&!b.navigation.blocked(y*b.width+gate.x);
    if(free&&start===null)start=y;
    if(!free&&start!==null){openings.push({start,end:y-1,width:y-start});start=null;}
   }
   assert.equal(openings.length,3);
   const middle=openings.find(p=>p.start<=gate.y&&p.end>=gate.y);
   assert.ok(middle&&middle.width>=12&&middle.width<=24);
   assert.ok(openings.filter(p=>p!==middle).every(p=>p.width>=4&&p.width<=10));
  }
  let basin=0;
  for(let y=40;y<=71;y++)for(let x=53;x<=90;x++)if(b.terrain[y][x]==='grass')basin++;
  assert.ok(basin>1150,'central battle space stays broad and continuous grass');

  assert.ok(field.outline.length>200);
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
