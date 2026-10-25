import {registerPlacedGroup} from './unit-groups.mjs';
import {battalionFormation} from './test-formation.mjs';
// Deterministic, opt-in test settings. Uses the same Board commands as gameplay.
export function setupMovementScenario(board,type,count,makeCharacter,options={}) {
  count=Math.min(1000,Math.max(2,Math.floor(Number(count)||16)));
  if(!['crossing','bottleneck','obstacles','crowd','skirmish','formation'].includes(type))type='crossing';
  const opposing=type==='crossing'||type==='crowd';
  board.height=Math.max(16,Math.ceil(Math.sqrt(count)*2)+4);
  const rows=Math.floor((board.height-3)/2)+1;
  const band=Math.ceil(count/(rows*(opposing?2:1)));
  board.width=Math.max(14,(opposing?4:6)*band+10,Math.ceil(Math.sqrt(count)*2)+6);
  const pairColumns=Math.ceil(Math.sqrt(Math.ceil(count/2)));
  if(type==='skirmish'){board.width=Math.max(14,3*pairColumns+2);board.height=Math.max(16,3*Math.ceil(count/2/pairColumns)+2);}
  const formation=type==='formation'?battalionFormation(Math.ceil(count/2)):null;
  if(formation){board.width=2*(2+formation.depth*2)+5;board.height=formation.rows*2+4;}
  if(options.seed!=null)board.seed=Number(options.seed)>>>0;
  board.navigationOrientation=options.mirror?-1:1;
  board.reset();
  const w=board.width,h=board.height,middle=Math.floor(w/2),orders=[];
  const wall=(x,y)=>board.setObstacle(options.mirror?w-1-x:x,y,{blocked:true,kind:'test-wall',attackable:false});
  if(type==='bottleneck')for(let y=0;y<h;y++)if(y!==Math.floor(h/2))wall(middle,y);
  if(type==='obstacles')for(let y=0;y<h;y++){
    if(y!==h-3)wall(Math.floor(w*.4),y);
    if(y!==2)wall(Math.floor(w*.65),y);
  }
  for(let i=0;i<count;i++) {
    const right=opposing&&i%2===1,k=opposing?Math.floor(i/2):i;
    let x=1+2*(k%band),y=1+2*Math.floor(k/band);
    if(type==='skirmish'){const pair=Math.floor(i/2);x=1+3*(pair%pairColumns)+i%2;y=1+3*Math.floor(pair/pairColumns);}
    const slot=formation?.slots[Math.floor(i/2)];
    if(slot){const front=2+formation.depth*2;x=i%2?w-1-front+slot.depth*2:front-slot.depth*2;y=2+slot.row*2;}
    const character=makeCharacter(i,slot);
    const spawnX=right?w-1-x:x;
    const unit=board.spawn(options.mirror?w-1-spawnX:spawnX,y,character,{team:i%2?'B':'A',autoCombat:false,movement:options.movementFor?.(character,i),capabilities:options.capabilitiesFor?.(character,i),stats:{range:1,rangeShape:'king',...options.statsFor?.(character,i)}});
    if(!unit)throw new Error('테스트 배치가 겹칩니다.');
    unit.formationRole=slot?.role||null;
    if(slot){
      unit.formationSquadIndex=slot.squadIndex;
      unit.formationSquadType=slot.squadType;
      unit.formationSquadLabel=slot.squadLabel;
      unit.formationPlatoonIndex=slot.platoonIndex;
    }
    if(slot)unit.facing=(i%2?-1:1)*(options.mirror?-1:1);
    // Ordinary soldiers advance toward the enemy; a flag commander takes
    // only a few cautious steps forward, staying behind its own front line.
    const goalX=slot?.role==='banner'?x+(i%2?-3:3):
      type==='skirmish'?(i%2?1:w-2):(right?x:w-1-x);
    orders.push({id:unit.id,x:options.mirror?w-1-goalX:goalX,y});
  }
  const groups=[];
  if(type==='formation')for(const team of ['A','B']){const members=board.units.filter(u=>u.team===team).map(u=>u.id);const g=registerPlacedGroup(board,members,{kind:'battalion',name:`${team} 제1대대`,team});if(g)groups.push(g.id);}
  return {type,count,orders,groupIds:groups,combat:!!options.combat,started:false,startTime:null};
}
export function startMovementScenario(board,scenario) {
  if(!scenario||scenario.started)return 0;
  scenario.started=true;scenario.startTime=board.time;
  for(const o of scenario.orders){const u=board.unit(o.id);if(u)u.combat.auto=scenario.combat;}
  return board.batchCommands(()=>scenario.orders.reduce((n,o)=>n+Number(board.move(o.id,o.x,o.y)),0));
}
export function movementStats(board,scenario) {
  let moving=0,waiting=0,arrived=0,attacking=0,casualties=0;const teams={A:0,B:0};
  for(const o of scenario?.orders||[]) {
    const u=board.unit(o.id);if(!u||u.health.current<=0){casualties++;continue;}
    if(u.team in teams)teams[u.team]++;
    if(u.x===o.x&&u.y===o.y&&!u.step)arrived++;
    if(u.state==='attack')attacking++;
    else if(u.step)moving++;
    else if(u.command)waiting++;
  }
  return {moving,waiting,arrived,attacking,casualties,teams,total:scenario?.orders.length||0,...board.navigation.stats};
}
