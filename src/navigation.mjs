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
  neighbors(index) {
    const w=this.board.width,h=this.board.height,x=index%w,y=Math.floor(index/w);
    return [x+1<w?index+1:-1,y+1<h?index+w:-1,x>0?index-1:-1,y>0?index-w:-1];
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
    const key=`${x},${y},${reach?.shape||'point'},${reach?.range||0}`;
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
    const traffic=b.flows[opposite]>0;
    if(traffic&&Math.abs(dx)>=Math.abs(dy)&&Math.abs(dx)>=4) {
      const lane=laneFor(py,b.height,dx);
      vertical(lane);horizontal(x);vertical(y);
    } else if(traffic&&Math.abs(dy)>=4) {
      const lane=laneFor(px,b.width,dy);
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
      for(const n of this.neighbors(cell))if(!previous.has(n)&&this.free(n,u)&&previous.size<LOCAL_LIMIT) {
        previous.set(n,cell);queue.push(n);
      }
    }
    return null;
  }
  wait(u,reason,delay=.24) {
    u.state='idle';u.path=[];u.waitReason=reason;u.waitSince??=this.board.time;
    u.retryAt=this.board.time+delay+(u.id%4)*.025;
  }
  plan(u) {
    const b=this.board;
    if(u.step||!['idle','walk'].includes(u.state))return;
    if(b.tryAutoAttack(u))return;
    const command=u.command;
    if(!command||b.time<(u.retryAt||0))return;
    let {x,y}=command;
    if(command.type==='attack') {
      const target=b.unit(command.target);
      if(!target||target.health.current<=0){b.cancelCommand(u);return;}
      x=target.x;y=target.y;
      if(b.inAttackRange(u,target,false)){b.beginAttack(u);return;}
    } else if(u.x===x&&u.y===y){b.cancelCommand(u);return;}
    const start=this.index(u.x,u.y),routeKey=`${x},${y},${b.obstacleRevision}`;
    if(u.guideKey!==routeKey) {
      const field=this.field(x,y,command.type==='attack'?{shape:u.combat.shape,range:u.combat.range}:false);
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
        const next=this.neighbors(cell).find(n=>n>=0&&!this.blocked(n)&&field.at(n)===field.at(cell)-1);
        if(next==null)break;
        u.guide.push(next);cell=next;
      }
      u.guideKey=routeKey;u.route=[];
    }
    const reached=u.guide.indexOf(start);
    if(reached>=0)u.guide.splice(0,reached+1);
    if(!u.guide.length){b.cancelCommand(u);return;}
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
    const candidates=this.neighbors(start);
    if(!next) {
      const waited=b.time-(u.waitSince??b.time);
      // Let a moving neighbor finish before spending any local search budget.
      if(!blocker?.command||waited>=.24) {
        // A detour must rejoin a future route cell, never its origin. This
        // prevents sideways oscillation and preserves static obstacle guidance.
        const potential=new Map(u.guide.map((cell,i)=>[cell,u.guide.length-i]));
        const route=this.detour(u,{at:cell=>cell===start?u.guide.length+1:(potential.get(cell)??-1)},start);
        if(route?.length){next=route.shift();u.route=route;}
      }
      if(!next&&!blocker&&waited>=.5) {
        // Several courtesy yields can drift outside the small local search.
        // Re-anchor the compact guide instead of retrying the same dead end.
        u.guideKey=null;this.wait(u,'replanning',NAV_INTERVAL);return;
      }
      // A passing bay can require temporary motion away from the goal. Yield
      // sideways, hold long enough for the opposing unit to clear the lane.
      if(!next&&blocker?.command&&waited>=.65) {
        const dx=blocker.x-u.x,dy=blocker.y-u.y;
        for(const n of candidates)if(this.free(n,u)) {
          const p=this.coords(n);
          if((p.x-u.x)*dx+(p.y-u.y)*dy===0){next=p;u.yieldUntil=b.time+.85;break;}
        }
      }
    }
    if(!next){this.wait(u,'traffic',Math.min(.65,.16+(b.time-(u.waitSince??b.time))*.15));return;}
    const decision=b.movementPolicy?.beforeStep?.({board:b,unit:u,from:{x:u.x,y:u.y},to:{...next},obstacle:b.obstacles.get(this.index(next.x,next.y))})||'move';
    if(b.unit(u.id)!==u||u.health.current<=0||u.command!==command||u.step||!['idle','walk'].includes(u.state))return;
    if(decision==='cancel'){b.cancelCommand(u);return;}
    if(decision!=='move'){this.wait(u,'condition');return;}
    // Hooks may change the board; validate once more before reserving.
    if(!this.free(this.index(next.x,next.y),u)){this.wait(u,'traffic');return;}
    b.beginStep(u,next);u.waitReason=null;u.waitSince=null;u.retryAt=0;
  }
  schedule() {
    const units=this.board.units,n=units.length;if(!n)return;
    this.cursor=(this.cursor+1)%n;
    // Older waiters get first refusal, rotating index breaks ties in O(N).
    for(const old of [true,false])for(let i=0;i<n;i++) {
      const u=units[(i+this.cursor)%n];
      if((u.waitSince!=null&&this.board.time-u.waitSince>=.5)===old)this.plan(u);
    }
  }
}
