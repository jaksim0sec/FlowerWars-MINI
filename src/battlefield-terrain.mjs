// Mirrored strategic layout with organic coastlines and broad open central ground.
export const KINGDOM_WALLS={A:27,B:72};
export const GATE_FROM=40,GATE_TO=60,GATE_SEGMENT_LENGTH=4;
export const terrainNames={
 grass:'개활지',soil:'흙',road:'길 · 이동 속도 +20%',
 forest:'연못 · 진입 불가',pond:'연못 · 진입 불가',
 grove:'숲 · 이동 속도 -15%',wall:'목책 · 진입 불가',gate:'관문'
};
export function terrainAt(board,x,y){return board.terrain[Math.round(y)]?.[Math.round(x)]||'grass';}
export function terrainStepMultiplier(board,from,to){
 const speed=p=>{const t=terrainAt(board,p.x,p.y);return t==='road'?1.2:t==='grove'?.85:1;};
 return 2/(speed(from)+speed(to));
}
export function gateSegmentAt(x,y){
 if(!Number.isInteger(x)||!Number.isInteger(y))return null;
 const team=x===KINGDOM_WALLS.A?'A':x===KINGDOM_WALLS.B?'B':null;
 if(!team||y<GATE_FROM||y>=GATE_TO)return null;
 return {team,index:Math.floor((y-GATE_FROM)/GATE_SEGMENT_LENGTH)};
}
const ellipse=(x,y,cx,cy,rx,ry,i=0)=>{
 const a=(x-cx)/rx,b=(y-cy)/ry;
 return a*a+b*b<1+.11*Math.sin(x*.37+y*.23+i)+.05*Math.cos(x*.19-y*.38-i);
};
// Small asymmetric details inside mirrored macro geography prevent strictly
// straight bands. All hard barriers are at the kingdom edges, not the arena.
const pond=(x,y)=>{
 const mx=Math.min(x,99-x);
 return [
  [6,7,11,9],[9,94,12,9],
  [3,34,6,10],[4,67,6,11],
  [27,8,6,10],[27,91,6,10],
  [37,2,8,4],[34,97,8,4]
 ].some(([cx,cy,rx,ry],i)=>ellipse(mx,y,cx,cy,rx,ry,i));
};
const grove=(x,y)=>{
 const mx=Math.min(x,99-x);
 return [
  [11,23,8,10],[14,76,9,10],
  [6,51,4,7],[20,35,5,5],[19,65,5,5],
  [39,10,10,7],[35,89,9,7]
 ].some(([cx,cy,rx,ry],i)=>ellipse(mx,y,cx,cy,rx,ry,i+4));
};
function segmentDistance(x,y,ax,ay,bx,by){
 const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1)));
 return Math.hypot(x-ax-t*dx,y-ay-t*dy);
}
// Curved roads are restricted to the owners' rear. The central battle is wide
// open meadow; an actual front line must be formed with soldiers, not roads.
function curve(start,control,end,steps=12){
 const pts=[];
 for(let i=0;i<=steps;i++){const t=i/steps,u=1-t;pts.push([u*u*start[0]+2*u*t*control[0]+t*t*end[0],u*u*start[1]+2*u*t*control[1]+t*t*end[1]]);}
 return pts;
}
const rearPaths=[
 curve([5,50],[15,48],[27,50]),
 [...curve([7,49],[7,22],[15,22]),...curve([15,22],[25,20],[25,42])],
 [...curve([7,51],[7,78],[15,78]),...curve([15,78],[25,79],[25,58])],
 curve([12,28],[19,50],[12,72])
];
function kingdomRoad(x,y){
 const mx=Math.min(x,99-x);
 if(mx>27||mx<3)return false;
 for(const line of rearPaths)for(let i=1;i<line.length;i++){
   if(segmentDistance(mx,y,...line[i-1],...line[i])<1.65)return true;
 }
 return false;
}
export function createBattlefield(board){
 board.obstacles.clear();
 for(let y=0;y<board.height;y++)for(let x=0;x<board.width;x++){
  let type='grass',atWall=x===KINGDOM_WALLS.A||x===KINGDOM_WALLS.B;
  if(atWall)type=y>=GATE_FROM&&y<GATE_TO?'gate':(y<20||y>=80?'pond':'wall');
  else if(pond(x,y))type='pond';
  else if(kingdomRoad(x,y))type='road';
  else if(grove(x,y))type='grove';
  board.terrain[y][x]=type;
  if(type==='pond'||type==='wall')board.obstacles.set(y*board.width+x,{kind:type,blocked:true});
 }
 board.terrainRevision++;board.obstacleRevision++;board.navigation.invalidate();
}
