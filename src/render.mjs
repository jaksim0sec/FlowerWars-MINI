import { project, HALF_W, HALF_H } from './model.mjs';

const UNIT_BASE = new URL('../assets/units/gynari-warrior/', import.meta.url);
const TILE_BASE = new URL('../assets/world/tiles/', import.meta.url);

async function loadImage(url) {
  const image = new Image();
  image.src = url;
  try { await image.decode(); }
  catch { throw new Error(`이미지를 불러오지 못했습니다: ${new URL(url).pathname}`); }
  return image;
}

export async function loadArtwork() {
  const response = await fetch(new URL('rig.json', UNIT_BASE));
  if (!response.ok) throw new Error('개나리용사 파츠 설정을 불러오지 못했습니다.');
  const rig = await response.json();
  const entries = await Promise.all(Object.entries(rig.parts).map(async ([name, part]) =>
    [name, await loadImage(new URL(part.asset, UNIT_BASE))]));
  const tiles = await Promise.all(['grass', 'soil'].map(async name =>
    [name, normalizeTile(await loadImage(new URL(`${name}.webp`, TILE_BASE)), name)]));
  return { rig, parts: Object.fromEntries(entries), tiles: Object.fromEntries(tiles) };
}

/** Affine texture triangle; uses original image pixels, not substitute artwork. */
function triangle(ctx, image, source, dest) {
  const [a, b, c] = source, [p, q, r] = dest;
  const det = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
  const ax = ((q[0] - p[0]) * (c[1] - a[1]) - (r[0] - p[0]) * (b[1] - a[1])) / det;
  const bx = ((r[0] - p[0]) * (b[0] - a[0]) - (q[0] - p[0]) * (c[0] - a[0])) / det;
  const ay = ((q[1] - p[1]) * (c[1] - a[1]) - (r[1] - p[1]) * (b[1] - a[1])) / det;
  const by = ((r[1] - p[1]) * (b[0] - a[0]) - (q[1] - p[1]) * (c[0] - a[0])) / det;
  ctx.save();
  ctx.beginPath();
  const center = [(p[0] + q[0] + r[0]) / 3, (p[1] + q[1] + r[1]) / 3];
  dest.forEach(([x, y], i) => {
    const dx = x - center[0], dy = y - center[1], d = Math.hypot(dx, dy);
    const v = [x + dx / d * 0.5, y + dy / d * 0.5];
    if (i) ctx.lineTo(...v); else ctx.moveTo(...v);
  });
  ctx.closePath(); ctx.clip();
  ctx.transform(ax, ay, bx, by, p[0] - ax * a[0] - bx * a[1], p[1] - ay * a[0] - by * a[1]);
  ctx.drawImage(image, 0, 0);
  ctx.restore();
}

function normalizeTile(image, type) {
  // Source silhouettes differ despite sharing 512x384 dimensions. Register the
  // actual seven corners, preserving both original top and stone wall textures.
  const source = type === 'grass'
    ? [[256, 29], [486, 169], [256, 310], [26, 169], [486, 215], [256, 356], [26, 215]]
    : [[256, 51], [478, 185], [256, 318], [33, 185], [478, 226], [256, 359], [33, 226]];
  const dest = [[144, 0], [288, 84], [144, 168], [0, 84], [288, 128], [144, 212], [0, 128]];
  const canvas = document.createElement('canvas');
  canvas.width = 288; canvas.height = 214;
  const ctx = canvas.getContext('2d');
  for (const ids of [[0, 1, 2], [0, 2, 3], [1, 4, 5], [1, 5, 2], [3, 2, 5], [3, 5, 6]]) {
    triangle(ctx, image, ids.map(i => source[i]), ids.map(i => dest[i]));
  }
  return canvas;
}

function diamond(ctx, x, y, fill, stroke = null, inset = 3) {
  ctx.beginPath();
  ctx.moveTo(x, y - HALF_H + inset);
  ctx.lineTo(x + HALF_W - inset, y);
  ctx.lineTo(x, y + HALF_H - inset);
  ctx.lineTo(x - HALF_W + inset, y);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}

function part(ctx, art, name, rotation = 0, dy = 0, clip = art.rig.parts[name].clip) {
  const p = art.rig.parts[name];
  ctx.save();
  ctx.translate(p.x + p.w * p.origin[0], p.y + p.h * p.origin[1] + dy);
  ctx.rotate(rotation + (p.rotation || 0));
  if (clip) {
    ctx.beginPath();
    clip.forEach(([x, y], i) => {
      const point = [(x - p.origin[0]) * p.w, (y - p.origin[1]) * p.h];
      if (i) ctx.lineTo(...point); else ctx.moveTo(...point);
    });
    ctx.closePath(); ctx.clip();
  }
  ctx.drawImage(art.parts[name], -p.w * p.origin[0], -p.h * p.origin[1], p.w, p.h);
  ctx.restore();
}

function arm(ctx, art, name, rotation, weaponRotation = null) {
  const p = art.rig.parts[name];
  rotation += p.rest_angle || 0;
  const shoulder = { x: p.x + p.w * p.origin[0], y: p.y + p.h * p.origin[1] };
  ctx.save();
  ctx.translate(shoulder.x, shoulder.y); ctx.rotate(rotation); ctx.translate(-shoulder.x, -shoulder.y);
  if (weaponRotation !== null) {
    const grip = { x: p.x + p.w * p.grip[0], y: p.y + p.h * p.grip[1] };
    ctx.save(); ctx.translate(grip.x, grip.y); ctx.rotate(weaponRotation + (art.rig.parts.basic_sword.rest_angle || 0)); ctx.translate(-grip.x, -grip.y);
    part(ctx, art, 'basic_sword'); ctx.restore();
  }
  part(ctx, art, name);
  ctx.restore();
}

function swordPose(elapsed, vector) {
  // Anticipation → sweep. Blade crosses the target at the model's 0.30s impact.
  const finish = vector?.y < 0 ? 0.2 : -1.15;
  const windup = finish + 1.6;
  if (elapsed < 0.18) return windup * elapsed / 0.18;
  if (elapsed < 0.3) return windup - 1.6 * (elapsed - 0.18) / 0.12;
  return finish * Math.max(0, 1 - (elapsed - 0.3) / 0.35);
}

export function drawWarrior(ctx, art, unit, time) {
  const walking = unit.state === 'walk';
  const attacking = unit.state === 'attack';
  const hit = unit.state === 'hit';
  const stride = Math.sin(time * 17);
  const bob = walking ? -Math.abs(stride) * 10 : Math.sin(time * 2.5 + unit.id) * 4;
  ctx.save();
  if (attacking && unit.attackVector) {
    const lunge = Math.sin(Math.min(1, unit.elapsed / .6) * Math.PI) * .12;
    ctx.translate(unit.attackVector.x * lunge, unit.attackVector.y * lunge);
  }
  ctx.scale(unit.facing === 1 ? -art.rig.scale : art.rig.scale, art.rig.scale);
  ctx.translate(-art.rig.foot[0], -art.rig.foot[1]);
  part(ctx, art, 'shadow');
  // Recoil the entire assembly; head and weapon remain attached to the body.
  if (hit) ctx.translate(Math.sin(unit.elapsed * 50) * (1 - unit.elapsed / .36) * 32, -Math.sin(unit.elapsed / .36 * Math.PI) * 20);
  part(ctx, art, 'leg_back', walking ? stride * .16 : 0, walking ? -Math.max(0, stride) * 18 : 0);
  part(ctx, art, 'leg_front', walking ? -stride * .16 : 0, walking ? -Math.max(0, -stride) * 18 : 0);
  ctx.translate(0, bob);
  if (attacking) ctx.translate(-Math.sin(unit.elapsed / .65 * Math.PI) * 15, 0);
  // The weapon shoulder tucks behind the tunic; the free cuff rests in front.
  arm(ctx, art, 'hand_back', walking ? stride * .055 : attacking ? Math.sin(unit.elapsed / .65 * Math.PI) * .13 : 0,
    attacking ? swordPose(unit.elapsed, unit.attackVector) : Math.sin(time * 2.5 + unit.id) * .015);
  part(ctx, art, 'body');
  arm(ctx, art, 'hand_front', walking ? -stride * .055 : 0);
  ctx.save();
  ctx.translate(...art.rig.neck); ctx.rotate(Math.sin(time * 2.5 + unit.id) * .006);
  ctx.translate(-art.rig.neck[0], -art.rig.neck[1]);
  // The source includes rear petals/stem as well as the front leaf. Let the
  // face occlude the rear pieces, then overlay only the leaf and its right tip.
  part(ctx, art, 'head_deco');
  part(ctx, art, 'head');
  part(ctx, art, 'head_deco', 0, 0, art.rig.parts.head_deco.front_clip);
  ctx.restore();
  ctx.restore();
}

export function render(ctx, art, board, view, camera, width, height, dpr) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.translate(camera.x, camera.y); ctx.scale(camera.scale, camera.scale);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, -42); ctx.lineTo(576, 294); ctx.lineTo(144, 546); ctx.lineTo(-432, 210); ctx.closePath();
  ctx.translate(0, 23); ctx.shadowColor = '#68502455'; ctx.shadowBlur = 38; ctx.shadowOffsetY = 23;
  ctx.fillStyle = '#97794140'; ctx.fill(); ctx.restore();

  for (let depth = 0; depth < board.width + board.height - 1; depth++) {
    for (let y = 0; y < board.height; y++) {
      const x = depth - y;
      if (!board.inside(x, y)) continue;
      const p = project(x, y);
      ctx.drawImage(art.tiles[board.terrain[y][x]], p.x - 72, p.y - 42, 144, 107);
    }
  }
  if (view.hover) {
    const p = project(view.hover.x, view.hover.y);
    diamond(ctx, p.x, p.y, '#fff4b521', '#fff3c281');
  }
  if (view.tile) {
    const p = project(view.tile.x, view.tile.y);
    diamond(ctx, p.x, p.y, '#ffd45d23', '#fff1a8');
    diamond(ctx, p.x, p.y, null, '#b58124', 6);
  }
  const selected = board.unit(view.selected);
  if (selected?.path.length) {
    ctx.save(); ctx.beginPath();
    const start = project(selected.visualX, selected.visualY); ctx.moveTo(start.x, start.y);
    for (const step of selected.path) { const p = project(step.x, step.y); ctx.lineTo(p.x, p.y); }
    ctx.setLineDash([3, 6]); ctx.strokeStyle = '#fff3b9'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
  }
  const units = [...board.units].sort((a, b) => (a.visualX + a.visualY) - (b.visualX + b.visualY) || a.visualX - b.visualX);
  for (const unit of units) {
    const p = project(unit.visualX, unit.visualY);
    ctx.save(); ctx.translate(p.x, p.y);
    if (unit.id === view.selected || view.mode === 'attack') {
      ctx.beginPath(); ctx.ellipse(0, -1, 34, 13, 0, 0, Math.PI * 2);
      ctx.strokeStyle = unit.id === view.selected ? '#fff3ae' : '#b96335';
      ctx.lineWidth = unit.id === view.selected ? 2.5 : 1.5; ctx.stroke();
    }
    drawWarrior(ctx, art, unit, board.time);
    if (unit.id === view.selected) {
      const y = -123 + Math.sin(board.time * 3) * 2;
      ctx.fillStyle = '#fff1a3'; ctx.beginPath(); ctx.moveTo(-4, y); ctx.lineTo(4, y); ctx.lineTo(0, y + 5); ctx.fill();
    }
    ctx.restore();
  }
  for (const effect of board.effects) {
    const p = project(effect.x, effect.y), t = effect.age / .55;
    ctx.save(); ctx.translate(p.x, p.y - 54); ctx.globalAlpha = 1 - t;
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2, distance = 12 + t * 36;
      ctx.strokeStyle = i % 2 ? '#fff6cc' : '#f3b936'; ctx.lineWidth = 3 * (1 - t) + 1;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * distance, Math.sin(a) * distance);
      ctx.lineTo(Math.cos(a) * (distance + 8), Math.sin(a) * (distance + 8)); ctx.stroke();
    }
    ctx.restore();
  }
}
