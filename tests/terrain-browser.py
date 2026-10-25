"""Cache reuse, invalidation and viewport-only tile work, using real Canvas."""
import os,json
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BASE_URL','http://127.0.0.1:8015')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=b.new_page();page.goto(BASE+'/characters.html')
 result=page.evaluate('''async()=>{
 const{Board}=await import('/src/model.mjs');const{loadArtwork,render}=await import('/src/render.mjs');const{terrainRenderStats}=await import('/src/terrain-render.mjs');
 const art=await loadArtwork(),board=new Board(128,128),cv=document.createElement('canvas');cv.width=1000;cv.height=700;const ctx=cv.getContext('2d'),view={},camera={x:500,y:-3200,scale:1};let calls=0;const original=ctx.drawImage.bind(ctx);ctx.drawImage=(...a)=>{calls++;return original(...a)};
 const frame=()=>render(ctx,art,board,view,camera,1000,700,1);frame();const warm=terrainRenderStats(ctx);calls=0;const start=performance.now();for(let i=0;i<100;i++)frame();const ms=(performance.now()-start)/100,warmCalls=calls/100;
 if(calls!==100||terrainRenderStats(ctx).builds!==1)throw Error('static terrain repainted');
 if(warm.tiles>=500)throw Error('scanned entire terrain');
 const before=ctx.getImageData(0,0,1000,700).data;board.setTerrain(40,40,board.terrain[40][40]==='grass'?'soil':'grass');frame();const after=ctx.getImageData(0,0,1000,700).data;if(!after.some((v,i)=>v!==before[i]))throw Error('edited tile pixels stayed stale');if(terrainRenderStats(ctx).builds!==2)throw Error('edit failed to invalidate');
 camera.x+=20;frame();if(terrainRenderStats(ctx).builds!==3)throw Error('pan failed to invalidate');
 camera.scale=.8;frame();if(terrainRenderStats(ctx).builds!==4)throw Error('zoom failed to invalidate');
 board.reset();frame();if(terrainRenderStats(ctx).builds!==5)throw Error('reset failed to invalidate');
 cv.width=1200;render(ctx,art,board,view,camera,1200,700,1);if(terrainRenderStats(ctx).builds!==6)throw Error('resize failed to invalidate');
 render(ctx,art,board,view,camera,1200,700,2);if(terrainRenderStats(ctx).builds!==7)throw Error('DPR failed to invalidate');
 return{mapTiles:128*128,visibleTiles:warm.tiles,staticTerrainCallsPerFrame:warmCalls,cacheBytes:warm.bytes,msPerWarmFrame:ms};
 }''')
 print('PASS terrain cache: '+json.dumps(result));b.close()
