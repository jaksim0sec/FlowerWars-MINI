import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const ids=["shield-guard","scholar","banner-bearer","clover-mage","archer","scout"];
test('new modular heroes keep consistent scale, foot anchor and attachment overlap', async()=>{
 for(const id of ids){const r=JSON.parse(await readFile(new URL(`../assets/units/${id}/rig.json`,import.meta.url)));
  assert.deepEqual(r.foot,[505,1228]);const h=1228-Math.min(r.parts.head.y,r.parts.head_deco.y);
  assert.ok(h>=800&&h<=1050,`${id} height ${h}`);
  const b=r.parts.body;
  for(const part of ['head','hand_back','hand_front','leg_back','leg_front']){
   const p=r.parts[part];assert.ok(Math.min(p.x+p.w,b.x+b.w)>Math.max(p.x,b.x)&&Math.min(p.y+p.h,b.y+b.h)>Math.max(p.y,b.y),`${id}/${part} detached`);
  }
  const neck=r.nodes[1].children[2].children.find(n=>n.id==='neck');assert.deepEqual(neck.children,[{part:'head'},{part:'head_deco'}]);
 }
});
