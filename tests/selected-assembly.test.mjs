import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
// Source perspective defines costume and layering; the warrior defines anatomy.
const ids=['shield-guard','scholar','banner-bearer','clover-mage','archer','scout'];
test('source artwork keeps its aspect ratio inside the shared warrior body frame',async()=>{
 for(const id of ids){
  const r=JSON.parse(await readFile(new URL(`../assets/units/${id}/rig.json`,import.meta.url)));
  assert.deepEqual(r.foot,[505,1228]);
  assert.equal(r.bodyStandard,'../body-standard.json');
  for(const p of Object.values(r.parts))assert.ok(Math.abs(p.w/p.file_dimensions[0]-p.h/p.file_dimensions[1])<.02,`${id}: stretched source aspect ratio`);
 }
});
test('book hand, shield and raised banner arm have reference painter order',async()=>{
 const get=async id=>JSON.parse(await readFile(new URL(`../assets/units/${id}/rig.json`,import.meta.url)));
 for(const id of ['shield-guard','scholar','banner-bearer']){
  const r=await get(id),upper=r.nodes[1].children.find(n=>n.id==='upper').children;
  const arm=upper.find(n=>n.id==='leftArm');
  assert.ok(upper.findIndex(n=>n.part==='body')<upper.indexOf(arm),`${id}: arm hidden by torso`);
  if(id==='scholar'){
   assert.equal(arm.children[1].socket,'left');
   assert.equal(arm.children[2].clip,'palm_clip','only the palm belongs above the book');
  }
  if(id==='shield-guard')assert.equal(arm.children.at(-1).socket,'left','shield must occlude forearm');
 }
});
test('scout has two equal-size legs beneath the tunic for standing and walking',async()=>{
 const r=JSON.parse(await readFile(new URL('../assets/units/scout/rig.json',import.meta.url)));
 assert.equal(r.parts.leg_back.h,r.parts.leg_front.h);
 assert.equal(r.parts.leg_back.y,r.parts.leg_front.y);
 assert.ok(r.parts.leg_back.x+r.parts.leg_back.w<r.parts.leg_front.x);
});
