export const terrainNames={grass:'개활지',soil:'흙',road:'길 · 이동 속도 +20%',forest:'연못 · 진입 불가'};
export function terrainAt(board,x,y){return board.terrain[Math.round(y)]?.[Math.round(x)]||'grass';}
export function terrainStepMultiplier(board,from,to){
 const speed=p=>terrainAt(board,p.x,p.y)==='road'?1.2:1;
 return 2/(speed(from)+speed(to));
}
/** Three broad connecting lanes with open fighting grounds and impassable
 * woodland pockets. Mirror exactly so neither faction gets a terrain bonus. */
export function createBattlefield(board){
 const woods=[[25,34,13,8],[25,66,13,8],[43,28,9,9],[43,72,9,9]];
 for(let y=0;y<board.height;y++)for(let x=0;x<board.width;x++){
  const mx=Math.min(x,99-x),edge=Math.max(0,1-Math.max(0,mx-4)/16);
  const lanes=[20+30*edge,50,80-30*edge];
  const centerRoad=x>=48&&x<=51&&y>=17&&y<=83;
  const road=centerRoad||lanes.some(lane=>Math.abs(y-lane)<=2);
  const clearing=[[4,50,8],[28,50,10],[49.5,50,11]].some(([cx,cy,r])=>Math.hypot(mx-cx,y-cy)<r);
  const forest=!road&&!clearing&&woods.some(([cx,cy,rx,ry])=>((mx-cx)/rx)**2+((y-cy)/ry)**2<1+Math.sin(mx*1.7+y*.8)*.12);
  board.terrain[y][x]=road?'road':forest?'forest':'grass';
  if(forest)board.obstacles.set(y*board.width+x,{kind:'forest',blocked:true});
 }
 board.terrainRevision++;
 board.obstacleRevision++;board.navigation.invalidate();
}
