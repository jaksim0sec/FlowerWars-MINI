import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const load=async id=>JSON.parse(await readFile(new URL(`../assets/units/${id}/rig.json`,import.meta.url)));
const ids=['shield-guard','scholar','banner-bearer','clover-mage','archer','scout'];
test('six heroes use the warrior head, torso height and short-boot body frame',async()=>{
 const base=await load('gynari-warrior');const standard=JSON.parse(await readFile(new URL('../assets/units/body-standard.json',import.meta.url)));
 for(const id of ids){const r=await load(id);
  // The user's manual export gives the banner a slightly smaller face.
  assert.ok(Math.abs(r.parts.head.w/base.parts.head.w-1)<.10,`${id}: head differs from warrior`);
  assert.ok(Math.abs(r.parts.body.h*(standard.characters[id].torsoFraction || 1)/base.parts.body.h-1)<.03,`${id}: torso differs from warrior`);
  for(const name of ['leg_back','leg_front']){
   const p=r.parts[name];assert.ok(p.h>=90&&p.h<=125,`${id}/${name}: short boot proportion`);
   assert.ok(p.y+p.h>r.parts.body.y+r.parts.body.h*(standard.characters[id].torsoFraction || 1)+30,`${id}/${name}: leg is hidden in the body`);
  }
 }
});
test('left and right arms have comparable physical size, including the scout far arm',async()=>{
 for(const id of ids){const r=await load(id),a=r.parts.hand_back,b=r.parts.hand_front;
  // The second manual export deliberately lengthens the armored claw tip.
  assert.ok(Math.max(a.h,b.h)/Math.min(a.h,b.h)<(id==='shield-guard'?1.30:1.15),`${id}: arm length imbalance`);
  assert.ok(Math.max(a.w*a.h,b.w*b.h)/Math.min(a.w*a.h,b.w*b.h)<1.4,`${id}: arm size imbalance`);
 }
});
