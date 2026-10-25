import {healthLabel} from './characters/vitality.mjs';
import {createCharacter,equip} from './characters/engine.mjs';
import {visibleCharacters} from './characters/catalog.mjs';
import { Board, project, tileAt, zoomCamera, fitBoardCamera } from './model.mjs';
import { loadArtwork, render } from './render.mjs';

const $ = id => document.getElementById(id);
const canvas = $('board'), ctx = canvas.getContext('2d');
const board = new Board();
const view = { selected: null, tile: null, hover: null, mode: 'move' };
let camera = { x: 0, y: 0, scale: 1 };
let width = 0, height = 0, dpr = 1, art = null;
let lastFrame = 0, previousBusy = false, previousHits = 0;
let fitted = true;
const pointers = new Map();
let origin = null, gestureMoved = false;

function text(id, value) { if ($(id).textContent !== value) $(id).textContent = value; }
function notify(message) { text('notice', message); }

function fit() {
  camera = fitBoardCamera(width, height, board.width, board.height);
  fitted = true;
  refresh();
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  const first = !width;
  const rotated = Math.abs(rect.width - width) > 80;
  camera.x += (rect.width - width) / 2;
  camera.y += (rect.height - height) / 2;
  width = rect.width; height = rect.height;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  if (first || fitted || rotated) fit();
}

function newCharacter(id) {
  if(!art) return null;
  const instance=createCharacter(art.catalog,id);
  // Demo UI chooses a loadout explicitly; the character factory stays unarmed.
  const weapon=art.catalog.characters[id].recommendedWeapon;
  if(weapon) equip(art.catalog,instance,weapon,art.catalog.characters[id].recommendedHand || 'left');
  for(const [slot,equipmentId] of Object.entries(art.catalog.characters[id].recommendedAccessories || {}))equip(art.catalog,instance,equipmentId,slot);
  return instance;
}
function unitName(unit) {return art?.catalog.characters[unit.character?.characterId]?.name || '용사';}
function seed() {
  board.reset();
  const ids=art?visibleCharacters(art.catalog).map(([id])=>id):[];
  if(ids[0]) board.spawn(2, 2, newCharacter(ids[0]));
  if(ids[1]) {const second=board.spawn(3, 5, newCharacter(ids[1]));second.facing=1;}
  view.selected = null; view.tile = null; view.hover = null; view.mode = 'move';
  previousBusy = false; previousHits = 0;
  refresh();
}

function refresh() {
  let unit = board.unit(view.selected);
  if(unit?.health.current<=0){view.selected=null;view.tile=null;unit=null;}
  text('selection-health',unit?`체력 ${unit.health.current} / ${unit.health.max} · ${healthLabel(unit.health)}`:'');
  text('unit-count', `용사 ${board.units.filter(u=>u.health.current>0).length}`);
  text('zoom-value', `${Math.round(camera.scale * 100)}%`);
  $('summon').setAttribute('aria-label',`${$('character-type').selectedOptions[0].textContent} 소환`);
  $('summon').setAttribute('aria-pressed', String(view.mode === 'summon'));
  $('attack').setAttribute('aria-pressed', String(view.mode === 'attack'));
  $('attack').disabled = !unit || board.busy;
  canvas.classList.toggle('summoning', view.mode === 'summon');
  if (unit) {
    text('selection-name', `${unitName(unit)} ${unit.id}`);
    const action = { idle: '대기', walk: '이동 중', attack: '공격 중', hit: '피격', death:'쓰러짐' }[unit.state];
    text('selection-detail', `${unit.x + 1}, ${unit.y + 1} · ${action}${unit.hits ? ` · 피격 ${unit.hits}회` : ''}`);
  } else if (view.tile) {
    text('selection-name', `${view.tile.x + 1}, ${view.tile.y + 1}번 칸`);
    text('selection-detail', board.terrain[view.tile.y][view.tile.x] === 'grass' ? '잔디 블럭' : '흙 블럭');
  } else {
    text('selection-name', '용사를 선택하세요');
    text('selection-detail', '용사를 누른 뒤 원하는 칸으로 이동');
  }
  $('terrain').hidden = !view.tile || !!unit;
  if (view.tile) text('terrain', board.terrain[view.tile.y][view.tile.x] === 'grass' ? '흙으로' : '잔디로');
}

function setMode(mode) {
  if (!art) return;
  view.mode = view.mode === mode ? 'move' : mode;
  notify(view.mode === 'summon' ? `빈칸을 누르면 ${art.catalog.characters[$('character-type').value].name}가 찾아와요.` :
    view.mode === 'attack' ? '공격할 용사를 선택하세요. 멀리 있으면 걸어가서 공격해요.' :
      '용사를 선택하고 빈칸을 눌러 이동하세요.');
  refresh();
}

function local(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}
function world(p) { return { x: (p.x - camera.x) / camera.scale, y: (p.y - camera.y) / camera.scale }; }
function pick(p) { const w = world(p); return tileAt(w.x, w.y, board.width, board.height); }

function pickUnit(p) {
  const w = world(p);
  return [...board.units].sort((a, b) => (b.visualX + b.visualY) - (a.visualX + a.visualY) || b.visualX - a.visualX)
    .find(unit => {
      if(unit.health.current<=0)return false;
      const foot = project(unit.visualX, unit.visualY);
      return Math.abs(w.x - foot.x) < 32 && w.y > foot.y - 108 && w.y < foot.y + 7;
    });
}

function activate(p, keyboardTile = null) {
  if (!art) return;
  const tile = keyboardTile || pick(p);
  const target = keyboardTile ? board.at(tile.x, tile.y) : pickUnit(p) || (tile && board.at(tile.x, tile.y));
  if (view.mode === 'summon') {
    if (!tile) return;
    const unit = board.spawn(tile.x, tile.y,newCharacter($('character-type').value));
    if (!unit) { notify('다른 용사가 있거나 이동 중인 칸이에요. 빈칸을 선택하세요.'); return; }
    view.selected = unit.id; view.tile = tile; view.mode = 'move';
    notify(`${unitName(unit)}가 도착했어요. 빈칸을 누르면 걸어갑니다.`);
  } else if (target) {
    if (view.mode === 'attack' && view.selected !== target.id) {
      if (board.attack(view.selected, target.id)) {
        view.mode = 'move'; notify('목표를 향해 갑니다.');
      } else notify(board.busy ? '지금 동작이 끝난 뒤 다시 선택하세요.' : '그 용사에게 다가갈 길이 없어요.');
    } else {
      view.selected = target.id; view.tile = { x: target.x, y: target.y };
      view.mode = 'move'; notify('빈칸으로 이동하거나 공격 버튼을 눌러 대상을 선택하세요.');
    }
  } else if (tile) {
    view.tile = tile;
    if (view.selected && view.mode === 'move') {
      if (board.move(view.selected, tile.x, tile.y)) notify('한 걸음씩 이동하고 있어요.');
      else notify(board.busy ? '지금 동작이 끝난 뒤 다시 선택하세요.' : '그 칸으로 갈 길이 없어요.');
    } else if (view.mode === 'attack') notify('공격할 용사를 선택하세요.');
    else notify('이 칸의 지형을 바꾸거나 소환 버튼으로 용사를 놓아보세요.');
  } else {
    view.selected = null; view.tile = null; view.mode = 'move';
    notify('용사를 선택하거나 빈칸에 소환해보세요.');
  }
  refresh();
}

canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0 || !art) return;
  canvas.focus({ preventScroll: true });
  const p = local(event);
  pointers.set(event.pointerId, p);
  canvas.setPointerCapture(event.pointerId);
  if (pointers.size === 1) {
    origin = { ...p, cameraX: camera.x, cameraY: camera.y };
    gestureMoved = false;
  } else gestureMoved = true;
});

const midpoint = points => ({ x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 });
const distance = points => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
canvas.addEventListener('pointermove', event => {
  const p = local(event);
  if (!pointers.has(event.pointerId)) { view.hover = pick(p); return; }
  const before = [...pointers.values()];
  pointers.set(event.pointerId, p);
  if (pointers.size > 1) {
    const after = [...pointers.values()];
    const oldCenter = midpoint(before), newCenter = midpoint(after);
    camera = zoomCamera(camera, oldCenter, distance(after) / Math.max(1, distance(before)));
    fitted = false;
    camera.x += newCenter.x - oldCenter.x; camera.y += newCenter.y - oldCenter.y;
    gestureMoved = true;
  } else if (origin) {
    const dx = p.x - origin.x, dy = p.y - origin.y;
    if (Math.hypot(dx, dy) > 6) gestureMoved = true;
    if (gestureMoved) { camera.x = origin.cameraX + dx; camera.y = origin.cameraY + dy; fitted = false; }
  }
  canvas.classList.toggle('dragging', gestureMoved);
  refresh();
});

function release(event, cancelled = false) {
  if (!pointers.has(event.pointerId)) return;
  const p = local(event);
  pointers.delete(event.pointerId);
  if (!cancelled && !gestureMoved && pointers.size === 0) activate(p);
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  if (pointers.size === 1) origin = { ...[...pointers.values()][0], cameraX: camera.x, cameraY: camera.y };
  if (!pointers.size) { origin = null; canvas.classList.remove('dragging'); }
}
canvas.addEventListener('pointerup', e => release(e));
canvas.addEventListener('pointercancel', e => release(e, true));
canvas.addEventListener('pointerleave', () => { view.hover = null; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', event => {
  event.preventDefault();
  const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1);
  camera = zoomCamera(camera, local(event), Math.exp(-delta * .0015));
  fitted = false;
  refresh();
}, { passive: false });

canvas.addEventListener('keydown', event => {
  const directions = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
  if (directions[event.key]) {
    event.preventDefault();
    const [dx, dy] = directions[event.key], tile = view.tile || { x: 0, y: 0 };
    view.tile = { x: Math.min(board.width - 1, Math.max(0, tile.x + dx)), y: Math.min(board.height - 1, Math.max(0, tile.y + dy)) };
    const u = board.at(view.tile.x, view.tile.y);
    notify(`${view.tile.x + 1}, ${view.tile.y + 1}번 칸${u ? ` · ${unitName(u)} ${u.id}` : ''}. Enter로 선택`);
    refresh();
  } else if (event.key === 'Enter' && view.tile) { event.preventDefault(); activate(null, view.tile); }
  else if (event.key.toLowerCase() === 's') setMode('summon');
  else if (event.key.toLowerCase() === 'a' && view.selected && !board.busy) setMode('attack');
  else if (event.key === 'Escape') {
    view.mode = 'move'; view.selected = null; view.tile = null; refresh(); notify('선택을 해제했어요.');
  }
});

$('character-type').addEventListener('change',refresh);
$('summon').addEventListener('click', () => setMode('summon'));
$('attack').addEventListener('click', () => setMode('attack'));
$('reset').addEventListener('click', () => { seed(); notify('처음의 두 용사로 돌아왔어요.'); });
$('terrain').addEventListener('click', () => {
  if (!view.tile) return;
  const { x, y } = view.tile;
  board.terrain[y][x] = board.terrain[y][x] === 'grass' ? 'soil' : 'grass';
  refresh(); notify('선택한 칸의 지형을 바꿨어요.');
});
$('zoom-in').addEventListener('click', () => { camera = zoomCamera(camera, { x: width / 2, y: height / 2 }, 1.2); fitted = false; refresh(); });
$('zoom-out').addEventListener('click', () => { camera = zoomCamera(camera, { x: width / 2, y: height / 2 }, 1 / 1.2); fitted = false; refresh(); });
$('fit').addEventListener('click', fit);
new ResizeObserver(resize).observe(canvas);
seed(); resize();

loadArtwork().then(loaded => {
  art = loaded;
  $('character-type').replaceChildren(...visibleCharacters(art.catalog).map(([id,def])=>new Option(def.name,id)));
  seed();
  $('loading').hidden = true;
  notify('전장 준비 완료 · 용사를 선택하거나 빈칸에 소환해보세요.');
}).catch(error => {
  text('loading', error.message); notify('에셋을 확인해주세요. 원본 이미지가 필요합니다.');
});

function frame(now) {
  const dt = lastFrame ? Math.min((now - lastFrame) / 1000, .05) : 0;
  lastFrame = now;
  if (art) {
    board.update(dt);
    const hits = board.units.reduce((n, u) => n + u.hits, 0);
    if (hits > previousHits) notify('공격이 명중했어요! 상대 용사가 충격에 반응합니다.');
    else if (previousBusy && !board.busy) notify('동작 완료 · 다음 이동이나 공격을 선택하세요.');
    previousHits = hits; previousBusy = board.busy;
    refresh(); render(ctx, art, board, view, camera, width, height, dpr);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
