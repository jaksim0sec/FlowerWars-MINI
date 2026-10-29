// Visuals are deterministic derived data. Never serialize textures, caches or
// sprite arrays into battle checkpoints and never consume the tactical RNG.
const scenes=new WeakMap();
export const AUTUMN_LIMIT=480;
export function autumnScenery(board){
 if(board.battlefield?.visualVersion!=='autumn-v1')return [];
 const old=scenes.get(board);if(old?.terrain===board.terrain&&old.revision===board.terrainRevision&&old.seed===board.seed&&old.obstacle===board.obstacleRevision)return old.items;
 let n=(board.seed^0x5f37a129)>>>0;const random=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};
 const w=board.width,h=board.height,field=board.battlefield,items=[],used=new Set(),patches=[];
 const blocked=(x,y)=>!board.inside(x,y)||board.terrain[y][x]==='void'||board.terrain[y][x]==='forest';
 const clear=(x,y,r)=>{for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(field.protectedCells[(y+dy)*w+x+dx])return false;return true;};
 const add=(x,y,id,width,layer=1)=>{const cell=y*w+x;if(used.has(cell)||items.length>=AUTUMN_LIMIT)return;used.add(cell);items.push({x,y,id,width,layer});};
 // Large, soft, non-colliding ground patches. No tile rotations or random phase.
 for(let y=7;y<h-7;y+=12)for(let x=7;x<w-7;x+=12){
  const a=x+Math.floor(random()*5)-2,b=y+Math.floor(random()*5)-2;
  if(blocked(a,b)||random()>.65)continue;
  const id=['compacted_soil','dry_grass_patch','olive_grass_patch','leaf_scatter_01','moss_patch'][Math.floor(random()*5)];
  patches.push({x:a,y:b,id,width:1200+random()*650,layer:0});
 }
 // Separate clustered shore/rock families, with wide empty stretches in between.
 for(let y=4;y<h-4;y+=3)for(let x=4;x<w-4;x+=3){
  const a=x+Math.floor(random()*3)-1,b=y+Math.floor(random()*3)-1,t=board.terrain[b][a];
  const rim=Math.abs(b-field.upper[a])<5||Math.abs(b-field.lower[a])<5;
  if(t==='void'){
   continue;
  }else if(t==='forest'){
   if(!clear(a,b,3)||random()>.55)continue;
   const rock=board.obstacles.get(b*w+a)?.visual==='rock';
   add(a,b,rock?['mossy_boulder','rock_pair','low_outcrop','stone_wall_01','masonry_remnant'][Math.floor(random()*5)]:['reeds','cattails','lily_pads'][Math.floor(random()*3)],rock?250+random()*150:170+random()*140);
  }else if(rim&&clear(a,b,3)&&random()<.7){
   add(a,b,random()<.7?'golden_tree_round':'golden_tree_tall',420+random()*200);
  }else if(clear(a,b,4)&&random()<.23){
   add(a,b,['golden_shrub','olive_shrub','white_flowers','golden_wildflowers','grass_tuft','fallen_leaves'][Math.floor(random()*6)],130+random()*100);
  }
 }
 // Rim thickness and a few kingdom landmarks sit outside reserved traffic.
 for(let x=4;x<w-4;x+=5){
  const y=field.lower[x]+1;if(board.inside(x,y)&&x%25===4)add(x,y,'cliff_side_01',400,1);
  if(random()<.4){const tx=x+Math.floor(random()*4),up=field.upper[tx]-1;if(board.inside(tx,up)&&!field.protectedCells[up*w+tx])add(tx,up,'golden_tree_round',430+random()*170);}
 }
 for(const team of ['A','B']){
  const room=field.rooms.find(r=>r.id==='kingdom-'+team);if(!room)continue;
  for(const sign of [-1,1])for(let i=0;i<3;i++){
   const x=Math.round(room.x+(i-1)*4),y=Math.round(room.y+sign*(room.ry+2));
   if(board.inside(x,y)&&!blocked(x,y)&&clear(x,y,3))add(x,y,i===1?'masonry_remnant':team==='A'?'timber_fence_01':'stone_wall_01',260);
  }
 }
 const result=[...patches,...items].slice(0,AUTUMN_LIMIT).sort((a,b)=>a.layer-b.layer||(a.x+a.y)-(b.x+b.y)||a.x-b.x);
 scenes.set(board,{terrain:board.terrain,revision:board.terrainRevision,seed:board.seed,obstacle:board.obstacleRevision,items:result});return result;
}

const contourCache=new WeakMap();
// Trace the walkable union once. Clipping thousands of separate diamonds is
// prohibitively expensive on mobile Canvas implementations.
export function autumnGroundContours(board){
 const old=contourCache.get(board);if(old?.revision===board.terrainRevision&&old.terrain===board.terrain&&old.obstacle===board.obstacleRevision)return old.paths;
 const land=(x,y)=>board.inside(x,y)&&['grass','soil','road'].includes(board.terrain[y][x])&&(!board.obstacles.has(y*board.width+x)||board.obstacles.get(y*board.width+x).blocked===false);
 const edges=new Map(),key=(x,y)=>x+','+y;
 const edge=(a,b)=>{const k=key(...a);if(!edges.has(k))edges.set(k,[]);edges.get(k).push(b);};
 for(let y=0;y<board.height;y++)for(let x=0;x<board.width;x++)if(land(x,y)){
  const a=[2*x-1,2*y-1],b=[2*x+1,2*y-1],c=[2*x+1,2*y+1],d=[2*x-1,2*y+1];
  if(!land(x,y-1))edge(a,b);if(!land(x+1,y))edge(b,c);if(!land(x,y+1))edge(c,d);if(!land(x-1,y))edge(d,a);
 }
 const paths=[];
 while(edges.size){const start=edges.keys().next().value,points=[],first=start.split(',').map(Number);let p=first;
  do{points.push({x:p[0]/2,y:p[1]/2});const k=key(...p),list=edges.get(k);if(!list)break;p=list.pop();if(!list.length)edges.delete(k);}while(key(...p)!==start);
  paths.push(points);
 }
 contourCache.set(board,{revision:board.terrainRevision,terrain:board.terrain,obstacle:board.obstacleRevision,paths});return paths;
}
