import {squadTapIntent} from './gesture-commands.mjs';
import {terrainNames} from './battlefield-terrain.mjs';
import {FlagMatch} from './flag-match.mjs';
import {deploymentBlueprint} from './deployment-layout.mjs';
import {icon,typeLabels} from './ui-icons.mjs';
import {createFormationGroup,placeGroup,groupsFor,squadOf,squadsFor} from './unit-groups.mjs';
import {configureSquad,orderSquad,orderSquads,updateSquadOrders,squadSummary,SQUAD_ACTIONS} from './squad-orders.mjs';
import {characterRadius,onScreen} from './character-render-cache.mjs';
import {setupMovementScenario,startMovementScenario,movementStats} from './movement-scenarios.mjs';
import {healthLabel} from './characters/vitality.mjs';
import {createCharacter,equip,unequip,drawCharacter} from './characters/engine.mjs';
import {visibleCharacters} from './characters/catalog.mjs';
import { Board, BOARD_COLUMNS, BOARD_ROWS, project, tileAt, zoomCamera as modelZoomCamera, fitBoardCamera } from './model.mjs';
import { loadArtwork, render } from './render.mjs';

const $ = id => document.getElementById(id);
const canvas = $('board'), ctx = canvas.getContext('2d');
const board = new Board();
// Default sandbox map only. Test scenarios retain their own map sizes and layouts.
const DEFAULT_FIELD_SIZE=100;
const DEFAULT_WALL_SEGMENTS=[
  [21,35,44,35],[49,35,78,35],
  [22,50,38,50],[44,50,62,50],[67,50,81,50],
  [25,65,51,65],[57,65,79,65],
  [32,28,32,43],[32,48,32,59],
  [69,39,69,56],[69,61,69,76],
  [54,18,54,29],[54,73,54,86],
  [46,76,46,90],[76,18,76,30]
];
function placeDefaultWalls(){
  for(const [x1,y1,x2,y2] of DEFAULT_WALL_SEGMENTS){
    const dx=Math.sign(x2-x1),dy=Math.sign(y2-y1);
    for(let x=x1,y=y1;;x+=dx,y+=dy){
      board.setObstacle(x,y,{kind:'stone-wall',blocked:true,attackable:false});
      if(x===x2&&y===y2)break;
    }
  }
}
const view = { selected: null, tile: null, hover: null, mode: 'move' };
let camera = { x: 0, y: 0, scale: 1 };
let width = 0, height = 0, dpr = 1, art = null;
let lastFrame = 0, previousBusy = false, previousHits = 0;
let lastDraw=0,visibleCount=0,lastCamera='',cameraChanged=0,lastVisual='',cameraSettled=true;
let fitted = true,lastBoardSize='';
let movementScenario=null,lastLabUpdate=0,lastSquadUpdate=0,lastSelectedSquad='';
let lastMatchHud=0,lastMatchRefresh=0;
let selectedSquadId=null,lastRosterUpdate=0,rosterEpoch=null,commanderAvatar='',rosterCards=new Map(),commandPanelOpen=false;
const selectedSquads=new Set();
let additiveSelection=false,ordersExpanded=true;
let squadQuickCommand=false,longPressTimer=null,longPressPointer=null,longPressConsumed=false,feedbackTimer=null,squadHintSeen=false;
const phaseLabels={forming:'진형 형성 중',moving:'이동 중',flanking:'측면 우회 중',attacking:'집중 공격 중',holding:'전열 사수',stopped:'정지',arrived:'도착',complete:'목표 격파','target-lost':'대상 소실'};
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
  if(board.match){const center=project(49.5,49.5);camera.scale=Math.max(.02,Math.min((width-32)/14400,(height-220)/8400,.5));camera.x=width/2-center.x*camera.scale;camera.y=(height-20)/2-center.y*camera.scale;}
  fitted = true;
  refresh();
}
function zoomCamera(cam,anchor,factor){return modelZoomCamera(cam,anchor,factor,board.match ? .02 : .1);}

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
const squadActionLabels=Object.fromEntries(Object.entries(SQUAD_ACTIONS).map(([key,def])=>[key,def.label]));
const targetedSquadActions=new Set(Object.entries(SQUAD_ACTIONS).filter(([,def])=>def.target).map(([key])=>key));
function selectedCommandSquads(){return [...selectedSquads].map(id=>squadsFor(board).get(id)).filter(Boolean);}
function syncSelectionView(){view.selectedSquadIds=[...selectedSquads];dirty=true;}
function closeSquadPanel(){commandPanelOpen=false;refresh();}
function cancelSquadTarget(){
 if(view.mode==='squad-target'){view.mode='move';view.squadId=null;view.squadOrder=null;view.commandSquadIds=null;}
 $('squad-aim').hidden=true;refresh();
}
function commitSquadTarget(squad,action,aim){
 if(board.match&&!board.match.canCommand(squad?.team,action,aim)){notify('준비 중에는 내 진영 안에 배치하세요.');return false;}
 const ids=view.commandSquadIds||[...selectedSquads];
 if(!squad||!aim||!ids.length)return false;
 const result=orderSquads(board,ids,action,aim);
 if(!result.accepted.length)return false;
 additiveSelection=false;
 cancelSquadTarget();commandPanelOpen=false;ordersExpanded=false;
 notify(`${result.accepted.length}개 분대 · ${squadActionLabels[action]} · ${aim.x!=null?`${aim.x+1}, ${aim.y+1}번 칸`:'대상 지정'}${result.rejected.length?' · '+result.rejected.length+'개 분대 지휘 불가':''}`);
 refresh();syncSquadRoster();return true;
}
function issueSquadAction(action){
 const squads=selectedCommandSquads(),squad=squads[0];if(!squad)return;
 if(board.match&&(squad.team!=='A'||board.match.phase==='finished'))return;
 if(!squads.some(s=>squadSummary(board,s.id)?.commanderAlive)){notify('생존 기수가 없어 명령할 수 없습니다.');return;}
 additiveSelection=false;
 if(targetedSquadActions.has(action)){
  view.squadId=squad.id;view.commandSquadIds=squads.map(s=>s.id);view.squadOrder=action;view.mode='squad-target';commandPanelOpen=false;ordersExpanded=false;
  text('squad-aim-label',action==='flank'?'적 선택: 우회 → 공격 · 빈 땅: 우회 이동':`${squads.length}개 분대 · ${squadActionLabels[action]} → ${action==='focus'?'공격할 적':action==='follow'?'따라갈 아군':'목표 위치'} 선택`);
 }else{
  const result=orderSquads(board,squads.map(s=>s.id),action);
  cancelSquadTarget();commandPanelOpen=false;ordersExpanded=false;
  notify(`${result.accepted.length}개 분대 · ${squadActionLabels[action]}${result.rejected.length?' · '+result.rejected.length+'개 분대 지휘 불가':''}`);
 }
 refresh();syncSquadRoster();
}
function selectSquad(id,trigger=null,additive=false){
 const squad=squadsFor(board).get(id);if(!squad)return;
 if(view.mode==='squad-target'){
  const source=squadsFor(board).get(view.squadId),action=view.squadOrder;
  if(source&&action==='focus'&&squad.team!==source.team&&commitSquadTarget(source,action,{squadId:id}))return;
  if(source&&action==='flank'&&squad.team!==source.team){const lead=board.unit(squadSummary(board,id)?.actingCommanderId);if(lead&&commitSquadTarget(source,action,{x:lead.x,y:lead.y,attackTarget:{squadId:id}}))return;}
  if(source&&action==='follow'&&squad.team===source.team&&id!==source.id&&commitSquadTarget(source,action,{squadId:id}))return;
  if(id===source?.id)cancelSquadTarget();else {notify('명령에 맞는 대상 분대를 선택하세요.');return;}
 }
 if(board.match&&squad.team!=='A'){if(selectedSquads.size&&board.match.phase==='battle')commitSquadTarget(activeSquad(),'focus',{squadId:id});else notify('상대 봇 부대입니다. 내 부대를 먼저 선택하세요.');return;}
 if(view.mode==='deploy')view.mode='move';
 const current=selectedCommandSquads()[0];
 additive=additive||additiveSelection;
 if(additive&&current&&current.team!==squad.team){notify('같은 진영의 분대만 함께 선택할 수 있습니다.');return;}
 // The + button arms one pick, never a persistent grouping mode.
 additiveSelection=false;
 if(!additive)selectedSquads.clear();
 if(additive&&selectedSquads.has(id))selectedSquads.delete(id);else selectedSquads.add(id);
 selectedSquadId=selectedSquads.has(id)?id:[...selectedSquads].at(-1)||null;
 const chosen=selectedSquadId&&squadsFor(board).get(selectedSquadId),lead=chosen&&board.unit(chosen.leaderId);
 const unit=lead?.health.current>0?lead:chosen?.memberIds.map(member=>board.unit(member)).find(u=>u?.health.current>0);
 view.selected=unit?.id??null;view.tile=unit?{x:unit.x,y:unit.y}:null;
 commandPanelOpen=false;ordersExpanded=true;squadQuickCommand=true;syncSelectionView();
 if(trigger){const rect=trigger.getBoundingClientRect();$('squad-tools').style.setProperty('--squad-anchor-x',Math.round(rect.left+rect.width/2)+'px');}
 $('debug-tools').open=false;refresh();syncSquadRoster();
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
  const badges=document.createElement('span');badges.className='squad-badges';
  const role=document.createElement('span');role.className='squad-role';role.innerHTML=icon(squad.type);role.title=typeLabels[squad.type]||'혼성';
  const activity=document.createElement('span');activity.className='squad-activity';badges.append(role,activity);body.append(badges);
  body.append(title,status);button.append(portrait,body);
  button.addEventListener('click',event=>selectSquad(squad.id,button,event.shiftKey||event.ctrlKey||event.metaKey));
  button.addEventListener('dblclick',()=>locateSelection());
  let press=null,start=null,consumed=false;
  button.addEventListener('pointerdown',event=>{if(event.pointerType!=='touch')return;consumed=false;start={x:event.clientX,y:event.clientY};press=setTimeout(()=>{consumed=true;selectSquad(squad.id,button);},420);});
  button.addEventListener('pointermove',event=>{if(start&&Math.hypot(event.clientX-start.x,event.clientY-start.y)>8)clearTimeout(press);});
  for(const type of ['pointerup','pointercancel','pointerleave'])button.addEventListener(type,()=>clearTimeout(press));
  button.addEventListener('click',event=>{if(consumed){event.stopImmediatePropagation();consumed=false;}},true);
  return button;
}
/** Stable buttons and thumbnails: only status changes on combat updates. */
function syncSquadRoster(){
  const current=squadsFor(board),all=[...current.values()].filter(s=>!board.match||s.team==='A'),roster=$('squad-roster'),list=$('squad-roster-list');
  if(rosterEpoch!==board.byId){rosterEpoch=board.byId;rosterCards.clear();list.replaceChildren();selectedSquadId=null;selectedSquads.clear();additiveSelection=false;syncSelectionView();lastSelectedSquad='';commandPanelOpen=false;}
  roster.hidden=!all.length;
  text('squad-roster-count',all.length+'개');
  for(const squad of all){
    let button=rosterCards.get(squad.id);
    if(!button){
      const platoonKey=squad.platoonId||squad.groupId;
      if(!list.querySelector('[data-platoon="'+platoonKey+'"]')){
        const header=document.createElement('button');header.className='platoon-pick';header.dataset.platoon=platoonKey;header.innerHTML=icon('platoon')+'<span>'+squad.team+' · '+(squad.platoonIndex!=null?(squad.platoonIndex+1)+'소대':groupsFor(board).get(squad.groupId)?.name||'부대')+'</span><i></i>';
        header.title='소대 전체 선택 · Shift로 추가';header.addEventListener('click',event=>{
          const members=[...squadsFor(board).values()].filter(s=>(s.platoonId||s.groupId)===platoonKey);
          if(!members.length)return;cancelSquadTarget();selectSquad(members[0].id,header,event.shiftKey||event.ctrlKey||event.metaKey);
          for(const s of members)if(s.team===selectedCommandSquads()[0]?.team)selectedSquads.add(s.id);syncSelectionView();refresh();syncSquadRoster();
        });
        const group=document.createElement('div');group.className='platoon-group';group.dataset.group=platoonKey;
        const children=document.createElement('div');children.className='platoon-squads';
        const fold=document.createElement('button');fold.className='platoon-fold';fold.innerHTML=icon('chevron');fold.title='분대 접기 / 펼치기';fold.setAttribute('aria-label',fold.title);fold.setAttribute('aria-expanded','true');
        fold.addEventListener('click',()=>{children.hidden=!children.hidden;fold.setAttribute('aria-expanded',String(!children.hidden));});
        const heading=document.createElement('div');heading.className='platoon-heading';heading.append(header,fold);group.append(heading,children);list.append(group);
      }
      button=rosterButton(squad);rosterCards.set(squad.id,button);list.querySelector('[data-group="'+platoonKey+'"] .platoon-squads').append(button);}
    const summary=squadSummary(board,squad.id);
    const echelon=squad.platoonIndex!=null?'제'+(squad.platoonIndex+1)+'소대 · ':'';
    const label=echelon+(summary.leaderAlive?'기수 지휘 ':summary.commanderAlive?'임시 지휘 ':'전멸 ')+summary.alive+'/'+squad.memberIds.length;
    const status=button.querySelector('.squad-card-status');
    const remaining=summary.alive+'/'+squad.memberIds.length;
    const action=squad.order?.type||'wait',phase=phaseLabels[squad.order?.phase]||'대기';
    const activity=button.querySelector('.squad-activity');
    if(activity.dataset.action!==action){activity.dataset.action=action;activity.innerHTML=icon(action);}
    const target=squad.order?.target,destination=target?.x!=null?`${target.x+1}, ${target.y+1}`:target?.squadId?squadsFor(board).get(target.squadId)?.name:target?.unitId?'지정 병력':'';
    activity.title=(squadActionLabels[action]||'대기')+' · '+phase+(destination?' → '+destination:'');
    const caption=remaining+' · '+(squad.order?.after?'우회 → 공격':phase);if(status.textContent!==caption)status.textContent=caption;
    button.title=(typeLabels[squad.type]||'혼성')+' · '+activity.title;
    const active=selectedSquads.has(squad.id);
    button.classList.toggle('is-selected',active);
    button.classList.toggle('is-leader-down',!summary.commanderAlive);
    button.setAttribute('aria-pressed',String(active));
    button.setAttribute('aria-label',squad.team+'팀 '+squad.name+', '+label+'. 선택 후 빠른 명령');
  }
  for(const header of list.querySelectorAll('.platoon-pick')){const members=all.filter(s=>(s.platoonId||s.groupId)===header.dataset.platoon),actions=[...new Set(members.map(s=>s.order?.type||'wait'))];const badge=header.querySelector('i');badge.innerHTML=members.map(s=>'<span title="'+(typeLabels[s.type]||'혼성')+' · '+(squadActionLabels[s.order?.type]||'대기')+'">'+icon(s.type)+icon(s.order?.type||'wait')+'</span>').join('');header.title=members.map(s=>s.name+': '+(squadActionLabels[s.order?.type]||'대기')).join(' / ');}
  for(const [id,button] of rosterCards)if(!current.has(id)){button.remove();rosterCards.delete(id);}
  for(const id of selectedSquads)if(!current.has(id))selectedSquads.delete(id);
  if(selectedSquadId&&!current.has(selectedSquadId))selectedSquadId=null;
}
function selectUnit(unit){
  if(board.match&&unit?.team!=='A'&&unit){notify('상대 봇 병력은 조작할 수 없습니다.');return;}
  additiveSelection=false;
  view.selected=unit?.id??null;selectedSquadId=unit?squadOf(board,unit)?.id??null:null;
  selectedSquads.clear();if(selectedSquadId)selectedSquads.add(selectedSquadId);syncSelectionView();
  commandPanelOpen=false;
  syncSquadRoster();
}
function seed() {
  clearTimeout(feedbackTimer);$('command-feedback').hidden=true;cancelLongPress();
  board.width=DEFAULT_FIELD_SIZE;board.height=DEFAULT_FIELD_SIZE;board.reset();movementScenario=null;
  placeDefaultWalls();
  $('movement-start').disabled=true;
  const ids=art?visibleCharacters(art.catalog).map(([id])=>id):[];
  // Spawn near the map center so the units and nearby wall passages are visible.
  if(ids[0]) board.spawn(48, 47, newCharacter(ids[0]));
  if(ids[1]) {const second=board.spawn(51, 46, newCharacter(ids[1]));second.facing=1;}
  view.selected = null; view.tile = null; view.hover = null; view.mode = 'move';
  previousBusy = false; previousHits = 0;lastSelectedSquad='';selectedSquadId=null;commandPanelOpen=false;squadQuickCommand=false;cancelSquadTarget();
  syncSquadRoster();refresh();
}

function startMatch(){
 if(!art)return;
 new FlagMatch(board,{count:400,seed:Math.floor(Math.random()*4294967296),unitProfiles:art.catalog.characters,makeCharacter:(slot,i)=>characterForSlot(i,slot),optionsFor:c=>({stats:c.testStats||art.catalog.characters[c.characterId].testCombat,movement:movementFor(c),capabilities:art.catalog.characters[c.characterId].capabilities||[]})});
 movementScenario=null;view.selected=null;view.tile=null;view.hover=null;view.mode='deploy';view.deployType='defense';view.commandSquadIds=null;selectedSquads.clear();selectedSquadId=null;commandPanelOpen=false;squadQuickCommand=false;
 view.deployment=deploymentBlueprint(12,'defense','배치');
 syncSelectionView();syncSquadRoster();$('debug-tools').open=false;fit();updateMatchHud();refresh();
 notify('병종을 고르고 파란 진영을 터치해 배치하세요.');
}
function updateMatchHud(){
 const m=board.match;$('match-hud').hidden=!m;
 $('deployment-tools').hidden=!m||m.phase!=='preparation';
 $('match-result').hidden=!m||m.phase!=='finished';
 document.body.classList.toggle('in-match',!!m);
 for(const id of ['group-place','summon','board-resize','combat-enable','combat-disable','group-team','terrain'])$(id).disabled=!!m;
 if(!m)return;
 text('match-phase',m.phase==='preparation'?'병력 준비':m.phase==='battle'?'깃발 공성전':'전투 종료');
 const seconds=Math.ceil(m.remaining);text('match-timer',m.phase==='preparation'?Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0'):'');
 text('match-armies',m.phase==='preparation'?`배치 ${m.counts.A}/${m.limit} · 봇 ${m.counts.B}/${m.limit}`:`나 ${m.counts.A} · 봇 ${m.counts.B}`);
 text('deployment-reserve',`예비 ${m.reserve.A}명 · ${Math.min(12,m.reserve.A)}명씩 배치`);
 $('deployment-tools').classList.toggle('is-deploying',view.mode==='deploy');
 text('deployment-toggle',view.mode==='deploy'?'지휘 모드':'병력 배치');
 for(const button of document.querySelectorAll('[data-deploy-type]')){button.disabled=m.reserve.A<=0;button.setAttribute('aria-pressed',String(button.dataset.deployType===view.deployType));}
 if(m.phase!=='preparation'&&view.mode==='deploy')view.mode='move';
 $('match-skip').hidden=m.phase!=='preparation';$('match-charge').hidden=m.phase!=='battle';
 if(m.phase==='finished'){text('match-result-title',m.winner==='draw'?'무승부':m.winner==='A'?'승리':'패배');text('match-result-detail',m.winner==='draw'?'양쪽 깃발이 동시에 파괴됐습니다.':m.winner==='A'?'상대 깃발을 파괴했습니다.':'내 깃발이 파괴됐습니다.');}
}
function locateFlag(team){const m=board.match;if(!m)return;const p=project(m.flags[team].x,m.flags[team].y);camera.scale=Math.max(camera.scale,.22);camera.x=width/2-p.x*camera.scale;camera.y=height*.43-p.y*camera.scale;fitted=false;refresh();}
$('match-start').addEventListener('click',startMatch);$('match-restart').addEventListener('click',startMatch);
$('match-skip').addEventListener('click',()=>{if(!board.match?.counts.A){notify('내 진영에 병력을 먼저 배치하세요.');return;}if(board.match?.start()){updateMatchHud();notify('전투 시작 · 상대 깃발을 파괴하면 승리합니다.');}});
$('deployment-toggle').addEventListener('click',()=>{view.mode=view.mode==='deploy'?'move':'deploy';updateMatchHud();refresh();});
for(const button of document.querySelectorAll('[data-deploy-type]')){
 button.innerHTML=icon(button.dataset.deployType)+'<span>'+button.textContent+'</span>';
 button.addEventListener('click',()=>{view.deployType=button.dataset.deployType;view.mode='deploy';view.deployment=deploymentBlueprint(Math.min(12,board.match.reserve.A),view.deployType,'배치');selectUnit(null);updateMatchHud();refresh();});
}
$('match-charge').addEventListener('click',()=>{board.match?.charge();notify('전군 진격 · 부대를 선택해 개별 전술을 지휘할 수 있습니다.');});
$('match-home').addEventListener('click',()=>locateFlag('A'));$('match-enemy').addEventListener('click',()=>locateFlag('B'));

let dirty=true;
function refresh(invalidate=true) {
  if(invalidate)dirty=true;
  if(invalidate){const legacy=$('legacy-controls');$('command-dock').style.bottom=legacy.hidden?'':Math.max(0,height-legacy.getBoundingClientRect().top+8)+'px';}
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
  canvas.classList.toggle('summoning', ['summon','group','squad-target','deploy'].includes(view.mode));
  text('group-status',`${groupsFor(board).size}개 부대 등록`);
  const squad=activeSquad();
  $('squad-tools').hidden=!squad||!commandPanelOpen;
  $('squad-aim').hidden=view.mode!=='squad-target';
  if(squad){
    const summary=squadSummary(board,squad.id);
    text('squad-name',squad.name);
    text('squad-status',`${summary.alive}/${squad.memberIds.length}명 · ${summary.commanderAlive?'기수 지휘':'지휘관 전사'} · ${squadActionLabels[squad.order?.source]||'대기'}`);
    for(const button of $('squad-tools').querySelectorAll('[data-squad-action]'))button.disabled=!summary.commanderAlive;
    for(const button of $('squad-tools').querySelectorAll('[data-squad-stance]'))
      button.setAttribute('aria-pressed',String(selectedCommandSquads().every(s=>button.dataset.squadStance===s.stance)));
    for(const button of $('squad-tools').querySelectorAll('[data-squad-formation]'))
      button.setAttribute('aria-pressed',String(selectedCommandSquads().every(s=>button.dataset.squadFormation===s.formation)));
  }else lastSelectedSquad='';

  const selection=selectedCommandSquads(),summaries=selection.map(s=>squadSummary(board,s.id));
  document.body.classList.toggle('has-selection',selection.length>0);
  $('formation-progress').hidden=!selection.some(s=>s.order?.type==='rally');
  $('command-dock').hidden=!selection.length;
  $('command-dock').classList.toggle('is-expanded',ordersExpanded);
  $('orders-toggle').setAttribute('aria-expanded',String(ordersExpanded));
  if(selection.length){
    const count=summaries.reduce((n,s)=>n+s.alive,0),team=selection[0].team;
    text('command-selection',`${team} · ${selection.length}분대 · ${count}명`);
    const orderNames=[...new Set(selection.map(s=>squadActionLabels[s.order?.type]||'명령 없음'))].join(' / ');
    const phases=[...new Set(selection.map(s=>phaseLabels[s.order?.phase]).filter(Boolean))].join(' / ');
    const moving=summaries.reduce((n,s)=>n+s.moving,0),waiting=summaries.reduce((n,s)=>n+s.waiting,0);
    const queued=selection.some(s=>s.order?.after);
    text('command-state',queued?'우회 진행 → 도착 후 집중 공격':`${orderNames}${phases?' · '+phases:''}${waiting?' · 경로 대기 '+waiting+'명':''}`);
    if(selection.some(s=>s.order?.type==='rally')){
     const forming=summaries.filter(s=>s.order?.type==='rally'),formed=forming.reduce((n,s)=>n+s.formed,0),total=forming.reduce((n,s)=>n+s.formationTotal,0),percent=total?Math.round(formed/total*100):100;
     const labels={line:'횡대',column:'종대',square:'방진',spread:'산개',dense:'밀집'},names=[...new Set(forming.map(s=>labels[s.formation]))].join('·');
     $('formation-progress').value=percent;
     text('command-state',`${names} ${forming.some(s=>s.order?.phase==='blocked')?'공간 확보 대기':percent===100?'형성 완료':'형성 중'} · ${percent}% (${formed}/${total}명)`);
    }
    for(const button of $('command-dock').querySelectorAll('[data-squad-action]')){
      button.disabled=!summaries.some(s=>s.commanderAlive);
      button.setAttribute('aria-pressed',String(selection.every(s=>s.order?.type===button.dataset.squadAction)));
    }
  }
  $('selection-options').setAttribute('aria-expanded',String(commandPanelOpen));
  $('selection-add').setAttribute('aria-pressed',String(additiveSelection));
  if (unit) {
    text('selection-name', `${unitName(unit)} ${unit.id}${unit.groupId?' · '+groupsFor(board).get(unit.groupId)?.name:''}`);
    const action = { idle: '대기', walk: '이동 중', attack: '공격 중', hit: '피격', death:'쓰러짐' }[unit.state];
    text('selection-detail', `${unit.x + 1}, ${unit.y + 1} · ${unit.waitReason==='combat'?'교전 대기':unit.waitReason?'경로 대기':action}${unit.hits ? ` · 피격 ${unit.hits}회` : ''}`);
  } else if (view.tile) {
    text('selection-name', `${view.tile.x + 1}, ${view.tile.y + 1}번 칸`);
    text('selection-detail', terrainNames[board.terrain[view.tile.y][view.tile.x]]||'개활지');
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
  const nearby=board.units.filter(u=>u.health.current>0).map(u=>{const v=project(u.visualX,u.visualY);return {u,d:Math.hypot(p.x-(v.x*camera.scale+camera.x),p.y-((v.y-45)*camera.scale+camera.y))};}).filter(v=>v.d<=Math.max(22,30*camera.scale)).sort((a,b)=>a.d-b.d);
  if(nearby.length)return nearby[0].u;
  const w = world(p);
  return [...board.units].sort((a, b) => (b.visualX + b.visualY) - (a.visualX + a.visualY) || b.visualX - a.visualX)
    .find(unit => {
      if(unit.health.current<=0)return false;
      const foot = project(unit.visualX, unit.visualY);
      return Math.abs(w.x - foot.x) < 32 && w.y > foot.y - 108 && w.y < foot.y + 7;
    });
}

function pickFlag(p,tile){
 for(const flag of Object.values(board.match?.flags||{})){
  if(flag.health.current<=0)continue;
  if(tile?.x===flag.x&&tile?.y===flag.y)return flag;
  if(p){const v=project(flag.x,flag.y),x=v.x*camera.scale+camera.x,y=v.y*camera.scale+camera.y;
   if(Math.abs(p.x-x)<=24&&p.y>=y-42&&p.y<=y+12)return flag;
  }
 }
 return null;
}
function activate(p, keyboardTile = null, additive=false) {
  if (!art) return;
  if(board.match&&['group','summon'].includes(view.mode)){view.mode='move';return;}
  const tile = keyboardTile || pick(p);
  if(view.mode==='deploy'&&board.match?.phase==='preparation'){
    if(!tile)return;
    const squad=board.match.deploy('A',view.deployType||'defense',tile);
    if(!squad){notify('내 진영의 빈 공간에 배치하세요. 겹침·장애물·예비 병력을 확인하세요.');return;}
    view.deployment=board.match.reserve.A?deploymentBlueprint(Math.min(12,board.match.reserve.A),view.deployType,'배치'):null;
    if(!board.match.reserve.A)view.mode='move';
    syncSquadRoster();updateMatchHud();refresh();return;
  }
  const target = keyboardTile ? board.at(tile.x, tile.y)||pickFlag(null,tile) : pickUnit(p) || pickFlag(p,tile) || (tile && board.at(tile.x, tile.y));
  if(target?.structure==='flag'&&(!selectedSquads.size||target.team===activeSquad()?.team&&view.mode!=='squad-target')){
   notify(`${target.team==='A'?'내':'적'} 깃발 · 체력 ${Math.ceil(target.health.current)} / ${target.health.max}`);return;
  }
  if(view.mode==='squad-target'){
    const s=squadsFor(board).get(view.squadId),action=view.squadOrder;
    if(!s){cancelSquadTarget();return;}
    const other=target&&squadOf(board,target),aim=
      action==='focus'?target&&target.team!==s.team?{squadId:other?.id,unitId:other?undefined:target.id}:null:
      action==='flank'&&target?.team&&target.team!==s.team?{x:target.x,y:target.y,attackTarget:other?{squadId:other.id}:{unitId:target.id}}:
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
      if(commitSquadTarget(activeSquad(),intent.action==='move'?'advance':intent.action,intent.aim)){
        view.tile=tile;
        showCommandFeedback(target?{x:target.x,y:target.y}:tile,intent.action);
        notify((squadsFor(board).get(selectedSquadId)?.name||'분대')+' · '+squadActionLabels[intent.action]+' 명령');
      }else notify('목표 위치나 기수 상태를 확인하세요.');
    }else if(intent.kind==='select')selectSquad(intent.squadId,null,additive);
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
      const targetSquad=squadOf(board,target);
      if(targetSquad)selectSquad(targetSquad.id,null,additive);else selectUnit(target);
      if(!targetSquad||selectedSquads.has(targetSquad.id))view.selected=target.id;
      view.tile = { x: target.x, y: target.y };
      view.mode = 'move'; notify(targetSquad?`${selectedSquads.size}개 분대 선택 · 명령 버튼 또는 우클릭으로 지휘`:'빈칸으로 이동하거나 공격 버튼을 눌러 대상을 선택하세요.');
    }
  } else if (tile) {
    view.tile = tile;
    if (view.selected && view.mode === 'move') {
      if(selectedSquads.size){commitSquadTarget(activeSquad(),'advance',tile);return;}
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
  if(event.button!==0&&event.button!==1&&event.button!==2)return;
  canvas.focus({ preventScroll: true });
  const p = local(event);
  pointers.set(event.pointerId,p);
  canvas.setPointerCapture(event.pointerId);
  if (pointers.size === 1) {
    origin = { ...p, cameraX: camera.x, cameraY: camera.y, button:event.button };
    gestureMoved = false;
    longPressConsumed=false;
    if(event.pointerType==='touch'){
      const touched=pickUnit(p),s=touched&&squadOf(board,touched),epoch=board.byId;
      if(s){longPressPointer=event.pointerId;longPressTimer=setTimeout(()=>{
        if(longPressPointer!==event.pointerId||pointers.size!==1||gestureMoved||board.byId!==epoch)return;
        longPressConsumed=true;gestureMoved=true;selectSquad(s.id);
      },460);}
    }
  } else gestureMoved = true;
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
  cancelLongPress();
  if (!pointers.has(event.pointerId)) return;
  const p = local(event);
  pointers.delete(event.pointerId);
  if (!cancelled && !gestureMoved && pointers.size === 0 && origin?.button===0) activate(p,null,event.shiftKey||event.ctrlKey||event.metaKey);
  if (!cancelled && !gestureMoved && pointers.size === 0 && origin?.button===2&&selectedSquads.size)quickOrder(p);
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
  if(event.defaultPrevented)return;
  const directions = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
  if (directions[event.key]) {
    event.preventDefault();
    const [dx, dy] = directions[event.key], tile = view.tile || { x: 0, y: 0 };
    view.tile = { x: Math.min(board.width - 1, Math.max(0, tile.x + dx)), y: Math.min(board.height - 1, Math.max(0, tile.y + dy)) };
    const u = board.at(view.tile.x, view.tile.y);
    notify(`${view.tile.x + 1}, ${view.tile.y + 1}번 칸${u ? ` · ${unitName(u)} ${u.id}` : ''}. Enter로 선택`);
    refresh();
  } else if (event.key === 'Enter' && view.tile) { event.preventDefault(); activate(null, view.tile); }
  else if(selectedSquads.size&&({m:'advance',a:'advance',r:'advance',h:'hold',x:'hold'})[event.key.toLowerCase()]){event.preventDefault();issueSquadAction(({m:'advance',a:'advance',r:'advance',h:'hold',x:'hold'})[event.key.toLowerCase()]);}
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
  if (!view.tile||board.match) return;
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
  view.selected=null;selectedSquadId=null;commandPanelOpen=false;view.tile=null;view.hover=null;view.mode='move';view.commandSquadIds=null;selectedSquads.clear();syncSelectionView();previousHits=0;previousBusy=false;syncSquadRoster();
  $('movement-start').disabled=false;fit();updateMovementStats();notify('배치 완료 · 동시 이동으로 시작');
});
$('movement-start').addEventListener('click',()=>{
  const count=startMovementScenario(board,movementScenario);$('movement-start').disabled=true;
  refresh();updateMovementStats();notify(`${count}개체 시작 · ${movementScenario.combat?'A/B 주변 8칸 자동 공격':'이동만 · 대기·우회'}`);
});
for(const id of ['group-tools','movement-lab','field-tools'])$(id).addEventListener('toggle',()=>{if($(id).open)for(const other of ['group-tools','movement-lab','field-tools'])if(other!==id)$(other).open=false;});
$('debug-tools').addEventListener('toggle',()=>{if($('debug-tools').open){commandPanelOpen=false;refresh();}});
$('debug-close').addEventListener('click',()=>{$('debug-tools').open=false;});
function quickOrder(p){
 const source=selectedCommandSquads()[0];if(!source)return;
 if(view.mode==='squad-target'){activate(p);return;}
 const tile=pick(p),unit=pickUnit(p)||pickFlag(p,tile),other=unit&&squadOf(board,unit);
 const enemy=unit&&unit.team&&unit.team!==source.team;
 commitSquadTarget(source,enemy?'focus':'advance',enemy?(other?{squadId:other.id}:{unitId:unit.id}):tile);
}
$('command-dock').addEventListener('click',event=>{
 const action=event.target.closest('[data-squad-action]');if(action&&!action.disabled)issueSquadAction(action.dataset.squadAction);
});
for(const button of document.querySelectorAll('[data-squad-action]')){const def=SQUAD_ACTIONS[button.dataset.squadAction];button.innerHTML=icon(button.dataset.squadAction)+'<span class="icon-label">'+def.label+'</span>';button.title=def.label+' · '+def.hint;button.setAttribute('aria-label',def.label);}
for(const [attribute,prefix] of [['data-squad-stance',''],['data-squad-formation','']])for(const button of document.querySelectorAll('['+attribute+']')){const label=button.textContent.trim();button.innerHTML=icon(button.getAttribute(attribute))+'<span>'+label.replace(/^[^가-힣]+/,'')+'</span>';}
for(const [id,name,label] of [['selection-add','plus','추가 선택'],['selection-platoon','platoon','소대 선택'],['selection-options','square','진형'],['orders-toggle','chevron','명령'],['selection-clear','close','선택 해제'],['squad-close','close','닫기'],['zoom-in','plus','확대'],['zoom-out','zoom','축소'],['fit','fit','전장 맞춤']]){const button=$(id);button.innerHTML=icon(name)+'<span class="control-label">'+label+'</span>';button.title=label;button.setAttribute('aria-label',label);}
const debugSummary=$('debug-tools').querySelector(':scope > summary');debugSummary.innerHTML=icon('debug')+'<span>도구</span>';
$('orders-toggle').addEventListener('click',()=>{ordersExpanded=!ordersExpanded;refresh();});
function locateSelection(){
 const units=selectedCommandSquads().flatMap(s=>s.memberIds.map(id=>board.unit(id))).filter(u=>u?.health.current>0);
 if(!units.length)return;
 const points=units.map(u=>project(u.visualX,u.visualY)),xs=points.map(p=>p.x),ys=points.map(p=>p.y);
 const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 camera.scale=Math.min(1.1,Math.max(.2,Math.min((width-70)/(maxX-minX+180),(height-340)/(maxY-minY+180))));
 camera.x=width/2-(minX+maxX)/2*camera.scale;camera.y=Math.max(170,(height-220)/2)-(minY+maxY)/2*camera.scale;fitted=false;refresh();
}
$('selection-locate').innerHTML=icon('fit')+'<span class="control-label">부대 보기</span>';
$('selection-locate').addEventListener('click',locateSelection);
$('selection-add').addEventListener('click',()=>{additiveSelection=!additiveSelection;refresh();});
$('selection-clear').addEventListener('click',()=>{cancelSquadTarget();selectUnit(null);refresh();});
$('selection-options').addEventListener('click',()=>{commandPanelOpen=!commandPanelOpen;refresh();});
$('selection-platoon').addEventListener('click',()=>{
 const selected=selectedCommandSquads();if(!selected.length)return;
 additiveSelection=false;
 const team=selected[0].team;
 for(const source of selected)for(const candidate of squadsFor(board).values()){
  if(candidate.team===team&&candidate.groupId===source.groupId&&(!source.platoonId||source.platoonId===candidate.platoonId))selectedSquads.add(candidate.id);
 }
 syncSelectionView();refresh();syncSquadRoster();
});
$('squad-close').addEventListener('click',closeSquadPanel);
$('squad-aim-cancel').addEventListener('click',cancelSquadTarget);
$('squad-tools').addEventListener('click',event=>{
 const action=event.target.closest('[data-squad-action]');
 if(action&&!action.disabled){issueSquadAction(action.dataset.squadAction);return;}
 const stance=event.target.closest('[data-squad-stance]');
 if(stance){for(const squad of selectedCommandSquads())configureSquad(board,squad.id,{stance:stance.dataset.squadStance});refresh();return;}
 const formation=event.target.closest('[data-squad-formation]');
 if(formation){for(const squad of selectedCommandSquads()){
  configureSquad(board,squad.id,{formation:formation.dataset.squadFormation});
 }notify(`${formation.textContent.trim()} · 진형 변경`);syncSquadRoster();refresh();}
});
document.addEventListener('pointerdown',event=>{
 if($('debug-tools').open&&!$('debug-tools').contains(event.target))$('debug-tools').open=false;
 if(commandPanelOpen&&!$('squad-tools').contains(event.target)&&!$('squad-roster').contains(event.target)&&!$('command-dock').contains(event.target))closeSquadPanel();
});
document.addEventListener('keydown',event=>{
 const shortcut=({m:'advance',a:'advance',r:'advance',h:'hold',x:'hold'})[event.key.toLowerCase()];
 if(shortcut&&selectedSquads.size&&event.target!==canvas&&!event.target.closest('input,select,textarea,[contenteditable="true"]')&&!event.ctrlKey&&!event.metaKey&&!event.altKey){event.preventDefault();issueSquadAction(shortcut);return;}
 if(event.key!=='Escape')return;
 if(view.mode==='squad-target'){event.preventDefault();event.stopPropagation();cancelSquadTarget();return;}
 else if(commandPanelOpen){event.preventDefault();event.stopPropagation();closeSquadPanel();return;}
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
  commanderAvatar=makeCommanderAvatar();startMatch();
  $('loading').hidden = true;$('movement-setup').disabled=false;
  notify('전장 준비 완료 · 병종 선택 후 내 진영에 직접 배치 · 준비 5분');
}).catch(error => {
  text('loading', error.message); notify('에셋을 확인해주세요. 원본 이미지가 필요합니다.');
});

function frame(now) {
  const wallDt=lastFrame?Math.max(0,(now-lastFrame)/1000):0;
  const dt = lastFrame ? Math.min((now - lastFrame) / 1000, .05) : 0;
  lastFrame = now;
  if (art) {
    board.update(dt);
    board.match?.update(wallDt);
    if(now-lastMatchHud>=250){updateMatchHud();lastMatchHud=now;}
    if(now-lastSquadUpdate>=100&&board.match?.phase!=='finished'){updateSquadOrders(board);lastSquadUpdate=now;}
    if(now-lastRosterUpdate>=700){syncSquadRoster();lastRosterUpdate=now;}
    const hits = board.units.reduce((n, u) => n + u.hits, 0);
    if (hits > previousHits&&!selectedSquads.size&&!board.match) notify('공격이 명중했어요! 상대 용사가 충격에 반응합니다.');
    else if (!board.match&&!selectedSquads.size&&previousBusy && !board.busy && !board.units.some(u=>u.command)) notify('동작 완료 · 다음 이동이나 공격을 선택하세요.');
    previousHits = hits; previousBusy = board.busy;
    if(!board.match||now-lastMatchRefresh>=100){refresh(false);lastMatchRefresh=now;}
    if($('movement-lab').open&&now-lastLabUpdate>=250){updateMovementStats();lastLabUpdate=now;}
    const cameraKey=[camera.x,camera.y,camera.scale].join(',');
    if(cameraKey!==lastCamera){cameraChanged=now;lastCamera=cameraKey;dirty=true;cameraSettled=false;}
    const visual=[view.selected,view.tile?.x,view.tile?.y,view.hover?.x,view.hover?.y,view.mode,board.units.length,board.terrainRevision,board.obstacleRevision,width,height,dpr,board.match?.phase].join(',');
    if(visual!==lastVisual){lastVisual=visual;dirty=true;}
    const cameraMoving=now-cameraChanged<120;
    if(!cameraMoving&&!cameraSettled)dirty=true;
    const active=cameraMoving||board.units.some(u=>{
      if(u.state==='idle')return false;
      const p=project(u.visualX,u.visualY);return onScreen(p.x,p.y,u.character?characterRadius(art.catalog,u.character):250,camera,width,height);
    })||board.effects.some(e=>{const p=project(e.x,e.y);return onScreen(p.x,p.y-54,50,camera,width,height);});
    if((dirty||board.match?.phase!=='finished'&&(active||visibleCount>0))&&(now-lastDraw>=1000/(board.match?30:60)-1)){
      const result=render(ctx,art,board,view,camera,width,height,dpr,{cameraMoving});visibleCount=result.visibleUnits;lastDraw=now;dirty=false;if(!cameraMoving)cameraSettled=true;
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
