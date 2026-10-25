import test from 'node:test';
import assert from 'node:assert/strict';
import {editPart,exportEdits,validateEdits,groupAdjustment} from '../src/characters/rig-edit-model.mjs';
const rig=()=>({id:'a',parts:{hand:{asset:'h.png',x:10,y:20,w:100,h:100,origin:[.5,.5]}},sockets:{left:{part:'hand',group:'arm',grip:[.4,.8]}},nodes:[{id:'arm',transforms:[{pivot:[60,70],rotate:0}],children:[{part:'hand'}]}],twoHandedPoses:{hold:{nodes:{arm:{transforms:[{pivot:[60,70],rotate:1}]}}}}});
test('editing a hand updates holding and animation pivots without losing the rig',()=>{
 const r=rig();editPart(r,'hand',{x:30,w:120,origin:[.25,.6]});
 assert.deepEqual(r.nodes[0].transforms[0].pivot,[60,80]);assert.deepEqual(r.twoHandedPoses.hold.nodes.arm.transforms[0].pivot,[60,80]);assert.equal(r.parts.hand.asset,'h.png');
});
test('rig exports round-trip as actual data and reject invalid size or unknown assets',()=>{
 const catalog={characters:{a:{rig:rig()}},equipment:{}};const data=exportEdits(catalog,['a'],['a']);
 assert.equal(validateEdits(JSON.parse(JSON.stringify(data)),catalog).characters.a.parts.hand.x,10);
 const bad=structuredClone(data);bad.characters.a.parts.hand.w=-1;assert.throws(()=>validateEdits(bad,catalog));
 const other=structuredClone(data);other.characters.a.parts.hand.asset='different.png';assert.throws(()=>validateEdits(other,catalog));
 assert.throws(()=>editPart(catalog.characters.a.rig,'hand',{h:NaN}));
});
test('group adjustments preserve authored animation transforms',()=>{
 const r=rig(),g=r.nodes[0];const e=groupAdjustment(g);e.rotate=.3;e.scale=[1.1,1.1];
 assert.equal(g.transforms[0].rotate,0);assert.equal(g.transforms.length,2);assert.equal(groupAdjustment(g),e);
});

import {createCharacter,equip,layoutCharacter,point} from '../src/characters/engine.mjs';
test('edited rotation and group scale keep the equipment on the painted palm in empty/holding poses',()=>{
 const r=rig();r.nodes[0].children.unshift({socket:'left'});r.animations={};r.slotPoses={left:{empty:{arm:{transforms:[{pivot:[60,70],rotate:.1}]}}}};
 const catalog={characters:{a:{rig:r}},equipment:{tool:{hands:1,w:20,h:50,grip:[.4,.7]}}};
 const c=createCharacter(catalog,'a');const op=groupAdjustment(r.nodes[0]);op.scale=[1.2,1.2];op.rotate=.25;editPart(r,'hand',{rotation:.45});
 const empty=layoutCharacter(catalog,c,0);assert.ok(Math.abs(Math.hypot(empty.draws.find(x=>x.part==='hand').matrix[0],empty.draws.find(x=>x.part==='hand').matrix[1])-1.2)<1e-8,'group scale lost under empty-hand pose');
 equip(catalog,c,'tool','left');const l=layoutCharacter(catalog,c,0),d=l.draws.find(x=>x.part==='hand'),p=r.parts.hand,s=r.sockets.left;
 const palm=point(d.matrix,(s.grip[0]-p.origin[0])*p.w,(s.grip[1]-p.origin[1])*p.h),grip=point(l.equipmentDraws.left.matrix);
 assert.ok(Math.hypot(palm[0]-grip[0],palm[1]-grip[1])<1e-8);
});
