import {hasLineOfSight} from './combat.mjs';

export function healingOptions(options,character){
 const stats=options.stats||{};
 const healer=['clover-mage','sprout-healer'].includes(character?.characterId)||options.capabilities?.includes('heal');
 if(!healer&&!(stats.healAmount>0))return null;
 return {amount:stats.healAmount||10,range:stats.healRange||3,period:stats.healPeriod||1.5,nextAt:0};
}
export function tryHeal(board,actor){
 const h=actor.healing;
 if(!h||!actor.team||actor.step||!['idle','walk'].includes(actor.state)||board.time<h.nextAt)return false;
 // Finish the assigned march before stopping to cast; repeated healing must
 // not strand medics behind their squad. Healing resumes at the destination.
 if(actor.command?.type==='move'&&(actor.x!==actor.command.x||actor.y!==actor.command.y))return false;
 let best=null;
 for(const id of board.spatial.candidates(actor.x,actor.y,h.range)){
  const u=board.unit(id);
  if(!u||u.team!==actor.team||u.health.current<=0||u.health.current>=u.health.max)continue;
  if(Math.max(Math.abs(u.visualX-actor.visualX),Math.abs(u.visualY-actor.visualY))>h.range||!hasLineOfSight(board,actor,u))continue;
  if(!best||u.health.current/u.health.max<best.health.current/best.health.max||u.health.current/u.health.max===best.health.current/best.health.max&&u.id<best.id)best=u;
 }
 if(!best)return false;
 h.nextAt=board.time+h.period;
 actor.strike={target:best.id,automatic:true,healing:true,duration:.65,impactTime:.3};
 actor.target=best.id;actor.state='attack';actor.elapsed=0;actor.impacted=false;actor.waitReason='healing';
 return true;
}
