import {placeGroup,squadsFor,availableSquadBlueprints} from './unit-groups.mjs';
import {orderSquads} from './squad-orders.mjs';
import {survey,deployment,planOperation} from './bot-strategy.mjs';
import {commandBotSquad} from './bot-tactics.mjs';
import {createBattlefield} from './battlefield-terrain.mjs';
import {layoutDeployment} from './deployment-layout.mjs';
import {createRecruitmentCatalog} from './bot-doctrines.mjs';
import {BotCommand} from './bot-command.mjs';

export const PREPARATION_SECONDS=300;
export const ARMY_LIMIT=500;

/** Simulation-only match controller. Decisions are staggered across squads;
 * spatial buckets supply local enemies; capture and counters tick at 4 Hz. */
export class FlagMatch{
 constructor(board,{count=500,makeCharacter,optionsFor,seed=1,blueprints=availableSquadBlueprints(),unitProfiles={},scenario}={}){
  this.board=board;board.width=100;board.height=100;board.seed=seed;board.reset();
  this.epoch=board.byId;this.phase='preparation';this.remaining=PREPARATION_SECONDS;this.winner=null;
  this.flags={A:{x:4,y:50},B:{x:95,y:50}};this.counts={A:0,B:0};this.squadIds={A:[],B:[]};
  this.elapsed=0;this.nextStatus=0;this.nextDecision=0;this.cursor=0;this.decisions=0;this.statusRevision=0;
  this.nextSurvey=0;this.strategy=null;
  this.botOperations=new Map();
  this.recruitment=createRecruitmentCatalog(blueprints,unitProfiles);
  this.command=new BotCommand(this,scenario);
  this.limit=Math.max(1,Math.min(ARMY_LIMIT,Math.floor(Number(count)||ARMY_LIMIT)));
  this.reserve={A:this.limit,B:this.limit};this.makeCharacter=makeCharacter;this.optionsFor=optionsFor;
  board.match=this;
  createBattlefield(board);
  const previousPolicy=board.movementPolicy;
  board.movementPolicy={matchOwner:this,previousPolicy,beforeStep:context=>{
   if(board.match===this&&this.phase==='preparation'&&!this.inTerritory(context.unit.team,context.to))return 'wait';
   if(board.match===this&&this.command.isGuard(context.unit.squadId)){
    const flag=this.flags.B,d=p=>Math.max(Math.abs(p.x-flag.x),Math.abs(p.y-flag.y));
    if(d(context.to)>16&&d(context.to)>=d(context.unit))return 'wait';
   }
   return previousPolicy?.beforeStep?.(context)||'move';
  }};
  this.refreshStatus();
 }
 deploy(team,type,anchor){
  if(this.phase!=='preparation'||!(team in this.reserve)||!this.recruitment.has(type)||this.reserve[team]<=0)return null;
  const index=this.squadIds[team].length,size=Math.min(12,this.reserve[team],this.recruitment.get(type).blueprint.members.length);
  const blueprint=layoutDeployment(this.recruitment.get(type).blueprint,size,`${index+1}분대`),sign=team==='B'?-1:1;
  if(blueprint.members.some(m=>!this.inTerritory(team,{x:anchor.x+m.offset.x*sign,y:anchor.y+m.offset.y})))return null;
  const group=placeGroup(this.board,blueprint,anchor,{team,autoCombat:false,makeCharacter:this.makeCharacter,optionsFor:this.optionsFor});
  if(!group)return null;
  const s=squadsFor(this.board).get(group.squads[0]);s.platoonIndex=Math.floor(index/4);s.platoonId=team+':match:p'+s.platoonIndex;s.matchIndex=index;
  this.squadIds[team].push(s.id);this.reserve[team]-=size;this.refreshStatus();return s;
 }
 deployBot(){
  if(!this.reserve.B)return false;
  const index=this.squadIds.B.length,groupIndex=Math.floor(index/4),slot=index%4;
  let operation=this.botOperations.get(groupIndex);
  if(!operation){
   const observation=survey(this.board,this.flags.B);this.command.chooseScenario(observation);
   operation=planOperation(observation,groupIndex,Math.ceil(this.limit/12),this.recruitment,this.command.scenario,[...this.botOperations.values()]);
   if(!this.placeOperation(operation))return false;
   this.botOperations.set(groupIndex,operation);
  }
  const s=this.deploy('B',operation.types[slot],deployment({botOperation:operation,botSlot:slot}));
  if(!s)return false;
  s.botOperation=operation;s.botSlot=slot;this.command.register(s,operation);return true;
 }
 placeOperation(operation){
  // Validate the entire footprint before placing its first squad. Partners
  // retain nearby reserved positions instead of individually spilling outward.
  const footprints=[];
  let remaining=this.reserve.B;
  for(let slot=0;slot<4;slot++){
   const size=Math.min(12,remaining,this.recruitment.get(operation.types[slot]).blueprint.members.length);if(size<=0)break;remaining-=size;
   for(const member of layoutDeployment(this.recruitment.get(operation.types[slot]).blueprint,size,'').members)
    footprints.push({x:(slot%2)*7-member.offset.x,y:(slot<2?-4:4)+member.offset.y});
  }
  const wanted=operation.anchor;
  for(let radius=0;radius<=36;radius+=4)for(let dx=-radius;dx<=radius;dx+=4)for(let dy=-radius;dy<=radius;dy+=4){
   if(Math.max(Math.abs(dx),Math.abs(dy))!==radius)continue;
   const anchor={x:wanted.x+dx,y:wanted.y+dy},seen=new Set();
   if(footprints.every(p=>{
    const x=anchor.x+p.x,y=anchor.y+p.y,key=y*this.board.width+x;
    if(!this.board.inside(x,y)||!this.inTerritory('B',{x,y})||seen.has(key)||this.board.occupied(x,y)||this.board.navigation.blocked(key))return false;
    seen.add(key);return true;
   })){operation.anchor=anchor;return true;}
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
  this.command.lastScenario=-Infinity;this.command.chooseScenario(survey(this.board,this.flags.B));
  // Finish the bot's direct placement before skipping the preparation clock.
  while(this.reserve.B>0)if(!this.deployBot())break;
  this.strategy=survey(this.board,this.flags.B);
  this.phase='battle';this.remaining=0;this.statusRevision++;
  this.command.refresh();
  for(const u of this.board.units)if(u.health.current>0){u.combat.auto=true;u.retryAt=0;u.waitReason=null;}
  this.nextDecision=this.elapsed;return true;
 }
 update(dt){
  if(this.board.byId!==this.epoch||this.phase==='finished'||!Number.isFinite(dt)||dt<=0)return;
  this.elapsed+=dt;
  if(this.phase==='preparation'){this.remaining=Math.max(0,this.remaining-dt);if(this.remaining<=1e-8)this.start();}
  if(this.elapsed>=this.nextStatus){this.nextStatus=this.elapsed+.25;this.refreshStatus();}
  if(this.phase==='battle'&&this.elapsed>=this.command.nextRefresh)this.command.refresh();
  else if(this.phase==='preparation'&&this.elapsed>=this.nextSurvey){this.strategy=survey(this.board,this.flags.B);this.nextSurvey=this.elapsed+3;}
  if(this.phase!=='finished'&&this.elapsed>=this.nextDecision){
   // Three of at most 42 bot squads per slice; each squad thinks about once/s.
   this.nextDecision=this.elapsed+(this.phase==='preparation'?.25:.08);
   if(this.phase==='preparation'){
    const committed=Math.min(this.limit,Math.max(72,this.counts.A+24));
    for(let i=0;i<3&&this.reserve.B&&this.counts.B<committed;i++)if(!this.deployBot())break;
    return;
   }
   const priority=this.command.priorityId();if(priority)this.think(priority);
   for(let i=0;i<(priority?2:3)&&this.squadIds.B.length;i++){const id=this.squadIds.B[this.cursor++%this.squadIds.B.length];if(id!==priority)this.think(id);}
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
  if(this.phase!=='battle')return;
  const s=squadsFor(this.board).get(id);if(!s)return;
  this.decisions++;
  commandBotSquad(this,s);
 }
 charge(){
  if(this.phase!=='battle')return;
  orderSquads(this.board,this.squadIds.A,'advance',this.flags.B);
 }
}
