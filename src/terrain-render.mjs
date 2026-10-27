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
  for(let x=minX;x<=maxX;x++)if(board.terrain[y][x]!=='void')tiles.push({x,y});
 }
 return tiles.sort((a,b)=>(a.x+a.y)-(b.x+b.y)||a.y-b.y);
}
// All materials share the same global 5x2 phase; never shuffle variants.
export const terrainVariant=(x,y)=>1+((x%5+5)%5)+5*((y%2+2)%2);
export function terrainMaterial(board,x,y){
 const type=board.terrain[y][x],obstacle=board.obstacles?.get(y*board.width+x);
 if(type==='void')return 'void';
 return type==='forest'||obstacle&&obstacle.blocked!==false?'pond':type==='road'?'soil':type;
}
export function terrainEdges(board,x,y){
 const material=terrainMaterial(board,x,y);
 const east=x<board.width-1?terrainMaterial(board,x+1,y):'void',south=y<board.height-1?terrainMaterial(board,x,y+1):'void';
 return {wallX:material!=='void'&&east==='void',wallY:material!=='void'&&south==='void',
  boundaryX:east!=='void'&&east!==material,boundaryY:south!=='void'&&south!==material};
}
const materialRow={grass:0,soil:1,pond:2};
function paint(ctx,art,board,camera,width,height,dpr){
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
 ctx.translate(camera.x,camera.y);ctx.scale(camera.scale,camera.scale);
 ctx.save();ctx.beginPath();
 if(board.battlefield?.outline){
  board.battlefield.outline.forEach((p,i)=>{const x=(p.x-p.y)*HALF_W,y=(p.x+p.y)*HALF_H;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.closePath();
 }else{
  ctx.moveTo(0,-HALF_H);ctx.lineTo(board.width*HALF_W,(board.width-1)*HALF_H);
  ctx.lineTo((board.width-board.height)*HALF_W,(board.width+board.height-1)*HALF_H);
  ctx.lineTo(-board.height*HALF_W,(board.height-1)*HALF_H);ctx.closePath();
 }
 ctx.translate(0,23);ctx.shadowColor='#68502455';ctx.shadowBlur=38;ctx.shadowOffsetY=23;ctx.fillStyle='#97794140';ctx.fill();ctx.restore();
 // A continuous base prevents transparent hairlines during fractional zoom.
 ctx.fillStyle='#8eaa54';ctx.fill();
 const tiles=visibleTiles(board,camera,width,height);
 let walls=0,boundaries=0;
 for(const{x,y}of tiles){
  const material=terrainMaterial(board,x,y),row=materialRow[material]??0;
  const sx=(terrainVariant(x,y)-1)*144,left=(x-y)*HALF_W-72,top=(x+y)*HALF_H-42;
  ctx.drawImage(art.tiles.atlas,sx,row*107,144,107,left,top,144,107);
  // A neighbor of another material is still solid ground, never an exposed wall.
  const edges=terrainEdges(board,x,y);
  if(edges.wallX){ctx.drawImage(art.tiles.atlas,sx,(3+row)*107,144,107,left,top,144,107);walls++;}
  if(edges.wallY){ctx.drawImage(art.tiles.atlas,sx,(6+row)*107,144,107,left,top,144,107);walls++;}
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
    if(neighbor==='void'||neighbor===material||(material==='pond'||neighbor==='pond')!==water)continue;
    ctx.moveTo(px+side*HALF_W,py);ctx.lineTo(px,py+HALF_H);count++;
   }
  }
  if(count){
   ctx.lineJoin='round';ctx.lineCap='round';ctx.strokeStyle=water?'#4e796ab0':'#9b83466e';ctx.lineWidth=water?4:2;ctx.stroke();
   ctx.strokeStyle=water?'#e4dba5b0':'#ded29980';ctx.lineWidth=1;ctx.stroke();
  }
  boundaries+=count;
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
