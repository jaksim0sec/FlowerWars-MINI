// Geometry is generated once per map. Corridors, rooms and defensive banks
// are explicit tactical features; the coast is fitted around them afterwards.
export function roundedPath(points){
 const out=[points[0]],mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
 for(let i=1;i<points.length-1;i++){
  const a=points[i-1],b=points[i],c=points[i+1];
  const trim=Math.min(4,Math.hypot(b.x-a.x,b.y-a.y)*.3,Math.hypot(c.x-b.x,c.y-b.y)*.3);
  const entry=mix(b,a,trim/Math.hypot(b.x-a.x,b.y-a.y)),exit=mix(b,c,trim/Math.hypot(c.x-b.x,c.y-b.y));
  out.push(entry);
  for(let k=1;k<=6;k++){const t=k/6,u=1-t;out.push({x:u*u*entry.x+2*u*t*b.x+t*t*exit.x,y:u*u*entry.y+2*u*t*b.y+t*t*exit.y});}
 }
 out.push(points.at(-1));return out;
}
export function distanceToPath(x,y,points){
 let best=Infinity;
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));
  best=Math.min(best,Math.hypot(x-a.x-t*dx,y-a.y-t*dy));
 }
 return best;
}
export function planBattlefield(width,height,random){
 const sx=(width-1)/143,sy=(height-1)/111,jitter=n=>(random()-.5)*n;
 const p=(x,y)=>({x:x*sx,y:y*sy}),scale=Math.min(sx,sy),paths=[],rooms=[],defenses=[];
 const middle=55.5+jitter(2),top=19+jitter(3),bottom=92+jitter(3),gateA=30+jitter(3),gateB=113+jitter(3);
 const path=(id,kind,points,radius,from,to)=>{const pointsInWorld=roundedPath(points.map(([x,y])=>p(x,y)));const route={id,kind,points:pointsInWorld,radius:radius*scale,minWidth:radius*2*scale,minTurnRadius:3*scale,from,to};paths.push(route);return route;};
 const room=(id,kind,x,y,rx,ry=rx)=>{const c=p(x,y);rooms.push({id,kind,...c,rx:rx*sx,ry:ry*sy});};
 room('kingdom-A','deployment',16,56,14,24);room('kingdom-B','deployment',127,55,14,24);
 room('battle','battle',72,middle,25,25);
 for(const [team,gate,home,front]of [['A',gateA,20,44],['B',gateB,123,100]]){
  room('rear-'+team,'staging',home,middle,9,10);room('front-'+team,'staging',front,middle,10,10);
  path('main-'+team,'main',[[team==='A'?15:128,team==='A'?56:55],[home,middle],[gate,middle+jitter(2)],[front,middle],[team==='A'?68:76,middle+(team==='A'?-1:1)]],9.5,'kingdom-'+team,'battle');
 }
 for(const [side,y,sign]of [['upper',top,-1],['lower',bottom,1]]){
  // Each flank has its own smooth centerline and fixed width. A corridor does
  // not move when the outer coastline changes.
  const bend=y+jitter(3)+(side==='lower'?2:0);
  path('flank-'+side,'flank',[[15,56],[21,middle+sign*20],[29,y+sign*2],[48,bend],[66,y],[79,y+jitter(2)],[97,bend+(side==='lower'?2:-1)+jitter(2)],[115,y],[122,middle+sign*20],[128,55]],4,'kingdom-A','kingdom-B');
  for(const [team,x,entryX]of [['A',62,68],['B',82,77]]){
   room(`flank-stage-${side}-${team}`,'staging',x,y,6);
   room(`merge-${side}-${team}`,'merge',entryX,middle+sign*16,7);
   path(`entry-${side}-${team}`,'entry',[[x,y],[entryX,middle+sign*22],[entryX,middle+sign*16],[entryX,middle+sign*10]],4,'flank-'+side,'battle');
  }
  for(const [team,x,front]of [['A',34,44],['B',109,100]]){
   room(`counter-stage-${side}-${team}`,'merge',x,middle+sign*22,5);
   path(`counter-${side}-${team}`,'counter',[[x,y],[x,middle+sign*22],[front,middle+sign*9],[front,middle]],4,'flank-'+side,'front-'+team);
  }
  for(const [team,flip]of [['A',false],['B',true]]){
   const transform=([x,v])=>[flip?143-x:x,middle+sign*v];
   const long=side==='upper'?[[37,15],[42,24+jitter(2)],[53,25+jitter(2)],[63,17]]:[[37,15],[39,25+jitter(2)],[48,31+jitter(2)],[58,29+jitter(2)],[65,20]];
   const short=[[23,19],[26,24+jitter(2)],[28,31]];
   for(const [kind,points,radius]of [['front',long,3.8+random()*.8],['gate',short,4.5]]){
    defenses.push({id:`defense-${side}-${team}-${kind}`,team,side,kind,points:roundedPath(points.map(transform).map(([x,y])=>p(x,y))),radius:radius*scale,phase:random()*6.28});
   }
  }
 }
 return {paths,rooms,defenses,lanes:[Math.round(top*sy),Math.round(middle*sy),Math.round(bottom*sy)]};
}
