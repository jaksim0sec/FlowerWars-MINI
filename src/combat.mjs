// Combat rules are actor data. No character IDs, camera or rig dependencies.
export const BASE_ATTACK_DURATION=.65;
const positive=(value,fallback)=>Number.isFinite(value)&&value>0?value:fallback;
export function combatOptions(options={}) {
  const stats=options.stats||{},range=Math.max(1,Math.floor(positive(stats.range,1)));
  return {auto:!!options.autoCombat,period:positive(stats.attackPeriod,BASE_ATTACK_DURATION),range,
    shape:stats.rangeShape==='king'?'king':'manhattan',nextAttackAt:0,targetId:null,nextSearchAt:0,
    searchInterval:positive(stats.searchInterval,.24),lineOfSight:!!stats.lineOfSight,
    preferredRange:Number.isFinite(stats.preferredRange)?Math.max(0,Math.min(range,stats.preferredRange)):null};
}
export function inAttackRange(actor,target,physical=true) {
  const x=physical?'visualX':'x',y=physical?'visualY':'y';
  const dx=Math.abs(actor[x]-target[x]),dy=Math.abs(actor[y]-target[y]);
  return (actor.combat.shape==='king'?Math.max(dx,dy):dx+dy)<=actor.combat.range+1e-6;
}
// Hash priorities rather than ordering IDs: spawn order and faction names do not
// decide equidistant fights. The board supplies stable seed-neutral actor keys.
function hash(value) {
  value=Math.imul((value>>>0)^0x9e3779b9,0x85ebca6b);value^=value>>>13;
  value=Math.imul(value,0xc2b2ae35);return (value^(value>>>16))>>>0;
}
function priority(actor){return actor.priorityKey??hash(actor.id);}
function rank(board,actor,target) {
  return hash(priority(target)^hash(priority(actor))^hash(board.seed||0)^hash(board.decisionEpoch||0));
}
function blocked(board,x,y) {
  const cell=y*board.width+x;
  return board.navigation?.blocked?board.navigation.blocked(cell):board.obstacles?.has(cell)&&board.obstacles.get(cell)?.blocked!==false;
}
export function hasLineOfSight(board,actor,target) {
  // Traverse the cells crossed by the visual center-to-center segment, including
  // both touching cells at corners so a diagonal cannot see through a solid wall.
  let x=Math.floor(actor.visualX+.5),y=Math.floor(actor.visualY+.5);
  const endX=Math.floor(target.visualX+.5),endY=Math.floor(target.visualY+.5);
  const dx=target.visualX-actor.visualX,dy=target.visualY-actor.visualY,sx=Math.sign(dx),sy=Math.sign(dy);
  const stepX=dx?1/Math.abs(dx):Infinity,stepY=dy?1/Math.abs(dy):Infinity;
  let crossX=dx?((sx>0?x+.5:x-.5)-actor.visualX)/dx:Infinity;
  let crossY=dy?((sy>0?y+.5:y-.5)-actor.visualY)/dy:Infinity;
  while(x!==endX||y!==endY) {
    if(Math.abs(crossX-crossY)<1e-10) {
      if(blocked(board,x+sx,y)||blocked(board,x,y+sy))return false;
      x+=sx;y+=sy;crossX+=stepX;crossY+=stepY;
    } else if(crossX<crossY){x+=sx;crossX+=stepX;}
    else {y+=sy;crossY+=stepY;}
    if((x!==endX||y!==endY)&&blocked(board,x,y))return false;
  }
  return true;
}
function validEnemy(board,actor,target) {
  return !!target&&target!==actor&&target.health.current>0&&!!target.team&&actor.team!==target.team&&
    inAttackRange(actor,target)&&(!actor.combat.lineOfSight||hasLineOfSight(board,actor,target));
}
function *localCandidates(board,actor) {
  const range=actor.combat.range;
  for(let dy=-range;dy<=range;dy++)for(let dx=-range;dx<=range;dx++) {
    const x=actor.x+dx,y=actor.y+dy;if(!board.inside(x,y))continue;
    const cell=y*board.width+x;board.combatStats.probes+=2;
    yield board.cells.get(cell);yield board.reservations.get(cell);
  }
}
export function findLocalEnemy(board,actor) {
  board.combatStats.checks++;
  const ranged=actor.combat.range>2&&board.spatial;
  const candidates=ranged?board.spatial.candidates(actor.x,actor.y,actor.combat.range):localCandidates(board,actor);
  function* targets(){yield* candidates;const flags=board.match?.flags;if(flags){yield flags.A.id;yield flags.B.id;}}
  const seen=new Set();let best=null,bestDistance=Infinity,bestRank=Infinity;
  for(const id of targets()) {
    if(ranged)board.combatStats.probes++;
    if(id==null||id===actor.id||seen.has(id))continue;seen.add(id);
    const target=board.unit(id);
    if(!validEnemy(board,actor,target))continue;
    const dx=Math.abs(actor.visualX-target.visualX),dy=Math.abs(actor.visualY-target.visualY);
    const distance=actor.combat.shape==='king'?Math.max(dx,dy):dx+dy;
    // Mirrored interpolation can differ in the last floating point bit. Keep
    // those geometrically equal distances tied so the seeded priority decides.
    const score=Math.round((actor.combat.preferredRange==null?distance:Math.abs(distance-actor.combat.preferredRange))*1e9),tie=rank(board,actor,target);
    if(score<bestDistance||score===bestDistance&&tie<bestRank){best=target;bestDistance=score;bestRank=tie;}
  }
  return best;
}
function nextSearch(board,actor) {
  const interval=actor.combat.searchInterval,phase=hash(priority(actor)^hash(board.seed||0))/0x100000000*interval;
  return (Math.floor((board.time-phase)/interval)+1)*interval+phase;
}
export function tryAutoAttack(board,actor) {
  if(actor.healing)return false;
  if(!actor.combat.auto||!actor.team||actor.step)return false;
  const marked=actor.command?.type==='attack'?board.unit(actor.command.target):null;
  // Leave an in-range explicit strike to the command path. Otherwise defend
  // locally while retaining the distant designated target for pursuit.
  if(validEnemy(board,actor,marked))return false;
  let target=board.unit(actor.combat.targetId);
  if(!validEnemy(board,actor,target)) {
    actor.combat.targetId=null;target=null;
    if(board.time+1e-9>=actor.combat.nextSearchAt) {
      target=findLocalEnemy(board,actor);actor.combat.targetId=target?.id??null;
      actor.combat.nextSearchAt=nextSearch(board,actor);
    }
  }
  if(!target){if(actor.waitReason==='combat')actor.waitReason=null;return false;}
  if(actor.combat.charge&&actor.command?.type==='move'&&board.time+1e-9<actor.combat.nextAttackAt)return false;
  actor.waitReason='combat';
  if(board.time+1e-9>=actor.combat.nextAttackAt)board.beginAttack(actor,target.id,true);
  return true; // Remain engaged instead of walking through the local enemy.
}
export function combatAnimationElapsed(actor) {
  return actor.state==='attack'&&actor.strike?actor.elapsed*BASE_ATTACK_DURATION/actor.strike.duration:actor.elapsed;
}
