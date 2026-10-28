import {squadsFor} from '../unit-groups.mjs';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export class Observer{
 constructor(match){this.match=match;this.revision=-1;this.builds=0;}
 topology(){
  const b=this.match.board;if(this.revision===b.obstacleRevision)return;
  this.revision=b.obstacleRevision;this.builds++;this.nodes=[];this.distances=new Map();
  const nearest=p=>{for(let r=0;r<16;r++)for(let dx=-r;dx<=r;dx++)for(let dy=-r;dy<=r;dy++){if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;const x=Math.round(p.x)+dx,y=Math.round(p.y)+dy;if(b.inside(x,y)&&!b.navigation.blocked(y*b.width+x))return {x,y};}return null;};
  const add=(id,kind,p,width=12)=>{const point=nearest(p);if(!point)return;const node={id,kind,...point,width,index:this.nodes.length,edges:new Map()};this.nodes.push(node);return node;};
  for(const room of b.battlefield?.rooms||[])add(room.id,room.kind,room,Math.min(room.rx,room.ry)*2);
  for(const path of b.battlefield?.paths||[]){let last=null;for(let i=0;i<path.points.length;i++){const point=path.points[i];if(last&&distance(last,point)<9&&i!==path.points.length-1)continue;last=point;add(path.id+':'+i,path.kind,point,path.minWidth);}}
  for(const defense of b.battlefield?.defenses||[]){const p=defense.points[0];add(defense.id,'defense',{x:p.x+(defense.team==='B'?5:-5),y:p.y},8);}
  add('objective-A','objective',this.match.flags.A);add('objective-B','objective',this.match.flags.B);
  this.owner=new Int16Array(b.width*b.height).fill(-1);const depth=new Int16Array(this.owner.length),queue=new Int32Array(this.owner.length);let head=0,tail=0;
  for(const node of this.nodes){const n=node.y*b.width+node.x;if(this.owner[n]>=0){node.alias=this.owner[n];continue;}this.owner[n]=node.index;queue[tail++]=n;}
  while(head<tail){const cell=queue[head++],a=this.owner[cell];for(const next of b.navigation.neighbors(cell)){if(next<0||b.navigation.blocked(next))continue;const c=this.owner[next];if(c<0){this.owner[next]=a;depth[next]=depth[cell]+1;queue[tail++]=next;}else if(c!==a){const cost=depth[cell]+depth[next]+1,old=this.nodes[a].edges.get(c)??Infinity;if(cost<old){this.nodes[a].edges.set(c,cost);this.nodes[c].edges.set(a,cost);}}}}
  for(const n of this.nodes)if(n.alias!==undefined){n.edges.set(n.alias,0);this.nodes[n.alias].edges.set(n.index,0);}
 }
 nodeAt(p){const b=this.match.board;const x=Math.max(0,Math.min(b.width-1,Math.round(p.x))),y=Math.max(0,Math.min(b.height-1,Math.round(p.y)));const owner=this.owner[y*b.width+x];if(owner>=0)return this.nodes[owner];
  // A formation centroid may lie inside a lake while every member is legal.
  for(let r=1;r<=10;r++)for(let dx=-r;dx<=r;dx++)for(const dy of [-r,r]){const xx=x+dx,yy=y+dy;if(b.inside(xx,yy)&&this.owner[yy*b.width+xx]>=0)return this.nodes[this.owner[yy*b.width+xx]];}
  for(let r=1;r<=10;r++)for(let dy=-r;dy<=r;dy++)for(const dx of [-r,r]){const xx=x+dx,yy=y+dy;if(b.inside(xx,yy)&&this.owner[yy*b.width+xx]>=0)return this.nodes[this.owner[yy*b.width+xx]];}return null;}
 routes(from){
  if(!from)return null;if(this.distances.has(from.index))return this.distances.get(from.index);
  const costs=new Float64Array(this.nodes.length).fill(Infinity),previous=new Int16Array(costs.length).fill(-1),used=new Uint8Array(costs.length);costs[from.index]=0;
  for(let k=0;k<costs.length;k++){let best=-1;for(let i=0;i<costs.length;i++)if(!used[i]&&(best<0||costs[i]<costs[best]))best=i;if(best<0||!Number.isFinite(costs[best]))break;used[best]=1;for(const [next,cost]of this.nodes[best].edges)if(costs[best]+cost<costs[next]){costs[next]=costs[best]+cost;previous[next]=best;}}
  const result={costs,previous};this.distances.set(from.index,result);return result;
 }
 travel(a,b){const from=a.index!==undefined?a:this.nodeAt(a),to=b.index!==undefined?b:this.nodeAt(b);return from&&to?distance(a,from)+this.routes(from).costs[to.index]+distance(to,b):Infinity;}
 route(a,b){const from=a.index!==undefined?a:this.nodeAt(a),to=b.index!==undefined?b:this.nodeAt(b);if(!from||!to)return [];const routes=this.routes(from);if(!Number.isFinite(routes.costs[to.index]))return [];const result=[];for(let i=to.index;i!==from.index;i=routes.previous[i]){if(i<0)return [];result.push(this.nodes[i]);}return result.reverse();}
 waypoints(start,nodes){
  const b=this.match.board;
  const clear=(a,c)=>{const steps=Math.ceil(Math.hypot(c.x-a.x,c.y-a.y)*2);for(let i=0;i<=steps;i++){const t=steps?i/steps:0,x=Math.round(a.x+(c.x-a.x)*t),y=Math.round(a.y+(c.y-a.y)*t);if(!b.inside(x,y)||b.navigation.blocked(y*b.width+x))return false;}return true;};
  const out=[];let anchor=start;
  for(let i=0;i<nodes.length;){let last=i;for(let j=nodes.length-1;j>i;j--)if(clear(anchor,nodes[j])){last=j;break;}out.push(nodes[last]);anchor=nodes[last];i=last+1;}
  return out;
 }
 observe(){
  this.topology();const b=this.match.board,states=new Map(),regions=this.nodes.map(node=>({node,A:0,B:0,healingA:0,healingB:0,countA:0,countB:0,congestion:0}));
  for(const u of b.units){if(u.health.current<=0||!['A','B'].includes(u.team))continue;
   const health=u.health.current/u.health.max,dps=u.healing?0:u.damage/u.combat.period,range=1+Math.min(8,u.combat.range)*.06,power=(u.formationRole==='banner'?.15:1)*health*(Math.sqrt(u.health.max/100)+dps/35*range);
   const node=this.nodeAt(u);if(node){const r=regions[node.index];r[u.team]+=power;r['count'+u.team]++;if(u.healing)r['healing'+u.team]++;if(u.waitReason)r.congestion++;}
   if(u.team!=='B')continue;
   let s=states.get(u.squadId);if(!s){s={id:u.squadId,squad:squadsFor(b).get(u.squadId),units:[],count:0,x:0,y:0,health:0,maxHealth:0,power:0,heal:0,fire:0,melee:0,shield:0,spear:0,range:0,speed:0,engaged:0};states.set(u.squadId,s);}
   s.units.push(u);s.count++;if(u.formationRole==='guard')s.shield++;if(u.combat.charge)s.spear++;s.range=Math.max(s.range,u.combat.range);s.health+=u.health.current;s.maxHealth+=u.health.max;s.power+=power;s.speed+=1/u.movement.stepTime;if(u.healing)s.heal++;else if(u.formationRole!=='banner'){s.x+=u.x;s.y+=u.y;if(u.combat.range>1)s.fire++;else s.melee++;}if(u.state==='attack')s.engaged++;
  }
  for(const s of states.values()){const n=s.fire+s.melee;if(n){s.x/=n;s.y/=n;}else{s.x=s.units.reduce((a,u)=>a+u.x,0)/s.count;s.y=s.units.reduce((a,u)=>a+u.y,0)/s.count;}s.ratio=s.health/s.maxHealth;s.speed/=s.count;s.node=this.nodeAt(s);}
  const home=this.match.flags.B,homeThreat=b.units.reduce((sum,u)=>sum+(u.team==='A'&&u.health.current>0&&distance(u,home)<20?(u.health.current/u.health.max)*(Math.sqrt(u.health.max/100)+u.damage/u.combat.period/35):0),0),totalEnemy=regions.reduce((n,r)=>n+r.A,0),totalFriendly=regions.reduce((n,r)=>n+r.B,0);
  return {states,regions,homeThreat,totalEnemy,totalFriendly,time:this.match.elapsed,flagHit:this.match.elapsed-(home.lastHitAt??-Infinity)<6};
 }
 local(snapshot,point,radius=24){const key=point.index!==undefined?point.index+':'+radius:null;snapshot.localCache??=new Map();if(key&&snapshot.localCache.has(key))return snapshot.localCache.get(key);const out={A:0,B:0,heal:0,congestion:0};for(const r of snapshot.regions){const d=this.travel(point,r.node);if(d>radius)continue;const weight=1-d/(radius+1);out.A+=r.A*weight;out.B+=r.B*weight;out.heal+=r.healingB*weight;out.congestion+=r.congestion*weight;}if(key)snapshot.localCache.set(key,out);return out;}
}
