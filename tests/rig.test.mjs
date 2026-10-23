import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { drawWarrior } from '../src/render.mjs';

const rig = JSON.parse(await readFile(new URL('../assets/units/gynari-warrior/rig.json', import.meta.url)));

// A recording canvas implements affine transforms so tests inspect the actual
// rendered attachment points, without replacing the renderer or artwork rig.
class RecordingCanvas {
  matrix = [1, 0, 0, 1, 0, 0];
  stack = [];
  draws = new Map();
  clips = [];
  path = [];
  beginPath() { this.path = []; }
  moveTo(x,y) { this.lineTo(x,y); }
  lineTo(x,y) { const m=this.matrix; this.path.push([m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]]); }
  closePath() {}
  clip() { this.clips.push([...this.path]); }
  save() { this.stack.push({matrix:[...this.matrix],clips:[...this.clips]}); }
  restore() { const saved=this.stack.pop(); this.matrix=saved.matrix; this.clips=saved.clips; }
  translate(x, y) { const m = this.matrix; m[4] += m[0] * x + m[2] * y; m[5] += m[1] * x + m[3] * y; }
  scale(x, y) { const m = this.matrix; m[0] *= x; m[1] *= x; m[2] *= y; m[3] *= y; }
  rotate(a) {
    const [a0, b, c, d, x, y] = this.matrix, s = Math.sin(a), co = Math.cos(a);
    this.matrix = [a0 * co + c * s, b * co + d * s, c * co - a0 * s, d * co - b * s, x, y];
  }
  drawImage(image, x, y, w, h) { this.draws.set(image, { matrix: [...this.matrix], x, y, w, h, clips:[...this.clips] }); }
  point(image, x, y) {
    const d = this.draws.get(image), m = d.matrix, px = d.x + x * d.w, py = d.y + y * d.h;
    return [m[0] * px + m[2] * py + m[4], m[1] * px + m[3] * py + m[5]];
  }
}
const artwork = { rig, parts: Object.fromEntries(Object.keys(rig.parts).map(name => [name, name])) };

test('independent sword grip stays attached to the wrist through every pose and facing', () => {
  for (const facing of [-1, 1]) for (const state of ['idle', 'walk', 'attack', 'hit']) {
    for (const elapsed of [0, .16, .3, .5, .64]) {
      const ctx = new RecordingCanvas();
      drawWarrior(ctx, artwork, { id: 1, facing, state, elapsed, attackVector: { x: facing * 72, y: 42 } }, elapsed);
      const sword = ctx.point('basic_sword', .75, .78);
      const wrist = ctx.point('hand_back', .33, .75);
      assert.ok(Math.hypot(sword[0] - wrist[0], sword[1] - wrist[1]) < .1, `${state} ${elapsed} ${facing}: sword detached`);
    }
  }
});

function contains(polygon, point) {
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const [xi,yi]=polygon[i], [xj,yj]=polygon[j], [x,y]=point;
    if ((yi>y)!==(yj>y) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside;
  }
  return inside;
}

test('arms omit duplicate yellow shoulder caps while keeping the actual palms', () => {
  const ctx=new RecordingCanvas();
  drawWarrior(ctx,artwork,{id:1,state:'idle',facing:-1,elapsed:0},0);
  for(const [name,cap,palm] of [['hand_back',[.8,.16],[.33,.75]],['hand_front',[.2,.16],[.7,.77]]]) {
    const clips=ctx.draws.get(name).clips;
    assert.ok(clips.length, `${name} includes a second shoulder cap`);
    assert.ok(clips.some(p=>!contains(p,ctx.point(name,...cap))),`${name} shoulder cap still visible`);
    assert.ok(clips.every(p=>contains(p,ctx.point(name,...palm))),`${name} palm clipped away`);
  }
});

test('short feet stay tucked under the tunic throughout the walk cycle', () => {
  for(const time of [0,.1,.2,.3,.4,.5]) {
    const ctx=new RecordingCanvas();
    drawWarrior(ctx,artwork,{id:1,state:'walk',facing:-1,elapsed:time},time);
    const hem=ctx.point('body',.5,1);
    for(const name of ['leg_back','leg_front']) {
      const top=ctx.point(name,.5,.05), bottom=ctx.point(name,.5,1);
      assert.ok(top[1]<hem[1],`${name} detached from tunic`);
      assert.ok(bottom[1]-hem[1]<12,`${name} is too long for a short boot`);
    }
  }
});

test('wrist roots meet the torso sleeve ends and the jaw meets the collar', () => {
  for(const state of ['idle','walk','attack','hit']) for(const facing of [-1,1]) {
    const ctx=new RecordingCanvas();
    drawWarrior(ctx,artwork,{id:1,state,facing,elapsed:.3,attackVector:{x:facing*72,y:42}},.3);
    for(const [hand,shoulder] of [['hand_back',[.145,.32]],['hand_front',[.88,.34]]]) {
      const root=ctx.point(hand,...rig.parts[hand].origin), sleeve=ctx.point('body',...shoulder);
      assert.ok(Math.hypot(root[0]-sleeve[0],root[1]-sleeve[1])<2,`${hand} detached at shoulder during ${state}`);
    }
    const jaw=ctx.point('head',.5,.99), collar=ctx.point('body',.52,.08);
    assert.ok(Math.hypot(jaw[0]-collar[0],jaw[1]-collar[1])<2,`head floats above collar during ${state}`);
  }
});

test('foot shadow is centered on the board contact point, not below it', () => {
  const ctx = new RecordingCanvas();
  drawWarrior(ctx, artwork, { id: 1, state: 'idle', facing: -1, elapsed: 0 }, 0);
  const shadow = ctx.point('shadow', .5, .5);
  assert.ok(Math.abs(shadow[0]) < 3);
  assert.ok(Math.abs(shadow[1]) < 2, `shadow floats below feet at ${shadow[1]}`);
});
