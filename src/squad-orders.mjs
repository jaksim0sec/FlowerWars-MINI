import {squadsFor} from './unit-groups.mjs';
import {planFormation,settleFormation,repairOccupiedSeats} from './formation-planner.mjs';
import {coverPlan,moveUnderCover} from './commander-cover.mjs';
import {reformFormation,pathTo as formationPath} from './formation-reform.mjs';
import {unequip} from './characters/engine.mjs';

export const SQUAD_ACTIONS={
 move:{label:'이동',target:true,hint:'교전보다 이동 우선'},
 advance:{label:'이동',target:true,hint:'목표로 이동하며 마주친 적과 자동 교전'},
 focus:{label:'공격',target:true,hint:'선택한 적을 추적·공격'},
 flank:{label:'우회',target:true,hint:'적 선택 → 측면 우회 후 공격 · 지면 선택은 우회 이동'},
 fortify:{label:'방어진 구축',target:true,hint:'목표에 방패 전열을 세우고 사수'},
 retreat:{label:'후퇴',target:true,hint:'교전을 끊고 지정 위치로 철수'},
 hold:{label:'사수',hint:'이동을 멈추고 현재 위치에서 적과 교전'},
 wait:{label:'정지',hint:'이동과 공격 중단'},
 rally:{label:'집결',hint:'기수 주변에 재집결'},
 follow:{label:'아군 추종',target:true,hint:'다른 아군 분대를 따라 이동'},
 'firing-line':{label:'사격진 구축',target:true,hint:'목표에 산개 배치 후 사격'}
};
const ALIASES={assault:'advance','support-focus':'follow',reform:'rally'};
const STANCES=new Set(['aggressive','balanced','avoid']);
const FORMATIONS=new Set(['line','column','dense','spread','square']);
const alive=(board,squad)=>squad.memberIds.map(id=>board.unit(id)).filter(u=>u&&u.health.current>0);
/** A promoted soldier keeps their own body and combat stats, but carries the unit flag. */
function giveActingCommanderBanner(unit){
 const character=unit?.character;
 if(!character?.equipment||!Object.hasOwn(character.equipment,'left'))return;
 if(character.equipment.left?.equipmentId==='banner_bearer_banner')return;
 unequip(character,'left');
 character.equipment.left={equipmentId:'banner_bearer_banner',hand:'left',overrides:{}};
}
/** The flag bearer commands while alive. After their loss, a surviving soldier
 * takes over without replacing or respawning the fallen character. */
const originalCommander=(board,squad)=>board.unit(squad.leaderId);
const commander=(board,squad)=>{
 const leader=originalCommander(board,squad);
 if(leader?.health.current>0)return leader;
 const incumbent=board.unit(squad.actingLeaderId);
 if(incumbent?.health.current>0){giveActingCommanderBanner(incumbent);return incumbent;}
 const successor=alive(board,squad).sort((a,b)=>a.id-b.id)[0]||null;
 squad.actingLeaderId=successor?.id??null;
 if(successor)giveActingCommanderBanner(successor);
 return successor;
};
function slots(board,squad,center,formation=squad.formation){
 const claimed=new Set();
 for(const other of squadsFor(board).values())if(other.id!==squad.id&&other.team===squad.team)
   for(const p of other.order?.goals?.values()||[])claimed.add(p.y*board.width+p.x);
 return planFormation(board,{...squad,travelOffsets:squad.order?.travelOffsets,formation,reforming:squad.order?.type==='rally'},center,alive(board,squad),commander(board,squad),claimed);
}
export function configureSquad(board,id,{stance,formation}={}){
 const s=squadsFor(board).get(id);if(!s)return false;
 if(stance&&STANCES.has(stance))s.stance=stance;
 if(formation&&FORMATIONS.has(formation)){
  const changed=s.formation!==formation;
  s.formation=formation;
  if(changed||!s.order||['hold','wait'].includes(s.order.type))return orderSquad(board,id,'rally');
 }
 if(s.order){s.order.dirty=true;runOrder(board,s,true);}
 return true;
}
function enemyUnits(board,s,target){
 const enemy=target?.squadId?squadsFor(board).get(target.squadId):null;
 const units=enemy?alive(board,enemy):target?.unitId?[board.unit(target.unitId)].filter(Boolean):[];
 return units.filter(u=>u.health.current>0&&u.team&&u.team!==s.team);
}
function followLeader(board,s,target){
 const ally=squadsFor(board).get(target?.squadId);
 if(!ally||ally.team!==s.team||ally.id===s.id)return null;
 const lead=commander(board,ally);return lead?.health.current>0?lead:null;
}
export function orderSquad(board,id,action,target=null){
 const s=squadsFor(board).get(id),lead=s&&commander(board,s),type=ALIASES[action]||action,def=SQUAD_ACTIONS[type];
 if(!s||!lead||lead.health.current<=0||!def)return false;
 // Every explicit order replaces the previous intention. A flank only chains
 // an attack when that target was included in the flank command itself.
 // The API still accepts untargeted defensive orders around the commander.
 if(!target&&['fortify','firing-line'].includes(type))target={x:lead.step?.x??lead.x,y:lead.step?.y??lead.y};
 if(type==='focus'){if(!enemyUnits(board,s,target).length)return false;}
 else if(type==='follow'){if(!followLeader(board,s,target))return false;}
 else if(def.target&&(!target||!board.inside(target.x,target.y)||board.navigation.blocked(target.y*board.width+target.x)))return false;
 const same=s.order?.source===action&&JSON.stringify(s.order.target)===JSON.stringify(target);
 if(same)return true;
 const facing=target?.x!=null?Math.sign(target.x-lead.x)||(s.team==='B'?-1:1):(s.team==='B'?-1:1);
 const order={type,source:action,target:type==='rally'?{x:lead.step?.x??lead.x,y:lead.step?.y??lead.y}:target?{...target}:null,dirty:true,previous:null,goals:new Map(),lastMembers:0,facing,phase:'moving',waypoints:[]};
 const dx=(target?.x??lead.x)-lead.x,dy=(target?.y??lead.y)-lead.y;
 order.forward=Math.abs(dy)>Math.abs(dx)?{x:0,y:Math.sign(dy)}:{x:facing,y:0};
 if(type==='retreat')order.forward={x:s.team==='B'?-1:1,y:0};
 if(type==='flank'&&target.attackTarget){if(!enemyUnits(board,s,target.attackTarget).length)return false;order.after={type:'focus',target:{...target.attackTarget}};}
 if(type==='flank'){
   const units=alive(board,s),x=Math.round(units.reduce((n,u)=>n+u.x,0)/units.length),y=Math.round(units.reduce((n,u)=>n+u.y,0)/units.length);
   const candidates=[Math.max(2,y-9),Math.min(board.height-3,y+9)].filter(side=>Math.abs(side-y)>=3);
   if(!candidates.length)return false;
   const threat=side=>board.units.filter(u=>u.health.current>0&&u.team&&u.team!==s.team&&Math.abs(u.y-side)<5&&u.x>=Math.min(x,target.x)-2&&u.x<=Math.max(x,target.x)+2).length;
   candidates.sort((a,b)=>threat(a)-threat(b)||Math.abs(b-y)-Math.abs(a-y));
   const side=candidates[0];order.waypoints=[{x,y:side},{x:target.x,y:side}];order.phase='flanking';
 }
 if(['move','advance','flank','retreat'].includes(type)){
  const units=alive(board,s),previous=s.order;
  const stable=previous?.goals?.size&&['arrived','holding'].includes(previous.phase);
  const anchor=stable?previous.goals.get(lead.id):lead;
  order.travelOffsets=!stable&&previous?.travelOffsets?new Map(previous.travelOffsets):new Map(units.map(u=>{const p=stable?previous.goals.get(u.id)||u:u;return [u.id,{x:p.x-anchor.x,y:p.y-anchor.y}];}));
 }
 s.order=order;
 if(type==='fortify')s.formation='line';
 if(type==='firing-line')s.formation='spread';
 if(action==='reform')s.formation='line';
 // Stop obsolete intentions now, retaining only physically committed steps.
 for(const u of alive(board,s)){board.interrupt(u);u.marchStepTime=null;u.combat.targetId=null;u.combat.nextSearchAt=0;u.combat.holdPosition=false;}
 runOrder(board,s,true);return true;
}
export function orderSquads(board,ids,action,target=null){
 const selected=[...new Set(ids)].map(id=>squadsFor(board).get(id)).filter(Boolean);
 const accepted=[],rejected=[],team=selected[0]?.team;
 const positional=target?.x!=null&&!['focus','follow','support-focus'].includes(action);
 if(positional&&!board.inside(target.x,target.y))return {accepted,rejected:selected.map(s=>s.id)};
 const rows=Math.min(Math.ceil(Math.sqrt(selected.length)),Math.max(1,Math.floor((board.height-8)/9)+1)),cols=Math.ceil(selected.length/rows);
 const offsets=selected.map((s,i)=>({x:Math.round((Math.floor(i/rows)-(cols-1)/2)*6),y:Math.round((i%rows-(rows-1)/2)*9)}));
 let center=target;
 if(positional&&selected.length>1){
   const xExtent=Math.max(...selected.map(s=>{const columns=action==='flank'||s.formation==='column'?2:s.formation==='line'?6:4;return Math.floor((alive(board,s).length-1)/columns)*(s.formation==='spread'?2:1)+1;}));
   const yExtent=5;
   const minX=Math.min(...offsets.map(p=>p.x)),maxX=Math.max(...offsets.map(p=>p.x)),minY=Math.min(...offsets.map(p=>p.y)),maxY=Math.max(...offsets.map(p=>p.y));
   center={x:Math.max(xExtent-minX,Math.min(board.width-1-xExtent-maxX,target.x)),y:Math.max(yExtent-minY,Math.min(board.height-1-yExtent-maxY,target.y))};
 }
 board.batchCommands(()=>selected.forEach((s,i)=>{
   let aim=target;
   if(positional&&selected.length>1)aim={x:Math.max(0,Math.min(board.width-1,center.x+offsets[i].x)),y:Math.max(0,Math.min(board.height-1,center.y+offsets[i].y))};
   if(s.team===team&&orderSquad(board,s.id,action,aim))accepted.push(s.id);else rejected.push(s.id);
 }));
 return {accepted,rejected};
}
function centerFor(board,s,o){
 if(o.waypoints.length)return o.waypoints[0];
 if(o.type==='follow'){
   const lead=followLeader(board,s,o.target);if(!lead)return null;
   return {x:Math.max(0,Math.min(board.width-1,lead.x+(s.team==='B'?3:-3))),y:lead.y};
 }
 return o.target?.x!=null?{x:o.target.x,y:o.target.y}:null;
}
function runOrder(board,s,replace=false){
 const o=s.order;if(!o)return;const units=alive(board,s);
 if(o.type==='rally'&&board.time<(o.reformRetryAt||0))return;
 if(!units.length){s.order=null;return;}
 if(o.type==='wait'||o.type==='hold'){
   for(const u of units){if(replace)board.interrupt(u);u.combat.holdPosition=true;}
   o.phase=o.type==='hold'?'holding':'stopped';o.dirty=false;return;
 }
 if(o.type==='focus'){
   const enemies=enemyUnits(board,s,o.target);
   if(!enemies.length){for(const u of units)board.interrupt(u);o.phase='complete';return;}
   const lead=commander(board,s);
   const protectedLeader=lead?.formationRole==='banner'||lead?.character?.characterId==='banner-bearer'||s.actingLeaderId===lead?.id;
   if(board.time>=(o.coverAt||0)){o.cover=protectedLeader?coverPlan(board,s,units,lead):new Map();o.coverAt=board.time+.6;}
   board.batchCommands(()=>{for(const u of units){
     if(u.healing){if(u.command?.type==='attack')board.interrupt(u);continue;}
     if(protectedLeader&&units.length>1&&u.id===lead?.id){
       if(o.cover?.has(u.id))moveUnderCover(board,u,o.cover.get(u.id));
       else if(u.command?.type==='attack')board.cancelCommand(u);
       continue;
     }
     if(o.cover?.has(u.id)){moveUnderCover(board,u,o.cover.get(u.id));continue;}
     if(u.command?.type==='attack'&&enemies.some(e=>e.id===u.command.target))continue;
     if(!replace&&(u.state!=='idle'||u.step))continue;
     const sorted=[...enemies].sort((a,b)=>(Math.abs(a.x-u.x)+Math.abs(a.y-u.y))-(Math.abs(b.x-u.x)+Math.abs(b.y-u.y))||a.id-b.id);
     board.attack(u.id,sorted[0].id,{replace});
   }});o.phase='attacking';o.dirty=false;return;
 }
 let center=centerFor(board,s,o);
 if(!center){for(const u of units)board.interrupt(u);o.phase='target-lost';return;}
 if(o.waypoints.length&&o.goals.size&&units.every(u=>{const p=o.goals.get(u.id);return !p||u.x===p.x&&u.y===p.y&&!u.step;})){
   o.waypoints.shift();o.previous=null;o.phase=o.waypoints.length?'flanking':'moving';center=centerFor(board,s,o);replace=true;
 }
 if(board.time>=(o.nextOccupancyCheck||0)){
  const claimed=[];
  for(const other of squadsFor(board).values())if(other.id!==s.id&&other.team===s.team)claimed.push(...(other.order?.goals?.values()||[]));
  repairOccupiedSeats(board,s,units,claimed);
  o.nextOccupancyCheck=board.time+.25;
 }
 const anchor=center.x+','+center.y+','+s.formation;
 if(anchor!==o.previous||units.length!==o.lastMembers||o.dirty){
   replace=true;
   let planned=slots(board,s,center,s.formation);
   if(o.type==='rally'){
    const lead=commander(board,s),seat=planned.find(([u])=>u.id===lead?.id)?.[1],anchor=lead?.step||lead;
    if(seat&&anchor)planned=slots(board,s,{x:center.x+anchor.x-seat.x,y:center.y+anchor.y-seat.y},s.formation);
   }
   o.goals=new Map(planned.map(([u,p])=>[u.id,p]));
   if(o.type==='rally'){
    for(const u of units){if(u.state!=='attack'||!u.strike)board.interrupt(u);u.reformSearch=null;}
    o.activeReformId=null;o.reformBuffer=null;o.reformFailed=null;
   }
   if(o.type!=='rally'){
    const lead=commander(board,s),origin=lead?.step||lead,target=lead&&o.goals.get(lead.id);
    if(origin&&target)o.marchRoute={origin:{x:origin.x,y:origin.y},target:{...target},starts:new Map(units.map(u=>[u.id,{x:u.step?.x??u.x,y:u.step?.y??u.y}]))};
   }
   o.previous=anchor;o.lastMembers=units.length;o.dirty=false;
 }
 settleFormation(units,o.goals);
 // Assigned seats remain authoritative after arrival as well as while moving.
 // Otherwise idle archers sidestep automatically and get sent back every tick.
 if(o.type==='rally'){
  reformFormation(board,s,units,commander(board,s));
  for(const u of units)u.combat.formationLocked=true;
  return;
 }
 // Blocked deep seats use the same bounded, protected cooperation as normal
 // navigation. No second system issues replacement commands to passing troops.
 if(board.time>=(o.nextPassingAt||0))for(const u of units){
  if(u.courtesy||u.remoteCourtesy||u.waitReason!=='traffic'||board.time-(u.waitSince??board.time)<.6)continue;
  const goal=o.goals.get(u.id);if(!goal)continue;
  let requested=false;
  for(const [dx,dy]of [[0,0],[1,0],[-1,0],[0,1],[0,-1]]){
   const blocker=board.at(goal.x+dx,goal.y+dy);
   if(board.navigation.requestCooperation(u,blocker,{squad:s,order:o,goal:{...goal}})){requested=true;break;}
  }
  if(requested){o.nextPassingAt=board.time+.4;break;}
 }
 let arrived=0;
 if(o.travelOffsets){const pace=Math.max(...units.map(u=>u.movement.stepTime));for(const u of units)u.marchStepTime=pace;}
 board.batchCommands(()=>{for(const u of units){
   if(u.courtesy)continue;
   const p=o.goals.get(u.id),at=p&&u.x===p.x&&u.y===p.y&&!u.step;
   const defensive=['fortify','firing-line'].includes(o.type);

   u.combat.holdPosition=defensive&&at;
   if(at){arrived++;if(u.command)board.cancelCommand(u);continue;}
   if(!p||u.command?.type==='move'&&u.command.x===p.x&&u.command.y===p.y)continue;
   if(u.state==='attack'&&u.strike)continue;
   if(!replace&&u.command?.type!=='move'&&(u.state!=='idle'||u.step))continue;
   board.move(u.id,p.x,p.y,{replace:replace||u.command?.type==='move',direct:true,squadRoute:o.marchRoute});
 }});
 for(const u of units)u.combat.formationLocked=true;
 if(!o.waypoints.length)o.phase=arrived===units.length?(['fortify','firing-line'].includes(o.type)?'holding':'arrived'):'moving';
 if(o.phase==='arrived'&&o.after){const next=o.after;s.order=null;orderSquad(board,s.id,next.type,next.target);}
}
export function updateSquadOrders(board){for(const s of squadsFor(board).values())if(s.order&&!['wait','hold'].includes(s.order.type))runOrder(board,s);}
export function squadSummary(board,id){
 const s=squadsFor(board).get(id);if(!s)return null;
 const units=alive(board,s);
 const matched=units.filter(u=>{const p=s.order?.goals?.get(u.id);return p&&u.x===p.x&&u.y===p.y&&!u.step;}).length;
 return {...s,formed:matched,formationTotal:units.length,formationProgress:units.length?Math.round(matched/units.length*100):100,alive:units.length,commanderAlive:!!commander(board,s),leaderAlive:(originalCommander(board,s)?.health.current||0)>0,actingCommanderId:commander(board,s)?.id??null,moving:units.filter(u=>u.step).length,waiting:units.filter(u=>u.command&&['planning','traffic','replanning','yielding','condition'].includes(u.waitReason)).length};
}
