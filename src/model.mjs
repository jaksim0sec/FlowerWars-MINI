export const HALF_W = 72;
export const HALF_H = 42;
export const STEP_TIME = 0.34;
export const IMPACT_TIME = 0.3;

export function project(x, y) {
  return { x: (x - y) * HALF_W, y: (x + y) * HALF_H };
}

export function unproject(x, y) {
  return { x: (x / HALF_W + y / HALF_H) / 2, y: (y / HALF_H - x / HALF_W) / 2 };
}

export function tileAt(px, py, width, height) {
  const p = unproject(px, py);
  const x = Math.floor(p.x + 0.5), y = Math.floor(p.y + 0.5);
  return x >= 0 && y >= 0 && x < width && y < height ? { x, y } : null;
}

export function zoomCamera(camera, anchor, factor) {
  const scale = Math.min(2.4, Math.max(0.25, camera.scale * factor));
  const ratio = scale / camera.scale;
  return { x: anchor.x - (anchor.x - camera.x) * ratio,
    y: anchor.y - (anchor.y - camera.y) * ratio, scale };
}

const key = (x, y) => `${x},${y}`;
const neighbors = (x, y) => [[x + 1, y], [x, y + 1], [x - 1, y], [x, y - 1]];

/** Deterministic command model. No timers, DOM, AI, health or victory rules. */
export class Board {
  constructor(width = 8, height = 6) {
    this.width = width;
    this.height = height;
    this.reset();
  }

  reset() {
    this.units = []; this.effects = []; this.nextId = 1; this.time = 0;
    this.terrain = Array.from({ length: this.height }, (_, y) =>
      Array.from({ length: this.width }, (_, x) => (x === 3 || x === 4 || y === 2 && x > 1 && x < 6) ? 'soil' : 'grass'));
  }
  inside(x, y) { return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < this.width && y < this.height; }
  unit(id) { return this.units.find(u => u.id === id); }
  at(x, y) { return this.units.find(u => u.x === x && u.y === y); }
  get busy() { return this.units.some(u => u.state !== 'idle'); }

  occupied(x, y, except = null) {
    return this.units.some(u => u.id !== except &&
      (u.x === x && u.y === y || u.path.some(p => p.x === x && p.y === y)));
  }

  spawn(x, y) {
    if (!this.inside(x, y) || this.occupied(x, y)) return null;
    const u = { id: this.nextId++, x, y, visualX: x, visualY: y,
      state: 'idle', elapsed: 0, facing: -1, path: [], target: null, hits: 0, impacted: false };
    this.units.push(u);
    return u;
  }

  pathTo(u, goal) {
    const queue = [{ x: u.x, y: u.y, path: [] }], seen = new Set([key(u.x, u.y)]);
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i];
      if (goal(current.x, current.y)) return current.path;
      for (const [x, y] of neighbors(current.x, current.y)) {
        if (!this.inside(x, y) || seen.has(key(x, y)) || this.occupied(x, y, u.id)) continue;
        seen.add(key(x, y));
        queue.push({ x, y, path: [...current.path, { x, y }] });
      }
    }
    return null;
  }

  move(id, x, y) {
    const u = this.unit(id);
    if (!u || this.busy || !this.inside(x, y) || this.occupied(x, y) || u.x === x && u.y === y) return false;
    const path = this.pathTo(u, (a, b) => a === x && b === y);
    if (!path?.length) return false;
    u.path = path;
    u.target = null;
    this.beginStep(u);
    return true;
  }

  attack(id, targetId) {
    const u = this.unit(id), target = this.unit(targetId);
    if (!u || !target || u === target || this.busy) return false;
    const path = this.pathTo(u, (x, y) => Math.abs(x - target.x) + Math.abs(y - target.y) === 1);
    if (!path) return false;
    u.target = targetId;
    u.path = path;
    if (path.length) this.beginStep(u);
    else this.beginAttack(u);
    return true;
  }

  beginStep(u) {
    u.state = 'walk'; u.elapsed = 0;
    const next = u.path[0];
    u.facing = project(next.x - u.x, next.y - u.y).x >= 0 ? 1 : -1;
  }

  beginAttack(u) {
    const target = this.unit(u.target);
    if (!target || Math.abs(u.x - target.x) + Math.abs(u.y - target.y) !== 1) {
      u.state = 'idle'; u.target = null; return;
    }
    u.facing = project(target.x - u.x, target.y - u.y).x >= 0 ? 1 : -1;
    u.attackVector = project(target.x - u.x, target.y - u.y);
    u.state = 'attack'; u.elapsed = 0; u.impacted = false;
  }

  update(dt) {
    this.time += dt;
    for (const e of this.effects) e.age += dt;
    this.effects = this.effects.filter(e => e.age < 0.55);
    for (const u of this.units) {
      u.elapsed += dt;
      if (u.state === 'walk') {
        // Carry excess frame time into the next step; logical cells change only on arrival.
        while (u.path.length && u.elapsed >= STEP_TIME) {
          const next = u.path.shift();
          u.x = next.x; u.y = next.y;
          u.visualX = u.x; u.visualY = u.y;
          u.elapsed -= STEP_TIME;
          if (u.path.length) {
            const p = u.path[0];
            u.facing = project(p.x - u.x, p.y - u.y).x >= 0 ? 1 : -1;
          }
        }
        if (u.path.length) {
          const t = u.elapsed / STEP_TIME, p = u.path[0];
          u.visualX = u.x + (p.x - u.x) * t;
          u.visualY = u.y + (p.y - u.y) * t;
        } else if (u.target) this.beginAttack(u);
        else { u.state = 'idle'; u.elapsed = 0; }
      } else if (u.state === 'attack') {
        if (!u.impacted && u.elapsed >= IMPACT_TIME) {
          u.impacted = true;
          const target = this.unit(u.target);
          if (target && Math.abs(u.x - target.x) + Math.abs(u.y - target.y) === 1) {
            target.state = 'hit'; target.elapsed = 0; target.hits++;
            this.effects.push({ x: target.x, y: target.y, age: 0 });
          }
        }
        if (u.elapsed >= 0.65) { u.state = 'idle'; u.elapsed = 0; u.target = null; }
      } else if (u.state === 'hit' && u.elapsed >= 0.36) {
        u.state = 'idle'; u.elapsed = 0;
      }
    }
  }
}
