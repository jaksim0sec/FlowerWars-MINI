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
const pond=(x,y)=>{
 const mx=Math.min(x,99-x);
 return [[8,5,11,8],[12,94,14,8],[5,36,5,10],[6,65,5,11],[31,6,12,6],[33,94,11,6]]
  .some(([cx,cy,rx,ry],i)=>ellipse(mx,y,cx,cy,rx,ry,i));
};
const grove=(x,y)=>{
 const mx=Math.min(x,99-x);
 return [[13,22,10,10],[15,78,11,10],[5,51,5,8],[37,12,11,7],[38,87,10,8]]
  .some(([cx,cy,rx,ry],i)=>ellipse(mx,y,cx,cy,rx,ry,i+4));
};
function segmentDistance(x,y,ax,ay,bx,by){
 const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1)));
 return Math.hypot(x-ax-t*dx,y-ay-t*dy);
}
function kingdomRoad(x,y){
 const mx=Math.min(x,99-x);
 const segments=[[[7,50],[26,50]],[[8,50],[12,30]],[[12,30],[20,22]],[[20,22],[24,42]],
 [[8,50],[12,70]],[[12,70],[20,79]],[[20,79],[24,58]],[[12,30],[12,70]]];
 return segments.some(([[ax,ay],[bx,by]])=>segmentDistance(mx,y,ax,ay,bx,by)<=3.5);
}
export function createBattlefield(board){
 board.obstacles.clear();
 for(let y=0;y<board.height;y++)for(let x=0;x<board.width;x++){
  let type='grass',atWall=x===KINGDOM_WALLS.A||x===KINGDOM_WALLS.B;
  if(atWall)type=y<GATE_FROM||y>=GATE_TO?(y<13||y>=87?'pond':'wall'):'gate';
  else if(pond(x,y))type='pond';
  else if(kingdomRoad(x,y)||x>27&&x<72&&Math.abs(y-50-Math.sin(Math.min(x,99-x)/9)*2)<1.8)type='road';
  else if(grove(x,y))type='grove';
  board.terrain[y][x]=type;
  if(type==='pond'||type==='wall')board.obstacles.set(y*board.width+x,{kind:type,blocked:true});
 }
 board.terrainRevision++;board.obstacleRevision++;board.navigation.invalidate();
}
