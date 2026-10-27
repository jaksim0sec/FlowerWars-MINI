const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
export const kindOf=u=>`${u.unitType||u.character?.characterId||u.formationRole||'soldier'}:${u.combat.range}:${!!u.healing}`;
export function forwardFor(s){return s.order?.forward||{x:s.order?.facing||(s.team==='B'?-1:1),y:0};}

// A temporary intruder must never relocate every seat of an existing formation.
export function repairOccupiedSeats(board,squad,units,otherGoals=[]){
 const goals=squad.order.goals,own=new Set(units.map(u=>u.id));
 const claimed=new Set([...goals.values()].map(p=>p.y*board.width+p.x));
 for(const p of otherGoals)claimed.add(p.y*board.width+p.x);
 for(const [id,seat]of goals){
  const occupant=board.at(seat.x,seat.y);
  if(!occupant||own.has(occupant.id)||occupant.command||occupant.step)continue;
  let replacement=null;
  for(let r=1;r<=3&&!replacement;r++)for(let dx=-r;dx<=r&&!replacement;dx++)for(let dy=-r;dy<=r;dy++){
   if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;
   const x=seat.x+dx,y=seat.y+dy,key=y*board.width+x;
   if(!board.inside(x,y)||claimed.has(key)||board.navigation.blocked(key)||board.occupied(x,y))continue;
   if(squad.botOperation?.role==='guard'&&board.match&&Math.max(Math.abs(x-board.match.flags.B.x),Math.abs(y-board.match.flags.B.y))>16)continue;
   replacement={x,y};claimed.add(key);break;
  }
  if(!replacement)continue;
  goals.set(id,replacement);
  const unit=board.unit(id);if(unit){board.interrupt(unit);unit.reformSearch=null;}
 }
}

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

// Pass a vacant seat through settled soldiers of the same kind. Each relay
// moves one tile; the distant soldier's destination gets one tile closer.
export function relayFormationVacancies(board,units,goals){
 const byCell=new Map(units.filter(u=>!u.step).map(u=>[u.x+','+u.y,u]));
 for(const owner of units){
  const hole=goals.get(owner.id);
  if(!hole||owner.step||owner.strike||distance(owner,hole)<=1||board.occupied(hole.x,hole.y))continue;
  for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){
   const relay=byCell.get((hole.x+dx)+','+(hole.y+dy)),seat=relay&&goals.get(relay.id);
   if(!relay||relay.command||relay.strike||!seat||distance(relay,seat)!==0||kindOf(relay)!==kindOf(owner)||1+distance(owner,relay)>distance(owner,hole))continue;
   goals.set(relay.id,hole);goals.set(owner.id,seat);board.cancelCommand(owner);owner.reformSearch=null;
   break;
  }
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
 const ordered=[...guards,...melee,...support],rows=[];
 for(let i=0;i<ordered.length;i++){
  const rowWidth=Math.min(width,ordered.length-Math.floor(i/width)*width);
  rows.push({unit:ordered[i],depth:Math.floor(i/width)*gap,lane:(i%width-Math.floor(rowWidth/2))*gap});
 }
 if(lead)rows.push({unit:lead,depth:Math.ceil(ordered.length/width)*gap,lane:0});
 let offsets=rows.map(r=>({x:-f.x*r.depth+side.x*r.lane,y:-f.y*r.depth+side.y*r.lane}));
 if(formation==='square'){
  const edge=[],inside=[],radius=units.length>17?3:2;
  for(let y=-radius;y<=radius;y++)for(let x=-radius;x<=radius;x++)if(x||y)(Math.max(Math.abs(x),Math.abs(y))===radius?edge:inside).push({x,y});
  const outer=rows.filter(r=>r.unit!==lead&&band(r.unit)===0),inner=rows.filter(r=>r.unit!==lead&&band(r.unit)!==0);
  const angular=(a,b)=>Math.atan2(a.y,a.x)-Math.atan2(b.y,b.x);
  edge.sort(angular);inside.sort(angular);
  const count=outer.length+inner.length,innerCount=Math.min(inner.length,Math.max(0,count-Math.max(4,outer.length)));
  const sample=(ring,n)=>Array.from({length:n},(_,i)=>ring[Math.floor(i*ring.length/n)]);
  const perimeter=sample(edge,count-innerCount),core=sample(inside,innerCount);
  rows.splice(0,rows.length,...outer,...inner,...(lead?[{unit:lead}]:[]));
  offsets=rows.map(r=>r.unit===lead?{x:0,y:0}:band(r.unit)===0?perimeter.shift():core.shift()||perimeter.shift());
 }
 if(squad.travelOffsets){
  rows.splice(0,rows.length,...units.map(unit=>({unit})));
  offsets=units.map(u=>squad.travelOffsets.get(u.id)||{x:0,y:0});
 }
 const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
 const bounds=axis=>[Math.min(...offsets.map(p=>p[axis])),Math.max(...offsets.map(p=>p[axis]))];
 const [minX,maxX]=bounds('x'),[minY,maxY]=bounds('y');
 const marginX=board.width>maxX-minX+2?1:0,marginY=board.height>maxY-minY+2?1:0;
 center={x:clamp(center.x,marginX-minX,board.width-1-marginX-maxX),y:clamp(center.y,marginY-minY,board.height-1-marginY-maxY)};
 const claimed=new Set(otherGoals),own=new Set(units.map(u=>u.id)),positions=[];
 if(squad.reforming){
  const desired={...center};let fitted=null;
  for(let r=0;r<=14&&!fitted;r++)for(let dx=-r;dx<=r&&!fitted;dx++)for(let dy=-r;dy<=r;dy++){
   if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;
   const candidate={x:desired.x+dx,y:desired.y+dy};let free=true;
   for(let x=candidate.x+minX-1;x<=candidate.x+maxX+1&&free;x++)for(let y=candidate.y+minY-1;y<=candidate.y+maxY+1;y++){
    const key=y*board.width+x,occupant=board.at(x,y);
    if(!board.inside(x,y)||board.navigation.blocked(key)||claimed.has(key)||occupant&&!own.has(occupant.id)){free=false;break;}
   }
   if(free){fitted=candidate;break;}
  }
  if(fitted)center=fitted;
 }
 for(let i=0;i<rows.length;i++){
  const wanted={x:center.x+offsets[i].x,y:center.y+offsets[i].y};let best=null;
  for(let radius=0;radius<=12&&!best;radius++)for(let dx=-radius;dx<=radius&&!best;dx++)for(let dy=-radius;dy<=radius;dy++){
   if(Math.max(Math.abs(dx),Math.abs(dy))!==radius)continue;
   const x=wanted.x+dx,y=wanted.y+dy,key=y*board.width+x,occupant=board.at(x,y),reserved=board.reservations.get(key);
   if(squad.botOperation?.role==='guard'&&board.match){const flag=board.match.flags.B;if(Math.max(Math.abs(x-flag.x),Math.abs(y-flag.y))>16)continue;}
   if(!board.inside(x,y)||board.navigation.blocked(key)||claimed.has(key)||occupant&&!own.has(occupant.id)||reserved&&!own.has(reserved))continue;
   // A fallback must stay behind the front for the commander.
   if(!squad.travelOffsets&&formation!=='square'&&rows[i].unit.id===lead?.id&&positions.some(p=>p&&(x-p.x)*f.x+(y-p.y)*f.y>=0))continue;
   best={x,y};claimed.add(key);break;
  }
  positions.push(best||null);
 }
 const groups=new Map(),result=[];
 rows.forEach((r,i)=>{if(!positions[i])return;const key=r.unit.id===lead?.id?'commander':kindOf(r.unit)+':'+(escorts.includes(r.unit)?'escort':'rank');if(!groups.has(key))groups.set(key,{units:[],positions:[]});groups.get(key).units.push(r.unit);groups.get(key).positions.push(positions[i]);});
 for(const group of groups.values())result.push(...match(group.units,group.positions));
 return result;
}
