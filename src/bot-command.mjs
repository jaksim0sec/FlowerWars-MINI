import {squadsFor} from './unit-groups.mjs';
import {survey,LANES} from './bot-strategy.mjs';
import {DOCTRINES} from './bot-doctrines.mjs';

const roles=['guard','front','breach','mobile','support'];
const laneFor=y=>Math.min(2,Math.max(0,Math.floor(y/34)));
const distance=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
export class BotCommand{
 constructor(match,scenario){
  this.match=match;this.requested=scenario;this.scenario=DOCTRINES.find(s=>s.id===scenario)||DOCTRINES[0];
  this.operations=match.botOperations;this.registry=new Map(roles.map(role=>[role,new Set()]));
  this.plans=new Map();this.events=[];this.mode='deploy';this.frontX=[60,64,60];this.gapSince=[null,null,null];this.nextFront=0;
  this.nextRefresh=0;this.lastScenario=-Infinity;this.contractedUntil=0;this.priorityCursor=0;
 }
 event(type,detail){this.events.push({type,time:this.match.elapsed,...detail});if(this.events.length>32)this.events.shift();}
 chooseScenario(plan){
  if(this.requested||this.match.elapsed-this.lastScenario<12)return;
  const weights=DOCTRINES.map(s=>s.weight*(s.id==='breakthrough'?1+plan.enemy.healers/Math.max(1,plan.enemy.total)*4:s.id==='counterstroke'?1+plan.enemy.mobile/Math.max(1,plan.enemy.total)*2:1+Math.max(...plan.pressure)/Math.max(1,plan.pressure.reduce((a,b)=>a+b,0))));
  let seed=(Math.imul(this.match.board.seed||1,1664525)+1013904223)>>>0;
  let choice=seed/4294967296*weights.reduce((a,b)=>a+b,0),selected=DOCTRINES[0];
  for(let i=0;i<weights.length;i++){choice-=weights[i];if(choice<=0){selected=DOCTRINES[i];break;}}
  this.scenario=selected;this.lastScenario=this.match.elapsed;
 }
 register(squad,operation){
  operation.squadIds.push(squad.id);squad.botRole=this.roleFor(squad,operation);
  this.registry.get(squad.botRole).add(squad.id);
 }
 roleFor(squad,operation){return operation.needs[squad.botSlot]==='support'&&(this.match.recruitment.get(squad.type)?.features.heal||0)>.15?'support':operation.role;}
 isGuard(id){const s=squadsFor(this.match.board).get(id);return s?.botOperation?.role==='guard';}
 // One map-level flood per terrain revision. Gap claims use actual connected
 // walkable terrain, not a coarse cell that may hide an X wall.
 topology(){
  const b=this.match.board;if(this.topologyRevision===b.obstacleRevision)return;
  this.topologyRevision=b.obstacleRevision;this.connected=new Uint8Array(b.width*b.height);
  const flag=this.match.flags.B,start=flag.y*b.width+flag.x,queue=[start];this.connected[start]=1;
  for(let i=0;i<queue.length;i++)for(const n of b.navigation.neighbors(queue[i]))if(n>=0&&!this.connected[n]&&!b.navigation.blocked(n)){this.connected[n]=1;queue.push(n);}
 }
 free(point){
  const b=this.match.board;
  for(let radius=0;radius<=12;radius++)for(let dx=-radius;dx<=radius;dx++)for(let dy=-radius;dy<=radius;dy++){
   if(Math.max(Math.abs(dx),Math.abs(dy))!==radius)continue;
   const x=Math.round(point.x+dx),y=Math.round(point.y+dy);
   if(b.inside(x,y)&&this.connected[y*b.width+x])return {x,y};
  }
  return {...this.match.flags.B};
 }
 guardSeats(live,states){
  const entries=live.filter(o=>o.role==='guard').flatMap(o=>o.liveIds),key=this.mode+':'+this.topologyRevision+':'+entries.map(id=>id+'/'+states.get(id).count).join(',');
  if(key===this.guardSeatKey)return;this.guardSeatKey=key;this.guardGoals=new Map();
  const b=this.match.board,flag=this.match.flags.B,claimed=new Set(),candidates=[];
  for(let x=flag.x-16;x<=Math.min(97,flag.x+16);x++)for(let y=flag.y-16;y<=flag.y+16;y++)if(b.inside(x,y))candidates.push({x,y});
  const preferred={x:this.mode==='contract'?91:86,y:flag.y};
  candidates.sort((a,c)=>(Math.abs(a.x-preferred.x)+Math.abs(a.y-preferred.y))-(Math.abs(c.x-preferred.x)+Math.abs(c.y-preferred.y)));
  for(const id of entries){
   const count=states.get(id).count,offsets=[];
   // Compact two-wide columns pack a defense perimeter without scattering
   // reinforcements beyond the flag leash. Sizes come from live membership.
   for(let i=0;i<count-1;i++){const width=Math.min(2,count-1-Math.floor(i/2)*2);offsets.push({x:Math.floor(i/2),y:-(i%2-Math.floor(width/2))});}
   offsets.push({x:Math.ceil((count-1)/2),y:0});
   const goal=candidates.find(p=>offsets.every(o=>{const x=p.x+o.x,y=p.y+o.y,n=y*b.width+x;return b.inside(x,y)&&distance({x,y},flag)<=16&&this.connected[n]&&!claimed.has(n);}));
   const target=goal||this.free(flag);this.guardGoals.set(id,{...target,formation:'column'});
   for(const o of offsets)claimed.add((target.y+o.y)*b.width+target.x+o.x);
  }
 }
 refresh(){
  const m=this.match,b=m.board,registry=squadsFor(b);this.topology();
  const observation=survey(b,m.flags.B);m.strategy=observation;this.chooseScenario(observation);
  const states=new Map(),enemyCounts=[0,0,0],enemyFront=[10,10,10],friendly=[0,0,0],contact=[0,0,0],gateSupport=[0,0,0],enemies=[];let rearEnemy=0,flagEnemy=0,forwardDefenders=0;
  for(const u of b.units){
   if(u.health.current<=0)continue;
   const lane=laneFor(u.y);
   if(u.team==='A'){
    enemies.push(u);
    enemyCounts[lane]++;enemyFront[lane]=Math.max(enemyFront[lane],u.x);
    if(u.x>=78)rearEnemy++;
    if(distance(u,m.flags.B)<=10)flagEnemy++;
   }else if(u.team==='B'){
    let state=states.get(u.squadId);if(!state){state={count:0,x:0,y:0,health:0,maxHealth:0,positions:[]};states.set(u.squadId,state);}
    state.count++;state.x+=u.x;state.y+=u.y;state.health+=u.health.current;state.maxHealth+=u.health.max;
    if(u.formationRole!=='banner'&&!u.healing)state.positions.push(u.x);
    const role=registry.get(u.squadId)?.botOperation?.role;
    if(role==='front'||role==='breach'){friendly[lane]++;if(u.x<=74&&u.x>=40)gateSupport[lane]++;}
    if(u.x<78)forwardDefenders++;
   }
  }
  for(const state of states.values()){state.x/=state.count;state.y/=state.count;state.ratio=state.health/state.maxHealth;state.positions.sort((a,b)=>a-b);state.forwardX=state.positions[Math.floor(state.positions.length*.6)]??state.x;}
  this.states=states;this.enemyCounts=enemyCounts;this.enemyFront=enemyFront;
  for(const u of enemies)if(Math.abs(u.x-this.frontX[laneFor(u.y)])<10)contact[laneFor(u.y)]++;
  for(const set of this.registry.values())set.clear();
  const live=[];
  for(const operation of this.operations.values()){
   operation.liveIds=operation.squadIds.filter(id=>states.has(id));
   if(!operation.liveIds.length)continue;live.push(operation);
   for(const id of operation.liveIds){const s=registry.get(id);s.botRole=this.roleFor(s,operation);this.registry.get(s.botRole).add(id);}
  }
  // Never allow losses to delete the flag-defense command. Reassign existing
  // nearby forces, preserving IDs, units and all normal movement rules.
  const total=[...states.values()].reduce((n,s)=>n+s.count,0);
  let guardStrength=live.filter(o=>o.role==='guard').reduce((n,o)=>n+o.liveIds.reduce((v,id)=>v+states.get(id).count,0),0);
  const homeDanger=m.elapsed-(m.flags.B.lastHitAt??-Infinity)<6||flagEnemy>=2||(rearEnemy>=Math.max(4,total*.05)&&forwardDefenders<Math.max(total*.45,rearEnemy*3));
  const required=homeDanger?Math.max(1,total*.35):0;
  for(const op of [...live].filter(o=>o.role!=='guard').sort((a,c)=>this.center(c).x-this.center(a).x)){
   if(guardStrength>=required)break;
   op.baseRole??=op.role;op.promotedAt=m.elapsed;op.role='guard';op.mission='guard';op.stage='defend';guardStrength+=op.liveIds.reduce((n,id)=>n+states.get(id).count,0);
   for(const id of op.liveIds){for(const set of this.registry.values())set.delete(id);const s=registry.get(id);s.botRole=this.roleFor(s,op);this.registry.get(s.botRole).add(id);}
   this.event('guard-reinforced',{operation:op.index});
  }
  if(!homeDanger&&m.elapsed>=this.contractedUntil)for(const op of live){
   const strength=op.liveIds.reduce((n,id)=>n+states.get(id).count,0);
   if(!op.baseRole||m.elapsed-op.promotedAt<8||guardStrength-strength<required)continue;
   guardStrength-=strength;op.role=op.baseRole;op.baseRole=null;op.mission=op.role==='mobile'?'flank':'attack';op.stage=op.role==='mobile'?'reserve':'advance';
   for(const id of op.liveIds){for(const set of this.registry.values())set.delete(id);const s=registry.get(id);s.botRole=this.roleFor(s,op);this.registry.get(s.botRole).add(id);}
   this.event('reserve-restored',{operation:op.index});
  }
  if(homeDanger)this.contractedUntil=m.elapsed+6;
  const mode=m.elapsed<this.contractedUntil?'contract':'advance';
  if(mode!==this.mode){this.mode=mode;this.event(mode==='contract'?'defense-contracted':'front-resumed',{});}
  this.guardSeats(live,states);
  const totalEnemy=Math.max(1,observation.enemy.total);
  for(let lane=0;lane<3;lane++){
   const gate=this.free({x:51,y:LANES[lane]});
   const open=enemyCounts[lane]<=Math.max(3,totalEnemy*.12)&&gateSupport[lane]>=Math.min(6,Math.max(1,total*.02))&&this.connected[gate.y*b.width+gate.x];
   if(open&&this.gapSince[lane]===null)this.gapSince[lane]=m.elapsed;
   if(!open)this.gapSince[lane]=null;
  }
  const openingReady=m.elapsed>=this.scenario.openingHold&&(this.scenario.id!=='counterstroke'||Math.max(...enemyFront)>50||m.elapsed>=20);
  if(m.elapsed>=this.nextFront&&mode!=='contract'&&openingReady){
   this.nextFront=m.elapsed+this.scenario.frontCadence;
   for(let lane=0;lane<3;lane++){
    const wings=live.filter(op=>op.role==='front'&&op.lane!==1).map(op=>op.lane);
    if(this.scenario.id==='envelopment'&&lane===1&&wings.some(wing=>this.frontX[wing]>44))continue;
    const nearby=[...states].filter(([id])=>{const s=registry.get(id);return s?.botOperation?.role==='front'&&s.botOperation.lane===lane;});
    if(nearby.some(([,s])=>s.x<=this.frontX[lane]+7)&&contact[lane]<=Math.max(6,friendly[lane]*1.15))this.frontX[lane]=Math.max(12,this.frontX[lane]-2);
   }
  }
  for(const op of live){
   const center=this.center(op),peers=live.filter(other=>other.role===op.role&&(op.role==='guard'||other.lane===op.lane)),rank=peers.indexOf(op);let goal,stage=op.stage||'advance',action='advance';
   if(op.role==='guard'){
    goal={x:mode==='contract'?91:86,y:50};stage='defend';action='fortify';
   }else if(mode==='contract'&&(op.role==='mobile'&&center.x>55||op.role==='front')){
    goal={x:84,y:42+op.lane*8};stage='reinforce';action='fortify';
   }else if(op.role==='mobile'){
    const gaps=openingReady?[0,1,2].filter(lane=>this.gapSince[lane]!==null&&m.elapsed-this.gapSince[lane]>=this.scenario.gapHold).sort((a,c)=>enemyCounts[a]-enemyCounts[c]):[];
    if(!op.stage)op.stage='reserve';
    if(op.stage==='reserve'&&gaps.length){op.lane=gaps[0];op.stage='penetrate';op.entryFront=enemyFront[op.lane];this.event('gap-opened',{operation:op.index,lane:op.lane});}
    if(op.stage==='penetrate'&&center.x<=Math.max(8,op.entryFront-10)+rank*3+5){op.stage='rear-attack';op.rearLane=observation.strongest;this.event('rear-attack',{operation:op.index});}
    if(op.stage==='rear-attack'&&distance(center,{x:Math.max(6,enemyFront[op.rearLane]-10),y:LANES[op.rearLane]})<7)op.stage='capture';
    stage=op.stage;
    goal=stage==='reserve'?{x:76+rank*7,y:LANES[op.lane]}:stage==='penetrate'?{x:Math.max(8,op.entryFront-10,Math.round(center.x)-10)+rank*3,y:LANES[op.lane]}:
     stage==='rear-attack'?{x:Math.max(6,enemyFront[op.rearLane]-10),y:LANES[op.rearLane]}:m.flags.A;
    if(stage==='reserve')action='fortify';
   }else{
    const lane=op.role==='breach'?observation.strongest:op.lane;
    goal={x:op.role==='breach'?Math.max(6,this.frontX[lane]-this.scenario.breachAhead)+rank*8:this.frontX[lane]+rank*8,y:LANES[lane]};
    if(center.x<20)goal=m.flags.A;
   }
   this.plans.set(op.index,{goal:this.free(goal),guardGoals:this.guardGoals,entry:this.free({x:Math.min(76,Math.max(40,(op.entryFront||45)+8)),y:LANES[op.lane]}),stage,action,mode});
  }
  this.nextRefresh=m.elapsed+.5;
 }
 center(operation){
  const ids=operation.liveIds||operation.squadIds,primary=this.states?.get(ids[0]);
  return primary?{x:primary.forwardX,y:primary.y}:operation.anchor;
 }
 planFor(operation){return this.plans.get(operation.index)||{goal:operation.anchor,stage:operation.role==='mobile'?'reserve':'advance',action:'advance',mode:this.mode};}
 priorityId(){const ids=[...this.registry.get('guard')];return ids.length?ids[this.priorityCursor++%ids.length]:null;}
}
