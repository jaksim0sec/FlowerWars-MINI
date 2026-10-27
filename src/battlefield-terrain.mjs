export const terrainNames={grass:'개활지',soil:'흙',road:'길 · 이동 속도 +20%',forest:'연못 · 진입 불가'};
export function terrainAt(board,x,y){return board.terrain[Math.round(y)]?.[Math.round(x)]||'grass';}
export function terrainStepMultiplier(board,from,to){
 const speed=p=>terrainAt(board,p.x,p.y)==='road'?1.2:1;
 return 2/(speed(from)+speed(to));
}
export const BATTLEFIELD_WIDTH=144;
export const BATTLEFIELD_HEIGHT=112;
// Strategic coordinates keep doctrine proportions while local combat distances
// and movement speed remain in actual tiles.
export const fieldX=(board,x)=>Math.round(x*(board.width-1)/99);
export const fieldY=(board,y)=>Math.round(y*(board.height-1)/99);
export const battlefieldLanes=board=>board.battlefield?.lanes||[20,50,80].map(y=>fieldY(board,y));
export function battlefieldLane(board,y){
 const lanes=battlefieldLanes(board);let best=0;
 for(let i=1;i<lanes.length;i++)if(Math.abs(y-lanes[i])<Math.abs(y-lanes[best]))best=i;
 return best;
}
function randomFor(seed){let n=seed>>>0;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
function segmentDistance(x,y,a,b){
 const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));
 return Math.hypot(x-a.x-t*dx,y-a.y-t*dy);
}
/** Seeded, rotationally balanced lake sectors around a protected battlefield.
 * Carve guarantees BEFORE placing water: two broad approaches, two narrow
 * bypasses and four side entries. Work runs once, never in the frame loop. */
export function createBattlefield(board){
 const random=randomFor(board.seed),w=board.width,h=board.height,cx=(w-1)/2,cy=(h-1)/2;
 const sx=w/144,sy=h/112,shift=Math.round((random()-.5)*8*sy);
 const upper=Math.round(20*sy+shift),lower=h-1-upper;
 const rx=(18+random()*3)*sx,ry=(14+random()*3)*sy;
 const entrance=(4+Math.floor(random()*2))*sy,flank=2*sy;
 const left={x:5*sx,y:cy},right={x:w-1-left.x,y:cy};
 const main=[left,{x:cx-rx-5*sx,y:cy+shift},{x:cx,y:cy},{x:cx+rx+5*sx,y:cy-shift},right];
 const top=[left,{x:27*sx,y:upper},{x:cx-12*sx,y:upper-2*sy},{x:cx+13*sx,y:upper+2*sy},{x:w-1-27*sx,y:upper},right];
 const rotate=p=>({x:w-1-p.x,y:h-1-p.y});
 const bottom=top.map(rotate).reverse();
 const entryX=cx-(9+random()*5)*sx;
 const entry=[{x:entryX-5*sx,y:upper},{x:entryX,y:cy-ry+2*sy},{x:cx-8*sx,y:cy-5*sy}];
 const entries=[entry,entry.map(rotate),entry.map(p=>({x:w-1-p.x,y:p.y})),entry.map(p=>({x:p.x,y:h-1-p.y}))];
 const paths=[{points:main,radius:entrance},{points:top,radius:flank},{points:bottom,radius:flank},...entries.map(points=>({points,radius:1.5*Math.min(sx,sy)}))];
 const lakes=[];
 // Paired irregular lobes leave broken shores instead of one enclosed ring.
 for(const sign of [-1,1]){
  const lake={x:cx-(23+random()*4)*sx,y:cy+sign*(24+random()*3)*sy,rx:(17+random()*3)*sx,ry:(18+random()*3)*sy,phase:random()*6.28};
  lakes.push(lake,{...lake,...rotate(lake),phase:lake.phase+Math.PI});
 }
 const cap={x:cx+(random()-.5)*8*sx,y:cy-ry-10*sy,rx:(20+random()*3)*sx,ry:10*sy,phase:random()*6.28};
 lakes.push(cap,{...cap,...rotate(cap),phase:cap.phase+Math.PI});
 const segments=paths.flatMap(path=>path.points.slice(1).map((b,i)=>({a:path.points[i],b,radius:path.radius})));
 board.obstacles.clear();
 const protectedCells=new Uint8Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const road=segments.some(s=>segmentDistance(x,y,s.a,s.b)<=s.radius);
  const clearing=((x-cx)/rx)**2+((y-cy)/ry)**2<=1;
  const home=Math.min(x,w-1-x)<25*sx;
  const water=!road&&!clearing&&!home&&lakes.some(l=>{
   const dx=(x-l.x)/l.rx,dy=(y-l.y)/l.ry,angle=Math.atan2(dy,dx);
   return dx*dx+dy*dy<1+.12*Math.sin(angle*3+l.phase)+.06*Math.cos(angle*5-l.phase);
  });
  board.terrain[y][x]=water?'forest':road?'road':'grass';
  if(road||clearing||home)protectedCells[y*w+x]=1;
  if(water)board.obstacles.set(y*w+x,{kind:'forest',blocked:true});
 }
 board.battlefield={seed:board.seed,lanes:[upper,Math.round(cy),lower],clearing:{x:cx,y:cy,rx,ry},paths,protectedCells};
 board.terrainRevision++;board.obstacleRevision++;board.navigation.invalidate();
}
