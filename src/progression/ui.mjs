import {battleViewReady,pauseSinglePlayer} from '../online/game-gate.mjs';
import {TYPES,FLAGS,CHESTS,QUESTS,getProfile,battleActive,beginExpedition,abandonExpedition,train,unlock,setPath,toggleLineup,buyFlag,equipFlag,buySupply,buyChest,openChest,beginBattle} from './core.mjs';

let ready=false,tab='army',message='',open=!pauseSinglePlayer();
const button=document.createElement('button');
button.id='camp-entry';button.type='button';button.textContent='🌼 야영지';
button.setAttribute('aria-controls','campaign-panel');button.setAttribute('aria-expanded',String(open));
const overlay=document.createElement('div');
overlay.id='campaign-panel';overlay.className='camp-overlay';overlay.hidden=!open;
overlay.innerHTML='<section class="camp-sheet" role="dialog" aria-modal="true" aria-label="개나리워즈 야영지"><header class="camp-header"><div><small>FLOWERWARS · BASE CAMP</small><h1>개나리 야영지</h1><p>나만의 군대를 편성하고 숲을 되찾으세요</p></div><button type="button" data-action="close" class="camp-close" aria-label="야영지 닫기">×</button></header><div id="camp-content"></div></section>';
document.body.append(button,overlay);
const contentRoot=overlay.querySelector('#camp-content');
const fmt=n=>Math.floor(n).toLocaleString('ko-KR');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function setOpen(value){
  open=!!value;overlay.hidden=!open;button.setAttribute('aria-expanded',String(open));
  if(open){render();overlay.querySelector('.camp-close').focus({preventScroll:true});}
}
function control(label,action,more='',disabled=false,kind=''){return '<button type="button" class="camp-control '+kind+'" data-action="'+action+'" '+more+(disabled?' disabled':'')+'>'+label+'</button>';}
function roster(p){
  return '<div class="camp-section-title"><div><h2>내 부대</h2><p>출전할 부대를 최대 네 종류 선택하세요. 강화는 싱글 원정에만 적용됩니다.</p></div><small>'+p.lineup.length+' / 4 편성</small></div>'+
    '<div class="camp-card-grid">'+Object.entries(TYPES).map(([id,type])=>{
      const sq=p.squads[id],owned=sq.level>0,selected=p.lineup.includes(id);
      const path=type.paths[sq.path==='b'?1:0];
      return '<article class="camp-card '+(selected?'selected':'')+' '+(!owned?'locked':'')+'"><div class="camp-card-top"><span class="camp-unit-icon">'+type.icon+'</span><span class="camp-level">'+(owned?'훈련 '+sq.level+'단계':'미해금')+'</span></div>'+
        '<h3>'+type.name+'</h3><p>'+(owned?path[0]+' · '+path[1]:'보급상자 또는 제작으로 획득')+'</p>'+
        (owned?'<div class="camp-dual">'+control(selected?'편성 해제':'출전 편성','lineup','data-type="'+id+'"',false,selected?'secondary':'')+
        control(sq.level>=4?'최대 강화':'훈련 '+(30*sq.level)+' 도토리','train','data-type="'+id+'"',sq.level>=4)+'</div>'+
        '<div class="camp-paths">'+type.paths.map((def,i)=>control(def[0],'path','data-type="'+id+'" data-path="'+(i?'b':'a')+'" aria-pressed="'+(sq.path===(i?'b':'a'))+'"',false,sq.path===(i?'b':'a')?'active':'secondary')).join('')+'</div>'+
        '<small class="camp-record">출전 '+sq.battles+'회 · 승리 '+sq.wins+'회</small>':
        control('확정 해금 · 100 도토리 + 재료 2','unlock','data-type="'+id+'"'))+'</article>';
    }).join('')+'</div>';
}
function shop(p){
  return '<div class="camp-section-title"><div><h2>보급소</h2><p>상자는 전투로 획득하거나 도토리로 구매할 수 있습니다. 유료 구매는 없습니다.</p></div></div>'+
  '<div class="camp-feature"><div><strong>보유 보급상자 '+p.chests+'개</strong><p>열기 전에 원하는 종류를 선택하세요.</p></div>'+control('상자 구매 · 65 도토리','buy-chest','',p.acorns<65)+'</div>'+
  '<div class="camp-card-grid">'+Object.entries(CHESTS).map(([id,c])=>'<article class="camp-card"><div class="camp-card-top"><span class="camp-unit-icon">📦</span><span class="camp-level">선택형 보상</span></div><h3>'+c.name+'</h3><p>'+c.desc+'</p>'+control('상자 열기','chest','data-type="'+id+'"',p.chests<1)+'</article>').join('')+'</div>'+
  '<div class="camp-section-title"><div><h2>군기 제작소</h2><p>깃발 효과는 해당 부대와 함께 출전한 병력에 적용됩니다.</p></div></div>'+
  '<div class="camp-card-grid">'+Object.entries(FLAGS).map(([id,f])=>'<article class="camp-card '+(id===p.activeFlag?'selected':'')+'"><div class="camp-card-top"><span class="camp-unit-icon">🚩</span><span class="camp-level">'+(p.flags.includes(id)?'보유 중':fmt(f.cost)+' 도토리')+'</span></div><h3>'+f.name+'</h3><p>'+f.desc+'</p>'+(p.flags.includes(id)?control(id===p.activeFlag?'장착 중':'장착하기','flag-equip','data-type="'+id+'"',id===p.activeFlag):control('제작하기','flag-buy','data-type="'+id+'"',p.acorns<f.cost))+'</article>').join('')+'</div>';
}
function expedition(p){
  const run=p.expedition;
  const header='<div class="camp-section-title"><div><h2>숲 되찾기</h2><p>깃발 공성전 세 번을 완수하는 원정입니다. 각 전투가 끝날 때 진행 상황이 저장됩니다.</p></div></div>';
  const report=p.lastReport?'<div class="camp-feature"><div><strong>직전 전투 · '+(p.lastReport.outcome==='victory'?'승리':p.lastReport.outcome==='defeat'?'패배':'무승부')+'</strong><p>'+p.lastReport.stage+'차 전투 · 도토리 '+p.lastReport.acorns+'개 · 재료 '+p.lastReport.materials+'개 획득'+(p.lastReport.complete?' · 원정 완료 보상 포함':'')+'</p></div></div>':'';
  if(!run)return header+report+'<div class="camp-big-card"><small>NEW EXPEDITION</small><h3>첫 번째 숲길</h3><p>3번의 전투를 연달아 승리하세요. 원정을 실패해도 획득한 보상과 부대 성장 기록은 남습니다.</p>'+
    control('새 원정 시작','begin-expedition','',!ready||battleActive(),'primary')+'</div>';
  const label=run.stage===1?'선봉 진격':run.stage===2?'중앙 공방':'최후의 깃발';
  return header+report+'<div class="camp-big-card"><small>EXPEDITION · '+run.stage+' / 3</small><h3>'+label+'</h3><div class="camp-steps">'+[1,2,3].map(i=>'<span class="'+(i<run.stage?'done':i===run.stage?'current':'')+'">'+(i<run.stage?'✓':i)+'</span>').join('')+'</div><p>출전 가능: '+p.lineup.map(t=>TYPES[t].name).join(' · ')+'</p><p>이번 원정 보급 '+run.supply+'개'+(run.boost?' · 선택된 보급: '+(run.boost==='attack'?'공격 강화':'체력 강화'):'')+'</p>'+
    '<div class="camp-dual">'+control('공격 보급 · 35','supply','data-type="attack"',run.supply<35||!!run.boost||battleActive())+control('수비 보급 · 35','supply','data-type="health"',run.supply<35||!!run.boost||battleActive())+'</div>'+
    '<div class="camp-dual">'+control(battleActive()?'전투 진행 중':run.stage+'차 전투 출정','launch','',!ready||battleActive()||pauseSinglePlayer(),'primary')+control('원정 포기','abandon','',battleActive(),'secondary')+'</div></div>';
}
function records(p){
 const medals=p.medals.length?p.medals.map(m=>'<span class="camp-medal">'+esc(m)+'</span>').join(''):'아직 받은 훈장이 없습니다';
 return '<div class="camp-section-title"><div><h2>전공 기록</h2><p>작전 결과는 야영지에 영구 기록됩니다.</p></div></div>'+
 '<div class="camp-stats"><div><small>총 출전</small><strong>'+fmt(p.battles)+'</strong></div><div><small>승리</small><strong>'+fmt(p.wins)+'</strong></div><div><small>획득 훈장</small><strong>'+p.medals.length+'</strong></div></div>'+
 '<div class="camp-feature"><div><strong>전투 훈장</strong><p>'+medals+'</p></div></div>'+
 '<div class="camp-section-title"><div><h2>작전 의뢰</h2><p>각 의뢰는 최초 달성 시 도토리를 지급합니다.</p></div></div>'+
 '<div class="camp-quests">'+Object.entries(QUESTS).map(([id,q])=>'<div class="camp-quest"><div><strong>'+q.name+'</strong><p>'+q.desc+'</p></div><span>'+(p.quests.includes(id)?'달성':'보상 '+q.reward)+'</span></div>').join('')+'</div>';
}
function render(){
  if(!open)return;
  const p=getProfile();
  contentRoot.innerHTML='<div class="camp-wallet"><span>🌰 도토리 <strong>'+fmt(p.acorns)+'</strong></span><span>⚒️ 훈련 재료 <strong>'+fmt(p.materials)+'</strong></span><span>📦 상자 <strong>'+fmt(p.chests)+'</strong></span></div>'+
  '<nav class="camp-tabs" aria-label="야영지 메뉴">'+[['army','부대 편성'],['shop','보급소'],['expedition','원정'],['records','기록·의뢰']].map(([id,text])=>'<button type="button" data-action="tab" data-tab="'+id+'" aria-current="'+(tab===id?'page':'false')+'">'+text+'</button>').join('')+'</nav>'+
  '<div class="camp-pages">'+(tab==='army'?roster(p):tab==='shop'?shop(p):tab==='expedition'?expedition(p):records(p))+'</div>'+
  '<p class="camp-toast" role="status" aria-live="polite">'+esc(message)+'</p>';
}
overlay.addEventListener('click',event=>{
  if(event.target===overlay){setOpen(false);return;}
  const el=event.target.closest('button[data-action]');if(!el||el.disabled)return;
  const action=el.dataset.action,type=el.dataset.type;let result;
  if(action==='close'){setOpen(false);return;}
  if(action==='tab'){tab=el.dataset.tab;message='';render();return;}
  if(action==='train')result=train(type);
  else if(action==='unlock')result=unlock(type);
  else if(action==='lineup')result=toggleLineup(type);
  else if(action==='path')result=setPath(type,el.dataset.path);
  else if(action==='flag-buy')result=buyFlag(type);
  else if(action==='flag-equip')result=equipFlag(type);
  else if(action==='buy-chest')result=buyChest();
  else if(action==='chest')result=openChest(type);
  else if(action==='begin-expedition')result=beginExpedition();
  else if(action==='abandon')result=abandonExpedition();
  else if(action==='supply')result=buySupply(type);
  else if(action==='launch'){
    if(!ready||pauseSinglePlayer()){message='전장이 준비되지 않았거나 온라인 연결 중이야.';render();return;}
    result=beginBattle();
    if(result.ok){setOpen(false);window.dispatchEvent(new Event('flowerwars:campaign-launch'));return;}
  }
  if(result){message=result.reason||(result.ok?'처리 완료':'처리할 수 없습니다.');render();}
});
button.addEventListener('click',()=>setOpen(!open));
window.addEventListener('flowerwars:campaign-changed',render);
window.addEventListener('flowerwars:open-camp',()=>{tab='expedition';message='';setOpen(true);});
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&open){event.preventDefault();setOpen(false);}},false);
battleViewReady().then(()=>{ready=true;render();}).catch(()=>{message='전장을 불러오지 못했습니다.';render();});
render();
