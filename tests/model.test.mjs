import test from 'node:test';
import assert from 'node:assert/strict';
import { Board, BOARD_COLUMNS, BOARD_ROWS, HALF_W, HALF_H, project, unproject, tileAt, zoomCamera, fitBoardCamera } from '../src/model.mjs';

test('isometric projection and diamond picking respect cell boundaries', () => {
  assert.deepEqual(project(2, 1), { x: 72, y: 126 });
  assert.deepEqual(unproject(72, 126), { x: 2, y: 1 });
  assert.deepEqual(tileAt(70, 125, 8, 6), { x: 2, y: 1 });
  assert.equal(tileAt(-500, -500, 8, 6), null);
});

test('zoom preserves the world point underneath a cursor and clamps limits', () => {
  const camera = { x: 100, y: 80, scale: 1 };
  const next = zoomCamera(camera, { x: 172, y: 122 }, 2);
  assert.deepEqual(next, { x: 28, y: 38, scale: 2 });
  assert.equal(zoomCamera(camera, { x: 0, y: 0 }, 999).scale, 2.4);
  assert.equal(zoomCamera(camera, { x: 0, y: 0 }, 0.001).scale, 0.1);
});

test('default battlefield has ten columns and sixteen rows', () => {
  const board = new Board();
  assert.equal(board.width, BOARD_COLUMNS);
  assert.equal(board.height, BOARD_ROWS);
  assert.equal(board.terrain.length, 16);
  assert.equal(board.terrain[0].length, 10);
  assert.equal(board.inside(9, 15), true);
  assert.equal(board.inside(10, 15), false);
});

test('fit uses the actual 10 by 16 field bounds including unit heads and sidewalls', () => {
  const left = -BOARD_ROWS * HALF_W, right = BOARD_COLUMNS * HALF_W;
  const top = -126, bottom = (BOARD_COLUMNS + BOARD_ROWS - 1) * HALF_H + 22;
  for (const [width, height] of [[375,494],[320,400],[844,170],[1280,700]]) {
    const camera = fitBoardCamera(width, height);
    assert.ok(left * camera.scale + camera.x >= 15.9);
    assert.ok(right * camera.scale + camera.x <= width - 15.9);
    assert.ok(top * camera.scale + camera.y >= 15.9);
    assert.ok(bottom * camera.scale + camera.y <= height - 15.9);
  }
});

test('summon rejects occupied and outside cells without consuming ids', () => {
  const b = new Board(4, 4);
  assert.equal(b.spawn(-1, 0), null);
  assert.equal(b.spawn(1, 1).id, 1);
  assert.equal(b.spawn(1, 1), null);
  assert.equal(b.spawn(2, 1).id, 2);
});

test('walking uses a free cardinal path and interpolates instead of teleporting', () => {
  const b = new Board(4, 4);
  const u = b.spawn(0, 0);
  b.spawn(1, 0);
  assert.equal(b.move(u.id, 2, 0), true);
  assert.equal(u.state, 'walk');
  b.update(0.12);
  assert.equal(u.x, 0);
  assert.ok(u.visualY > 0 && u.visualY < 1);
  assert.equal(u.visualX, 0);
  assert.equal(b.spawn(0, 1), null, 'moving path is reserved');
  for (let i = 0; i < 30; i++) b.update(0.1);
  assert.equal(u.state, 'idle');
  assert.deepEqual([u.x, u.y, u.visualX, u.visualY], [2, 0, 2, 0]);
});

test('invalid commands are rejected and dynamically blocked commands wait', () => {
  const b = new Board(3, 3);
  const u = b.spawn(0, 0);
  b.spawn(1, 0); b.spawn(0, 1);
  assert.equal(b.move(u.id, 0, 0), false);
  assert.equal(b.move(u.id, 1, 0), true);
  assert.equal(b.move(u.id, 2, 2), true);
  assert.equal(u.waitReason, 'traffic');
  assert.equal(b.move(u.id, 9, 9), false);
  assert.equal(u.state, 'idle');
});

test('attack approaches its target and applies exactly one hit at sword impact', () => {
  const b = new Board(5, 3);
  const u = b.spawn(0, 1), target = b.spawn(4, 1);
  assert.equal(b.attack(u.id, target.id), true);
  assert.equal(target.hits, 0);
  for (let i = 0; i < 100 && u.state === 'walk'; i++) b.update(0.02);
  assert.deepEqual([u.x, u.y], [3, 1]);
  assert.equal(u.state, 'attack');
  b.update(0.1);
  assert.equal(target.hits, 0);
  b.update(0.25);
  assert.equal(target.hits, 1);
  assert.equal(target.state, 'hit');
  for (let i = 0; i < 30; i++) b.update(0.05);
  assert.equal(target.hits, 1);
  assert.equal(u.state, 'idle');
  assert.equal(target.state, 'idle');
  assert.equal(b.attack(u.id, u.id), false);
});

test('actions only lock their own actor and reset cancels all impacts', () => {
  const b = new Board(3, 3);
  const u = b.spawn(0, 0), v = b.spawn(1, 0);
  b.attack(u.id, v.id);
  assert.equal(b.move(u.id, 2, 0), false);
  assert.equal(b.move(v.id, 2, 0), true);
  b.reset();
  b.update(5);
  assert.equal(b.units.length, 0);
  assert.equal(b.effects.length, 0);
});

test('reset restores tile terrain as well as canceling the demonstration', () => {
  const b = new Board(3, 3);
  b.terrain[0][0] = 'soil';
  b.reset();
  assert.equal(b.terrain[0][0], 'grass');
});
