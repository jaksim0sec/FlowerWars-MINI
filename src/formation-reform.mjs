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
 while(queue.length&&head<256&&nav.remaining>0){
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
  if(active.state==='attack'&&active.strike)return;
  if(active.step||active.command&&board.time-(active.waitSince??board.time)<1.5)return;
  if(active.command)board.interrupt(active);
  o.reformFailed=null;
 }
 o.activeReformId=null;
 if(units.some(u=>u.step))return;
 if(o.reformBuffer){const waiter=board.unit(o.reformBuffer.for);if(!waiter||waiter.health.current<=0||at(waiter,o.goals.get(waiter.id)))o.reformBuffer=null;}
 const buffers=new Set(o.reformBuffer?.ids||[]);
 const pending=units.filter(u=>!buffers.has(u.id)&&!at(u,o.goals.get(u.id))).sort((a,b)=>(a.id===lead?.id?-1:b.id===lead?.id?1:distance(a,o.goals.get(a.id))-distance(b,o.goals.get(b.id))||a.id-b.id));
 const candidates=lead&&pending.some(u=>u.id===lead.id)?[lead]:pending;
 o.reformFailed??=new Set();
 for(const u of candidates){
  if(o.reformFailed.has(u.id)||u.state==='attack'&&u.strike)continue;
  const goal=o.goals.get(u.id);if(!goal)continue;
  const route=pathTo(board,u,goal);
  if(route===undefined)return;
  if(!route)o.reformFailed.add(u.id);
  if(route?.length&&board.move(u.id,goal.x,goal.y,{replace:true,direct:true,plannedPath:route})){
   for(const other of units)other.reformSearch=null;
   o.reformFailed=null;o.activeReformId=u.id;return;
  }
 }
 // Occupied-goal cycles need one adjacent passing seat; never move the whole
 // formation out and back. The displaced soldier retains its final goal.
 const seats=new Set([...o.goals.values()].map(p=>p.x+','+p.y));
 if(board.navigation.remaining<128)return;
 const directions=[[1,0],[-1,0],[0,1],[0,-1]];
 for(const waiter of pending.filter(u=>!o.reformBuffer||u.id===o.reformBuffer.for))for(const [gx,gy]of [[0,0],...directions,...directions.map(([x,y])=>[x*2,y*2])]){
  const seat=o.goals.get(waiter.id),u=board.at(seat.x+gx,seat.y+gy);
  if(!u||u.squadId!==squad.id||u.id===waiter.id||buffers.has(u.id)||u.state!=='idle')continue;
  // Keep the first passing cell free as an entrance into deep formations.
  // Parking on it can seal the very seat the buffer was meant to open.
  const parking=[...directions.map(([x,y])=>[x*2,y*2]),...directions.map(([x,y])=>[x*3,y*3]),...directions];
  // Park away from the entering soldier rather than in their access corridor.
  parking.sort((a,b)=>distance({x:u.x+b[0],y:u.y+b[1]},waiter)-distance({x:u.x+a[0],y:u.y+a[1]},waiter));
  for(const [dx,dy]of parking){
  const goal={x:u.x+dx,y:u.y+dy};
  if(!board.inside(goal.x,goal.y)||seats.has(goal.x+','+goal.y))continue;
  const route=pathTo(board,u,goal);
  if(route?.length&&board.move(u.id,goal.x,goal.y,{replace:true,direct:true,plannedPath:route})){for(const other of units)other.reformSearch=null;o.reformBuffer={ids:[...buffers,u.id],for:waiter.id};o.reformFailed=null;o.activeReformId=u.id;return;}
  }
 }
 o.reformFailed=null;o.reformRetryAt=board.time+.75;
}
