import {combatAnimationElapsed} from './combat.mjs';
import {characterRadius,onScreen,cachedPose,releasePose} from './character-render-cache.mjs';
import {drawTerrain} from './terrain-render.mjs';
import {loadCatalog, loadImage} from './characters/catalog.mjs';
import {createCharacter, equip, drawCharacter} from './characters/engine.mjs';
import { project, HALF_W, HALF_H } from './model.mjs';
import {drawCommandOverlay} from './command-overlay.mjs';
import {drawMatchOverlay,drawDistantSoldier} from './match-overlay.mjs';

const TERRAIN_ATLAS=new URL('../assets/world/terrain/atlas.webp',import.meta.url);
export async function loadArtwork() {
  const [catalog,atlas]=await Promise.all([loadCatalog(),loadImage(TERRAIN_ATLAS)]);
  const warrior=catalog.characters['gynari-warrior'];
  return {catalog,rig:warrior.rig,parts:warrior.images,tiles:{atlas}};
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

  if (view.hover) {
    const p = project(view.hover.x, view.hover.y);
    diamond(ctx, p.x, p.y, '#fff4b521', '#fff3c281');
  }
  if(view.mode==='deploy'&&view.hover&&board.match?.phase==='preparation'&&view.deployment){
    for(const member of view.deployment.members){const x=view.hover.x+member.offset.x,y=view.hover.y+member.offset.y;
      const valid=board.inside(x,y)&&board.match.inTerritory('A',{x,y})&&!board.navigation.blocked(y*board.width+x)&&!board.occupied(x,y);
      const p=project(x,y);diamond(ctx,p.x,p.y,valid?'#5aabd04a':'#d6686055',valid?'#4c8fba':'#cc6254',5);
    }
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
