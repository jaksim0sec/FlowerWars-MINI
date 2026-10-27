import {relayFormationVacancies} from './formation-planner.mjs';
const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
// Concurrent reform uses normal cell reservations and the shared search budget.
export function pathTo(board,unit,goal,avoid=null){
 const nav=board.navigation,start=unit.y*board.width+unit.x,end=goal.y*board.width+goal.x;
 if(board.occupied(goal.x,goal.y,unit.id)||nav.blocked(end))return null;
 if(start!==end&&!nav.neighbors(end).some(n=>n>=0&&!nav.blocked(n)&&!board.occupied(n%board.width,Math.floor(n/board.width),unit.id)))return null;
 const key=`${start}:${end}:${board.obstacleRevision}`;
 if(unit.reformSearch?.key!==key)unit.reformSearch={key,queue:[start],previous:new Map([[start,-1]]),cost:new Map([[start,0]]),closed:new Set()};
 const {queue,previous,cost,closed}=unit.reformSearch;let head=0;
 while(queue.length&&head<256&&nav.remaining>0){
  queue.sort((a,b)=>(cost.get(a)+distance(nav.coords(a),goal))-(cost.get(b)+distance(nav.coords(b),goal))||distance(nav.coords(a),goal)-distance(nav.coords(b),goal));
  const cell=queue.shift();if(closed.has(cell))continue;closed.add(cell);head++;nav.consume();
  if(cell===end){const route=[];for(let n=end;n!==start;n=previous.get(n))route.push(n);unit.reformSearch=null;if(avoid&&route.some(n=>avoid.has(n)))return undefined;return route.reverse();}
  const neighbors=nav.neighbors(cell).filter(n=>n>=0).sort((a,b)=>distance(nav.coords(a),goal)-distance(nav.coords(b),goal));
  for(const n of neighbors){const p=nav.coords(n),next=cost.get(cell)+1;if(closed.has(n)||avoid?.has(n)||nav.blocked(n)||board.occupied(p.x,p.y,unit.id)||(cost.get(n)??Infinity)<=next)continue;previous.set(n,cell);cost.set(n,next);queue.push(n);}
 }
 if(queue.length)return undefined;
 unit.reformSearch=null;return null;
}
export function reformFormation(board,squad,units,lead){
 const o=squad.order;
 const at=(u,p)=>p&&u.x===p.x&&u.y===p.y&&!u.step;
 o.formed=units.filter(u=>at(u,o.goals.get(u.id))).length;o.total=units.length;
 if(o.goals.size<units.length){o.phase='blocked';o.dirty=true;o.reformRetryAt=board.time+1;return;}
 if(o.formed===o.total){o.phase='arrived';o.activeReformId=null;return;}
 o.phase='forming';
 relayFormationVacancies(board,units,o.goals);
 const occupancy=units.map(u=>u.id+':'+u.x+','+u.y).join(';');
 if(o.reformOccupancy!==occupancy)for(const u of units)u.reformSearch=null;
 if(o.reformOccupancy!==occupancy||board.time>=(o.reformRetryAt||0)){
  o.reformFailed=null;o.reformOccupancy=occupancy;o.reformRetryAt=board.time+.5;
 }
 const pending=units.filter(u=>!u.courtesy&&!u.step&&!at(u,o.goals.get(u.id))).sort((a,b)=>(a.id===lead?.id?-1:b.id===lead?.id?1:distance(a,o.goals.get(a.id))-distance(b,o.goals.get(b.id))||a.id-b.id));
 const candidates=pending;
 const corridors=new Set();
 for(const u of units)if(u.step){
  corridors.add(u.y*board.width+u.x);corridors.add(u.step.y*board.width+u.step.x);
  for(const n of u.guide||[])corridors.add(n);
  for(const p of u.route||[])corridors.add(p.y*board.width+p.x);
 }
 let searches=0,searching=false;
 o.reformFailed??=new Set();
 for(const u of candidates){
  if(o.reformFailed.has(u.id)||u.state==='attack'&&u.strike)continue;
  const goal=o.goals.get(u.id);if(!goal)continue;
  if(u.command?.type==='move'&&u.command.x===goal.x&&u.command.y===goal.y&&board.time-(u.waitSince??board.time)<1.5)continue;
  if(++searches>4)break;
  const route=pathTo(board,u,goal,corridors);
  if(route===undefined){searching=true;continue;}
  if(!route)o.reformFailed.add(u.id);
  if(route?.length&&board.move(u.id,goal.x,goal.y,{replace:true,direct:true,plannedPath:route})){
   for(const n of route)corridors.add(n);
   o.reformFailed.clear();
  }
 }
 // Reuse Navigation cooperation; it preserves commands and protects held,
 // attacking and healing troops, instead of forcibly assigning passing bays.
 if(searching||units.some(u=>u.step||u.command?.type==='move'&&!u.waitReason))return;
 if(board.navigation.remaining<32)return;
 for(const waiter of pending){
  if(waiter.remoteCourtesy?.cursor>=0)continue;
  const goal=o.goals.get(waiter.id);if(!goal)continue;
  for(const [dx,dy]of [[0,0],[1,0],[-1,0],[0,1],[0,-1],[2,0],[-2,0],[0,2],[0,-2]]){
   const blocker=board.at(goal.x+dx,goal.y+dy);
   if(board.navigation.requestCooperation(waiter,blocker,{squad,order:o,goal:{...goal}}))return;
  }
 }
}
