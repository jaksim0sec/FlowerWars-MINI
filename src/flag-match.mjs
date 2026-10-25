import {placeGroup,squadsFor} from './unit-groups.mjs';
import {orderSquad,orderSquads} from './squad-orders.mjs';
import {survey,deployment,attackLane} from './bot-strategy.mjs';
import {deploymentBlueprint} from './deployment-layout.mjs';

export const PREPARATION_SECONDS=300;
export const ARMY_LIMIT=500;
const TYPES=['defense','assault','ranged','mobile','mixed','support'];
const samePoint=(a,b)=>a?.x===b.x&&a?.y===b.y;

/** Simulation-only match controller. Decisions are staggered across squads;
 * spatial buckets supply local enemies; capture and counters tick at 4 Hz. */
export class FlagMatch{
 constructor(board,{count=500,makeCharacter,optionsFor,seed=1}={}){
  this.board=board;board.width=100;board.height=100;board.seed=seed;board.reset();
  this.epoch=board.byId;this.phase='preparation';this.remaining=PREPARATION_SECONDS;this.winner=null;
  this.flags={A:{x:4,y:50},B:{x:95,y:50}};this.counts={A:0,B:0};this.squadIds={A:[],B:[]};
  this.elapsed=0;this.nextStatus=0;this.nextDecision=0;this.cursor=0;this.decisions=0;this.statusRevision=0;
  this.nextSurvey=0;this.strategy=null;
  this.limit=Math.max(1,Math.min(ARMY_LIMIT,Math.floor(Number(count)||ARMY_LIMIT)));
  this.reserve={A:this.limit,B:this.limit};this.makeCharacter=makeCharacter;this.optionsFor=optionsFor;
  board.match=this;
  // Broad symmetric passages: terrain is shared, the middle is a deployment
  // boundary during preparation rather than an invisible permanent wall.
  for(const x of [46,53])for(let y=10;y<90;y++)if(y%20>=4&&y%20<=13)board.setObstacle(x,y,{kind:'stone-wall',blocked:true});
  const previousPolicy=board.movementPolicy;
  board.movementPolicy={matchOwner:this,previousPolicy,beforeStep:context=>{
   if(board.match===this&&this.phase==='preparation'&&!this.inTerritory(context.unit.team,context.to))return 'wait';
   return previousPolicy?.beforeStep?.(context)||'move';
  }};
  this.refreshStatus();
 }
 deploy(team,type,anchor){
  if(this.phase!=='preparation'||!(team in this.reserve)||!TYPES.includes(type)||this.reserve[team]<=0)return null;
  const index=this.squadIds[team].length,size=Math.min(12,this.reserve[team]);
  const blueprint=deploymentBlueprint(size,type,`${index+1}분대`),sign=team==='B'?-1:1;
  if(blueprint.members.some(m=>!this.inTerritory(team,{x:anchor.x+m.offset.x*sign,y:anchor.y+m.offset.y})))return null;
  const group=placeGroup(this.board,blueprint,anchor,{team,autoCombat:false,makeCharacter:this.makeCharacter,optionsFor:this.optionsFor});
  if(!group)return null;
  const s=squadsFor(this.board).get(group.squads[0]);s.platoonIndex=Math.floor(index/4);s.platoonId=team+':match:p'+s.platoonIndex;s.matchIndex=index;
  this.squadIds[team].push(s.id);this.reserve[team]-=size;this.refreshStatus();return s;
 }
 deployBot(){
  if(!this.reserve.B)return false;
  const index=this.squadIds.B.length,type=TYPES[index%TYPES.length],plan=this.strategy||survey(this.board,this.flags.B),wanted=deployment({type,matchIndex:index},plan);
  for(let radius=0;radius<=32;radius+=4)for(let dx=-radius;dx<=radius;dx+=4)for(let dy=-radius;dy<=radius;dy+=4){
   if(Math.max(Math.abs(dx),Math.abs(dy))!==radius)continue;
   if(this.deploy('B',type,{x:Math.round(wanted.x+dx),y:Math.round(wanted.y+dy)}))return true;
  }
  return false;
 }
 inTerritory(team,p){return team==='A'?p.x<50:p.x>=50;}
 canCommand(team,action,target){
  if(this.phase==='finished'||team!=='A')return false;
  if(this.phase==='preparation'&&(['focus','follow'].includes(action)||target?.x!=null&&!this.inTerritory('A',target)))return false;
  return true;
 }
 start(){
  if(this.phase!=='preparation')return false;
  // Finish the bot's direct placement before skipping the preparation clock.
  while(this.reserve.B>0)if(!this.deployBot())break;
  this.phase='battle';this.remaining=0;this.statusRevision++;
  for(const u of this.board.units)if(u.health.current>0){u.combat.auto=true;u.retryAt=0;u.waitReason=null;}
  this.nextDecision=this.elapsed;return true;
 }
 update(dt){
  if(this.board.byId!==this.epoch||this.phase==='finished'||!Number.isFinite(dt)||dt<=0)return;
  this.elapsed+=dt;
  if(this.phase==='preparation'){this.remaining=Math.max(0,this.remaining-dt);if(this.remaining<=1e-8)this.start();}
  if(this.elapsed>=this.nextStatus){this.nextStatus=this.elapsed+.25;this.refreshStatus();}
  if(this.phase!=='finished'&&this.elapsed>=this.nextSurvey){this.strategy=survey(this.board,this.flags.B);this.nextSurvey=this.elapsed+(this.phase==='preparation'?3:1.5);}
  if(this.phase!=='finished'&&this.elapsed>=this.nextDecision){
   // Three of at most 42 bot squads per slice; each squad thinks about once/s.
   this.nextDecision=this.elapsed+(this.phase==='preparation'?.25:.08);
   if(this.phase==='preparation'){for(let i=0;i<3&&this.reserve.B;i++)if(!this.deployBot())break;return;}
   for(let i=0;i<3&&this.squadIds.B.length;i++)this.think(this.squadIds.B[this.cursor++%this.squadIds.B.length]);
  }
 }
 refreshStatus(){
  const counts={A:0,B:0},sums={A:{x:0,y:0},B:{x:0,y:0}},captures=new Set();
  for(const u of this.board.units){
   if(u.health.current<=0)continue;
   if(u.team in counts){counts[u.team]++;sums[u.team].x+=u.visualX;sums[u.team].y+=u.visualY;}
   if(this.phase==='battle'&&!u.healing&&u.team in this.flags){const flag=this.flags[u.team==='A'?'B':'A'];if(Math.max(Math.abs(u.visualX-flag.x),Math.abs(u.visualY-flag.y))<=1.25)captures.add(u.team);}
  }
  if(counts.A!==this.counts.A||counts.B!==this.counts.B)this.statusRevision++;
  this.counts=counts;
  this.centers={A:counts.A?{x:sums.A.x/counts.A,y:sums.A.y/counts.A}:null,B:counts.B?{x:sums.B.x/counts.B,y:sums.B.y/counts.B}:null};
  if(captures.size){this.winner=captures.size===2?'draw':[...captures][0];this.phase='finished';this.statusRevision++;
   for(const u of this.board.units){this.board.interrupt(u);u.combat.auto=false;}
  }
 }
 think(id){
  const b=this.board,s=squadsFor(b).get(id);if(!s)return;
  const units=s.memberIds.map(id=>b.unit(id)).filter(u=>u?.health.current>0);if(!units.length)return;
  this.decisions++;
  const center={x:Math.round(units.reduce((n,u)=>n+u.x,0)/units.length),y:Math.round(units.reduce((n,u)=>n+u.y,0)/units.length)};
  const plan=this.strategy||survey(b,this.flags.B);
  if(this.phase==='preparation'){
   return;
  }
  const intruder=b.unit(plan.intruderId);
  if(intruder?.health.current>0&&(s.type==='defense'||center.x>75)){
   const target=intruder.squadId?{squadId:intruder.squadId}:{unitId:intruder.id};
   if(s.order?.type!=='focus'||s.order.target?.squadId!==target.squadId||s.order.target?.unitId!==target.unitId)orderSquad(b,s.id,'focus',target);
   return;
  }
  const enemyIds=new Set();for(const uid of b.spatial.candidates(center.x,center.y,9)){
   const u=b.unit(uid);if(u?.health.current>0&&u.team==='A'&&Math.max(Math.abs(u.x-center.x),Math.abs(u.y-center.y))<=9)enemyIds.add(u.squadId);
  }
  const enemy=[...enemyIds].map(id=>squadsFor(b).get(id)).filter(Boolean).sort((a,c)=>{
   const aa=b.unit(a.leaderId)||b.unit(a.memberIds.find(id=>b.unit(id)?.health.current>0)),cc=b.unit(c.leaderId)||b.unit(c.memberIds.find(id=>b.unit(id)?.health.current>0));
   return (Math.abs(aa.x-center.x)+Math.abs(aa.y-center.y))-(Math.abs(cc.x-center.x)+Math.abs(cc.y-center.y));
  })[0];
  if(enemy){if(s.order?.type!=='focus'||s.order.target?.squadId!==enemy.id)orderSquad(b,s.id,'focus',{squadId:enemy.id});return;}
  const health=units.reduce((n,u)=>n+u.health.current,0)/units.reduce((n,u)=>n+u.health.max,0);
  if(health<.35&&s.type!=='defense'){
   const goal={x:84,y:Math.max(10,Math.min(90,attackLane(s,plan)))};
   if(s.order?.type!=='retreat')orderSquad(b,s.id,'retreat',goal);
   return;
  }
  if(s.order?.type==='focus'&&s.order.phase!=='complete'&&s.order.phase!=='target-lost'){
   const target=squadsFor(b).get(s.order.target?.squadId);if(target?.memberIds.some(id=>b.unit(id)?.health.current>0))return;
  }
  const defend=s.type==='defense'&&Math.floor(s.matchIndex/6)%2===0;
  if(s.type==='mobile'&&center.x>25){
   // Complete the chosen flank; do not restart it on every decision tick.
   if(s.order?.type==='flank'&&['moving','flanking'].includes(s.order.phase))return;
   const goal={x:center.x>53?42:16,y:attackLane(s,plan)};
   orderSquad(b,s.id,'flank',goal);return;
  }
  const goal=defend?{x:86,y:42+(Math.floor(s.matchIndex/6)%5)*4}:
    center.x>53?{x:51,y:attackLane(s,plan)}:
    center.x>20?{x:16,y:36+(s.matchIndex%7)*4}:this.flags.A;
  if(!samePoint(s.order?.target,goal)||['complete','target-lost'].includes(s.order?.phase))orderSquad(b,s.id,defend?'fortify':'advance',goal);
 }
 charge(){
  if(this.phase!=='battle')return;
  orderSquads(this.board,this.squadIds.A,'advance',this.flags.B);
 }
}
