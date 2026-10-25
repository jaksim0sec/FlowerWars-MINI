import test from 'node:test';import assert from 'node:assert/strict';import * as terrain from '../src/terrain-render.mjs';
import {Board}from'../src/model.mjs';
test('visible tile enumeration matches exhaustive overlap and painter order on a large board',()=>{
 const b=new Board(140,120),w=900,h=650;
 for(const c of [{x:-400,y:-1300,scale:.7},{x:0,y:0,scale:.1},{x:400,y:-3200,scale:2.4},{x:1e6,y:1e6,scale:1}]){
 const actual=terrain.visibleTiles(b,c,w,h).map(p=>`${p.x},${p.y}`),expected=[];
 for(let depth=0;depth<b.width+b.height-1;depth++)for(let y=0;y<b.height;y++){
  const x=depth-y;if(!b.inside(x,y))continue;const px=(x-y)*72*c.scale+c.x,py=(x+y)*42*c.scale+c.y;
  if(px+72*c.scale>=0&&px-72*c.scale<=w&&py+65*c.scale>=0&&py-42*c.scale<=h)expected.push(`${x},${y}`);
 }
 assert.deepEqual(actual,expected);assert.ok(actual.length<(c.scale===.1?10000:500));
 }
});
test('terrain edits and reset invalidate cached terrain without changing combat',()=>{
 const b=new Board(),before=b.terrainRevision;b.setTerrain(0,0,'soil');assert.equal(b.terrain[0][0],'soil');assert.ok(b.terrainRevision>before);const v=b.terrainRevision;b.setTerrain(0,0,'soil');assert.equal(b.terrainRevision,v);b.reset();assert.ok(b.terrainRevision>v);
});
