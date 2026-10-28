import {recruit} from '../bot-doctrines.mjs';
import {Observer} from './observer.mjs';
import {CommandGateway} from './commands.mjs';
import {createOperation,trackProgress,adopt,selectFront} from './operations.mjs';
import {choose} from './planner.mjs';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export class TacticalController{
 constructor(match){
  this.match=match;this.observer=new Observer(match);this.operations=match.botOperations;this.nextRefresh=0;this.scenario={id:'utility',label:'전술 지휘'};
  this.registry=new Map(['guard','front','breach','mobile','support'].map(role=>[role,new Set()]));this.events=[];this.mode='advance';this.priorityCursor=0;
  this.metrics={orders:0,replacements:0,deduplicated:0,deferred:0,invalid:0,replans:0,progress:0,completed:0,stalls:0,observations:0,refreshMs:0,maxRefreshMs:0};this.gateway=new CommandGateway(match,this.observer,this.metrics);
 }
 recruit(index,slots){
  const m=this.match;this.observer.topology();let ranged=0,armored=0,total=0;
  for(const u of m.board.units)if(u.team==='A'&&u.health.current>0){total++;if(u.combat.range>1)ranged++;if(u.formationRole==='guard')armored++;}
  const existing=[...this.operations.values()].flatMap(o=>o.needs),mobileShare=total?ranged/total*.55+.15:.2;
  const mobile=existing.filter(n=>n==='mobile').length<(index+1)*mobileShare;
  const needs=slots===2?[mobile?'mobile':'screen',existing.filter(n=>n==='support').length<(existing.length+slots)*(armored>total*.35?.15:.25)?'support':'fire']:['screen','fire',ranged>total*.35?'mobile':armored>total*.35?'fire':'strike','support'].slice(0,slots);
  const anchors=this.observer.nodes.filter(n=>['staging','merge','deployment'].includes(n.kind)&&(n.x>=m.board.width*.6||n.kind==='staging'&&m.inTerritory('B',n))).sort((a,b)=>this.observer.travel(a,m.flags.A)-this.observer.travel(b,m.flags.A));
  const types=needs.map(n=>recruit(m.recruitment,n)),size=types.reduce((n,type)=>n+m.recruitment.get(type).blueprint.members.length,0);
  const placed=[...this.operations.values()];
  const cost=n=>{const nearby=placed.reduce((v,o)=>v+(o.types||[]).reduce((a,t)=>a+m.recruitment.get(t).blueprint.members.length,0)*Math.max(0,1-distance(n,o.anchor)/24),0);
   const link=placed.length?Math.min(...placed.map(o=>distance(n,o.anchor))):0;
   return this.observer.travel(n,m.flags.A)*.25+(size+nearby)/Math.max(8,n.width)*10+Math.max(0,link-22);};
  anchors.sort((a,b)=>cost(a)-cost(b));
  return {index,types,needs,squadIds:[],role:mobile?'mobile':'front',mission:'attack',anchor:anchors[0]||{x:m.flags.B.x-12,y:m.flags.B.y}};
 }
 placementAllowed(anchor){const placed=[...this.operations.values()];return !placed.length||placed.some(o=>distance(anchor,o.anchor)<=30);}
 register(squad,operation){operation.squadIds.push(squad.id);squad.botRole=operation.needs[squad.botSlot]==='support'?'support':operation.role;this.registry.get(squad.botRole).add(squad.id);}
 isGuard(id){return this.registry.get('guard').has(id);}
 refresh(){
  const start=performance.now(),m=this.match;this.snapshot=this.observer.observe();this.states=this.snapshot.states;this.metrics.observations++;
  // Reattach orphaned medics once per shared observation, never per soldier.
  const active=[...this.operations.values()];
  for(const raw of active){
   if(raw.intent===undefined){const created=createOperation(raw.index,raw.squadIds,raw.anchor);Object.assign(raw,created);}
   const live=raw.squadIds.map(id=>this.states.get(id)).filter(Boolean);
   if(live.length&&live.every(s=>s.melee+s.fire===0)){
    let host=null,best=Infinity;for(const other of active)if(other!==raw){const fighter=other.squadIds.map(id=>this.states.get(id)).find(s=>s&&s.melee+s.fire>0);if(fighter){const d=this.observer.travel(live[0],fighter);if(d<best){best=d;host=other;}}}
    if(host){for(const s of live){host.squadIds.push(s.id);s.squad.botOperation=host;}raw.squadIds=[];}
   }
  }
  const threat=this.snapshot.homeThreat,homeDanger=this.snapshot.flagHit||threat>Math.max(5,this.snapshot.totalFriendly*.025);
  this.mode=homeDanger?'contract':'advance';
  const forces=[];for(const operation of active){const force=trackProgress(operation,this.states,this.observer,m.elapsed,this.metrics);if(force)forces.push({operation,force});}
  // Respond with the nearest sufficient force, rather than recalling the army.
  const defenders=new Set();let committed=0;
  if(homeDanger)for(const {operation,force}of [...forces].sort((a,b)=>this.observer.travel(a.force.center,m.flags.B)-this.observer.travel(b.force.center,m.flags.B))){defenders.add(operation.index);committed+=force.power;if(committed>=Math.max(threat*1.35,this.snapshot.totalFriendly*.15))break;}
  for(const set of this.registry.values())set.clear();
  const claimed=new Map();
  for(const {operation,force}of forces){
   operation.blockedReason=Number.isFinite(this.observer.travel(force.center,m.flags.A))?null:'objective-unreachable';
   const reserve=forces.length>2&&operation.index===forces.at(-1).operation.index;
   const planningForce=force.live.every(s=>s.squad.aiRecoverySpent)?{...force,ratio:Math.max(.5,force.ratio)}:force;
   const candidate=choose(this.observer,this.snapshot,planningForce,operation,{reserve,homeDanger:defenders.has(operation.index),claimed});
   if(candidate){adopt(operation,candidate,this.observer,force.center,m.elapsed,this.metrics);claimed.set(candidate.node.id,(claimed.get(candidate.node.id)||0)+1);}
   for(const s of force.live){s.squad.botRole=s.heal>s.count*.15?'support':operation.role;this.registry.get(s.squad.botRole).add(s.id);}
  }
  m.strategy={...this.snapshot,enemy:{total:this.snapshot.totalEnemy}};this.nextRefresh=m.elapsed+.75;
  const ms=performance.now()-start;this.metrics.refreshMs+=ms;this.metrics.maxRefreshMs=Math.max(this.metrics.maxRefreshMs,ms);
 }
 priorityId(){const ids=[...this.registry.get('guard')];return ids.length?ids[this.priorityCursor++%ids.length]:null;}
 safe(point){const b=this.match.board,x=Math.round(point.x),y=Math.round(point.y);for(let r=0;r<=5;r++)for(let dx=-r;dx<=r;dx++)for(let dy=-r;dy<=r;dy++){if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;const xx=x+dx,yy=y+dy;if(b.inside(xx,yy)&&!b.navigation.blocked(yy*b.width+xx))return {x:xx,y:yy};}return this.observer.nodeAt(point);}
 think(squad){
  if(!this.snapshot)return;const state=this.states.get(squad.id);if(!state)return;
  // Health/death is validated again at dispatch; shared estimates remain bounded.
  const live=state.units.filter(u=>u.health.current>0);if(!live.length)return;
  state.engaged=live.filter(u=>u.state==='attack').length;
  const operation=squad.botOperation;state.redirect=!!operation.ineffective||operation.intent==='DEFEND';
  const peers=operation.squadIds.map(id=>this.states.get(id)).filter(s=>s&&s.units.some(u=>u.health.current>0));
  const front=selectFront(peers,operation.intent);
  const screens=[...this.states.values()].filter(s=>(s.shield||0)>0&&s.ratio>.3&&this.observer.travel(state,s)<24);
  let screen=screens.sort((a,b)=>this.observer.travel(state,a)-this.observer.travel(state,b))[0]||front;
  const previous=screens.find(s=>s.id===squad.aiScreenId);
  if(previous&&screen&&this.observer.travel(state,previous)<=this.observer.travel(state,screen)+6)screen=previous;
  squad.aiScreenId=screen?.id;
  const now=this.match.elapsed,ratio=live.reduce((n,u)=>n+u.health.current,0)/live.reduce((n,u)=>n+u.health.max,0);
  if(ratio<.35&&!squad.aiRecovery&&!squad.aiRecoverySpent){squad.aiRecovery={until:now+8};}
  if(squad.aiRecovery){
   if(ratio>=.65||now>=squad.aiRecovery.until){squad.aiRecovery=null;squad.aiRecoverySpent=ratio<.65;}else{const medic=peers.find(s=>s.id!==state.id&&s.heal>0);this.gateway.issue(state,'retreat',this.safe(medic||{x:state.x+6,y:state.y}),{urgent:squad.order?.type!=='retreat'});return;}
  }
  if(ratio>.7)squad.aiRecoverySpent=false;
  // Support lag never pauses fighters. Medics anchor on living fighters.
  if((squad.botRole==='support'||state.fire>state.melee)&&screen&&screen.id!==state.id){
   const back=Math.max(2,Math.min(8,state.heal?Math.max(...live.map(u=>u.healing?.range||1))-1:(state.range||4)-1)),lateral=((squad.matchIndex??squad.botSlot)%3-1)*4;
   let threat=null,closest=Infinity;
   for(const id of this.match.board.spatial.candidates(screen.x,screen.y,12)){const u=this.match.board.unit(id);if(u?.team==='A'&&u.health.current>0&&distance(screen,u)<closest){threat=u;closest=distance(screen,u);}}
   const exposed=threat&&distance(state,threat)<=Math.max(2,state.heal?2:(state.range||3)*.5);
   state.redirect ||= !!exposed;
   if(state.engaged&&!exposed&&distance(state,screen)<=Math.max(8,(state.range||3)+4))return;
   const dx=threat?screen.x-threat.x:1,dy=threat?screen.y-threat.y:0,length=Math.hypot(dx,dy)||1;
   const target=this.safe({x:screen.x+dx/length*back-dy/length*lateral,y:screen.y+dy/length*back+dx/length*lateral});
   if(target&&Number.isFinite(this.observer.travel(state,target)))this.gateway.issue(state,'advance',target);return;
  }
  const point=operation.route[operation.waypoint]||operation.goal;if(!point)return;
  let target=point,action=operation.intent==='HOLD'?(distance(state,point)>6?'advance':'hold'):operation.intent==='REGROUP'?'retreat':operation.intent==='DEFEND'?'fortify':'advance';
  if(front&&front.id!==state.id&&distance(state,front)<22&&action==='advance'&&state.shield===0)target=this.safe({x:point.x+2,y:point.y+(squad.botSlot%2?4:-4)});
  else if(peers.length>1&&action!=='hold')target=this.safe({x:point.x+(squad.botSlot%2)*4,y:point.y+(squad.botSlot<2?-3:3)});
  // Keep engagement local and stable; automatic combat still owns targeting.
  let enemy=null,best=Infinity;
  for(const id of this.match.board.spatial.candidates(state.x,state.y,8)){const u=this.match.board.unit(id);if(u?.team!=='A'||u.health.current<=0)continue;const d=distance(state,u);if(d<best){enemy=u;best=d;}}
  if(enemy&&best<=Math.max(3,...live.map(u=>u.combat.range))&&action!=='retreat'){
   const current=this.match.board.unit(squad.order?.target?.unitId);if(squad.order?.type==='focus'&&current?.health.current>0&&distance(state,current)<=10)return;
   this.gateway.issue(state,'focus',{unitId:enemy.id});return;
  }
  if(target)this.gateway.issue(state,action,action==='hold'?null:target,{urgent:operation.intent==='DEFEND'&&this.snapshot.flagHit&&squad.order?.type!=='fortify'});
 }
 planFor(op){return {goal:op.goal||op.anchor,stage:op.intent,action:op.intent==='DEFEND'?'fortify':'advance',mode:this.mode};}
 center(op){const live=op.squadIds.map(id=>this.states?.get(id)).filter(Boolean);return live.length?{x:live.reduce((n,s)=>n+s.x,0)/live.length,y:live.reduce((n,s)=>n+s.y,0)/live.length}:op.anchor;}
}
