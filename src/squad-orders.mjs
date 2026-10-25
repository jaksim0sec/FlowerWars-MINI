import {squadsFor} from './unit-groups.mjs';

export const SQUAD_ACTIONS={
 move:{label:'이동',target:true,hint:'교전보다 이동 우선'},
 advance:{label:'공격 이동',target:true,hint:'경로의 적과 교전하며 전진'},
 focus:{label:'집중 공격',target:true,hint:'선택한 적을 추적·공격'},
 flank:{label:'우회 기동',target:true,hint:'측면 경유 후 목표로 이동'},
 fortify:{label:'방어진 구축',target:true,hint:'목표에 방패 전열을 세우고 사수'},
 retreat:{label:'후퇴',target:true,hint:'교전을 끊고 지정 위치로 철수'},
 hold:{label:'현 위치 사수',hint:'이동 중단·제자리 교전'},
 wait:{label:'정지',hint:'이동과 공격 중단'},
 rally:{label:'집결',hint:'기수 주변에 재집결'},
 follow:{label:'아군 추종',target:true,hint:'다른 아군 분대를 따라 이동'},
 'firing-line':{label:'사격진 구축',target:true,hint:'목표에 산개 배치 후 사격'}
};
const ALIASES={assault:'advance','support-focus':'follow',reform:'rally'};
const STANCES=new Set(['aggressive','balanced','avoid']);
const FORMATIONS=new Set(['line','column','dense','spread']);
const alive=(board,squad)=>squad.memberIds.map(id=>board.unit(id)).filter(u=>u&&u.health.current>0);
const commander=(board,squad)=>board.unit(squad.leaderId);
const priority=u=>({'shield-guard':0,scout:1,archer:2,'clover-mage':3,scholar:4,'banner-bearer':5}[u.character?.characterId]??2);
function slots(board,squad,center,formation=squad.formation){
 const units=alive(board,squad).sort((a,b)=>priority(a)-priority(b)||a.id-b.id),own=new Set(squad.memberIds);
 const n=units.length,columns=Math.min(n,formation==='column'?2:formation==='line'?6:4);
 const gap=formation==='spread'?2:1,sign=squad.order?.facing||(squad.team==='B'?-1:1);
 // Fit the entire footprint, leaving a passing row/column at board edges.
 // Per-slot clamping can seal unfilled corner slots behind arrived troops.
 const depth=Math.floor((n-1)/columns)*gap,low=Math.floor(columns/2)*gap,high=(columns-1-Math.floor(columns/2))*gap;
 const marginX=board.width>depth+2?1:0,marginY=board.height>low+high+2?1:0;
 center={x:Math.max(marginX+(sign>0?depth:0),Math.min(board.width-1-marginX-(sign<0?depth:0),center.x)),y:Math.max(marginY+low,Math.min(board.height-1-marginY-high,center.y))};
 const claimed=new Set(),assignments=[];
 for(const other of squadsFor(board).values())if(other.id!==squad.id&&other.team===squad.team)
   for(const p of other.order?.goals?.values()||[])claimed.add(p.y*board.width+p.x);
 for(let i=0;i<n;i++){
   const rank=Math.floor(i/columns)*gap,lane=(i%columns-Math.floor(columns/2))*gap;
   const wanted={x:center.x-sign*rank,y:center.y+lane};let best=null;
   for(let radius=0;radius<=Math.max(12,Math.ceil(n/columns)*gap+2)&&!best;radius++)
     for(let dx=-radius;dx<=radius&&!best;dx++)for(let dy=-radius;dy<=radius;dy++){
       if(Math.max(Math.abs(dx),Math.abs(dy))!==radius)continue;
       const x=wanted.x+dx,y=wanted.y+dy,key=y*board.width+x;
       const occupant=board.at(x,y),reservation=board.reservations.get(key);
       if(board.inside(x,y)&&!board.navigation.blocked(key)&&!claimed.has(key)&&(!occupant||own.has(occupant.id))&&(!reservation||own.has(reservation))){best={x,y};claimed.add(key);break;}
     }
   if(best)assignments.push([units[i],best]);
 }
 return assignments;
}
export function configureSquad(board,id,{stance,formation}={}){
 const s=squadsFor(board).get(id);if(!s)return false;
 if(stance&&STANCES.has(stance))s.stance=stance;
 if(formation&&FORMATIONS.has(formation))s.formation=formation;
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
 // The API still accepts untargeted defensive orders around the commander.
 if(!target&&['fortify','firing-line'].includes(type))target={x:lead.step?.x??lead.x,y:lead.step?.y??lead.y};
 if(type==='focus'){if(!enemyUnits(board,s,target).length)return false;}
 else if(type==='follow'){if(!followLeader(board,s,target))return false;}
 else if(def.target&&(!target||!board.inside(target.x,target.y)||board.navigation.blocked(target.y*board.width+target.x)))return false;
 const same=s.order?.source===action&&JSON.stringify(s.order.target)===JSON.stringify(target);
 if(same)return true;
 const facing=target?.x!=null?Math.sign(target.x-lead.x)||(s.team==='B'?-1:1):(s.team==='B'?-1:1);
 const order={type,source:action,target:type==='rally'?{x:lead.step?.x??lead.x,y:lead.step?.y??lead.y}:target?{...target}:null,dirty:true,previous:null,goals:new Map(),lastMembers:0,facing,phase:'moving',waypoints:[]};
 if(type==='flank'){
   const units=alive(board,s),x=Math.round(units.reduce((n,u)=>n+u.x,0)/units.length),y=Math.round(units.reduce((n,u)=>n+u.y,0)/units.length);
   const candidates=[Math.max(2,y-9),Math.min(board.height-3,y+9)].filter(side=>Math.abs(side-y)>=3);
   if(!candidates.length)return false;
   const threat=side=>board.units.filter(u=>u.health.current>0&&u.team&&u.team!==s.team&&Math.abs(u.y-side)<5&&u.x>=Math.min(x,target.x)-2&&u.x<=Math.max(x,target.x)+2).length;
   candidates.sort((a,b)=>threat(a)-threat(b)||Math.abs(b-y)-Math.abs(a-y));
   const side=candidates[0];order.waypoints=[{x,y:side},{x:target.x,y:side}];order.phase='flanking';
 }
 s.order=order;
 if(type==='flank')s.formation='column';
 if(type==='fortify')s.formation='line';
 if(type==='firing-line')s.formation='spread';
 if(action==='reform')s.formation='line';
 // Stop obsolete intentions now, retaining only physically committed steps.
 for(const u of alive(board,s)){board.interrupt(u);u.combat.targetId=null;u.combat.nextSearchAt=0;u.combat.holdPosition=false;}
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
 if(!units.length){s.order=null;return;}
 if(o.type==='wait'||o.type==='hold'){
   for(const u of units){if(replace)board.interrupt(u);u.combat.auto=o.type==='hold';u.combat.holdPosition=true;}
   o.phase=o.type==='hold'?'holding':'stopped';o.dirty=false;return;
 }
 if(o.type==='focus'){
   const enemies=enemyUnits(board,s,o.target);
   if(!enemies.length){for(const u of units)board.interrupt(u);o.phase='complete';return;}
   board.batchCommands(()=>{for(const u of units){
     u.combat.auto=false;
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
 const own=new Set(s.memberIds);
 if([...o.goals.values()].some(p=>{const u=board.at(p.x,p.y);return u&&!own.has(u.id)&&!u.command&&!u.step;}))o.dirty=true;
 const anchor=center.x+','+center.y+','+s.formation;
 if(anchor!==o.previous||units.length!==o.lastMembers||o.dirty){
   replace=true;
   o.goals=new Map(slots(board,s,center,o.type==='rally'?'dense':s.formation).map(([u,p])=>[u.id,p]));
   o.previous=anchor;o.lastMembers=units.length;o.dirty=false;
 }
 let arrived=0;
 board.batchCommands(()=>{for(const u of units){
   const p=o.goals.get(u.id),at=p&&u.x===p.x&&u.y===p.y&&!u.step;
   const defensive=['fortify','firing-line'].includes(o.type);
   u.combat.auto=(defensive?at:o.type==='advance'||o.type==='rally'||o.type==='follow'&&s.stance!=='avoid')&&s.stance!=='avoid';
   u.combat.holdPosition=defensive&&at;
   if(at){arrived++;if(replace)board.interrupt(u);continue;}
   if(!p||u.command?.type==='move'&&u.command.x===p.x&&u.command.y===p.y)continue;
   if(!replace&&(u.state!=='idle'||u.step))continue;
   board.move(u.id,p.x,p.y,{replace,direct:true});
 }});
 if(!o.waypoints.length)o.phase=arrived===units.length?(['fortify','firing-line'].includes(o.type)?'holding':'arrived'):'moving';
}
export function updateSquadOrders(board){for(const s of squadsFor(board).values())if(s.order&&!['wait','hold'].includes(s.order.type))runOrder(board,s);}
export function squadSummary(board,id){
 const s=squadsFor(board).get(id);if(!s)return null;
 const units=alive(board,s);
 return {...s,alive:units.length,commanderAlive:(commander(board,s)?.health.current||0)>0,moving:units.filter(u=>u.step).length,waiting:units.filter(u=>u.waitReason&&u.waitReason!=='combat').length};
}
