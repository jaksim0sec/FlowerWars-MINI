import test from 'node:test';import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';import {FlagMatch} from '../src/flag-match.mjs';
import {autumnScenery,AUTUMN_LIMIT,autumnGroundContours} from '../src/autumn-scenery.mjs';
import {saveBattleState,restoreBattleState,createBattleState} from '../src/online/battle-state.mjs';
import {terrainMaterial,terrainEdges,terrainVariant} from '../src/terrain-render.mjs';
test('autumn visuals are bounded, independently seeded, cacheable derived data with empty traffic lanes',()=>{
 for(let seed=0;seed<32;seed++){
  const b=new Board();new FlagMatch(b,{seed});for(const route of b.battlefield.paths){if(route.kind==='main')assert.ok(route.minWidth>=20&&route.minWidth<=24);else assert.ok(route.minWidth>=8&&route.minWidth<=10);}
  const terrain=JSON.stringify(b.terrain),metadata=JSON.stringify(b.battlefield),s=autumnScenery(b);
  assert.ok(s.length>40&&s.length<=AUTUMN_LIMIT);assert.equal(autumnScenery(b),s);
  for(const d of s){assert.ok(b.inside(d.x,d.y));if(d.layer){assert.equal(b.battlefield.protectedCells[d.y*b.width+d.x],0);if(!d.id.startsWith('cliff_side')&&!d.id.startsWith('golden_tree'))assert.notEqual(b.terrain[d.y][d.x],'void');}}
  assert.equal(JSON.stringify(b.terrain),terrain);assert.equal(JSON.stringify(b.battlefield),metadata);
  const other=new Board();new FlagMatch(other,{seed});assert.deepEqual(autumnScenery(other),s);
 }
});
test('north rock and south water retain identical blocked mechanics and global connected tile phase',()=>{
 const b=new Board();new FlagMatch(b,{seed:73});let rocks=0,water=0;
 for(let y=0;y<b.height;y++)for(let x=0;x<b.width;x++){
  assert.equal(terrainVariant(x,y),1+x%5+5*(y%2));
  if(b.terrain[y][x]==='forest'){assert.equal(b.navigation.blocked(y*b.width+x),true);const material=terrainMaterial(b,x,y);if(y<b.height/2){assert.equal(material,'rock');rocks++;}else{assert.equal(material,'pond');water++;}
   const edge=terrainEdges(b,x,y);if(x+1<b.width&&b.terrain[y][x+1]!=='void')assert.equal(edge.wallX,false);
  }
 }assert.ok(rocks>50&&water>50);
});
test('restoring a real battle regenerates the same artwork without serializing sprites or caches',async()=>{
 const s=createBattleState('autumn-recovery',{seed:73}),before=autumnScenery(s.board),snapshot=await saveBattleState(s,0),restored=await restoreBattleState(snapshot);
 assert.deepEqual(autumnScenery(restored.board),before);assert.equal(snapshot.state.graph.nodes.some(n=>n.entries?.some(([k])=>['autumnCache','autumnSprites'].includes(k))),false);
});

test('shared squad route recovery omits transient search heaps and retains route identity',async()=>{
 const {SearchQueue}=await import('../src/search-queue.mjs');const s=createBattleState('route-recovery',{seed:29}),b=s.board;b.obstacles.clear();for(const row of b.terrain)row.fill('grass');
 const a=b.spawn(20,40,null,{team:'A'}),c=b.spawn(21,40,null,{team:'A'}),route={origin:{x:20,y:40},target:{x:30,y:40},path:null,revision:b.obstacleRevision,planner:{x:20,y:40,staticSearch:{open:new SearchQueue([{cell:1,g:0,f:1}])}}};a.squadRoute=route;c.squadRoute=route;
 const recovered=await restoreBattleState(await saveBattleState(s,0));assert.equal(recovered.board.units[0].squadRoute,recovered.board.units[1].squadRoute);assert.equal(recovered.board.units[0].squadRoute.planner,null);assert.deepEqual(recovered.board.units[0].squadRoute.target,route.target);
});

test('cached ground contours have exactly the walkable area and invalidate on obstacle edits',()=>{
 const b=new Board(12,12);b.terrain=Array.from({length:12},()=>Array(12).fill('grass'));b.obstacles.clear();
 const area=loops=>loops.reduce((sum,p)=>sum+p.reduce((v,a,i)=>{const c=p[(i+1)%p.length];return v+(a.x*c.y-c.x*a.y)/2;},0),0);
 const first=autumnGroundContours(b);assert.equal(area(first),144);assert.equal(autumnGroundContours(b),first);b.setObstacle(5,5,{blocked:true});const next=autumnGroundContours(b);assert.notEqual(next,first);assert.equal(area(next),143);
});
