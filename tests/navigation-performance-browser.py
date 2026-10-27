"""Rendered FPS and frame CPU, separate from model throughput measurements."""
import os,json
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1000,'height':760},service_workers='block')
 page.goto(os.environ.get('BASE_URL','http://127.0.0.1:8042')+'/manifest.json')
 result=page.evaluate('''async()=>{
 const{Board}=await import('/src/model.mjs'),{loadArtwork,render}=await import('/src/render.mjs');
 const{createCharacter}=await import('/src/characters/engine.mjs'),{registerPlacedGroup}=await import('/src/unit-groups.mjs');
 const art=await loadArtwork(),results=[];document.body.replaceChildren();
 const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=760;document.body.append(canvas);const ctx=canvas.getContext('2d');
 for(const count of [64,256,700]){
  const board=new Board(100,100,{seed:73});
  for(let y=0;y<100;y++)if(![10,11,12,28,29,30,46,47,48,64,65,66,82,83,84].includes(y))board.setObstacle(47,y,{blocked:true});
  const ids=[];
  for(let i=0;i<count;i++){const c=createCharacter(art.catalog,['scout','shield-guard','archer','clover-mage','scholar','banner-bearer'][i%6]);const u=board.spawn(4+i%16,5+Math.floor(i/16),c,{team:'A',stats:art.catalog.characters[c.characterId].testCombat});ids.push(u.id);}
  for(let i=0;i<count;i+=24)registerPlacedGroup(board,ids.slice(i,i+24),{team:'A'});
  board.batchCommands(()=>{board.units.forEach((u,i)=>board.move(u.id,70+i%16,u.y,{direct:true}));});
  for(let i=0;i<500;i++)board.update(.05);
  board.match={phase:'battle',flags:{},centers:{}};
  const durations=[],intervals=[];let previous=null;
  await new Promise(resolve=>{let frame=0;function draw(timestamp){
   const start=performance.now();board.update(.05);render(ctx,art,board,{}, {x:500,y:40,scale:.065},1000,760,1);
   if(frame>=30){durations.push(performance.now()-start);if(previous!==null)intervals.push(timestamp-previous);}
   previous=timestamp;if(++frame<180)requestAnimationFrame(draw);else resolve();
  }requestAnimationFrame(draw);});
  durations.sort((a,b)=>a-b);intervals.sort((a,b)=>a-b);
  results.push({count,fps:1000/(intervals.reduce((a,b)=>a+b,0)/intervals.length),frameCpuP95ms:durations[Math.floor(durations.length*.95)],frameIntervalP95ms:intervals[Math.floor(intervals.length*.95)]});
 }
 return results;
 }''')
 print(json.dumps(result,indent=2));browser.close()
