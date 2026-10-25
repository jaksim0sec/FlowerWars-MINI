// Test combat rules are actor data. No character IDs, camera or rig dependencies.
export const BASE_ATTACK_DURATION=.65;
const positive=(value,fallback)=>Number.isFinite(value)&&value>0?value:fallback;
export function combatOptions(options={}) {
  const stats=options.stats||{};
  return {auto:!!options.autoCombat,period:positive(stats.attackPeriod,BASE_ATTACK_DURATION),
    range:Math.max(1,Math.floor(positive(stats.range,1))),shape:stats.rangeShape==='king'?'king':'manhattan',nextAttackAt:0};
}
export function inAttackRange(actor,target,physical=true) {
  const x=physical?'visualX':'x',y=physical?'visualY':'y';
  const dx=Math.abs(actor[x]-target[x]),dy=Math.abs(actor[y]-target[y]);
  return (actor.combat.shape==='king'?Math.max(dx,dy):dx+dy)<=actor.combat.range+1e-6;
}
export function findLocalEnemy(board,actor) {
  board.combatStats.checks++;
  const range=actor.combat.range,seen=new Set();let best=null,bestDistance=Infinity;
  for(let dy=-range;dy<=range;dy++)for(let dx=-range;dx<=range;dx++) {
    const x=actor.x+dx,y=actor.y+dy;if(!board.inside(x,y))continue;
    const cell=y*board.width+x;board.combatStats.probes+=2;
    for(const id of [board.cells.get(cell),board.reservations.get(cell)]) {
      if(id==null||id===actor.id||seen.has(id))continue;seen.add(id);
      const target=board.unit(id);
      if(!target||target.health.current<=0||!target.team||actor.team===target.team||!inAttackRange(actor,target))continue;
      const distance=Math.max(Math.abs(actor.visualX-target.visualX),Math.abs(actor.visualY-target.visualY));
      if(distance<bestDistance||distance===bestDistance&&id<best.id){best=target;bestDistance=distance;}
    }
  }
  return best;
}
export function tryAutoAttack(board,actor) {
  if(!actor.combat.auto||!actor.team||actor.step||actor.command?.type==='attack')return false;
  const target=findLocalEnemy(board,actor);
  if(!target){if(actor.waitReason==='combat')actor.waitReason=null;return false;}
  actor.waitReason='combat';
  if(board.time+1e-9>=actor.combat.nextAttackAt)board.beginAttack(actor,target.id,true);
  return true; // Remain engaged instead of walking through the local enemy.
}
export function combatAnimationElapsed(actor) {
  return actor.state==='attack'&&actor.strike?actor.elapsed*BASE_ATTACK_DURATION/actor.strike.duration:actor.elapsed;
}
