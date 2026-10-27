import {HALF_W,HALF_H,unproject} from './model.mjs';
const caches=new WeakMap();
/** Enumerate only projected tiles touching the viewport, in original painter order. */
export function visibleTiles(board,camera,width,height){
 const left=-camera.x/camera.scale-HALF_W,right=(width-camera.x)/camera.scale+HALF_W;
 const top=-camera.y/camera.scale-65,bottom=(height-camera.y)/camera.scale+HALF_H;
 const corners=[[left,top],[right,top],[left,bottom],[right,bottom]].map(([x,y])=>unproject(x,y));
 const minY=Math.max(0,Math.floor(Math.min(...corners.map(p=>p.y))));
 const maxY=Math.min(board.height-1,Math.ceil(Math.max(...corners.map(p=>p.y))));
 const tiles=[];
 for(let y=minY;y<=maxY;y++){
  const minX=Math.max(0,Math.ceil(Math.max(left/HALF_W+y,top/HALF_H-y)));
  const maxX=Math.min(board.width-1,Math.floor(Math.min(right/HALF_W+y,bottom/HALF_H-y)));
  for(let x=minX;x<=maxX;x++)tiles.push({x,y});
 }
 return tiles.sort((a,b)=>(a.x+a.y)-(b.x+b.y)||a.y-b.y);
}
// All materials share the same global 5x2 phase; never shuffle variants.
export const terrainVariant=(x,y)=>1+((x%5+5)%5)+5*((y%2+2)%2);
export function terrainMaterial(board,x,y){
 const type=board.terrain[y][x],obstacle=board.obstacles?.get(y*board.width+x);
 return type==='forest'||type==='pond'?'pond':type==='road'||type==='wall'||type==='gate'?'soil':type==='grove'?'grass':obstacle&&obstacle.blocked!==false?'pond':type;
}
export function terrainEdges(board,x,y){
 const material=terrainMaterial(board,x,y);
 return {wallX:x===board.width-1,wallY:y===board.height-1,
  boundaryX:x<board.width-1&&terrainMaterial(board,x+1,y)!==material,
  boundaryY:y<board.height-1&&terrainMaterial(board,x,y+1)!==material};
}
const materialRow={grass:0,soil:1,pond:2};
function paint(ctx,art,board,camera,width,height,dpr){
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
 ctx.translate(camera.x,camera.y);ctx.scale(camera.scale,camera.scale);
 ctx.save();ctx.beginPath();ctx.moveTo(0,-HALF_H);
 ctx.lineTo(board.width*HALF_W,(board.width-1)*HALF_H);
 ctx.lineTo((board.width-board.height)*HALF_W,(board.width+board.height-1)*HALF_H);
 ctx.lineTo(-board.height*HALF_W,(board.height-1)*HALF_H);ctx.closePath();
 ctx.translate(0,23);ctx.shadowColor='#68502455';ctx.shadowBlur=38;ctx.shadowOffsetY=23;ctx.fillStyle='#97794140';ctx.fill();ctx.restore();
 // A continuous base prevents transparent hairlines during fractional zoom.
 ctx.fillStyle='#8eaa54';ctx.fill();
 const tiles=visibleTiles(board,camera,width,height);
 let walls=0,boundaries=0;
 for(const{x,y}of tiles){
  const material=terrainMaterial(board,x,y),row=materialRow[material]??0;
  const sx=(terrainVariant(x,y)-1)*144,left=(x-y)*HALF_W-72,top=(x+y)*HALF_H-42;
  ctx.drawImage(art.tiles.atlas,sx,row*107,144,107,left,top,144,107);
  // Grove tint belongs to the terrain surface, not to large floating tree
  // sprites. It makes the forest readable even with the entire map fitted.
  if(board.terrain[y][x]==='grove'){
   const px=(x-y)*HALF_W,py=(x+y)*HALF_H;
   ctx.fillStyle='#426b4a72';
   ctx.beginPath();ctx.moveTo(px,py-HALF_H+3);ctx.lineTo(px+HALF_W-4,py);
   ctx.lineTo(px,py+HALF_H-3);ctx.lineTo(px-HALF_W+4,py);ctx.closePath();ctx.fill();
  }
  // A neighbor of another material is still solid ground, never an exposed wall.
  if(x===board.width-1){ctx.drawImage(art.tiles.atlas,sx,(3+row)*107,144,107,left,top,144,107);walls++;}
  if(y===board.height-1){ctx.drawImage(art.tiles.atlas,sx,(6+row)*107,144,107,left,top,144,107);walls++;}
 }
 // Material seams are an independent, static overlay. Each shared edge is
 // visited once and batched into just two paths (shoreline / land).
 for(const water of [false,true]){
  ctx.beginPath();let count=0;
  for(const{x,y}of tiles){
   const material=terrainMaterial(board,x,y),px=(x-y)*HALF_W,py=(x+y)*HALF_H;
   for(const [dx,dy,side]of [[1,0,1],[0,1,-1]]){
    if(!board.inside(x+dx,y+dy))continue;
    const neighbor=terrainMaterial(board,x+dx,y+dy);
    if(neighbor===material||(material==='pond'||neighbor==='pond')!==water)continue;
    ctx.moveTo(px+side*HALF_W,py);ctx.lineTo(px,py+HALF_H);count++;
   }
  }
  if(count){
   ctx.lineJoin='round';ctx.lineCap='round';ctx.strokeStyle=water?'#4e796ab0':'#9b83466e';ctx.lineWidth=water?4:2;ctx.stroke();
   ctx.strokeStyle=water?'#e4dba5b0':'#ded29980';ctx.lineWidth=1;ctx.stroke();
  }
  boundaries+=count;
 }

 // All obstacles are drawn on the ground plane, never as tall gatehouses.
 // The wooded areas are dark patches with occasional short shrubs.
 for(const {x,y} of tiles){
  const type=board.terrain[y][x];
  if(type!=='grove'&&type!=='wall'&&type!=='gate')continue;
  const px=(x-y)*HALF_W,py=(x+y)*HALF_H;
  if(type==='grove'){
   const hash=(Math.imul(x+13,374761393)^Math.imul(y+17,668265263))>>>0;
   if(hash%5!==0)continue; // avoid a noisy leaf stamp on every tile
   const dx=hash%31-15,dy=(hash>>>8)%15-7;
   ctx.fillStyle='#34573a58';
   ctx.beginPath();ctx.ellipse(px+dx+5,py+dy+3,20,7,0,0,Math.PI*2);ctx.fill();
   ctx.fillStyle=hash%2?'#50794eb5':'#628753bd';
   ctx.beginPath();ctx.ellipse(px+dx,py+dy-4,18,10,0,0,Math.PI*2);ctx.fill();
   ctx.fillStyle='#86a978b0';
   ctx.beginPath();ctx.ellipse(px+dx-5,py+dy-8,9,4,0,0,Math.PI*2);ctx.fill();
   continue;
  }
  const gate=type==='gate'?board.match?.gateAt(x,y):null;
  const opened=type==='gate'&&gate?.health.current===0;
  const fx=px+HALF_W/2,fy=py-HALF_H/2,tx=px-HALF_W/2,ty=py+HALF_H/2;
  function stroke(color,width,down=0){
   ctx.beginPath();ctx.moveTo(fx,fy+down);ctx.lineTo(tx,ty+down);
   ctx.lineCap='butt';ctx.lineWidth=width;ctx.strokeStyle=color;ctx.stroke();
  }
  if(opened){
   // Flattened timber debris still marks the breach without closing the path.
   stroke('#816b5260',9,4);
   continue;
  }
  stroke('#4d463958',31,8); // ground contact shadow, not a flying sprite
  if(type==='wall'){
   stroke('#5f5340',24,2);stroke('#8c8065',19,-2);stroke('#c0ad82',5,-7);
  }else{
   stroke('#67462f',29,2);stroke('#a9794c',22,-2);stroke('#d7aa70',8,-7);
   // Five visually separate leafs match the five independently breakable
   // four-cell gate sections without drawing tall towers.
   if(y%4===0){
    const r=board.match?.gateAt(x,y)?.health.current??0;
    ctx.fillStyle=r?'#4f433b':'#8b7863';
    ctx.fillRect(px-5,py-15,10,20);
   }
  }
  if(type==='wall'&&y%5===0){
   // Fence posts are small enough to stay below soldier heads.
   ctx.fillStyle='#66553d';ctx.fillRect(px-4,py-16,8,17);
   ctx.fillStyle='#c1a978';ctx.fillRect(px-3,py-16,6,4);
  }
 }
 return {tiles:tiles.length,walls,boundaries};
}
/** One viewport-sized backing canvas per renderer, never a map-sized allocation. */
export function drawTerrain(ctx,art,board,camera,width,height,dpr,interactive=false){
 let cache=caches.get(ctx);
 if(!cache){cache={canvas:document.createElement('canvas'),builds:0,tiles:0};caches.set(ctx,cache);}
 const pad=128,key=[board.width,board.height,board.terrainRevision,board.terrain,board.obstacleRevision,art.tiles,width,height,dpr];
 const base=cache.camera;
 const covered=base&&-camera.x/camera.scale>=(-base.x-pad)/base.scale&&
  (width-camera.x)/camera.scale<=(width-base.x+pad)/base.scale&&
  -camera.y/camera.scale>=(-base.y-pad)/base.scale&&
  (height-camera.y)/camera.scale<=(height-base.y+pad)/base.scale;
 if(!cache.key||key.some((v,i)=>v!==cache.key[i])||!covered||(!interactive&&(base.scale!==camera.scale||base.x!==camera.x||base.y!==camera.y))){
  const pw=Math.round((width+pad*2)*dpr),ph=Math.round((height+pad*2)*dpr);
  if(cache.canvas.width!==pw||cache.canvas.height!==ph){cache.canvas.width=pw;cache.canvas.height=ph;}
  const painted=paint(cache.canvas.getContext('2d'),art,board,{...camera,x:camera.x+pad,y:camera.y+pad},width+pad*2,height+pad*2,dpr);
  Object.assign(cache,painted);
  cache.camera={...camera};cache.key=key;cache.builds++;
 }
 const ratio=camera.scale/cache.camera.scale;
 ctx.setTransform(1,0,0,1,0,0);
 ctx.drawImage(cache.canvas,(camera.x-(cache.camera.x+pad)*ratio)*dpr,(camera.y-(cache.camera.y+pad)*ratio)*dpr,cache.canvas.width*ratio,cache.canvas.height*ratio);
}
export function terrainRenderStats(ctx){const c=caches.get(ctx);return c?{builds:c.builds,tiles:c.tiles,walls:c.walls,boundaries:c.boundaries,bytes:c.canvas.width*c.canvas.height*4}:null;}
