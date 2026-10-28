"""Paired viewport-cache benchmarks using baseline modules served from git objects."""
import asyncio,json,os,subprocess
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1];BASE=os.environ.get('BASE_URL','http://127.0.0.1:10004')
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=await b.new_page(service_workers='block')
  for name in ['terrain-render','battlefield-terrain','battlefield-plan','render']:
   s=subprocess.check_output(['git','show',f'f024058:src/{name}.mjs'],cwd=ROOT,text=True).replace("'./terrain-render.mjs'","'./terrain-render-baseline.mjs'").replace("'./battlefield-plan.mjs'","'./battlefield-plan-baseline.mjs'")
   await page.route('**/src/'+name+'-baseline.mjs',lambda route,request,s=s:route.fulfill(content_type='text/javascript',body=s))
  await page.goto(BASE+'/characters.html')
  results=await page.evaluate('''async()=>{
   const {Board}=await import('/src/model.mjs');const result=[];
   for(const baseline of [true,false]){
    const suffix=baseline?'-baseline':'',render=await import('/src/render'+suffix+'.mjs'),terrain=await import('/src/terrain-render'+suffix+'.mjs'),generator=await import('/src/battlefield-terrain'+suffix+'.mjs');
    const started=performance.now(),art=await render.loadArtwork(),loadMs=performance.now()-started;
    for(const [width,height,dpr]of [[390,844,2],[1280,800,1]]){
     const b=new Board(176,128,{seed:73});generator.createBattlefield(b);const canvas=document.createElement('canvas');canvas.width=width*dpr;canvas.height=height*dpr;const ctx=canvas.getContext('2d'),scale=Math.min((width-32)/(72*(176+128)),(height-180)/(42*(176+128))),camera={x:width/2-(175-127)*72/2*scale,y:height/2-(175+127)*42/2*scale,scale};
     const t=performance.now();terrain.drawTerrain(ctx,art,b,camera,width,height,dpr);const firstBuildMs=performance.now()-t;let t0=performance.now();for(let i=0;i<60;i++)terrain.drawTerrain(ctx,art,b,camera,width,height,dpr);const steadyMs=(performance.now()-t0)/60;
     const builds=[];for(let i=0;i<8;i++){const t=performance.now();terrain.drawTerrain(ctx,art,b,{...camera,x:camera.x+i*4,scale:camera.scale*(1+i*.01)},width,height,dpr);builds.push(performance.now()-t);}builds.sort((a,b)=>a-b);
     const stats=terrain.terrainRenderStats(ctx);result.push({baseline,width,height,dpr,loadMs,firstBuildMs,steadyMs,cacheRebuildP95:builds.at(-1),...stats});
    }
   }return result;
  }''')
  Path(ROOT/'docs/measurements/autumn-browser-cache.json').write_text(json.dumps(results,indent=2)+'\n');print(json.dumps(results,indent=2));await b.close()
asyncio.run(main())
