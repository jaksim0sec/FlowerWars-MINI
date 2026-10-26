import {squadsFor} from './unit-groups.mjs';
import {orderSquad} from './squad-orders.mjs';

const distance=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
function state(board,squad){
 const units=squad.memberIds.map(id=>board.unit(id)).filter(u=>u?.health.current>0);
 if(!units.length)return null;
 const body=units.filter(u=>u.formationRole!=='banner'),troops=body.length?body:units;
 return {squad,units,fighters:body.filter(u=>!u.healing).length,center:{x:troops.reduce((n,u)=>n+u.x,0)/troops.length,y:troops.reduce((n,u)=>n+u.y,0)/troops.length},
  health:units.reduce((n,u)=>n+u.health.current,0)/units.reduce((n,u)=>n+u.health.max,0)};
}
function move(board,squad,action,point){
 const aim={x:Math.max(3,Math.min(94,Math.round(point.x))),y:Math.max(4,Math.min(95,Math.round(point.y)))};
 if(board.navigation.blocked(aim.y*board.width+aim.x)){
  let free=null;
  for(let r=1;r<=4&&!free;r++)for(const dx of [-r,0,r])for(const dy of [-r,0,r]){
   const x=aim.x+dx,y=aim.y+dy;
   if(board.inside(x,y)&&!board.navigation.blocked(y*board.width+x)){free={x,y};break;}
  }
  if(!free)return false;Object.assign(aim,free);
 }
 // Avoid restarting physical steps/strikes for small movement of a partner.
 if(squad.order?.type===action&&(distance(squad.order.target,aim)<3||board.time<(squad.botMoveAt||0)))return true;
 if(!orderSquad(board,squad.id,action,aim))return false;
 if(action==='fortify'){squad.order.forward={x:-1,y:0};squad.order.dirty=true;}
 squad.botMoveAt=board.time+1.2;return true;
}
function nearbyEnemy(board,center,flanking){
 let best=null,score=Infinity;
 for(const id of board.spatial.candidates(center.x,center.y,9)){
  const u=board.unit(id);if(!u||u.team!=='A'||u.health.current<=0)continue;
  const d=distance(center,u);if(d>9)continue;
  const value=d*3+u.health.current/u.health.max*2-(flanking&&(u.healing||u.combat.range>1)?5:0);
  if(value<score){best=u;score=value;}
 }
 return best;
}

/** One bounded decision for a member of a persistent combined-arms operation.
 * Uses the exact player order API; no teleportation or custom movement rules. */
export function commandBotSquad(match,squad){
 const board=match.board,operation=squad.botOperation,self=state(board,squad);if(!operation||!self)return;
 const features=s=>match.recruitment.get(s.type)?.features||{};
 const tactical=match.command.planFor(operation);
 if(operation.role==='guard'){
  const flag=match.flags.B,slot=squad.botSlot;
  const home=tactical.guardGoals?.get(squad.id)||tactical.goal;
  // Only the forward screen intercepts. Firepower, inner reserve and medics
  // continue to occupy the flag approaches instead of following the bait.
  const intruder=board.unit(match.strategy?.intruderId);
  if(slot===0&&intruder?.health.current>0&&distance(intruder,flag)<=10&&distance(self.center,intruder)<=16){
   orderSquad(board,squad.id,'focus',{unitId:intruder.id});return;
  }
  move(board,squad,'fortify',home);
  if(squad.formation!==home.formation){squad.formation=home.formation||'column';if(squad.order)squad.order.dirty=true;}
  return;
 }
 const registry=squadsFor(board),partners=operation.squadIds
  .map(id=>registry.get(id)).filter(Boolean).map(s=>state(board,s)).filter(Boolean);
 let frontline=partners.find(p=>p.fighters&&p.squad.botSlot===0&&!p.squad.botRecovering&&p.health>=.35)||
  partners.find(p=>p.fighters&&(features(p.squad).tank+features(p.squad).melee)>.45&&!p.squad.botRecovering&&p.health>=.35)||
  partners.find(p=>p.fighters&&p.squad.botRole!=='support'&&!p.squad.botRecovering)||self;
 const support=partners.find(p=>p.squad.botRole==='support'),isSupport=squad.botRole==='support';

 const canHeal=partners.some(p=>p.units.some(u=>u.healing));
 if(self.health<.35&&!squad.botRecovering&&(canHeal||!squad.botRetreatSpent)){
  squad.botRecovering=true;squad.botRecoveryAt=board.time;
 }
 if(self.health>=.65){squad.botRecovering=false;squad.botRetreatSpent=false;}
 if(squad.botRecovering&&!canHeal&&board.time-squad.botRecoveryAt>=6){squad.botRecovering=false;squad.botRetreatSpent=true;}
 if(squad.botRecovering){
  // Retreat once, then let nearby healers work instead of extending the retreat
  // every decision or immediately attacking again at half health.
  if(squad.order?.type!=='retreat'){
   const medic=support&&support.squad.id!==squad.id?support.center:null;
   move(board,squad,'retreat',{x:Math.max(self.center.x+6,medic?.x||0),y:medic?.y??self.center.y});
  }
  return;
 }
 const movingThrough=operation.role==='mobile'&&['penetrate','rear-attack','capture'].includes(tactical.stage);
 if(movingThrough&&operation.needs[squad.botSlot]!=='mobile'){
  const rear=Math.max(...partners.filter(p=>operation.needs[p.squad.botSlot]==='mobile').map(p=>p.center.x));
  move(board,squad,'fortify',{x:Math.max(tactical.entry.x,rear+7)+(isSupport?5:0),y:tactical.entry.y});return;
 }

 if(isSupport){
  if(!partners.some(p=>p.squad.botRole!=='support'&&p.fighters)){
   // A rare operation-level fallback, never a global scan per soldier.
   const hosts=match.squadIds.B.map(id=>registry.get(id)).filter(s=>s&&s.botRole!=='support'&&s.botOperation!==operation)
    .map(s=>state(board,s)).filter(p=>p?.fighters&&!p.squad.botRecovering);
   hosts.sort((a,b)=>distance(a.center,self.center)-distance(b.center,self.center));
   if(!hosts.length){move(board,squad,'retreat',{x:90,y:50});return;}
   frontline=hosts[0];
  }
  const patients=[...partners,frontline];
  const wounded=patients.filter(p=>p.squad.id!==squad.id&&p.health<.8).sort((a,b)=>a.health-b.health)[0];
  const anchor=wounded?.center||frontline.center;
  move(board,squad,'advance',{x:anchor.x-(wounded?1:0),y:anchor.y+(wounded?1:3)});
  return;
 }

 const enemy=nearbyEnemy(board,frontline.center,operation.role==='mobile');
 if(enemy&&distance(self.center,enemy)<=16&&(!movingThrough||distance(self.center,enemy)<=3)){
  orderSquad(board,squad.id,'focus',enemy.squadId?{squadId:enemy.squadId}:{unitId:enemy.id});return;
 }
 if(squad.id!==frontline.squad.id){
  // Firepower stays just behind the screen; the second strike squad guards
  // its side. Position is based on living troops, not a distant goal/commander.
  const frontX=movingThrough?(match.command.states?.get(frontline.squad.id)?.forwardX??frontline.center.x):frontline.center.x;
  move(board,squad,'advance',{x:frontX+(movingThrough?4:features(squad).fire>.4?4:8),y:frontline.center.y});return;
 }
 const lagging=!movingThrough&&partners.some(p=>p.squad.id!==squad.id&&!p.squad.botRecovering&&distance(p.center,self.center)>13);
 if(lagging){orderSquad(board,squad.id,'hold');return;}
 move(board,squad,tactical.action,tactical.goal);
}
