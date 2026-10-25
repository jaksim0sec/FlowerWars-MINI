const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
export const kindOf=u=>`${u.character?.characterId||u.formationRole||'soldier'}:${u.combat.range}:${!!u.healing}`;
export function forwardFor(s){return s.order?.forward||{x:s.order?.facing||(s.team==='B'?-1:1),y:0};}

// Same-role positions have no personal owner: a soldier already on a matching
// slot keeps it, including soldiers arriving through a different passing lane.
export function settleFormation(units,goals){
 const owners=new Map([...goals].map(([id,p])=>[p.x+','+p.y,id]));
 const byId=new Map(units.map(u=>[u.id,u]));
 for(const u of units){
  if(u.step)continue;
  const owner=owners.get(u.x+','+u.y),other=byId.get(owner),previous=goals.get(u.id);
  if(!other||owner===u.id||!previous||kindOf(other)!==kindOf(u))continue;
  const here=goals.get(owner);goals.set(u.id,here);goals.set(owner,previous);
  owners.set(here.x+','+here.y,u.id);owners.set(previous.x+','+previous.y,owner);
 }
}

// Minimum total Manhattan assignment within a role (Hungarian algorithm).
function match(units,positions){
 const n=units.length,u=Array(n+1).fill(0),v=[...u],p=[...u],way=[...u];
 for(let i=1;i<=n;i++){
  p[0]=i;let j0=0;const min=Array(n+1).fill(Infinity),used=Array(n+1).fill(false);
  do{
   used[j0]=true;const i0=p[j0];let delta=Infinity,j1=0;
   for(let j=1;j<=n;j++)if(!used[j]){
    const cost=distance(units[i0-1].step||units[i0-1],positions[j-1])-u[i0]-v[j];
    if(cost<min[j]){min[j]=cost;way[j]=j0;}
    if(min[j]<delta){delta=min[j];j1=j;}
   }
   for(let j=0;j<=n;j++)if(used[j]){u[p[j]]+=delta;v[j]-=delta;}else min[j]-=delta;
   j0=j1;
  }while(p[j0]!==0);
  do{const j1=way[j0];p[j0]=p[j1];j0=j1;}while(j0);
 }
 return positions.map((position,j)=>[units[p[j+1]-1],position]);
}
function band(u){
 if(u.healing||u.formationRole==='healer'||u.formationRole==='support')return 2;
 if(u.combat.range>1||['archer','clover-mage','scholar'].includes(u.character?.characterId))return 2;
 return 0;
}
export function planFormation(board,squad,center,units,lead,otherGoals){
 const f=forwardFor(squad),side={x:-f.y,y:f.x},formation=squad.formation;
 const gap=formation==='spread'?2:1,width=formation==='column'?2:formation==='line'?Math.min(6,Math.max(3,Math.ceil(Math.sqrt(units.length)*1.5))):4;
 const fighters=units.filter(u=>u.id!==lead?.id);
 const guards=fighters.filter(u=>u.character?.characterId==='shield-guard'||u.formationRole==='guard');
 const melee=fighters.filter(u=>!guards.includes(u)&&band(u)===0);
 const support=fighters.filter(u=>!guards.includes(u)&&!melee.includes(u));
 const escortPool=melee.length>=2?melee:guards.length>=3?guards:[];
 const escorts=escortPool.slice().sort((a,b)=>distance(a,lead)-distance(b,lead)||a.id-b.id).slice(0,2);
 const rows=[];let rank=0;
 for(const group of [guards,melee,support]){
  const members=group.filter(u=>!escorts.includes(u));
  for(let i=0;i<members.length;i++)rows.push({unit:members[i],depth:rank+Math.floor(i/width)*gap,lane:(i%width-Math.floor(Math.min(width,members.length-Math.floor(i/width)*width)/2))*gap});
  rank+=Math.ceil(members.length/width)*gap;
 }
 for(let i=0;i<escorts.length;i++)rows.push({unit:escorts[i],depth:rank,lane:(i===0?-1:1)*gap});
 if(lead)rows.push({unit:lead,depth:rank+gap,lane:0});
 const offsets=rows.map(r=>({x:-f.x*r.depth+side.x*r.lane,y:-f.y*r.depth+side.y*r.lane}));
 const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
 const bounds=axis=>[Math.min(...offsets.map(p=>p[axis])),Math.max(...offsets.map(p=>p[axis]))];
 const [minX,maxX]=bounds('x'),[minY,maxY]=bounds('y');
 const marginX=board.width>maxX-minX+2?1:0,marginY=board.height>maxY-minY+2?1:0;
 center={x:clamp(center.x,marginX-minX,board.width-1-marginX-maxX),y:clamp(center.y,marginY-minY,board.height-1-marginY-maxY)};
 const claimed=new Set(otherGoals),own=new Set(units.map(u=>u.id)),positions=[];
 for(let i=0;i<rows.length;i++){
  const wanted={x:center.x+offsets[i].x,y:center.y+offsets[i].y};let best=null;
  for(let radius=0;radius<=12&&!best;radius++)for(let dx=-radius;dx<=radius&&!best;dx++)for(let dy=-radius;dy<=radius;dy++){
   if(Math.max(Math.abs(dx),Math.abs(dy))!==radius)continue;
   const x=wanted.x+dx,y=wanted.y+dy,key=y*board.width+x,occupant=board.at(x,y),reserved=board.reservations.get(key);
   if(!board.inside(x,y)||board.navigation.blocked(key)||claimed.has(key)||occupant&&!own.has(occupant.id)||reserved&&!own.has(reserved))continue;
   // A fallback must stay behind the front for the commander.
   if(rows[i].unit.id===lead?.id&&positions.some(p=>p&&(x-p.x)*f.x+(y-p.y)*f.y>=0))continue;
   best={x,y};claimed.add(key);break;
  }
  positions.push(best||null);
 }
 const groups=new Map(),result=[];
 rows.forEach((r,i)=>{if(!positions[i])return;const key=r.unit.id===lead?.id?'commander':kindOf(r.unit)+':'+(escorts.includes(r.unit)?'escort':'rank');if(!groups.has(key))groups.set(key,{units:[],positions:[]});groups.get(key).units.push(r.unit);groups.get(key).positions.push(positions[i]);});
 for(const group of groups.values())result.push(...match(group.units,group.positions));
 return result;
}
