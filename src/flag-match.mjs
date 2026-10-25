import {createFormationGroup,placeGroup,squadsFor} from './unit-groups.mjs';
import {orderSquad} from './squad-orders.mjs';

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
  this.limit=Math.max(1,Math.min(ARMY_LIMIT,Math.floor(Number(count)||ARMY_LIMIT)));
  board.match=this;
  // Broad symmetric passages: terrain is shared, the middle is a deployment
  // boundary during preparation rather than an invisible permanent wall.
  for(const x of [46,53])for(let y=10;y<90;y++)if(y%20>=4&&y%20<=13)board.setObstacle(x,y,{kind:'stone-wall',blocked:true});
  for(const team of ['A','B']){
   let remaining=this.limit,index=0;
   while(remaining>0){
    const size=Math.min(12,remaining),type=TYPES[index%TYPES.length],col=index%5,row=Math.floor(index/5);
    const blueprint=createFormationGroup(Math.max(2,size),'squad',`${index+1}분대`,type);blueprint.members=blueprint.members.slice(0,size);
    const group=placeGroup(board,blueprint,{x:team==='A'?10+col*8:89-col*8,y:8+row*10},{team,autoCombat:false,makeCharacter,optionsFor});
    if(!group)throw new Error('전투 부대 배치 공간이 부족합니다.');
    const s=squadsFor(board).get(group.squads[0]);s.platoonIndex=Math.floor(index/4);s.platoonId=team+':match:p'+s.platoonIndex;s.matchIndex=index;
    this.squadIds[team].push(s.id);remaining-=size;index++;
   }
  }
  const previousPolicy=board.movementPolicy;
  board.movementPolicy={matchOwner:this,previousPolicy,beforeStep:context=>{
   if(board.match===this&&this.phase==='preparation'&&!this.inTerritory(context.unit.team,context.to))return 'wait';
   return previousPolicy?.beforeStep?.(context)||'move';
  }};
  for(const s of squadsFor(board).values()){
   const leader=board.unit(s.leaderId);if(leader)orderSquad(board,s.id,'fortify',{x:leader.x,y:leader.y});
  }
  this.refreshStatus();
 }
 inTerritory(team,p){return team==='A'?p.x<50:p.x>=50;}
 canCommand(team,action,target){
  if(this.phase==='finished'||team!=='A')return false;
  if(this.phase==='preparation'&&(['focus','follow'].includes(action)||target?.x!=null&&!this.inTerritory('A',target)))return false;
  return true;
 }
 start(){
  if(this.phase!=='preparation')return false;
  this.phase='battle';this.remaining=0;this.statusRevision++;
  for(const u of this.board.units)if(u.health.current>0){u.combat.auto=true;u.retryAt=0;u.waitReason=null;}
  this.nextDecision=this.elapsed;return true;
 }
 update(dt){
  if(this.board.byId!==this.epoch||this.phase==='finished'||!Number.isFinite(dt)||dt<=0)return;
  this.elapsed+=dt;
  if(this.phase==='preparation'){this.remaining=Math.max(0,this.remaining-dt);if(this.remaining<=1e-8)this.start();}
  if(this.elapsed>=this.nextStatus){this.nextStatus=this.elapsed+.25;this.refreshStatus();}
  if(this.phase==='battle'&&this.elapsed>=this.nextDecision){
   // Three of at most 42 bot squads per slice; each squad thinks about once/s.
   this.nextDecision=this.elapsed+.08;
   for(let i=0;i<3&&this.squadIds.B.length;i++)this.think(this.squadIds.B[this.cursor++%this.squadIds.B.length]);
  }
 }
 refreshStatus(){
  const counts={A:0,B:0},captures=new Set();
  for(const u of this.board.units){
   if(u.health.current<=0)continue;
   if(u.team in counts)counts[u.team]++;
   if(this.phase==='battle'&&!u.healing&&u.team in this.flags){const flag=this.flags[u.team==='A'?'B':'A'];if(Math.max(Math.abs(u.visualX-flag.x),Math.abs(u.visualY-flag.y))<=1.25)captures.add(u.team);}
  }
  if(counts.A!==this.counts.A||counts.B!==this.counts.B)this.statusRevision++;
  this.counts=counts;
  if(captures.size){this.winner=captures.size===2?'draw':[...captures][0];this.phase='finished';this.statusRevision++;
   for(const u of this.board.units){this.board.interrupt(u);u.combat.auto=false;}
  }
 }
 think(id){
  const b=this.board,s=squadsFor(b).get(id);if(!s)return;
  const units=s.memberIds.map(id=>b.unit(id)).filter(u=>u?.health.current>0);if(!units.length)return;
  this.decisions++;
  const center={x:Math.round(units.reduce((n,u)=>n+u.x,0)/units.length),y:Math.round(units.reduce((n,u)=>n+u.y,0)/units.length)};
  const enemyIds=new Set();for(const uid of b.spatial.candidates(center.x,center.y,9)){
   const u=b.unit(uid);if(u?.health.current>0&&u.team==='A'&&Math.max(Math.abs(u.x-center.x),Math.abs(u.y-center.y))<=9)enemyIds.add(u.squadId);
  }
  const enemy=[...enemyIds].map(id=>squadsFor(b).get(id)).filter(Boolean).sort((a,c)=>{
   const aa=b.unit(a.leaderId)||b.unit(a.memberIds.find(id=>b.unit(id)?.health.current>0)),cc=b.unit(c.leaderId)||b.unit(c.memberIds.find(id=>b.unit(id)?.health.current>0));
   return (Math.abs(aa.x-center.x)+Math.abs(aa.y-center.y))-(Math.abs(cc.x-center.x)+Math.abs(cc.y-center.y));
  })[0];
  if(enemy){if(s.order?.type!=='focus'||s.order.target?.squadId!==enemy.id)orderSquad(b,s.id,'focus',{squadId:enemy.id});return;}
  if(s.order?.type==='focus'&&s.order.phase!=='complete'&&s.order.phase!=='target-lost'){
   const target=squadsFor(b).get(s.order.target?.squadId);if(target?.memberIds.some(id=>b.unit(id)?.health.current>0))return;
  }
  const defend=s.matchIndex%6===0;
  const goal=defend?{x:86,y:42+(Math.floor(s.matchIndex/6)%5)*4}:
    center.x>53?{x:51,y:12+(s.matchIndex%10)*8}:
    center.x>20?{x:16,y:36+(s.matchIndex%7)*4}:this.flags.A;
  if(!samePoint(s.order?.target,goal)||['complete','target-lost'].includes(s.order?.phase))orderSquad(b,s.id,defend?'fortify':'advance',goal);
 }
 charge(){
  if(this.phase!=='battle')return;
  for(const id of this.squadIds.A)orderSquad(this.board,id,'advance',this.flags.B);
 }
}
