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
function paint(ctx,art,board,camera,width,height,dpr){
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
 ctx.translate(camera.x,camera.y);ctx.scale(camera.scale,camera.scale);
 ctx.save();ctx.beginPath();ctx.moveTo(0,-HALF_H);
 ctx.lineTo(board.width*HALF_W,(board.width-1)*HALF_H);
 ctx.lineTo((board.width-board.height)*HALF_W,(board.width+board.height-1)*HALF_H);
 ctx.lineTo(-board.height*HALF_W,(board.height-1)*HALF_H);ctx.closePath();
 ctx.translate(0,23);ctx.shadowColor='#68502455';ctx.shadowBlur=38;ctx.shadowOffsetY=23;ctx.fillStyle='#97794140';ctx.fill();ctx.restore();
 const tiles=visibleTiles(board,camera,width,height);
 for(const{x,y}of tiles)ctx.drawImage(art.tiles[board.terrain[y][x]],(x-y)*HALF_W-72,(x+y)*HALF_H-42,144,107);
 return tiles.length;
}
/** One viewport-sized backing canvas per renderer, never a map-sized allocation. */
export function drawTerrain(ctx,art,board,camera,width,height,dpr){
 let cache=caches.get(ctx);
 if(!cache){cache={canvas:document.createElement('canvas'),builds:0,tiles:0};caches.set(ctx,cache);}
 const key=[board.width,board.height,board.terrainRevision,board.terrain,art.tiles,camera.x,camera.y,camera.scale,width,height,dpr];
 if(!cache.key||key.some((v,i)=>v!==cache.key[i])){
  const pw=Math.round(width*dpr),ph=Math.round(height*dpr);
  if(cache.canvas.width!==pw||cache.canvas.height!==ph){cache.canvas.width=pw;cache.canvas.height=ph;}
  cache.tiles=paint(cache.canvas.getContext('2d'),art,board,camera,width,height,dpr);cache.key=key;cache.builds++;
 }
 ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(cache.canvas,0,0);
}
export function terrainRenderStats(ctx){const c=caches.get(ctx);return c?{builds:c.builds,tiles:c.tiles,bytes:c.canvas.width*c.canvas.height*4}:null;}
