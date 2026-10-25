import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DEATH_DURATION} from '../src/characters/vitality.mjs';
import {createCharacter,equip,layoutCharacter,point} from '../src/characters/engine.mjs';
const json=async path=>JSON.parse(await readFile(new URL(path,import.meta.url)));
const rig=await json('../assets/units/archer/rig.json');
rig.animations={...await json('../assets/animations/humanoid.json'),...rig.animations};
const catalog={characters:{archer:{rig}},equipment:await json('../assets/equipment/catalog.json')};
const archer=(side='right')=>{const c=createCharacter(catalog,'archer');equip(catalog,c,'archer_bow',side);return c;};
const pose=(c,elapsed,state='attack')=>{Object.assign(c.animation,{state,elapsed});return layoutCharacter(catalog,c,elapsed);};
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);

test('a bow stays upright while aiming, drawing, releasing and recovering instead of sword slashing',()=>{
 const c=archer(),angles=[0,.10,.20,.29,.30,.34,.48,.65].map(t=>{
  const l=pose(c,t),d=l.equipmentDraws.right;
  assert.ok(distance(point(d.matrix),point(l.sockets.right.matrix))<1e-8,'painted grip detaches');
  return Math.atan2(d.matrix[1],d.matrix[0]);
 });
 assert.ok(Math.max(...angles)-Math.min(...angles)<.4,`bow slashes through ${angles}`);
});

test('the bow pose raises the grip and draws the opposite palm onto the string, then recovers',()=>{
 const c=archer(),idle=pose(c,0,'idle'),aim=pose(c,.10),draw=pose(c,.28),recover=pose(c,.65);
 assert.ok(point(draw.sockets.right.matrix)[1]<point(idle.sockets.right.matrix)[1]-25,'bow arm never aims');
 assert.ok(distance(point(aim.sockets.left.matrix),point(draw.sockets.left.matrix))>35,'drawing hand never pulls');
 const cue=draw.equipmentDraws.right.bow;
 assert.ok(cue,'bow has no string/arrow cue');
 assert.ok(distance(point(draw.equipmentDraws.right.matrix,...cue.nock),point(draw.sockets.left.matrix))<1e-8,'string misses drawing palm');
 assert.ok(distance(point(recover.sockets.right.matrix),point(idle.sockets.right.matrix))<5,'bow arm does not recover');
 assert.ok(draw.draws.some(d=>d.overlayPart==='hand_back'),'draw palm is hidden behind the tunic');
});

test('the arrow releases at combat impact .30, the string snaps back, and the cue ends during recovery',()=>{
 const c=archer(),before=pose(c,.299).equipmentDraws.right.bow,release=pose(c,.30).equipmentDraws.right.bow,after=pose(c,.34).equipmentDraws.right.bow,recover=pose(c,.65).equipmentDraws.right.bow;
 assert.ok(before?.loaded,'no arrow on the drawn string');
 assert.equal(release.loaded,false,'arrow remains nocked after damage is applied');
 assert.ok(after.flight>0,'release has no arrow motion');
 assert.ok(distance(after.nock,after.rest)<distance(before.nock,before.rest)*.2,'released string is still pulled back');
 assert.equal(recover.flight,0,'recovery retains a flying arrow');
 assert.equal(recover.loaded,false,'recovery retains the previous arrow');
});

test('bow cues and palm overlays are equipment data, preserve anatomy and do not seize an occupied hand',()=>{
 const before=JSON.stringify(catalog),c=archer();pose(c,.2);assert.equal(JSON.stringify(catalog),before);
 equip(catalog,c,'basic_sword','left');const l=pose(c,.2);
 assert.equal(l.equipmentDraws.right.bow.supportSocket,null,'bow commandeers an occupied sword hand');
 assert.ok(!l.draws.some(d=>d.overlayPart),'occupied support hand gets duplicated');
 const unarmed=createCharacter(catalog,'archer');assert.ok(!pose(unarmed,.2).draws.some(d=>d.overlayPart));
 const sword=createCharacter(catalog,'archer');equip(catalog,sword,'basic_sword','right');
 const a=pose(sword,.18).equipmentDraws.right.matrix,b=pose(sword,.30).equipmentDraws.right.matrix;
 assert.ok(Math.abs(Math.atan2(a[1],a[0])-Math.atan2(b[1],b[0]))>1,'sword lost its own slash motion');
});

// Record the real Canvas arrow shaft after every affine transform, so a passing
// layout test cannot hide a projectile that fires away from the model target.
class ArrowCanvas {
 matrix=[1,0,0,1,0,0];stack=[];path=[];arrows=[];globalAlpha=1;
 save(){this.stack.push({matrix:[...this.matrix],lineWidth:this.lineWidth,globalAlpha:this.globalAlpha});}
 restore(){Object.assign(this,this.stack.pop());}
 transform(a,b,c,d,e,f){const m=this.matrix;this.matrix=[m[0]*a+m[2]*b,m[1]*a+m[3]*b,m[0]*c+m[2]*d,m[1]*c+m[3]*d,m[0]*e+m[2]*f+m[4],m[1]*e+m[3]*f+m[5]];}
 translate(x,y){this.transform(1,0,0,1,x,y);}
 scale(x,y){this.transform(x,0,0,y,0,0);}
 beginPath(){this.path=[];}
 moveTo(x,y){this.path.push(point(this.matrix,x,y));}
 lineTo(x,y){this.path.push(point(this.matrix,x,y));}
 closePath(){}clip(){}fill(){}drawImage(){}
 stroke(){if(this.strokeStyle===catalog.equipment.archer_bow.bow.arrowColor)this.arrows.push([...this.path]);}
}
import {drawCharacter} from '../src/characters/engine.mjs';
test('rendered bow arrows fire toward the model facing on either hand',()=>{
 const renderCatalog={...catalog,characters:{archer:{rig,images:Object.fromEntries(Object.keys(rig.parts).map(k=>[k,k]))}},equipment:{...catalog.equipment,archer_bow:{...catalog.equipment.archer_bow,image:'bow'}}};
 for(const side of ['left','right'])for(const facing of [-1,1]){
  const c=archer(side);Object.assign(c.animation,{state:'attack',elapsed:.28,facing});const ctx=new ArrowCanvas();
  drawCharacter(ctx,renderCatalog,c,.28);
  assert.equal(ctx.arrows.length,1);
  const [tail,tip]=ctx.arrows[0];
  assert.ok((tip[0]-tail[0])*facing>0,`${side}/${facing}: arrow fires away from target`);
 }
});

test('a released arrow follows the actual combat attack vector, including diagonal and vertical targets',()=>{
 const renderCatalog={...catalog,characters:{archer:{rig,images:Object.fromEntries(Object.keys(rig.parts).map(k=>[k,k]))}},equipment:{...catalog.equipment,archer_bow:{...catalog.equipment.archer_bow,image:'bow'}}};
 for(const side of ['left','right'])for(const [x,y]of [[144,84],[144,-84],[-144,84],[-144,-84],[0,168],[0,-168]]){
  const c=archer(side);Object.assign(c.animation,{state:'attack',elapsed:.34,facing:x<0?-1:1,attackVector:{x,y}});const ctx=new ArrowCanvas();
  drawCharacter(ctx,renderCatalog,c,.34);const [tail,tip]=ctx.arrows[0],dx=tip[0]-tail[0],dy=tip[1]-tail[1];
  assert.ok((dx*x+dy*y)/(Math.hypot(dx,dy)*Math.hypot(x,y))>.999999,`${side}/${x},${y}: release misses attack vector`);
 }
});

test('the drawn string fades together with dropped bow artwork on death',()=>{
 const renderCatalog={...catalog,characters:{archer:{rig,images:Object.fromEntries(Object.keys(rig.parts).map(k=>[k,k]))}},equipment:{...catalog.equipment,archer_bow:{...catalog.equipment.archer_bow,image:'bow'}}};
 const c=archer(),elapsed=DEATH_DURATION-.15;Object.assign(c.animation,{state:'death',elapsed});const ctx=new ArrowCanvas(),alphas=[];
 ctx.stroke=function(){if(this.strokeStyle===catalog.equipment.archer_bow.bow.stringColor)alphas.push(this.globalAlpha);};
 const l=layoutCharacter(renderCatalog,c,elapsed);drawCharacter(ctx,renderCatalog,c,elapsed,{layout:l});
 assert.equal(alphas.length,1);assert.ok(alphas[0]<1,'string remains opaque while bow fades');
 assert.equal(alphas[0],l.equipmentDraws.right.alpha);
});

test('released arrows originate on the bow grip even for steep isometric target rays',()=>{
 const c=archer();Object.assign(c.animation,{attackVector:{x:0,y:168},facing:1});const b=pose(c,.34).equipmentDraws.right.bow;
 assert.ok(Math.abs(b.arrowTail[0]*b.direction[1]-b.arrowTail[1]*b.direction[0])<1e-8,'released shaft misses the bow grip');
});
