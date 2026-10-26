const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
// Only one reforming soldier searches/moves at a time. Search uses the existing
// shared navigation budget and treats stationary teammates as real obstacles.
function pathTo(board,unit,goal){
 const nav=board.navigation,start=unit.y*board.width+unit.x,end=goal.y*board.width+goal.x;
 if(board.occupied(goal.x,goal.y,unit.id)||nav.blocked(end))return null;
 if(start!==end&&!nav.neighbors(end).some(n=>n>=0&&!nav.blocked(n)&&!board.occupied(n%board.width,Math.floor(n/board.width),unit.id)))return null;
 const key=`${start}:${end}:${board.obstacleRevision}`;
 if(unit.reformSearch?.key!==key)unit.reformSearch={key,queue:[start],previous:new Map([[start,-1]]),cost:new Map([[start,0]]),closed:new Set()};
 const {queue,previous,cost,closed}=unit.reformSearch;let head=0;
 while(queue.length&&head<128&&nav.remaining>0){
  queue.sort((a,b)=>(cost.get(a)+distance(nav.coords(a),goal))-(cost.get(b)+distance(nav.coords(b),goal))||distance(nav.coords(a),goal)-distance(nav.coords(b),goal));
  const cell=queue.shift();if(closed.has(cell))continue;closed.add(cell);head++;nav.consume();
  if(cell===end){const route=[];for(let n=end;n!==start;n=previous.get(n))route.push(n);unit.reformSearch=null;return route.reverse();}
  const neighbors=nav.neighbors(cell).filter(n=>n>=0).sort((a,b)=>distance(nav.coords(a),goal)-distance(nav.coords(b),goal));
  for(const n of neighbors){const p=nav.coords(n),next=cost.get(cell)+1;if(closed.has(n)||nav.blocked(n)||board.occupied(p.x,p.y,unit.id)||(cost.get(n)??Infinity)<=next)continue;previous.set(n,cell);cost.set(n,next);queue.push(n);}
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
 const active=board.unit(o.activeReformId);
 if(active&&active.health.current>0){
  if(active.step||active.command&&board.time-(active.waitSince??board.time)<1.5)return;
  if(active.command)board.interrupt(active);
 }
 o.activeReformId=null;
 if(units.some(u=>u.step))return;
 if(o.reformBuffer){const waiter=board.unit(o.reformBuffer.for);if(!waiter||waiter.health.current<=0||at(waiter,o.goals.get(waiter.id)))o.reformBuffer=null;}
 const pending=units.filter(u=>u.id!==o.reformBuffer?.id&&!at(u,o.goals.get(u.id))).sort((a,b)=>(a.id===lead?.id?-1:b.id===lead?.id?1:distance(a,o.goals.get(a.id))-distance(b,o.goals.get(b.id))||a.id-b.id));
 const candidates=lead&&pending.some(u=>u.id===lead.id)?[lead]:pending;
 for(const u of candidates){
  const goal=o.goals.get(u.id);if(!goal)continue;
  const route=pathTo(board,u,goal);
  if(route===undefined)return;
  if(route?.length&&board.move(u.id,goal.x,goal.y,{replace:true,direct:true,plannedPath:route})){
   for(const other of units)other.reformSearch=null;
   o.activeReformId=u.id;return;
  }
 }
 // Occupied-goal cycles need one adjacent passing seat; never move the whole
 // formation out and back. The displaced soldier retains its final goal.
 const seats=new Set([...o.goals.values()].map(p=>p.x+','+p.y));
 if(board.navigation.remaining<128)return;
 const directions=[[1,0],[-1,0],[0,1],[0,-1]];
 for(const waiter of pending)for(const [gx,gy]of [[0,0],...directions]){
  const seat=o.goals.get(waiter.id),u=board.at(seat.x+gx,seat.y+gy);
  if(!u||u.squadId!==squad.id||u.id===waiter.id||u.id===o.reformBuffer?.id||u.state!=='idle')continue;
  for(const [dx,dy]of directions){
  const goal={x:u.x+dx,y:u.y+dy};
  if(!board.inside(goal.x,goal.y)||seats.has(goal.x+','+goal.y))continue;
  const route=pathTo(board,u,goal);
  if(route?.length&&board.move(u.id,goal.x,goal.y,{replace:true,direct:true,plannedPath:route})){for(const other of units)other.reformSearch=null;o.reformBuffer={id:u.id,for:waiter.id};o.activeReformId=u.id;return;}
  }
 }
}
