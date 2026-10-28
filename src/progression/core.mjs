// Campaign progression is local, offline-capable and intentionally separate from multiplayer.
export const TYPES = Object.freeze({
  defense:{name:'방어대',icon:'🛡️',paths:[['철벽','체력 +10%'],['반격','공격 +6%']]},
  ranged:{name:'궁병대',icon:'🏹',paths:[['정밀 조준','공격 +8%'],['기동 사격','이동속도 +8%']]},
  mixed:{name:'보병대',icon:'⚔️',paths:[['돌파','공격 +7%'],['생존','체력 +7%']]},
  assault:{name:'돌격대',icon:'🌿',paths:[['선봉','공격 +8%'],['재정비','체력 +8%']]},
  mobile:{name:'기동대',icon:'💨',paths:[['질주','이동속도 +10%'],['급습','공격 +7%']]},
  support:{name:'지원대',icon:'🌱',paths:[['돌봄','회복량 +10%'],['호위','체력 +8%']]}
});
export const FLAGS=Object.freeze({
  standard:{name:'기본 깃발',desc:'기본 능력치',cost:0},
  advance:{name:'진군의 깃발',desc:'공격 +4% / 체력 -2%',cost:95},
  guard:{name:'수호의 깃발',desc:'체력 +5% / 공격 -2%',cost:95},
  scout:{name:'유격의 깃발',desc:'이동속도 +5% / 체력 -2%',cost:95}
});
export const CHESTS=Object.freeze({
  barracks:{name:'병영 상자',desc:'부대 해금 또는 훈련 재료'},
  equipment:{name:'장비 상자',desc:'훈련 재료와 도토리'},
  honor:{name:'전공 상자',desc:'깃발 및 도토리'}
});
export const QUESTS=Object.freeze({
  first:{name:'첫 번째 승전보',desc:'원정 전투 1회 승리',reward:40},
  flag:{name:'흔들리지 않는 깃발',desc:'깃발 체력 70% 이상으로 승리',reward:45},
  diverse:{name:'합동 작전',desc:'서로 다른 부대 3종 이상 배치해 승리',reward:40}
});
const KEY='flowerwars-campaign-v1';
const initialSquads=()=>Object.fromEntries(Object.keys(TYPES).map(type=>[type,{level:['defense','ranged','mixed'].includes(type)?1:0,path:'a',battles:0,wins:0}]));
export function defaultProfile(){return {version:1,acorns:90,materials:2,chests:0,chestSerial:0,squads:initialSquads(),lineup:['defense','ranged','mixed'],flags:['standard'],activeFlag:'standard',battles:0,wins:0,medals:[],quests:[],expedition:null,lastReport:null};}
function readProfile(){
  try {
    const raw=JSON.parse(globalThis.localStorage?.getItem(KEY)||'null');
    if(!raw||raw.version!==1||!raw.squads||!Array.isArray(raw.lineup))return defaultProfile();
    const safe=defaultProfile();
    safe.acorns=Math.max(0,Math.min(1e9,Math.floor(Number(raw.acorns)||0)));
    safe.materials=Math.max(0,Math.min(1e7,Math.floor(Number(raw.materials)||0)));
    safe.chests=Math.max(0,Math.min(1000,Math.floor(Number(raw.chests)||0)));
    safe.chestSerial=Math.max(0,Math.floor(Number(raw.chestSerial)||0));
    for(const type of Object.keys(TYPES)){
      const q=raw.squads[type];
      if(!q)continue;
      safe.squads[type]={level:Math.max(0,Math.min(4,Math.floor(Number(q.level)||0))),path:q.path==='b'?'b':'a',battles:Math.max(0,Math.floor(Number(q.battles)||0)),wins:Math.max(0,Math.floor(Number(q.wins)||0))};
    }
    safe.lineup=[...new Set(raw.lineup.filter(type=>TYPES[type]&&safe.squads[type].level>0))].slice(0,4);
    if(!safe.lineup.length)safe.lineup=['defense'];
    safe.flags=[...new Set((Array.isArray(raw.flags)?raw.flags:[]).filter(k=>FLAGS[k]))];
    if(!safe.flags.includes('standard'))safe.flags.unshift('standard');
    safe.activeFlag=safe.flags.includes(raw.activeFlag)?raw.activeFlag:'standard';
    safe.battles=Math.max(0,Math.floor(Number(raw.battles)||0));
    safe.wins=Math.max(0,Math.floor(Number(raw.wins)||0));
    safe.medals=[...new Set((Array.isArray(raw.medals)?raw.medals:[]).filter(x=>typeof x==='string'&&x.length<60))];
    safe.quests=[...new Set((Array.isArray(raw.quests)?raw.quests:[]).filter(x=>QUESTS[x]))];
    if(raw.expedition&&[1,2,3].includes(raw.expedition.stage)){
      safe.expedition={stage:raw.expedition.stage,supply:Math.max(0,Math.min(500,Math.floor(Number(raw.expedition.supply)||0))),boost:['attack','health',null].includes(raw.expedition.boost)?raw.expedition.boost:null};
    }
    if(raw.lastReport&&typeof raw.lastReport==='object')safe.lastReport={outcome:['victory','defeat','draw'].includes(raw.lastReport.outcome)?raw.lastReport.outcome:'draw',acorns:Math.max(0,Math.floor(Number(raw.lastReport.acorns)||0)),materials:Math.max(0,Math.floor(Number(raw.lastReport.materials)||0)),stage:Math.max(1,Math.min(3,Number(raw.lastReport.stage)||1)),complete:!!raw.lastReport.complete};
    return safe;
  }catch{return defaultProfile();}
}
let profile=readProfile();
let activeBattle=null; // Ephemeral: a reload cannot pretend a battle was completed.
export function getProfile(){return structuredClone(profile);}
export function battleActive(){return activeBattle!==null;}
export function campaignTypes(){return profile.lineup.slice();}
function save(next){
  profile=next;
  try{globalThis.localStorage?.setItem(KEY,JSON.stringify(profile));}catch{}
  if(typeof window!=='undefined')window.dispatchEvent(new Event('flowerwars:campaign-changed'));
}
function action(fn){
  const next=structuredClone(profile),result=fn(next);
  if(!result?.ok)return result||{ok:false,reason:'요청을 처리할 수 없어요.'};
  save(next);return result;
}
const fail=reason=>({ok:false,reason});
export function beginExpedition(){
  if(activeBattle)return fail('전투가 진행 중이야.');
  return action(p=>{if(p.expedition)return fail('이미 진행 중인 원정이 있어.');p.expedition={stage:1,supply:0,boost:null};p.lastReport=null;return {ok:true};});
}
export function abandonExpedition(){
  if(activeBattle)return fail('진행 중인 전투는 끝내야 해.');
  return action(p=>{p.expedition=null;return {ok:true};});
}
export function train(type){
  return action(p=>{
    const squad=p.squads[type];if(!squad||squad.level<1)return fail('먼저 해당 부대를 해금해야 해.');
    if(squad.level>=4)return fail('최대 훈련 단계야.');
    const cost=30*squad.level,material=squad.level;
    if(p.acorns<cost||p.materials<material)return fail('도토리 또는 훈련 재료가 부족해.');
    p.acorns-=cost;p.materials-=material;squad.level++;
    return {ok:true,reason:TYPES[type].name+' 훈련 완료'};
  });
}
export function unlock(type){
  return action(p=>{
    const squad=p.squads[type];if(!squad)return fail('존재하지 않는 부대야.');
    if(squad.level>0)return fail('이미 보유한 부대야.');
    if(p.acorns<100||p.materials<2)return fail('해금에는 도토리 100개와 재료 2개가 필요해.');
    p.acorns-=100;p.materials-=2;squad.level=1;
    return {ok:true,reason:TYPES[type].name+' 해금 완료'};
  });
}
export function setPath(type,path){
  return action(p=>{if(!p.squads[type]?.level||!['a','b'].includes(path))return fail('특성을 선택할 수 없어.');p.squads[type].path=path;return {ok:true,reason:'특성을 변경했어.'};});
}
export function toggleLineup(type){
  return action(p=>{
    if(!p.squads[type]?.level)return fail('보유하지 않은 부대야.');
    if(p.lineup.includes(type)){if(p.lineup.length===1)return fail('최소 한 부대는 편성해야 해.');p.lineup=p.lineup.filter(x=>x!==type);}
    else{if(p.lineup.length>=4)return fail('동시에 4종까지만 편성할 수 있어.');p.lineup.push(type);}
    return {ok:true};
  });
}
export function buyFlag(id){
  return action(p=>{
    if(!FLAGS[id])return fail('없는 깃발이야.');
    if(p.flags.includes(id))return fail('이미 보유한 깃발이야.');
    if(p.acorns<FLAGS[id].cost)return fail('도토리가 부족해.');
    p.acorns-=FLAGS[id].cost;p.flags.push(id);return {ok:true,reason:'깃발 구입 완료'};
  });
}
export function equipFlag(id){
  return action(p=>{if(!p.flags.includes(id))return fail('보유하지 않은 깃발이야.');p.activeFlag=id;return {ok:true,reason:'깃발 장착 완료'};});
}
export function buySupply(id){
  return action(p=>{
    if(activeBattle||!p.expedition)return fail('원정 대기 중에만 살 수 있어.');
    if(!['attack','health'].includes(id))return fail('없는 보급품이야.');
    if(p.expedition.boost)return fail('이번 전투의 보급은 이미 골랐어.');
    if(p.expedition.supply<35)return fail('원정 보급품이 부족해.');
    p.expedition.supply-=35;p.expedition.boost=id;
    return {ok:true,reason:'다음 전투에 적용돼.'};
  });
}
export function buyChest(){
  return action(p=>{if(p.acorns<65)return fail('도토리가 부족해.');p.acorns-=65;p.chests++;return {ok:true,reason:'보급상자 1개 구매'};});
}
export function openChest(id){
  return action(p=>{
    if(!CHESTS[id])return fail('존재하지 않는 상자야.');
    if(p.chests<=0)return fail('열 수 있는 보급상자가 없어.');
    p.chests--;p.chestSerial++;
    let reward='';
    if(id==='barracks'){
      const locked=Object.keys(TYPES).filter(type=>!p.squads[type].level);
      if(locked.length){const type=locked[(p.chestSerial-1)%locked.length];p.squads[type].level=1;reward=TYPES[type].name+' 획득';}
      else {p.materials+=3;reward='훈련 재료 3개';}
    }else if(id==='equipment'){p.materials+=3;p.acorns+=10;reward='훈련 재료 3개 · 도토리 10개';}
    else {
      const unowned=Object.keys(FLAGS).filter(key=>!p.flags.includes(key));
      if(unowned.length){const key=unowned[(p.chestSerial-1)%unowned.length];p.flags.push(key);reward=FLAGS[key].name+' 획득';}
      else {p.acorns+=55;reward='도토리 55개';}
    }
    return {ok:true,reason:reward};
  });
}
export function beginBattle(){
  if(activeBattle)return fail('이미 진행 중인 전투야.');
  if(!profile.expedition)return fail('먼저 원정을 시작해야 해.');
  if(!profile.lineup.length)return fail('편성한 부대가 없어.');
  activeBattle={stage:profile.expedition.stage};
  return {ok:true,stage:activeBattle.stage};
}
export function cancelBattle(){activeBattle=null;}
export function isAllowedType(type){return !activeBattle||profile.lineup.includes(type);}
export function applyBonuses(board,squad,type){
  if(!activeBattle||!profile.squads[type]?.level||!squad)return;
  const owned=profile.squads[type],flag=profile.activeFlag;
  let damage=1+(owned.level-1)*.025,health=1,step=1,healing=1;
  if(type==='defense'){if(owned.path==='a')health+=.10;else damage+=.06;}
  if(type==='ranged'){if(owned.path==='a')damage+=.08;else step*=.92;}
  if(type==='mixed'){if(owned.path==='a')damage+=.07;else health+=.07;}
  if(type==='assault'){if(owned.path==='a')damage+=.08;else health+=.08;}
  if(type==='mobile'){if(owned.path==='a')step*=.90;else damage+=.07;}
  if(type==='support'){if(owned.path==='a')healing+=.10;else health+=.08;}
  if(flag==='advance'){damage+=.04;health-=.02;}
  if(flag==='guard'){health+=.05;damage-=.02;}
  if(flag==='scout'){step*=.95;health-=.02;}
  if(profile.expedition?.boost==='attack')damage+=.07;
  if(profile.expedition?.boost==='health')health+=.08;
  for(const id of squad.memberIds){
    const unit=board.unit(id);if(!unit)continue;
    unit.damage*=damage;
    unit.health.current*=health;unit.health.max*=health;
    unit.movement.stepTime*=step;
    if(unit.healing&&typeof unit.healing.amount==='number')unit.healing.amount*=healing;
  }
}
export function finishBattle({winner='draw',alive=0,flagRatio=0,types=[]}={}){
  if(!activeBattle||!profile.expedition||profile.expedition.stage!==activeBattle.stage)return null;
  const stage=activeBattle.stage;activeBattle=null;
  const won=winner==='A',unique=[...new Set(types.filter(type=>TYPES[type]))];
  const next=structuredClone(profile);
  const acorns=won?35+10*stage:12,materials=won?2:1;
  next.acorns+=acorns;next.materials+=materials;next.battles++;
  if(won)next.wins++;
  for(const type of unique){next.squads[type].battles++;if(won)next.squads[type].wins++;}
  const grant=(id)=>{if(!next.quests.includes(id)){next.quests.push(id);next.acorns+=QUESTS[id].reward;}};
  if(won){grant('first');if(flagRatio>=.7)grant('flag');if(unique.length>=3)grant('diverse');}
  if(won&&flagRatio>0&&flagRatio<=.25&&!next.medals.includes('최후의 잎'))next.medals.push('최후의 잎');
  if(won&&alive<=12&&alive>0&&!next.medals.includes('생환 훈장'))next.medals.push('생환 훈장');
  let complete=false;
  if(won&&stage===3){complete=true;next.acorns+=90;next.chests+=2;next.expedition=null;if(!next.medals.includes('원정 완수'))next.medals.push('원정 완수');}
  else if(won){next.expedition={stage:stage+1,supply:Math.min(500,next.expedition.supply+45),boost:null};next.chests++;}
  else{next.expedition=null;}
  next.lastReport={outcome:won?'victory':winner==='draw'?'draw':'defeat',acorns:acorns+(complete?90:0),materials,stage,complete};
  save(next);return next.lastReport;
}
