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
    this.remaining=SEARCH_BUDGET;
    this.stats={fieldBuilds:0,cacheHits:0,detours:0,expansions:0,lastExpansions:0};
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
      for(const n of this.neighbors(cell,u))if(!previous.has(n)&&this.free(n,u)&&previous.size<LOCAL_LIMIT) {
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
    if(u.staticSearch?.key!==key||u.staticSearch.start!==start)u.staticSearch={key,start,open:[{cell:start,g:0,f:heuristic(start)}],cost:new Map([[start,0]]),previous:new Map()};
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
        const g=current.g+1;if(g>=(search.cost.get(n)??Infinity))continue;
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
  plan(u) {
    const b=this.board;
    if(u.step||!['idle','walk'].includes(u.state))return;
    if(tryHeal(b,u))return;
    if(this.keepDistance(u))return;
    if(b.unit(u.id)!==u||u.health.current<=0||u.step||!['idle','walk'].includes(u.state))return;
    if(b.tryAutoAttack(u))return;
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
        const route=this.staticRoute(u,x,y,routeKey);
        if(route===false){b.cancelCommand(u);u.waitReason='unreachable';return;}
        if(!route){this.wait(u,'planning',NAV_INTERVAL);return;}
        u.guide=route;u.guideKey=routeKey;u.route=[];
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
      // Let a moving neighbor finish before spending any local search budget.
      if(!blocker?.command||waited>=u.movement.waitBeforeDetour) {
        // A detour must rejoin a future route cell, never its origin. This
        // prevents sideways oscillation and preserves static obstacle guidance.
        const potential=new Map(u.guide.map((cell,i)=>[cell,u.guide.length-i]));
        const route=u.recovery?null:this.detour(u,{at:cell=>cell===start?u.guide.length+1:(potential.get(cell)??-1)},start);
        if(route?.length){next=route.shift();u.route=route;}
      }
      if(!next&&waited>=.24&&(!blocker?.command||waited>=1)&&b.time>=(u.recoveryRetryAt||0)){
        const route=this.recover(u,start);
        if(route?.length){next=route.shift();u.route=route;}
      }
      if(!next&&!blocker&&waited>=.5) {
        // Several courtesy yields can drift outside the small local search.
        // Re-anchor the compact guide instead of retrying the same dead end.
        u.guideKey=null;this.wait(u,'replanning',NAV_INTERVAL);return;
      }
      // A passing bay can require temporary motion away from the goal. Yield
      // sideways, hold long enough for the opposing unit to clear the lane.
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
    const b=this.board,command=u.command;
    const decision=b.movementPolicy?.beforeStep?.({board:b,unit:u,from:{x:u.x,y:u.y},to:{...next},obstacle:b.obstacles.get(this.index(next.x,next.y))})||'move';
    if(b.unit(u.id)!==u||u.health.current<=0||u.command!==command||u.step||!['idle','walk'].includes(u.state))return;
    if(decision==='cancel'){b.cancelCommand(u);return;}
    if(decision!=='move'){this.wait(u,'condition');return;}
    // Hooks may change the board; validate once more before reserving.
    if(!this.free(this.index(next.x,next.y),u)){this.wait(u,'traffic');return;}
    this.offer(u,next);return true;
  }
  keepDistance(u){
    const b=this.board,preferred=u.combat.preferredRange,target=b.unit(u.combat.targetId);
    if(u.command?.type==='attack'||u.combat.holdPosition||!u.combat.auto||!(preferred>1)||!target||target.health.current<=0||target.team===u.team||b.time<(u.combat.spacingAt||0))return false;
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
    if(this.collecting){this.intents.set(u.id,{u,next,command:u.command});return;}
    this.board.beginStep(u,next);u.waitReason=null;u.waitSince=null;u.retryAt=0;
  }
  startCollection(){this.collecting=true;this.intents=new Map();}
  commit(){
    const b=this.board,winners=new Map();this.collecting=false;
    for(const intent of this.intents.values()){
      const {u,next}=intent;
      if(b.unit(u.id)!==u||u.health.current<=0||u.command!==intent.command||u.step||!['idle','walk'].includes(u.state))continue;
      const key=this.index(next.x,next.y),old=winners.get(key);
      const age=b.time-(u.waitSince??b.time),oldAge=old?b.time-(old.u.waitSince??b.time):-1;
      const rank=mix(u.priorityKey^b.decisionEpoch),oldRank=old?mix(old.u.priorityKey^b.decisionEpoch):0;
      if(!old||age>oldAge||age===oldAge&&rank>oldRank)winners.set(key,intent);
    }
    for(const intent of this.intents.values()){
      const {u,next,command}=intent;
      if(b.unit(u.id)!==u||u.health.current<=0||u.command!==command||u.step||!['idle','walk'].includes(u.state))continue;
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
        if((u.waitSince!=null&&this.board.time-u.waitSince>=.5)===old)this.plan(u);
      }
    }finally{this.commit();}
  }
}
