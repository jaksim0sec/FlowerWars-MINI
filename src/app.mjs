import {createFormationGroup,placeGroup,groupsFor,squadOf,squadsFor} from './unit-groups.mjs';
import {configureSquad,orderSquad,updateSquadOrders,squadSummary} from './squad-orders.mjs';
import {squadTapIntent} from './gesture-commands.mjs';
import {characterRadius,onScreen} from './character-render-cache.mjs';
import {setupMovementScenario,startMovementScenario,movementStats} from './movement-scenarios.mjs';
import {healthLabel} from './characters/vitality.mjs';
import {createCharacter,equip,unequip,drawCharacter} from './characters/engine.mjs';
import {visibleCharacters} from './characters/catalog.mjs';
import { Board, BOARD_COLUMNS, BOARD_ROWS, project, tileAt, zoomCamera, fitBoardCamera } from './model.mjs';
import { loadArtwork, render } from './render.mjs';

const $ = id => document.getElementById(id);
const canvas = $('board'), ctx = canvas.getContext('2d');
const board = new Board();
const view = { selected: null, tile: null, hover: null, mode: 'move' };
let camera = { x: 0, y: 0, scale: 1 };
let width = 0, height = 0, dpr = 1, art = null;
let lastFrame = 0, previousBusy = false, previousHits = 0;
let lastDraw=0,visibleCount=0,lastCamera='',cameraChanged=0,lastVisual='',cameraSettled=true;
let fitted = true,lastBoardSize='';
let movementScenario=null,lastLabUpdate=0,lastSquadUpdate=0,lastSelectedSquad='';
let selectedSquadId=null,lastRosterUpdate=0,rosterEpoch=null,commanderAvatar='',rosterCards=new Map(),commandPanelOpen=false;
let squadQuickCommand=false,longPressTimer=null,longPressPointer=null,longPressConsumed=false,feedbackTimer=null,squadHintSeen=false;
const squadSpecial={assault:['assault','돌파'],defense:['fortify','방어진 구축'],ranged:['firing-line','사격 위치 확보'],mobile:['flank','우회 기동'],support:['support-focus','지원 집중'],mixed:['reform','전열 정비']};
const pointers = new Map();
let origin = null, gestureMoved = false;

function text(id, value) { if ($(id).textContent !== value) $(id).textContent = value; }
let noticeTimer;
function showCommandFeedback(tile,action){
  if(!tile||!board.inside(tile.x,tile.y))return;
  const point=project(tile.x,tile.y),rect=canvas.getBoundingClientRect(),mark=$('command-feedback');
  mark.style.left=Math.round(rect.left+camera.x+point.x*camera.scale)+'px';
  mark.style.top=Math.round(rect.top+camera.y+point.y*camera.scale)+'px';
  mark.dataset.kind=action;
  mark.hidden=false;mark.classList.remove('command-feedback-playing');
  void mark.offsetWidth; // restart the brief visual acknowledgment on repeated taps
  mark.classList.add('command-feedback-playing');
  clearTimeout(feedbackTimer);feedbackTimer=setTimeout(()=>{mark.hidden=true;},650);
}
function notify(message) { text('notice', message);$('notice').classList.add('visible');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').classList.remove('visible'),2600); }

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
function characterForSlot(i,slot){const ids=visibleCharacters(art.catalog).map(([id])=>id),c=newCharacter(slot?.characterId||ids[Math.floor(i/2)%ids.length]);if(slot?.weapon){for(const key of Object.keys(c.equipment))unequip(c,key);equip(art.catalog,c,slot.weapon,'left');}if(slot?.name)c.testName=slot.name;if(slot?.stats)c.testStats={...slot.stats};if(slot?.movement)c.testMovement={...slot.movement};return c;}
function movementFor(c){if(c.testMovement)return {...c.testMovement};const profile={...art.catalog.characters[c.characterId].testMovement};for(const attachment of new Set(Object.values(c.equipment).filter(Boolean)))profile.stepTime*=art.catalog.equipment[attachment.equipmentId].movement?.stepMultiplier||1;return profile;}
function unitName(unit) {return unit.character?.testName || art?.catalog.characters[unit.character?.characterId]?.name || '용사';}
function activeSquad(){return (selectedSquadId&&squadsFor(board).get(selectedSquadId))||squadOf(board,board.unit(view.selected));}

/** Render the actual flag-bearer's head once using its registered character rig. */
function makeCommanderAvatar(){
  try{
    const canvas=document.createElement('canvas');canvas.width=144;canvas.height=144;
    const portrait=canvas.getContext('2d');portrait.scale(2,2);portrait.translate(36,106);
    drawCharacter(portrait,art.catalog,createCharacter(art.catalog,'banner-bearer'),0);
    return canvas.toDataURL('image/png');
  }catch(error){
    console.warn('기수 초상 생성 실패:',error);
    return new URL('../assets/units/banner-bearer/head_deco_overlay.png',import.meta.url).href;
  }
}
const squadActionLabels={
 move:'이동',advance:'진격',hold:'사수',focus:'집중 공격',
 rally:'집결',retreat:'후퇴',follow:'추종',wait:'대기',
 assault:'돌파',fortify:'방어진 구축','firing-line':'사격 위치 확보',
 flank:'우회 기동','support-focus':'지원 집중',reform:'전열 정비'
};
const targetedSquadActions=new Set(['move','advance','focus','retreat','follow','assault','flank','support-focus']);
function closeSquadPanel(){commandPanelOpen=false;refresh();}
function cancelSquadTarget(){
 if(view.mode==='squad-target'){view.mode='move';view.squadId=null;view.squadOrder=null;}
 $('squad-aim').hidden=true;refresh();
}
function commitSquadTarget(squad,action,aim){
 if(!squad||!aim||!orderSquad(board,squad.id,action,aim))return false;
 cancelSquadTarget();commandPanelOpen=false;
 notify(squad.name+' · '+(squadActionLabels[action]||action)+' 명령');
 refresh();return true;
}
function issueSquadAction(action){
 const squad=activeSquad();if(!squad)return;
 if(!squadSummary(board,squad.id)?.commanderAlive){notify('생존 병력이 없어 명령할 수 없습니다.');return;}
 if(targetedSquadActions.has(action)){
  view.squadId=squad.id;view.squadOrder=action;view.mode='squad-target';
  commandPanelOpen=false;
  text('squad-aim-label',action==='focus'?'공격할 적 분대 선택':action==='follow'||action==='support-focus'?'따라갈 아군 분대 선택':'목표 위치 선택');
  $('squad-aim').hidden=false;
  notify('전장에서 목표를 누르세요. 취소할 수도 있습니다.');
 }else if(orderSquad(board,squad.id,action)){
  commandPanelOpen=false;
  notify(squad.name+' · '+(squadActionLabels[action]||action)+' 즉시 적용');
 }else notify('분대 명령을 실행할 수 없습니다.');
 refresh();
}
function selectSquad(id,trigger=null){
 const squad=squadsFor(board).get(id);if(!squad)return;
 // A second commander card can be the focus/follow target directly.
 if(view.mode==='squad-target'){
  const source=squadsFor(board).get(view.squadId),action=view.squadOrder;
  if(source&&action==='focus'&&squad.team!==source.team&&commitSquadTarget(source,action,{squadId:id}))return;
  if(source&&['follow','support-focus'].includes(action)&&squad.team===source.team&&id!==source.id&&commitSquadTarget(source,action,{squadId:id}))return;
  if(id===source?.id){cancelSquadTarget();}
  else {notify('명령에 맞는 대상 분대를 선택하세요.');return;}
 }
 selectedSquadId=id;
 const unit=board.unit(squadSummary(board,id)?.actingCommanderId);
 view.selected=unit?.id??null;view.tile=unit?{x:unit.x,y:unit.y}:null;
 // The commander icon always opens its squad's orders; only ×/outside/Esc closes.
 commandPanelOpen=true;squadQuickCommand=true;
 if(trigger){
   const rect=trigger.getBoundingClientRect();
   $('squad-tools').style.setProperty('--squad-anchor-x',Math.round(rect.left+rect.width/2)+'px');
 }
 $('debug-tools').open=false;
 refresh();syncSquadRoster();
 if(!squadHintSeen){squadHintSeen=true;notify('기수 선택 후: 빈 칸 터치 = 이동 · 적 터치 = 공격 · 드래그 = 화면 이동');}
}
function rosterButton(squad){
  const button=document.createElement('button');button.type='button';button.className='squad-card';button.dataset.squadId=squad.id;
  const portrait=document.createElement('span');portrait.className='squad-portrait';
  const avatar=document.createElement('img');avatar.className='squad-avatar';avatar.src=commanderAvatar;avatar.alt='';avatar.width=44;avatar.height=44;
  const team=document.createElement('span');team.className='squad-card-team team-'+squad.team.toLowerCase();team.textContent=squad.team+'팀';
  portrait.append(avatar,team);
  const body=document.createElement('span');body.className='squad-card-body';
  const title=document.createElement('strong');title.className='squad-card-title';title.textContent=squad.name;
  const status=document.createElement('small');status.className='squad-card-status';
  body.append(title,status);button.append(portrait,body);
  button.addEventListener('click',()=>selectSquad(squad.id,button));
  button.addEventListener('dblclick',event=>{
    event.preventDefault();
    const s=squadsFor(board).get(squad.id),lead=board.unit(s?.leaderId);
    if(!lead||lead.health.current<=0)return;
    const p=project(lead.visualX,lead.visualY);
    camera.x=width/2-p.x*camera.scale;camera.y=height/2-p.y*camera.scale;
    fitted=false;refresh();
    notify(s.name+' 위치로 이동');
  });
  return button;
}
/** Stable buttons and thumbnails: only status changes on combat updates. */
function syncSquadRoster(){
  const current=squadsFor(board),all=[...current.values()],roster=$('squad-roster'),list=$('squad-roster-list');
  if(rosterEpoch!==board.byId){rosterEpoch=board.byId;rosterCards.clear();list.replaceChildren();selectedSquadId=null;lastSelectedSquad='';commandPanelOpen=false;squadQuickCommand=false;}
  roster.hidden=!all.length;
  text('squad-roster-count',all.length+'개');
  for(const squad of all){
    let button=rosterCards.get(squad.id);
    if(!button){button=rosterButton(squad);rosterCards.set(squad.id,button);list.append(button);}
    const summary=squadSummary(board,squad.id);
    const echelon=squad.platoonIndex!=null?'제'+(squad.platoonIndex+1)+'소대 · ':'';
    const label=echelon+(summary.leaderAlive?'기수 지휘 ':summary.commanderAlive?'임시 지휘 ':'전멸 ')+summary.alive+'/'+squad.memberIds.length;
    const status=button.querySelector('.squad-card-status');
    const remaining=(summary.leaderAlive?'':summary.commanderAlive?'대리 ':'전멸 ')+summary.alive+'/'+squad.memberIds.length;
    if(status.textContent!==remaining)status.textContent=remaining;
    const active=squad.id===selectedSquadId&&(commandPanelOpen||squadQuickCommand);
    button.classList.toggle('is-selected',active);
    button.classList.toggle('is-leader-down',!summary.commanderAlive);
    button.setAttribute('aria-pressed',String(active));
    button.setAttribute('aria-label',squad.team+'팀 '+squad.name+', '+label+'. 분대 명령 열기');
  }
  for(const [id,button] of rosterCards)if(!current.has(id)){button.remove();rosterCards.delete(id);}
  if(selectedSquadId&&!current.has(selectedSquadId))selectedSquadId=null;
}
function selectUnit(unit){
  view.selected=unit?.id??null;selectedSquadId=unit?squadOf(board,unit)?.id??null:null;
  commandPanelOpen=false;squadQuickCommand=false;
  syncSquadRoster();
}
function seed() {
  clearTimeout(feedbackTimer);$('command-feedback').hidden=true;cancelLongPress();
  board.width=BOARD_COLUMNS;board.height=BOARD_ROWS;board.reset();movementScenario=null;
  $('movement-start').disabled=true;
  const ids=art?visibleCharacters(art.catalog).map(([id])=>id):[];
  if(ids[0]) board.spawn(2, 2, newCharacter(ids[0]));
  if(ids[1]) {const second=board.spawn(3, 5, newCharacter(ids[1]));second.facing=1;}
  view.selected = null; view.tile = null; view.hover = null; view.mode = 'move';
  previousBusy = false; previousHits = 0;lastSelectedSquad='';selectedSquadId=null;commandPanelOpen=false;squadQuickCommand=false;cancelSquadTarget();
  syncSquadRoster();refresh();
}

let dirty=true;
function refresh(invalidate=true) {
  if(invalidate)dirty=true;
  const boardSize=`${board.width},${board.height}`;if(boardSize!==lastBoardSize){lastBoardSize=boardSize;$('board-columns').value=board.width;$('board-rows').value=board.height;}
  let unit = board.unit(view.selected);
  if(unit?.health.current<=0){view.selected=null;view.tile=null;unit=null;}
  text('selection-health',unit?`${unit.team?unit.team+' · ':''}체력 ${unit.health.current} / ${unit.health.max} · ${healthLabel(unit.health)}`:'');
  text('selection-combat',unit?.team?`공격 ${unit.damage} · 공속 ${(1/unit.combat.period).toFixed(2)}회/초 · 사거리 ${unit.combat.range}`:'');$('selection-combat').hidden=!unit?.team;
  text('unit-count', `용사 ${board.units.filter(u=>u.health.current>0).length}`);
  text('zoom-value', `${Math.round(camera.scale * 100)}%`);
  $('summon').setAttribute('aria-label',`${$('character-type').selectedOptions[0].textContent} 소환`);
  $('summon').setAttribute('aria-pressed', String(view.mode === 'summon'));
  $('attack').setAttribute('aria-pressed', String(view.mode === 'attack'));
  $('attack').disabled = !unit || unit.state!=='idle' || !!unit.step;
  canvas.classList.toggle('summoning', ['summon','group','squad-target'].includes(view.mode));
  text('group-status',`${groupsFor(board).size}개 부대 등록`);
  const squad=activeSquad();
  $('squad-tools').hidden=!squad||!commandPanelOpen;
  $('squad-aim').hidden=view.mode!=='squad-target';
  if(squad){
    const summary=squadSummary(board,squad.id),special=squadSpecial[squad.type]||squadSpecial.mixed;
    text('squad-name',squad.name);
    text('squad-status',`${summary.alive}/${squad.memberIds.length}명 · ${summary.leaderAlive?'기수 지휘':summary.commanderAlive?'임시 지휘관 승계':'분대 전멸'} · ${squadActionLabels[squad.order?.source]||'대기'}`);
    if(lastSelectedSquad!==squad.id){
      lastSelectedSquad=squad.id;
      $('squad-special').dataset.squadAction=special[0];
      text('squad-special-label',special[1]);
    }
    for(const button of $('squad-tools').querySelectorAll('[data-squad-action]'))button.disabled=!summary.commanderAlive;
    for(const button of $('squad-tools').querySelectorAll('[data-squad-stance]'))
      button.setAttribute('aria-pressed',String(button.dataset.squadStance===squad.stance));
    for(const button of $('squad-tools').querySelectorAll('[data-squad-formation]'))
      button.setAttribute('aria-pressed',String(button.dataset.squadFormation===squad.formation));
  }else lastSelectedSquad='';

  if (unit) {
    text('selection-name', `${unitName(unit)} ${unit.id}${unit.groupId?' · '+groupsFor(board).get(unit.groupId)?.name:''}`);
    const action = { idle: '대기', walk: '이동 중', attack: '공격 중', hit: '피격', death:'쓰러짐' }[unit.state];
    text('selection-detail', `${unit.x + 1}, ${unit.y + 1} · ${unit.waitReason==='combat'?'교전 대기':unit.waitReason?'경로 대기':action}${unit.hits ? ` · 피격 ${unit.hits}회` : ''}`);
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
  if(view.mode==='squad-target'){
    const s=squadsFor(board).get(view.squadId),action=view.squadOrder;
    if(!s){cancelSquadTarget();return;}
    const other=target&&squadOf(board,target),aim=
      action==='focus'?target&&target.team!==s.team?{squadId:other?.id,unitId:other?undefined:target.id}:null:
      ['follow','support-focus'].includes(action)?other&&other.team===s.team?{squadId:other.id}:null:
      tile?{x:tile.x,y:tile.y}:null;
    if(!commitSquadTarget(s,action,aim)){notify('명령 대상이나 지휘관을 확인하세요.');return;}
    showCommandFeedback(target?{x:target.x,y:target.y}:tile,action);
  } else if(view.mode==='group'){
    if(!tile)return;
    const blueprint=createFormationGroup($('group-size').value,$('group-kind').value,$('group-name').value,$('group-type').value);
    const group=placeGroup(board,blueprint,tile,{team:$('group-team').value,makeCharacter:(slot,i)=>characterForSlot(i,slot),optionsFor:c=>({stats:c.testStats||art.catalog.characters[c.characterId].testCombat,movement:movementFor(c),capabilities:art.catalog.characters[c.characterId].capabilities||[]})});
    if(!group){notify('부대 전체가 들어갈 빈 공간을 선택하세요. 앞줄 위치가 기준입니다.');return;}
    selectUnit(board.unit(group.commanderId||group.memberIds[0]));view.tile=tile;view.mode='move';notify(`${group.name} · ${group.memberIds.length}명 일괄 배치`);
  } else if (view.mode === 'summon') {
    if (!tile) return;
    const unit = board.spawn(tile.x, tile.y,newCharacter($('character-type').value));
    if (!unit) { notify('다른 용사가 있거나 이동 중인 칸이에요. 빈칸을 선택하세요.'); return; }
    selectUnit(unit);view.tile = tile; view.mode = 'move';
    notify(`${unitName(unit)}가 도착했어요. 빈칸을 누르면 걸어갑니다.`);
  } else if(view.mode==='move'&&squadQuickCommand&&selectedSquadId){
    // Touch-first RTS: tap open terrain to move the squad; tap an opposing
    // squad to focus it. Tapping an ally switches selection.
    const intent=squadTapIntent(board,selectedSquadId,target,tile);
    if(intent.kind==='order'){
      if(orderSquad(board,selectedSquadId,intent.action,intent.aim)){
        view.tile=tile;
        showCommandFeedback(target?{x:target.x,y:target.y}:tile,intent.action);
        notify((squadsFor(board).get(selectedSquadId)?.name||'분대')+' · '+squadActionLabels[intent.action]+' 명령');
      }else notify('목표 위치나 기수 상태를 확인하세요.');
    }else if(intent.kind==='select')selectSquad(intent.squadId);
    else if(intent.kind==='inspect'&&target){
      selectUnit(target);view.tile={x:target.x,y:target.y};
      notify(unitName(target)+' 선택 · 개별 조작');
    }
    refresh();return;
  } else if (target) {
    if (view.mode === 'attack' && view.selected !== target.id) {
      if (board.attack(view.selected, target.id)) {
        view.mode = 'move'; notify('목표를 향해 갑니다.');
      } else notify('선택한 용사의 동작이나 접근 경로를 확인하세요.');
    } else {
      selectUnit(target);view.tile = { x: target.x, y: target.y };
      view.mode = 'move'; notify('빈칸으로 이동하거나 공격 버튼을 눌러 대상을 선택하세요.');
    }
  } else if (tile) {
    view.tile = tile;
    if (view.selected && view.mode === 'move') {
      if (board.move(view.selected, tile.x, tile.y)) notify('한 걸음씩 이동하고 있어요.');
      else notify('선택한 용사의 동작이나 이동 경로를 확인하세요.');
    } else if (view.mode === 'attack') notify('공격할 용사를 선택하세요.');
    else notify('이 칸의 지형을 바꾸거나 소환 버튼으로 용사를 놓아보세요.');
  } else {
    selectUnit(null);view.tile = null; view.mode = 'move';
    notify('용사를 선택하거나 빈칸에 소환해보세요.');
  }
  refresh();
}

function cancelLongPress(){
  if(longPressTimer!=null)clearTimeout(longPressTimer);
  longPressTimer=null;longPressPointer=null;
}
canvas.addEventListener('pointerdown', event => {
  if(!art)return;
  // PC standard: right-click commands the explicitly selected squad.
  if(event.pointerType==='mouse'&&event.button===2){
    if(squadQuickCommand&&selectedSquadId&&view.mode==='move'){event.preventDefault();activate(local(event));}
    return;
  }
  if(event.button!==0)return;
  canvas.focus({ preventScroll: true });
  const p = local(event);
  pointers.set(event.pointerId,p);
  canvas.setPointerCapture(event.pointerId);
  if(pointers.size===1){
    origin={...p,cameraX:camera.x,cameraY:camera.y};gestureMoved=false;
    longPressConsumed=false;
    if(event.pointerType==='touch'){
      const touched=pickUnit(p),s=touched&&squadOf(board,touched),epoch=board.byId;
      if(s){
        longPressPointer=event.pointerId;
        longPressTimer=setTimeout(()=>{
          if(longPressPointer!==event.pointerId||pointers.size!==1||gestureMoved||board.byId!==epoch)return;
          if(!squadsFor(board).has(s.id))return;
          longPressConsumed=true;gestureMoved=true;
          selectSquad(s.id);
          notify(s.name+' · 길게 눌러 분대 명령 열기');
        },460);
      }
    }
  }else{gestureMoved=true;longPressConsumed=false;cancelLongPress();}
});

const midpoint = points => ({ x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 });
const distance = points => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
canvas.addEventListener('pointermove', event => {
  const p = local(event);
  if (!pointers.has(event.pointerId)) { view.hover = pick(p); return; }
  const before = [...pointers.values()];
  pointers.set(event.pointerId, p);
  if(pointers.size>1)longPressConsumed=false;
  if(origin&&Math.hypot(p.x-origin.x,p.y-origin.y)>8)cancelLongPress();
  if(longPressConsumed)return; // long-press is command selection, never a pan
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
  const p = local(event),consumed=longPressConsumed;
  cancelLongPress();pointers.delete(event.pointerId);
  if (!cancelled && !gestureMoved && !consumed && pointers.size === 0) activate(p);
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  if (pointers.size === 1) origin = { ...[...pointers.values()][0], cameraX: camera.x, cameraY: camera.y };
  if (!pointers.size) { origin = null;longPressConsumed=false; canvas.classList.remove('dragging'); }
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
  else if (event.key.toLowerCase() === 'a' && view.selected && !$('attack').disabled) setMode('attack');
  else if (event.key === 'Escape') {
    cancelSquadTarget();commandPanelOpen=false;view.mode = 'move'; selectUnit(null); view.tile = null; refresh(); notify('선택을 해제했어요.');
  }
});

$('character-type').addEventListener('change',refresh);
$('summon').addEventListener('click', () => setMode('summon'));
$('attack').addEventListener('click', () => setMode('attack'));
$('reset').addEventListener('click', () => { seed(); fit(); updateMovementStats();notify('처음의 두 용사로 돌아왔어요.'); });
$('terrain').addEventListener('click', () => {
  if (!view.tile) return;
  const { x, y } = view.tile;
  board.setTerrain(x,y,board.terrain[y][x] === 'grass' ? 'soil' : 'grass');
  refresh(); notify('선택한 칸의 지형을 바꿨어요.');
});
function updateMovementStats() {
  if(!movementScenario){text('movement-stats','배치 → 동시 이동 · 기존 전장 교체');return;}
  const s=movementStats(board,movementScenario);
  text('movement-stats',`A ${s.teams.A} · B ${s.teams.B} · 공격 ${s.attacking} · 퇴장 ${s.casualties}\n이동 ${s.moving} · 대기 ${s.waiting} · 도착 ${s.arrived}/${s.total}\nBFS ${s.fieldBuilds} · 우회 ${s.detours} · 탐색 ${s.lastExpansions}/2048`);
}
$('movement-setup').addEventListener('click',()=>{
  if(!art)return;
  clearTimeout(feedbackTimer);$('command-feedback').hidden=true;
  movementScenario=setupMovementScenario(board,$('movement-scenario').value,$('movement-count').value,characterForSlot,{combat:$('movement-combat').checked,statsFor:character=>character.testStats||art.catalog.characters[character.characterId].testCombat,seed:$('movement-seed').value,mirror:$('movement-mirror').checked,movementFor,capabilitiesFor:c=>art.catalog.characters[c.characterId].capabilities||[]});
  cancelLongPress();view.selected=null;selectedSquadId=null;commandPanelOpen=false;squadQuickCommand=false;view.tile=null;view.hover=null;view.mode='move';previousHits=0;previousBusy=false;syncSquadRoster();
  $('movement-start').disabled=false;fit();updateMovementStats();notify('배치 완료 · 동시 이동으로 시작');
});
$('movement-start').addEventListener('click',()=>{
  const count=startMovementScenario(board,movementScenario);$('movement-start').disabled=true;
  refresh();updateMovementStats();notify(`${count}개체 시작 · ${movementScenario.combat?'A/B 주변 8칸 자동 공격':'이동만 · 대기·우회'}`);
});
for(const id of ['group-tools','movement-lab','field-tools'])$(id).addEventListener('toggle',()=>{if($(id).open)for(const other of ['group-tools','movement-lab','field-tools'])if(other!==id)$(other).open=false;});
$('debug-tools').addEventListener('toggle',()=>{if($('debug-tools').open){commandPanelOpen=false;refresh();}});
$('debug-close').addEventListener('click',()=>{$('debug-tools').open=false;});
$('squad-close').addEventListener('click',closeSquadPanel);
$('squad-aim-cancel').addEventListener('click',cancelSquadTarget);
$('squad-tools').addEventListener('click',event=>{
 const action=event.target.closest('[data-squad-action]');
 if(action&&!action.disabled){issueSquadAction(action.dataset.squadAction);return;}
 const stance=event.target.closest('[data-squad-stance]');
 if(stance){const squad=activeSquad();if(squad&&configureSquad(board,squad.id,{stance:stance.dataset.squadStance}))refresh();return;}
 const formation=event.target.closest('[data-squad-formation]');
 if(formation){const squad=activeSquad();if(squad&&configureSquad(board,squad.id,{formation:formation.dataset.squadFormation}))refresh();}
});
document.addEventListener('pointerdown',event=>{
 if($('debug-tools').open&&!$('debug-tools').contains(event.target))$('debug-tools').open=false;
 if(commandPanelOpen&&!$('squad-tools').contains(event.target)&&!$('squad-roster').contains(event.target))closeSquadPanel();
});
document.addEventListener('keydown',event=>{
 if(event.key!=='Escape')return;
 if(view.mode==='squad-target'){event.preventDefault();event.stopPropagation();cancelSquadTarget();}
 else if(commandPanelOpen){event.preventDefault();event.stopPropagation();closeSquadPanel();}
 else if($('debug-tools').open&&event.target!==canvas){$('debug-tools').open=false;event.preventDefault();event.stopPropagation();}
},true);
$('legacy-controls-toggle').addEventListener('change',event=>{$('legacy-controls').hidden=!event.target.checked;if(event.target.checked)$('debug-tools').open=false;refresh();});
$('board-resize').addEventListener('click',()=>{
  if(!board.resize(Number($('board-columns').value),Number($('board-rows').value))){notify('4~256칸의 정수 크기를 입력하세요. 병력·이동 목표가 잘리는 축소는 불가합니다.');return;}
  if(view.tile&&!board.inside(view.tile.x,view.tile.y))view.tile=null;view.hover=null;fit();notify(`${board.width} × ${board.height}칸 · 기존 병력 유지`);
});
$('combat-enable').addEventListener('click',()=>{const n=board.setAutoCombat(true);refresh();notify(`${n}명 공격 활성 · 무진영 병력은 A/B 자동 배정`);});
$('combat-disable').addEventListener('click',()=>{board.setAutoCombat(false);refresh();notify('자동 공격 중지 · 진행 중인 타격은 마무리합니다.');});
$('group-place').addEventListener('click',()=>{if(!art)return;view.mode='group';notify('앞줄 기준 칸을 선택하세요. 부대 전체를 함께 배치합니다.');refresh();});
$('movement-default').addEventListener('click',()=>{seed();fit();updateMovementStats();notify('기본 전장 복원');});
$('movement-lab').addEventListener('toggle',updateMovementStats);
$('zoom-in').addEventListener('click', () => { camera = zoomCamera(camera, { x: width / 2, y: height / 2 }, 1.2); fitted = false; refresh(); });
$('zoom-out').addEventListener('click', () => { camera = zoomCamera(camera, { x: width / 2, y: height / 2 }, 1 / 1.2); fitted = false; refresh(); });
$('fit').addEventListener('click', fit);
new ResizeObserver(resize).observe(canvas);
seed(); resize();

loadArtwork().then(loaded => {
  art = loaded;
  $('character-type').replaceChildren(...visibleCharacters(art.catalog).map(([id,def])=>new Option(def.name,id)));
  seed();commanderAvatar=makeCommanderAvatar();syncSquadRoster();
  $('loading').hidden = true;$('movement-setup').disabled=false;
  notify('전장 준비 완료 · 용사를 선택하거나 빈칸에 소환해보세요.');
}).catch(error => {
  text('loading', error.message); notify('에셋을 확인해주세요. 원본 이미지가 필요합니다.');
});

function frame(now) {
  const dt = lastFrame ? Math.min((now - lastFrame) / 1000, .05) : 0;
  lastFrame = now;
  if (art) {
    board.update(dt);
    if(now-lastSquadUpdate>=500){updateSquadOrders(board);lastSquadUpdate=now;}
    if(now-lastRosterUpdate>=700){syncSquadRoster();lastRosterUpdate=now;}
    const hits = board.units.reduce((n, u) => n + u.hits, 0);
    if (hits > previousHits) notify('공격이 명중했어요! 상대 용사가 충격에 반응합니다.');
    else if (previousBusy && !board.busy && !board.units.some(u=>u.command)) notify('동작 완료 · 다음 이동이나 공격을 선택하세요.');
    previousHits = hits; previousBusy = board.busy;
    refresh(false);
    if($('movement-lab').open&&now-lastLabUpdate>=250){updateMovementStats();lastLabUpdate=now;}
    const cameraKey=[camera.x,camera.y,camera.scale].join(',');
    if(cameraKey!==lastCamera){cameraChanged=now;lastCamera=cameraKey;dirty=true;cameraSettled=false;}
    const visual=[view.selected,view.tile?.x,view.tile?.y,view.hover?.x,view.hover?.y,view.mode,board.units.length,board.terrainRevision,board.obstacleRevision,width,height,dpr].join(',');
    if(visual!==lastVisual){lastVisual=visual;dirty=true;}
    const cameraMoving=now-cameraChanged<120;
    if(!cameraMoving&&!cameraSettled)dirty=true;
    const active=cameraMoving||board.units.some(u=>{
      if(u.state==='idle')return false;
      const p=project(u.visualX,u.visualY);return onScreen(p.x,p.y,u.character?characterRadius(art.catalog,u.character):250,camera,width,height);
    })||board.effects.some(e=>{const p=project(e.x,e.y);return onScreen(p.x,p.y-54,50,camera,width,height);});
    if(dirty||active||(visibleCount>0&&now-lastDraw>=1000/30-1)){
      const result=render(ctx,art,board,view,camera,width,height,dpr,{cameraMoving});visibleCount=result.visibleUnits;lastDraw=now;dirty=false;if(!cameraMoving)cameraSettled=true;
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
