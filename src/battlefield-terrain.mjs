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
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
function interpolate(knots,x){
 for(let i=1;i<knots.length;i++)if(x<=knots[i][0]){const [a,u]=knots[i-1],[b,v]=knots[i];return u+(v-u)*smooth((x-a)/(b-a));}
 return knots.at(-1)[1];
}
/** Grow shorelines around tactical spaces. Independent, smoothly varying
 * shores replace mirrored polygons; narrow flanks follow the actual land edge. */
export function createBattlefield(board){
 const random=randomFor(board.seed),w=board.width,h=board.height,sx=(w-1)/143,sy=(h-1)/111;
 const jitter=n=>(random()-.5)*n,cy=55.5,phase=random()*6.28;
 const center=x=>cy+Math.sin(x*.043+phase)*2.2*Math.sin(Math.PI*x/143);
 const outlineBase=[[0,0],[5,11],[17,25],[34,30],[58,35],[78,40],[107,31],[127,27],[138,12],[143,0]];
 const shores=[-1,1].map(sign=>({sign,knots:outlineBase.map(([x,y],i)=>[x,y+(i===0||i===outlineBase.length-1?0:jitter(4))]),phase:random()*6.28}));
 const mainKnots=[[0,5],[17,21],[28,8+jitter(2)],[36,11+jitter(2)],[48,14+jitter(2)],[69,24],[77,24],[96,14+jitter(2)],[112,9+jitter(2)],[128,21],[143,5]];
 const mainHalf=x=>interpolate(mainKnots,x);
 const banks=shores.map(shore=>{
  const width=5+random()*2,start=36+jitter(4),end=68+jitter(4),otherStart=77+jitter(4),otherEnd=108+jitter(4);
  const segments=[[21+jitter(2),34+jitter(2)],[start,end],[otherStart,otherEnd],[110+jitter(2),123+jitter(2)]];
  return {...shore,width,segments};
 });
 const upper=[],lower=[],protectedCells=new Uint8Array(w*h),gates=[];
 board.obstacles.clear();
 for(let x=0;x<w;x++){
  const u=x/sx,c=center(u),edges=shores.map(s=>c+s.sign*(interpolate(s.knots,u)+Math.sin(u*.11+s.phase)*1.1*Math.sin(Math.PI*u/143)));
  upper[x]=Math.ceil(edges[0]*sy);lower[x]=Math.floor(edges[1]*sy);
  for(let y=0;y<h;y++){
   const n=y*w+x,v=y/sy,outside=y<upper[x]||y>lower[x]||u<1||u>142;
   let water=false;
   if(!outside)for(let i=0;i<2;i++){
    const bank=banks[i],distance=(v-c)*bank.sign,edgeDistance=(edges[i]-c)*bank.sign;
    const outer=edgeDistance-bank.width-(.5+Math.sin(u*.19+bank.phase)*.6);
    const gateBody=u<35||u>109;
    const thickness=8.5+Math.sin(u*.095+bank.phase)*2;
    const inner=Math.max(mainHalf(u)+Math.sin(u*.14+bank.phase)*1.3,gateBody?0:outer-thickness);
    const middle=(outer+inner)/2;
    // Each body tapers smoothly into irregular headlands. The spaces between
    // bodies form rear interception gaps and side entry into the central basin.
    const taper=Math.max(...bank.segments.map(([a,b])=>smooth((u-a)/3.5)*smooth((b-u)/4.5)));
    const half=Math.max(0,(outer-inner)/2)*taper;
    const ripple=Math.sin(u*.64+v*.48+bank.phase)*.28;
    if(half>.25&&Math.abs(distance-middle)<half+ripple)water=true;
   }
   const terrain=outside?'void':water?'forest':'grass';board.terrain[y][x]=terrain;
   if(outside||water)board.obstacles.set(n,{kind:terrain==='void'?'void':'forest',blocked:true});
   else if(Math.abs(v-c)<=mainHalf(u)-2)protectedCells[n]=1;
  }
 }
 // Store only the small coastline and tactical summary; no work in the frame loop.
 const outline=[];
 for(let x=1;x<w-1;x++)if(upper[x]<=lower[x])outline.push({x:x-.5,y:upper[x]-.5});
 for(let x=w-2;x>=1;x--)if(upper[x]<=lower[x])outline.push({x:x+.5,y:lower[x]+.5});
 for(const [a,b]of [[25,53],[90,119]]){
  let best=null;
  for(let x=a;x<=b;x++){
   const ix=Math.round(x*sx),y=Math.round(center(x)*sy);let lo=y,hi=y;
   while(lo>0&&!board.obstacles.has((lo-1)*w+ix))lo--;
   while(hi<h-1&&!board.obstacles.has((hi+1)*w+ix))hi++;
   if(!best||hi-lo<best.width)best={x:ix,y,width:hi-lo+1};
  }
  gates.push(best);
 }
 const flankY=Math.round((upper[Math.round(w/2)]+banks[0].width*sy/2));
 board.battlefield={seed:board.seed,lanes:[flankY,Math.round(center(71.5)*sy),Math.round(lower[Math.round(w/2)]-banks[1].width*sy/2)],
  clearing:{x:71.5*sx,y:center(71.5)*sy,rx:19*sx,ry:21*sy},outline,upper,lower,gates,protectedCells};
 board.terrainRevision++;board.obstacleRevision++;board.navigation.invalidate();
}
