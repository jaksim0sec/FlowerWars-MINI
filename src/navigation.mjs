import {squadsFor} from './unit-groups.mjs';
import {mix} from './decision.mjs';
import {tryHeal} from './healing.mjs';
import {hasLineOfSight} from './combat.mjs';
// Shared static distance fields + conservative one-step cooperative reservations.
// No visual/camera state participates in navigation.
export const SEARCH_BUDGET = 2048;
export const NAV_INTERVAL = .12;
const LOCAL_LIMIT = 96, CACHE_LIMIT = 64, FIELD_BYTES = 4*1024*1024;

export class Navigation {
  constructor(board) {
    this.board=board; this.fields=new Map(); this.pending=null; this.cursor=0;
    this.remaining=SEARCH_BUDGET;this.cooperations=new Set();this.occupancyVersions=new Uint32Array(board.width*board.height);this.congestion=new Map();
    this.stats={fieldBuilds:0,cacheHits:0,detours:0,expansions:0,lastExpansions:0,cooperativeSteps:0,cooperativeRequests:0,cooperativeFailures:0,sharedBuilds:0,sharedHits:0,staticBuilds:0};
  }
  invalidate(){this.fields.clear();this.pending=null;}
  index(x,y){return y*this.board.width+x;}
  coords(index){return {x:index%this.board.width,y:Math.floor(index/this.board.width)};}
  neighbors(index,unit=null) {
    const w=this.board.width,h=this.board.height,x=index%w,y=Math.floor(index/w);
    // Actor searches break equal paths relative to their destination. A fixed
    // east-first order gives opposing armies different detours and search-budget
    // success rates, even when their start positions and goals are symmetric.
    const target=unit?.command?.type==='attack'?this.board.unit(unit.command.target):unit?.command;
    const direction=target?Math.sign(target.x-unit.x):0;
    const approach=unit?.command?.flow==='east'?1:unit?.command?.flow==='west'?-1:0;
    const orientation=direction||approach||this.board.navigationOrientation;
    const east=x+1<w?index+1:-1,west=x>0?index-1:-1;return orientation===-1?[west,y+1<h?index+w:-1,east,y>0?index-w:-1]:[east,y+1<h?index+w:-1,west,y>0?index-w:-1];
  }
  blocked(index){return this.board.obstacles.get(index)?.blocked!==false&&this.board.obstacles.has(index);}
  touch(x,y){
    if(!this.board.inside(x,y))return;
    const cell=this.index(x,y);this.occupancyVersions[cell]++;
    for(const n of this.neighbors(cell))if(n>=0)this.occupancyVersions[n]++;
  }
  congestionAt(index,u){
    let cached=this.congestion.get(index),version=this.occupancyVersions[index];
    if(!cached||cached.version!==version){
      cached={version,load:0,east:0,west:0,north:0,south:0};const seen=new Set();
      for(const n of [index,...this.neighbors(index)])if(n>=0){
        const owner=this.board.cells.get(n),reserved=this.board.reservations.get(n);
        for(const id of [owner,reserved])if(id!=null&&!seen.has(id)){
          seen.add(id);const a=this.board.unit(id);if(!a||a.health.current<=0)continue;
          cached.load+=a.step?1:2;
          if(a.command?.flow)cached[a.command.flow]++;
        }
      }
      this.congestion.set(index,cached);
    }
    const opposite={east:'west',west:'east',north:'south',south:'north'}[u.command?.flow];
    return cached.load+(cached[opposite]||0)*2;
  }
  consume(){this.remaining--;this.stats.expansions++;this.stats.lastExpansions++;}
  refill(){this.remaining=SEARCH_BUDGET;this.stats.lastExpansions=0;this.work();}
  work() {
    const f=this.pending;if(!f)return;
    while(f.head<f.tail&&this.remaining>0) {
      const cell=f.queue[f.head++];this.consume();
      for(const n of this.neighbors(cell))if(n>=0&&f.distance[n]<0&&!this.blocked(n)) {
        f.distance[n]=f.distance[cell]+1;f.queue[f.tail++]=n;
      }
    }
    if(f.head===f.tail){f.complete=true;f.queue=null;this.pending=null;}
  }
  field(x,y,adjacent=false) {
    const reach=adjacent===true?{shape:'manhattan',range:1}:adjacent;
    const key=`${x},${y},${reach?.shape||'point'},${reach?.range||0},${!!reach?.lineOfSight}`;
    if(this.fields.has(key)) {
      const f=this.fields.get(key);this.fields.delete(key);this.fields.set(key,f);this.stats.cacheHits++;this.work();return f;
    }
    // Finish one incremental job before admitting another: bounded memory, no
    // eviction/restart starvation when commands have many distinct destinations.
    if(this.pending)return null;
    const capacity=Math.max(1,Math.min(CACHE_LIMIT,Math.floor(FIELD_BYTES/(this.board.width*this.board.height*4))));
    if(this.fields.size>=capacity)this.fields.delete(this.fields.keys().next().value);
    if(!this.board.obstacles.size) {
      // Empty terrain has an exact O(1) Manhattan distance; no map-sized BFS.
      const f={complete:true,at:index=>{const dx=Math.abs(index%this.board.width-x),dy=Math.abs(Math.floor(index/this.board.width)-y);const r=reach?.range||0;return reach?.shape==='king'?Math.max(0,dx-r)+Math.max(0,dy-r):Math.max(0,dx+dy-r);}};
      this.fields.set(key,f);return f;
    }
    const size=this.board.width*this.board.height;
    const f={distance:new Int32Array(size).fill(-1),queue:new Int32Array(size),head:0,tail:0,complete:false};
    const goal=this.index(x,y),seeds=reach?[]:[goal];
    if(reach)for(let dy=-reach.range;dy<=reach.range;dy++)for(let dx=-reach.range;dx<=reach.range;dx++) {
      if(!this.board.inside(x+dx,y+dy)||(reach.shape!=='king'&&Math.abs(dx)+Math.abs(dy)>reach.range))continue;
      if(reach.lineOfSight&&!hasLineOfSight(this.board,{visualX:x+dx,visualY:y+dy},{visualX:x,visualY:y}))continue;
      seeds.push(this.index(x+dx,y+dy));
    }
    for(const n of seeds)if(n>=0&&!this.blocked(n)){f.distance[n]=0;f.queue[f.tail++]=n;}
    f.at=index=>f.distance[index];
    this.fields.set(key,f);this.pending=f;this.stats.fieldBuilds++;this.work();return f;
  }
  free(index,u) {
    if(index<0||this.blocked(index))return false;
    const p=this.coords(index);return !this.board.occupied(p.x,p.y,u.id);
  }
  openGuide(u,x,y) {
    const b=this.board,dx=x-u.x,dy=y-u.y,guide=[];
    let px=u.x,py=u.y;
    const horizontal=to=>{while(px!==to){px+=Math.sign(to-px);guide.push(this.index(px,py));}};
    const vertical=to=>{while(py!==to){py+=Math.sign(to-py);guide.push(this.index(px,py));}};
    // Separated travel lanes leave intermediate rows/columns for destinations.
    // Opposite streams cannot permanently plug each other's entire travel lane.
    const laneFor=(position,limit,direction)=>{
      const residue=direction>0?0:2;
      if(limit<6){const p=direction>0?0:1;return limit>1&&position%2!==p?(position+1<limit?position+1:position-1):position;}
      for(let d=0;d<=3;d++)for(const candidate of [position+d,position-d])if(candidate>=0&&candidate<limit&&candidate%4===residue)return candidate;
      return position;
    };
    const opposite={east:'west',west:'east',south:'north',north:'south'}[u.command.flow];
    const traffic=b.flows[opposite]>0&&!u.combat.auto&&!u.command.direct;
    if(traffic&&Math.abs(dx)>=Math.abs(dy)&&Math.abs(dx)>=4) {
      const lane=laneFor(py,b.height,dx*b.navigationOrientation);
      vertical(lane);horizontal(x);vertical(y);
    } else if(traffic&&Math.abs(dy)>=4) {
      const canonical=b.navigationOrientation===-1?b.width-1-px:px;
      const chosen=laneFor(canonical,b.width,dy),lane=b.navigationOrientation===-1?b.width-1-chosen:chosen;
      horizontal(lane);vertical(y);horizontal(x);
    } else {horizontal(x);vertical(y);}
    return guide;
  }
  detour(u,field,start) {
    const queue=[start],previous=new Map([[start,-1]]),distance=field.at(start);
    for(let head=0;head<queue.length&&head<LOCAL_LIMIT&&this.remaining>0;head++) {
      const cell=queue[head];this.consume();
      if(cell!==start&&field.at(cell)>=0&&field.at(cell)<distance) {
        const path=[];let n=cell;
        while(n!==start){path.push(this.coords(n));n=previous.get(n);}
        this.stats.detours++;return path.reverse();
      }
      for(const n of (u.team&&u.command?.direct&&cell===start&&this.board.time-(u.waitSince??this.board.time)>.75?this.neighbors(cell,u).filter(n=>n>=0).sort((a,c)=>this.congestionAt(a,u)-this.congestionAt(c,u)):this.neighbors(cell,u)))if(!previous.has(n)&&this.free(n,u)&&previous.size<LOCAL_LIMIT) {
        previous.set(n,cell);queue.push(n);
      }
    }
    return null;
  }
  recover(u,start){
    // Local rejoining cannot see around a long stationary rank. Continue a
    // wider occupancy-aware search across ticks, charging the shared budget.
    const key=`${start}:${u.guideKey}`;
    if(u.recovery?.key!==key)u.recovery={key,queue:[start],head:0,previous:new Map([[start,-1]]),goals:new Set(u.guide)};
    const search=u.recovery;let work=0;
    while(search.head<search.queue.length&&this.remaining>0&&work++<256){
      const cell=search.queue[search.head++];this.consume();
      if(cell!==start&&search.goals.has(cell)&&this.free(cell,u)){
        const path=[];let n=cell;
        while(n!==start){path.push(this.coords(n));n=search.previous.get(n);}
        u.recovery=null;this.stats.detours++;return path.reverse();
      }
      for(const n of this.neighbors(cell,u))if(this.free(n,u)&&!search.previous.has(n)&&search.previous.size<8192){search.previous.set(n,cell);search.queue.push(n);}
    }
    if(search.head>=search.queue.length){u.recovery=null;u.recoveryRetryAt=this.board.time+1;}
    return null;
  }
  wait(u,reason,delay=.24) {
    u.state='idle';u.path=[];u.waitReason=reason;u.waitSince??=this.board.time;
    u.retryAt=this.board.time+delay+(u.priorityKey%4)*.025;
  }
  staticRoute(u,x,y,key){
    const start=this.index(u.x,u.y),goal=this.index(x,y);
    const heuristic=cell=>Math.abs(cell%this.board.width-x)+Math.abs(Math.floor(cell/this.board.width)-y);
    if(u.staticSearch?.key!==key||u.staticSearch.start!==start){this.stats.staticBuilds++;u.staticSearch={key,start,congested:!!u.congestionReplan,open:[{cell:start,g:0,f:heuristic(start)}],cost:new Map([[start,0]]),previous:new Map()};}
    const search=u.staticSearch;let count=0;
    while(search.open.length&&this.remaining>0&&count++<128){
      const current=search.open.shift();if(current.g!==search.cost.get(current.cell))continue;
      this.consume();
      if(current.cell===goal){
        const path=[];let cell=goal;while(cell!==start){path.push(cell);cell=search.previous.get(cell);}
        u.staticSearch=null;return path.reverse();
      }
      for(const n of this.neighbors(current.cell,u)){
        if(n<0||this.blocked(n))continue;
        const g=current.g+1+(search.congested?this.congestionAt(n,u)*.2:0);if(g>=(search.cost.get(n)??Infinity))continue;
        search.cost.set(n,g);search.previous.set(n,current.cell);
        const node={cell:n,g,f:g+heuristic(n)};
        // Stable A* priority, preferring progress when estimates tie.
        let low=0,high=search.open.length;while(low<high){const mid=(low+high)>>1,v=search.open[mid];if(v.f<node.f||v.f===node.f&&v.g>=node.g)low=mid+1;else high=mid;}
        search.open.splice(low,0,node);
      }
    }
    if(!search.open.length){u.staticSearch=null;return false;}
    return null;
  }
  sharedSquadGuide(u,x,y,key){
    const shared=u.squadRoute,b=this.board;
    if(!shared||u.congestionReplan)return undefined;
    if(shared.revision!==b.obstacleRevision){shared.path=null;shared.planner=null;shared.lanes=null;shared.revision=b.obstacleRevision;}
    if(!shared.planner){shared.planner={...shared.origin,command:{type:'move',...shared.target}};this.stats.sharedBuilds++;}
    if(!shared.path){
      if(shared.origin.x===shared.target.x&&shared.origin.y===shared.target.y)shared.path=[this.index(shared.origin.x,shared.origin.y)];
      else {
        const path=this.staticRoute(shared.planner,shared.target.x,shared.target.y,'shared:'+shared.revision);
        if(path===false)return undefined;if(!path)return null;
        shared.path=[this.index(shared.origin.x,shared.origin.y),...path];
      }
    }
    const start=shared.starts.get(u.id);if(!start)return undefined;
    const dx=start.x-shared.origin.x,dy=start.y-shared.origin.y;
    const shifted=shared.path.map(n=>{const p=this.coords(n);return {x:p.x+dx,y:p.y+dy};});
    const last=shifted.at(-1),current=this.index(u.x,u.y);
    if(last.x===x&&last.y===y&&shifted.every(p=>b.inside(p.x,p.y)&&!this.blocked(this.index(p.x,p.y)))){
      const path=shifted.map(p=>this.index(p.x,p.y)),index=path.indexOf(current);
      if(index>=0){this.stats.sharedHits++;return path.slice(index+1);}
    }
    // At a narrow gate use the common trunk, with short individual entry/exit
    // searches. The original offset goals remain intact beyond the gate.
    const trunk=shared.path;
    let local=u.sharedLocal;
    if(!local||local.shared!==shared||local.key!==key||local.start!==current){
      let entry=0,best=Infinity;
      trunk.forEach((n,i)=>{const p=this.coords(n),d=Math.abs(u.x-p.x)+Math.abs(u.y-p.y);if(d<best){best=d;entry=i;}});
      if(best>16)return undefined;
      const tail=this.coords(trunk.at(-1));
      local=u.sharedLocal={shared,key,start:current,entry,tail:{...tail,command:{type:'move',x,y}}};
    }
    const entryPoint=this.coords(trunk[local.entry]);
    if(!local.prefix){
      if(current===trunk[local.entry])local.prefix=[];
      else {const path=this.staticRoute(u,entryPoint.x,entryPoint.y,key+':entry');if(path===false)return undefined;if(!path)return null;local.prefix=path;}
    }
    if(!local.suffix){
      if(local.tail.x===x&&local.tail.y===y)local.suffix=[];
      else {const path=this.staticRoute(local.tail,x,y,key+':exit');if(path===false)return undefined;if(!path)return null;local.suffix=path;}
    }
    this.stats.sharedHits++;
    return [...local.prefix,...trunk.slice(local.entry+1),...local.suffix];
  }
  plan(u) {
    const b=this.board;
    if(u.step||!['idle','walk'].includes(u.state))return;
    if(u.state==='walk')u.state='idle';
    if(tryHeal(b,u))return;
    if(this.keepDistance(u))return;
    if(b.unit(u.id)!==u||u.health.current<=0||u.step||!['idle','walk'].includes(u.state))return;
    if(b.tryAutoAttack(u)){if(u.courtesy)this.cancelCooperation(u);return;}
    if(u.courtesy&&this.serviceCooperation(u))return;
    if(this.returnCourtesy(u))return;
    if(this.counterStep(u))return;
    const command=u.command;
    if(!command)return;
    let {x,y}=command;
    if(command.type==='attack') {
      const target=b.unit(command.target);
      if(!target||target.health.current<=0){b.cancelCommand(u);return;}
      x=target.x;y=target.y;
      if(b.inAttackRange(u,target)&&(!u.combat.lineOfSight||hasLineOfSight(b,u,target))){b.beginAttack(u);return;}
    } else if(u.x===x&&u.y===y){b.cancelCommand(u);return;}
    if(b.time<(u.retryAt||0))return;
    const start=this.index(u.x,u.y),routeKey=`${x},${y},${b.obstacleRevision}`;
    if(u.guideKey!==routeKey) {
      if(command.direct&&b.obstacles.size){
        let route=this.sharedSquadGuide(u,x,y,routeKey);
        if(route===undefined)route=this.staticRoute(u,x,y,routeKey);
        if(route===false){b.cancelCommand(u);u.waitReason='unreachable';return;}
        if(!route){this.wait(u,'planning',NAV_INTERVAL);return;}
        u.guide=route;u.guideKey=routeKey;u.route=[];u.congestionReplan=false;
      }else{
      const field=this.field(x,y,command.type==='attack'?{shape:u.combat.shape,range:u.combat.range,lineOfSight:u.combat.lineOfSight}:false);
      if(!field||field.at(start)<0) {
        if(field?.complete){b.cancelCommand(u);u.waitReason='unreachable';}
        else this.wait(u,'planning',NAV_INTERVAL);
        return;
      }
      // Keep only the route, never a reference pinning an entire distance grid.
      // Cache eviction cannot force each agent to search again at every step.
      u.guide=[];let cell=start;
      if(!b.obstacles.size&&command.type==='move')u.guide=this.openGuide(u,x,y);
      else while(field.at(cell)>0) {
        const next=this.neighbors(cell,u).find(n=>n>=0&&!this.blocked(n)&&field.at(n)===field.at(cell)-1);
        if(next==null)break;
        u.guide.push(next);cell=next;
      }
      u.guideKey=routeKey;u.route=[];
      }
    }
    const reached=u.guide.indexOf(start);
    if(reached>=0)u.guide.splice(0,reached+1);
    if(!u.guide.length){
      // A moving target can be logically adjacent while its interpolated body
      // is already outside melee range. Keep pursuit until physical contact.
      if(command.type==='attack'){u.guideKey=null;this.wait(u,'combat',NAV_INTERVAL);}
      else b.cancelCommand(u);
      return;
    }
    if(u.yieldUntil>b.time){this.wait(u,'yielding',NAV_INTERVAL);return;}
    let next=null;
    if(u.route?.length) {
      const p=u.route[0],n=this.index(p.x,p.y);
      if(Math.abs(p.x-u.x)+Math.abs(p.y-u.y)===1&&this.free(n,u)){next=p;u.route.shift();}
      else u.route=[];
    }
    const desired=this.coords(u.guide[0]);
    let blocker=null;
    if(!next&&Math.abs(desired.x-u.x)+Math.abs(desired.y-u.y)===1) {
      if(this.free(u.guide[0],u))next=desired;
      else blocker=b.at(desired.x,desired.y)||b.unit(b.reservations.get(u.guide[0]));
    }
    const candidates=this.neighbors(start,u);
    if(!next) {
      const waited=b.time-(u.waitSince??b.time);
      const marching=!!u.marchStepTime&&blocker?.team===u.team;
      // Let a moving neighbor finish before spending any local search budget.
      if(!blocker?.command||waited>=(marching?Math.max(1.5,u.movement.waitBeforeDetour):u.movement.waitBeforeDetour)) {
        // A detour must rejoin a future route cell, never its origin. This
        // prevents sideways oscillation and preserves static obstacle guidance.
        const potential=new Map(u.guide.map((cell,i)=>[cell,u.guide.length-i]));
        const route=u.recovery?null:this.detour(u,{at:cell=>cell===start?u.guide.length+1:(potential.get(cell)??-1)},start);
        if(route?.length){next=route.shift();u.route=route;}
      }
      if(!next&&waited>=.24&&(!blocker?.command||waited>=(marching?1.5:1))&&b.time>=(u.recoveryRetryAt||0)){
        const route=this.recover(u,start);
        if(route?.length){next=route.shift();u.route=route;}
      }
      if(!next&&waited>=.3&&this.requestCooperation(u,blocker))return;
      if(!next&&command.direct&&b.obstacles.size&&waited>=2&&b.time>=(u.nextCongestionReplan||0)){
        u.nextCongestionReplan=b.time+10;u.congestionReplan=true;u.guideKey=null;u.staticSearch=null;
        this.wait(u,'congestion',NAV_INTERVAL);return;
      }
      if(!next&&!blocker&&waited>=.5) {
        // Several courtesy yields can drift outside the small local search.
        // Re-anchor the compact guide instead of retrying the same dead end.
        u.guideKey=null;this.wait(u,'replanning',NAV_INTERVAL);return;
      }
      // Unilateral avoidance of a moving obstacle, including hostile traffic.
      // This never requests or forces motion from the other actor.
      if(!next&&blocker?.command&&waited>=u.movement.yieldAfter) {
        const dx=blocker.x-u.x,dy=blocker.y-u.y;
        for(const n of candidates)if(this.free(n,u)) {
          const p=this.coords(n);
          if((p.x-u.x)*dx+(p.y-u.y)*dy===0){next=p;u.yieldUntil=b.time+.85;break;}
        }
      }
    }
    if(!next){
      const delay=command.direct?(blocker?.step?Math.max(.04,Math.min(.12,blocker.step.duration-blocker.step.elapsed+.01)):.12):Math.min(.65,.16+(b.time-(u.waitSince??b.time))*.15);
      this.wait(u,'traffic',delay);return;
    }
    this.requestStep(u,next);
  }
  requestStep(u,next){
    const b=this.board,command=u.command,courtesy=u.courtesy,fromX=u.x,fromY=u.y;
    if(Math.abs(next.x-u.x)+Math.abs(next.y-u.y)!==1)return;
    const decision=b.movementPolicy?.beforeStep?.({board:b,unit:u,from:{x:u.x,y:u.y},to:{...next},obstacle:b.obstacles.get(this.index(next.x,next.y))})||'move';
    if(b.unit(u.id)!==u||u.health.current<=0||u.command!==command||u.step||u.x!==fromX||u.y!==fromY||courtesy&&(u.courtesy!==courtesy||u.combat.holdPosition)||!['idle','walk'].includes(u.state))return;
    if(decision==='cancel'){b.cancelCommand(u);return;}
    if(decision!=='move'){this.wait(u,'condition');return;}
    // Hooks may change the board; validate once more before reserving.
    if(!this.free(this.index(next.x,next.y),u)){this.wait(u,'traffic');return;}
    this.offer(u,next);return true;
  }
  returnCourtesy(u){
    const home=u.courtesyReturn,b=this.board;if(!home||u.command)return false;
    if(u.x===home.x&&u.y===home.y){u.courtesyReturn=null;return false;}
    if(b.time<home.nextAt)return true;
    home.nextAt=b.time+.3;
    const start=this.index(u.x,u.y),goal=this.index(home.x,home.y);
    if(!this.free(goal,u)){
      const blocker=b.at(home.x,home.y);
      if(blocker?.courtesyReturn){u.guide=[goal];this.requestCooperation(u,blocker);}
      return true;
    }
    if(home.route?.length){
      const next=home.route[0];
      if(this.free(this.index(next.x,next.y),u)&&Math.abs(next.x-u.x)+Math.abs(next.y-u.y)===1){this.requestStep(u,next);home.route.shift();return true;}
      home.route=null;u.recovery=null;
    }
    let route=u.recovery?null:this.detour(u,{at:n=>{const p=this.coords(n);return Math.abs(p.x-home.x)+Math.abs(p.y-home.y);}},start);
    if(!route){u.guide=[goal];u.guideKey='courtesy-return:'+goal;route=this.recover(u,start);}
    if(route?.length){this.requestStep(u,route[0]);home.route=route.slice(1);}
    return true;
  }
  canYield(u,root,formation=false){
    // A completed destination is an anchor, not an unowned vacancy. Ordinary
    // traffic must go around it; only the owning formation may temporarily
    // open that seat and then restore its role assignment.
    if(!formation&&!root.courtesyReturn&&u&&!u.command&&u.lastMoveGoal&&u.x===u.lastMoveGoal.x&&u.y===u.lastMoveGoal.y)return false;
    if(!formation&&!root.courtesyReturn&&u?.courtesyReturn)return false;
    if(u?.command?.type==='move'&&u.command.flow===root.command?.flow&&
      (u.waitSince==null||this.board.time-u.waitSince<1.5))return false;
    return !!u&&u!==root&&!!root.team&&u.team===root.team&&u.health.current>0&&!u.step&&!u.strike&&(!u.courtesy||u.courtesy.chain.root===root&&u.courtesy.chain.remote&&u.courtesy.chain.cursor<0)&&
      ['idle','walk'].includes(u.state)&&!u.combat.holdPosition&&u.command?.type!=='attack';
  }
  cancelCooperation(u){
    const chain=u.courtesy?.chain||u.remoteCourtesy;if(!chain)return;
    for(const record of chain.records){const actor=this.board.unit(record.id);if(actor?.courtesy?.chain===chain){
      actor.courtesy=null;actor.retryAt=0;
      if(actor.id!==chain.root.id&&!actor.command&&actor.health.current>0&&actor.lastMoveGoal&&!squadsFor(this.board).get(actor.squadId)?.order)actor.courtesyReturn={...actor.lastMoveGoal,nextAt:this.board.time+.3};
    }}
    if(chain.root.remoteCourtesy===chain)chain.root.remoteCourtesy=null;
    this.cooperations.delete(chain);chain.root.coopRetryAt=this.board.time+.4;
  }
  requestCooperation(root,blocker,remote=null){
    const b=this.board;
    if(root.step||root.strike||!['idle','walk'].includes(root.state))return false;
    if(root.courtesy||root.remoteCourtesy&&(!remote||root.remoteCourtesy.cursor>=0))return true;
    if(this.remaining<32||!this.canYield(blocker,root,!!remote)||this.cooperations.size>=16||b.time<(root.coopRetryAt||0))return false;
    if(!remote&&root.command?.x===blocker.x&&root.command?.y===blocker.y&&blocker.lastMoveGoal?.x===blocker.x&&blocker.lastMoveGoal?.y===blocker.y)return false;
    root.coopRetryAt=b.time+.6;this.stats.cooperativeRequests++;
    let work=0;const visited=new Set([root.id]),guide=new Set(root.guide||[]);
    const search=(u,depth)=>{
      if(depth>5||work>=32||this.remaining<=0||!this.canYield(u,root,!!remote)||visited.has(u.id))return null;
      visited.add(u.id);work++;this.consume();
      const parkingScore=n=>{
        if(!remote){
          if(u.command?.type==='move'){const p=this.coords(n);return Math.abs(p.x-u.command.x)+Math.abs(p.y-u.command.y);}
          return guide.has(n)?4:0;
        }
        const p=this.coords(n),seat=[...remote.order.goals.values()].some(g=>g.x===p.x&&g.y===p.y);
        return (seat?12:0)-Math.abs(p.x-root.x)-Math.abs(p.y-root.y)-Math.abs(p.x-remote.goal.x)-Math.abs(p.y-remote.goal.y);
      };
      const candidates=this.neighbors(this.index(u.x,u.y),root).filter(n=>n>=0&&!this.blocked(n)).sort((a,c)=>parkingScore(a)-parkingScore(c));
      for(const n of candidates){
        const p=this.coords(n);if(n===this.index(root.x,root.y))continue;
        if(this.free(n,u))return [{id:u.id,to:p,command:u.command}];
        if(remote){const next=b.at(p.x,p.y),tail=search(next,depth+1);if(tail)return [{id:u.id,to:p,command:u.command},...tail];}
      }
      for(const n of candidates){
        const p=this.coords(n),next=b.at(p.x,p.y),tail=search(next,depth+1);
        if(tail)return [{id:u.id,to:p,command:u.command},...tail];
      }
      return null;
    };
    const tail=search(blocker,0);
    if(!tail){this.stats.cooperativeFailures++;return false;}
    if(remote&&root.remoteCourtesy){
      const chain=root.remoteCourtesy;
      for(const record of tail){const index=chain.records.findIndex(r=>r.id===record.id);if(index>=0)chain.records[index]=record;else chain.records.push(record);b.unit(record.id).courtesy={chain,command:record.command};}
      chain.cursor=chain.records.length-1;return true;
    }
    const records=remote?tail:[{id:root.id,to:{x:blocker.x,y:blocker.y},command:root.command},...tail];
    const chain={records,cursor:records.length-1,root,remote,until:b.time+(remote?30:12)};this.cooperations.add(chain);if(remote)root.remoteCourtesy=chain;
    for(const record of records){const u=b.unit(record.id);u.courtesy={chain,command:u.command};}
    return true;
  }
  serviceCooperation(u){
    const b=this.board,chain=u.courtesy?.chain;if(!chain)return false;
    if(b.time>chain.until||chain.records.some(r=>{const a=b.unit(r.id);return !a||a.health.current<=0||a.command!==r.command||a.courtesy?.chain!==chain||a.strike||a.combat.holdPosition||!['idle','walk'].includes(a.state);})){this.cancelCooperation(u);return false;}
    if(chain.remote){
      const {squad,order,goal}=chain.remote,current=order.goals.get(chain.root.id);
      if(chain.root.health.current<=0||squad.order!==order||!current||current.x!==goal.x||current.y!==goal.y){this.cancelCooperation(u);return false;}
      if(!chain.root.step&&chain.root.x===goal.x&&chain.root.y===goal.y){this.cancelCooperation(u);return false;}
    }
    while(chain.cursor>=0){
      const r=chain.records[chain.cursor],a=b.unit(r.id);
      if(!a.step&&a.x===r.to.x&&a.y===r.to.y){chain.cursor--;continue;}
      if(a.id!==u.id||a.step)return true;
      if(!this.free(this.index(r.to.x,r.to.y),a)){this.cancelCooperation(u);return false;}
      if(this.requestStep(a,r.to))this.stats.cooperativeSteps++;else this.cancelCooperation(u);
      return true;
    }
    if(chain.remote)return true;
    this.cancelCooperation(u);return false;
  }
  counterStep(u){
    const b=this.board;
    if(!u.combat.retaliation&&u.combat.visionRange&&u.combat.auto&&!u.combat.holdPosition&&u.command?.type!=='attack'&&b.time>=(u.combat.visionAt||0)){
      u.combat.visionAt=b.time+.3;let nearest=null,best=Infinity;
      for(const id of b.spatial.candidates(u.x,u.y,u.combat.visionRange)){
        const enemy=b.unit(id);if(!enemy?.team||enemy.team===u.team||enemy.health.current<=0)continue;
        const d=Math.max(Math.abs(enemy.x-u.x),Math.abs(enemy.y-u.y));
        if(d<=u.combat.visionRange&&d<best&&hasLineOfSight(b,u,enemy)){nearest=enemy;best=d;}
      }
      if(nearest)u.combat.retaliation={targetId:nearest.id,x:u.x,y:u.y,until:b.time+2.5,approach:Math.sign(nearest.x-u.x)||b.navigationOrientation};
    }
    const r=u.combat.retaliation,target=r&&b.unit(r.targetId);
    if(!r)return false;
    if(!target||target.health.current<=0||b.time>r.until||Math.max(Math.abs(target.x-r.x),Math.abs(target.y-r.y))>6){u.combat.retaliation=null;return false;}
    if(u.healing||!u.combat.auto||u.combat.holdPosition||u.command?.type==='attack'||b.inAttackRange(u,target))return false;
    // Short, occupancy-aware interception. No additional commands or waypoint
    // queue; normal movement resumes when contact ends or the attacker leaves.
    const start=this.index(u.x,u.y),queue=[{cell:start,first:null}],seen=new Set([start]);
    const pursuer={x:u.x,command:{type:'attack',target:target.id,flow:r.approach<0?'west':'east'}};
    for(let head=0;head<queue.length&&head<48&&this.remaining>0;head++){
      const node=queue[head],p=this.coords(node.cell);this.consume();
      const actor={visualX:p.x,visualY:p.y};
      const dx=Math.abs(p.x-target.visualX),dy=Math.abs(p.y-target.visualY);
      if(node.first&&(u.combat.shape==='king'?Math.max(dx,dy):dx+dy)<=u.combat.range+1e-6&&hasLineOfSight(b,actor,target))return !!this.requestStep(u,node.first);
      for(const n of this.neighbors(node.cell,pursuer)){
        if(seen.has(n)||!this.free(n,u))continue;
        const next=this.coords(n);
        if(Math.max(Math.abs(next.x-r.x),Math.abs(next.y-r.y))>3)continue;
        seen.add(n);queue.push({cell:n,first:node.first||next});
      }
    }
    return false;
  }
  keepDistance(u){
    const b=this.board,preferred=u.combat.preferredRange,target=b.unit(u.combat.targetId);
    if(u.command||u.combat.formationLocked||u.combat.retaliation||u.combat.holdPosition||!u.combat.auto||!(preferred>1)||!target||target.health.current<=0||target.team===u.team||b.time<(u.combat.spacingAt||0))return false;
    const metric=(x,y)=>u.combat.shape==='king'?Math.max(Math.abs(x-target.visualX),Math.abs(y-target.visualY)):Math.abs(x-target.visualX)+Math.abs(y-target.visualY);
    const distance=metric(u.x,u.y);
    if(distance>=preferred)return false;
    let best=null,score=distance;
    for(const n of this.neighbors(this.index(u.x,u.y),u))if(this.free(n,u)){
      const p=this.coords(n),d=metric(p.x,p.y);
      if(d>score&&d<=u.combat.range){score=d;best=p;}
    }
    if(!best)return false;
    if(!this.requestStep(u,best))return false;u.combat.spacingAt=b.time+.6;return true;
  }
  offer(u,next){
    if(this.collecting){this.intents.set(u.id,{u,next,command:u.command,courtesy:u.courtesy});return;}
    this.board.beginStep(u,next);u.waitReason=null;u.waitSince=null;u.retryAt=0;
  }
  waitingAge(u){
    const now=this.board.time,inherited=u.courtesy?.chain.root.waitSince;
    return now-Math.min(u.waitSince??now,inherited??now);
  }
  startCollection(){this.collecting=true;this.intents=new Map();}
  commit(){
    const b=this.board,winners=new Map();this.collecting=false;
    for(const intent of this.intents.values()){
      const {u,next}=intent;
      if(b.unit(u.id)!==u||u.health.current<=0||u.command!==intent.command||intent.courtesy&&u.courtesy!==intent.courtesy||u.step||!['idle','walk'].includes(u.state))continue;
      const key=this.index(next.x,next.y),old=winners.get(key);
      const age=this.waitingAge(u),oldAge=old?this.waitingAge(old.u):-1;
      const rank=mix(u.priorityKey^b.decisionEpoch),oldRank=old?mix(old.u.priorityKey^b.decisionEpoch):0;
      if(!old||age>oldAge||age===oldAge&&rank>oldRank)winners.set(key,intent);
    }
    for(const intent of this.intents.values()){
      const {u,next,command}=intent;
      if(b.unit(u.id)!==u||u.health.current<=0||u.command!==command||intent.courtesy&&u.courtesy!==intent.courtesy||u.step||!['idle','walk'].includes(u.state))continue;
      if(winners.get(this.index(next.x,next.y))!==intent||!this.free(this.index(next.x,next.y),u)){
        u.route.unshift(next);this.wait(u,'traffic',.12);continue;
      }
      b.beginStep(u,next);u.waitReason=null;u.waitSince=null;u.retryAt=0;
    }
    this.intents.clear();
  }
  schedule() {
    const units=this.board.units,n=units.length;if(!n)return;
    this.board.decisionEpoch++;this.cursor=(this.cursor+1)%n;this.startCollection();
    try{
      for(const old of [true,false])for(let i=0;i<n;i++) {
        const u=units[(i+this.cursor)%n];
        if((this.waitingAge(u)>=.5)===old)this.plan(u);
      }
    }finally{this.commit();}
  }
}
