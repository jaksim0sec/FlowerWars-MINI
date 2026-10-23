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
  save() { this.stack.push([...this.matrix]); }
  restore() { this.matrix = this.stack.pop(); }
  translate(x, y) { const m = this.matrix; m[4] += m[0] * x + m[2] * y; m[5] += m[1] * x + m[3] * y; }
  scale(x, y) { const m = this.matrix; m[0] *= x; m[1] *= x; m[2] *= y; m[3] *= y; }
  rotate(a) {
    const [a0, b, c, d, x, y] = this.matrix, s = Math.sin(a), co = Math.cos(a);
    this.matrix = [a0 * co + c * s, b * co + d * s, c * co - a0 * s, d * co - b * s, x, y];
  }
  drawImage(image, x, y, w, h) { this.draws.set(image, { matrix: [...this.matrix], x, y, w, h }); }
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
      const sword = ctx.point('basic_sword', .77, .83);
      const wrist = ctx.point('hand_back', (297 - 190) / 192, (963 - 880) / 222);
      assert.ok(Math.hypot(sword[0] - wrist[0], sword[1] - wrist[1]) < .1, `${state} ${elapsed} ${facing}: sword detached`);
    }
  }
});

test('foot shadow is centered on the board contact point, not below it', () => {
  const ctx = new RecordingCanvas();
  drawWarrior(ctx, artwork, { id: 1, state: 'idle', facing: -1, elapsed: 0 }, 0);
  const shadow = ctx.point('shadow', .5, .5);
  assert.ok(Math.abs(shadow[0]) < 3);
  assert.ok(Math.abs(shadow[1]) < 2, `shadow floats below feet at ${shadow[1]}`);
});
