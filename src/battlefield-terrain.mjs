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
function insidePolygon(x,y,points){
 let inside=false;
 for(let i=0,j=points.length-1;i<points.length;j=i++){
  const a=points[i],b=points[j];
  if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;
 }
 return inside;
}
/** Build the tactical spaces first: kingdom, sortie throat, battle basin and
 * outside flank. Water is thin separating terrain, never the central space. */
export function createBattlefield(board){
 const random=randomFor(board.seed),w=board.width,h=board.height,cx=(w-1)/2,cy=(h-1)/2;
 const sx=(w-1)/143,sy=(h-1)/111;
 const point=(x,y)=>({x:x*sx,y:y*sy}),rotate=p=>({x:w-1-p.x,y:h-1-p.y});
 const gateX=29+Math.floor(random()*4),gateHalf=7+Math.floor(random()*3);
 const flankY=12+Math.floor(random()*3),flankHalf=2;
 const bend=(random()-.5)*4,tip=64+Math.floor(random()*4);
 const polygons=[],add=points=>{const p=points.map(([x,y])=>point(x,y));polygons.push(p,p.map(rotate));};
 // The two home-side gate banks reach the map edge. Each has a separate
 // small flank aperture; the central opening has a bounded physical width.
 for(const bottom of [false,true]){
  const flip=y=>bottom?111-y:y;
  add([[gateX-6,flip(0)],[gateX+4,flip(0)],[gateX+5,flip(flankY-flankHalf-1)],[gateX-5,flip(flankY-flankHalf-1)]]);
  add([[gateX-5,flip(flankY+flankHalf+1)],[gateX+4,flip(flankY+flankHalf+1)],
   [gateX+8,flip(37+bend)],[gateX+2,flip(55.5-gateHalf)],[gateX-2,flip(40+bend)]]);
 }
 // Four crescent shores separate the front from the flank. Their ends leave
 // side-entry gaps near the middle; these are openings, not bridges in lakes.
 const crescent=(offset)=>[[gateX+6,40+offset],[gateX+10,26+offset],[46,19+bend+offset],
  [57,18+bend+offset],[tip-2,24+offset],[tip,35+offset],[tip-5,31+offset],
  [54,28+bend+offset],[45,29+bend+offset],[gateX+10,35+offset],[gateX+7,43+offset]];
 add(crescent(0));add(crescent(0).map(([x,y])=>[x,111-y]));
 // A shallow outer shoreline keeps the outside route small enough to defend.
 add([[gateX+3,0],[143-gateX-3,0],[143-gateX-5,flankY-5],[91,flankY-5],
  [75,flankY-6],[55,flankY-5],[gateX+6,flankY-5]]);
 const left=point(5,55.5),right=rotate(left),gate=point(gateX+2,55.5);
 const main=[left,gate,point(71.5,55.5),rotate(gate),right];
 const top=[left,point(gateX-8,flankY),point(gateX+6,flankY),point(71.5,flankY+1),point(137-gateX,flankY),point(151-gateX,flankY),right];
 const bottom=top.map(rotate).reverse();
 const entry=[point((tip+71.5)/2,flankY+1),point((tip+71.5)/2,38),point(71.5,45)];
 const entries=[entry,entry.map(rotate),entry.map(p=>({x:p.x,y:h-1-p.y})),entry.map(p=>({x:w-1-p.x,y:p.y}))];
 const paths=[{points:main,radius:gateHalf*sy},{points:top,radius:flankHalf*sy},{points:bottom,radius:flankHalf*sy},...entries.map(points=>({points,radius:1.5*Math.min(sx,sy)}))];
 const clearing={x:cx,y:cy,rx:24*sx,ry:18*sy};
 // Safety corridors are grass, not a road lattice. Only the short kingdom
 // approaches are surfaced, ending before the open battle basin.
 const segments=paths.flatMap(path=>path.points.slice(1).map((b,i)=>({a:path.points[i],b,radius:path.radius})));
 board.obstacles.clear();const protectedCells=new Uint8Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const n=y*w+x,mirror=w*h-1-n;if(n>mirror)continue;
  const central=((x-cx)/clearing.rx)**2+((y-cy)/clearing.ry)**2<=1;
  const safe=central||segments.some(s=>segmentDistance(x,y,s.a,s.b)<=s.radius);
  const water=!safe&&polygons.some(p=>insidePolygon(x,y,p));
  const approach=x<gate.x||x>w-1-gate.x;
  const road=approach&&segmentDistance(x,y,left,right)<=1.2*sy;
  const terrain=water?'forest':road?'road':'grass';
  board.terrain[y][x]=terrain;board.terrain[h-1-y][w-1-x]=terrain;
  if(safe){protectedCells[n]=1;protectedCells[mirror]=1;}
  if(water){board.obstacles.set(n,{kind:'forest',blocked:true});board.obstacles.set(mirror,{kind:'forest',blocked:true});}
 }
 board.battlefield={seed:board.seed,lanes:[Math.round(flankY*sy),Math.round(cy),Math.round(h-1-flankY*sy)],clearing,paths,protectedCells,
  gates:[{x:Math.round(gate.x),y:Math.round(cy),halfWidth:gateHalf*sy},{x:Math.round(w-1-gate.x),y:Math.round(cy),halfWidth:gateHalf*sy}]};
 board.terrainRevision++;board.obstacleRevision++;board.navigation.invalidate();
}
