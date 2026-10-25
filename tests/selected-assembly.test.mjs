import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
// Ratios measured against the supplied assembled previews. The banner's torso
// includes its cape; the guard's visible head is contained in the crown source.
const expected={
 'shield-guard':{head:1.47,arm:.43},scholar:{head:1.08,arm:.44},
 'banner-bearer':{head:.59,arm:.29},'clover-mage':{head:1.13,arm:.45},
 archer:{head:1.29,arm:.44},scout:{head:1.22,arm:.44}
};
test('individual silhouettes preserve reference head and near-arm proportions',async()=>{
 for(const [id,want] of Object.entries(expected)){
  const r=JSON.parse(await readFile(new URL(`../assets/units/${id}/rig.json`,import.meta.url)));
  assert.deepEqual(r.foot,[505,1228]);
  for(const p of Object.values(r.parts))assert.ok(Math.abs(p.w/p.file_dimensions[0]-p.h/p.file_dimensions[1])<.02,`${id}: stretched source aspect ratio`);
  const head=r.parts[id==='shield-guard'?'head_deco':'head'].w/r.parts.body.w;
  const arm=r.parts.hand_front.w/r.parts.body.w;
  assert.ok(Math.abs(head-want.head)<.06,`${id}: head/body ${head}`);
  assert.ok(Math.abs(arm-want.arm)<.04,`${id}: arm/body ${arm}`);
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
test('scout preserves the supplied side-view silhouette instead of exposing a second boot',async()=>{
 const r=JSON.parse(await readFile(new URL('../assets/units/scout/rig.json',import.meta.url)));
 assert.ok(r.parts.leg_back.y+r.parts.leg_back.h<r.parts.body.y+r.parts.body.h,'far boot was pulled out of the source side-view pose');
});
