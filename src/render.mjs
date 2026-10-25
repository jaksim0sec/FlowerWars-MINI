import {combatAnimationElapsed} from './combat.mjs';
import {characterRadius,onScreen,cachedPose,releasePose} from './character-render-cache.mjs';
import {drawTerrain,visibleTiles} from './terrain-render.mjs';
import {loadCatalog, loadImage} from './characters/catalog.mjs';
import {createCharacter, equip, drawCharacter} from './characters/engine.mjs';
import { project, HALF_W, HALF_H } from './model.mjs';
import {drawCommandOverlay} from './command-overlay.mjs';
import {drawMatchOverlay,drawDistantSoldier} from './match-overlay.mjs';

const TILE_BASE = new URL('../assets/world/tiles/', import.meta.url);
export async function loadArtwork() {
  const catalog=await loadCatalog();
  const tiles=Object.fromEntries(await Promise.all(['grass','soil'].map(async name=>[name,normalizeTile(await loadImage(new URL(`${name}.webp`,TILE_BASE)),name)])));
  const warrior=catalog.characters['gynari-warrior'];
  return {catalog, rig:warrior.rig, parts:warrior.images, tiles};
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

/** Legacy API: retains the old armed-warrior call contract only. New callers
 * create their own instances/loadouts and use drawCharacter directly. */
export function drawWarrior(ctx, art, unit, time) {
  const instance=createCharacter(art.catalog,'gynari-warrior');
  equip(art.catalog,instance,'basic_sword','left');
  instance.animation={...unit,elapsed:combatAnimationElapsed(unit),phase:unit.id};
  if(unit.health)instance.health=unit.health;
  drawCharacter(ctx,art.catalog,instance,time);
}

export function render(ctx, art, board, view, camera, width, height, dpr, options={}) {
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
  drawTerrain(ctx,art,board,camera,width,height,dpr,options.cameraMoving);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.translate(camera.x,camera.y);ctx.scale(camera.scale,camera.scale);
  drawMatchOverlay(ctx,board.match,camera.scale);
  drawCommandOverlay(ctx,board,view,camera.scale);

  if(board.obstacles?.size)for(const {x,y} of visibleTiles(board,camera,width,height)) {
    const obstacle=board.obstacles.get(y*board.width+x);if(!obstacle||obstacle.blocked===false)continue;
    const p=project(x,y);diamond(ctx,p.x,p.y,'#423a3090','#766448',8);
    ctx.strokeStyle='#e8d9b4';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(p.x-9,p.y-7);ctx.lineTo(p.x+9,p.y+7);ctx.moveTo(p.x+9,p.y-7);ctx.lineTo(p.x-9,p.y+7);ctx.stroke();
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
  let posedUnits=0;
  const units = board.units.filter(u=>{const p=project(u.visualX,u.visualY);const visible=onScreen(p.x,p.y,u.character?characterRadius(art.catalog,u.character):250,camera,width,height);if(!visible&&u.character)releasePose(u.character);return visible;}).sort((a, b) => (a.visualX + a.visualY) - (b.visualX + b.visualY) || a.visualX - b.visualX);
  for (const unit of units) {
    const p = project(unit.visualX, unit.visualY);
    ctx.save(); ctx.translate(p.x, p.y);
    if(unit.team&&unit.state!=='death'){ctx.beginPath();ctx.ellipse(0,-1,29,10,0,0,Math.PI*2);ctx.strokeStyle=unit.team==='A'?'#3983b8':'#d56c3b';ctx.lineWidth=2;ctx.stroke();}
    if (unit.state!=='death' && (unit.id === view.selected || view.mode === 'attack')) {
      ctx.beginPath(); ctx.ellipse(0, -1, 34, 13, 0, 0, Math.PI * 2);
      ctx.strokeStyle = unit.id === view.selected ? '#fff3ae' : '#b96335';
      ctx.lineWidth = unit.id === view.selected ? 2.5 : 1.5; ctx.stroke();
    }
    if(unit.character&&board.match&&camera.scale<.28){
      drawDistantSoldier(ctx,art,unit,drawCharacter);
    }else if(unit.character) {
      Object.assign(unit.character.animation,{state:unit.state,elapsed:combatAnimationElapsed(unit),facing:unit.facing,phase:unit.id,attackVector:unit.attackVector,deathDirection:unit.deathDirection});
      const pose=cachedPose(art.catalog,unit.character,board.time,camera.scale);if(pose.computed)posedUnits++;
      drawCharacter(ctx,art.catalog,unit.character,board.time,{layout:pose.layout});
    } else drawWarrior(ctx, art, unit, board.time);
    if (unit.id === view.selected && unit.state!=='death') {
      const y = -123 + Math.sin(board.time * 3) * 2;
      ctx.fillStyle = '#fff1a3'; ctx.beginPath(); ctx.moveTo(-4, y); ctx.lineTo(4, y); ctx.lineTo(0, y + 5); ctx.fill();
    }
    ctx.restore();
  }
  for (const effect of board.effects) {
    const p = project(effect.x, effect.y), t = effect.age / .55;
    if(!onScreen(p.x,p.y-54,50,camera,width,height))continue;
    ctx.save(); ctx.translate(p.x, p.y - 54); ctx.globalAlpha = 1 - t;
    if(effect.healing){ctx.strokeStyle='#3d9b68';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-9,-t*25);ctx.lineTo(9,-t*25);ctx.moveTo(0,-9-t*25);ctx.lineTo(0,9-t*25);ctx.stroke();ctx.fillStyle='#286a42';ctx.font='bold 20px system-ui';ctx.fillText('+'+effect.amount,13,-t*25);ctx.restore();continue;}
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2, distance = 12 + t * 36;
      ctx.strokeStyle = i % 2 ? '#fff6cc' : '#f3b936'; ctx.lineWidth = 3 * (1 - t) + 1;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * distance, Math.sin(a) * distance);
      ctx.lineTo(Math.cos(a) * (distance + 8), Math.sin(a) * (distance + 8)); ctx.stroke();
    }
    ctx.restore();
  }
  return {visibleUnits:units.length,posedUnits};
}
