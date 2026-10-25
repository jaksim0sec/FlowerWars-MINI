// Deterministic, opt-in test settings. Uses the same Board commands as gameplay.
export function setupMovementScenario(board,type,count,makeCharacter) {
  count=Math.min(1000,Math.max(2,Math.floor(Number(count)||16)));
  if(!['crossing','bottleneck','obstacles','crowd'].includes(type))type='crossing';
  const opposing=type==='crossing'||type==='crowd';
  board.height=Math.max(16,Math.ceil(Math.sqrt(count)*2)+4);
  const rows=Math.floor((board.height-3)/2)+1;
  const band=Math.ceil(count/(rows*(opposing?2:1)));
  board.width=Math.max(14,(opposing?4:6)*band+10,Math.ceil(Math.sqrt(count)*2)+6);
  board.reset();
  const w=board.width,h=board.height,middle=Math.floor(w/2),orders=[];
  const wall=(x,y)=>board.setObstacle(x,y,{blocked:true,kind:'test-wall',attackable:false});
  if(type==='bottleneck')for(let y=0;y<h;y++)if(y!==Math.floor(h/2))wall(middle,y);
  if(type==='obstacles')for(let y=0;y<h;y++){
    if(y!==h-3)wall(Math.floor(w*.4),y);
    if(y!==2)wall(Math.floor(w*.65),y);
  }
  for(let i=0;i<count;i++) {
    const right=opposing&&i%2===1,k=opposing?Math.floor(i/2):i;
    const x=1+2*(k%band),y=1+2*Math.floor(k/band);
    const unit=board.spawn(right?w-1-x:x,y,makeCharacter(i));
    if(!unit)throw new Error('테스트 배치가 겹칩니다.');
    orders.push({id:unit.id,x:right?x:w-1-x,y});
  }
  return {type,count,orders,started:false,startTime:null};
}
export function startMovementScenario(board,scenario) {
  if(!scenario||scenario.started)return 0;
  scenario.started=true;scenario.startTime=board.time;
  return scenario.orders.reduce((n,o)=>n+Number(board.move(o.id,o.x,o.y)),0);
}
export function movementStats(board,scenario) {
  let moving=0,waiting=0,arrived=0;
  for(const o of scenario?.orders||[]) {
    const u=board.unit(o.id);if(!u)continue;
    if(u.x===o.x&&u.y===o.y&&!u.step)arrived++;
    else if(u.step)moving++;
    else if(u.command)waiting++;
  }
  return {moving,waiting,arrived,total:scenario?.orders.length||0,...board.navigation.stats};
}
