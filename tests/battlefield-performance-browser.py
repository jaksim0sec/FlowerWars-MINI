"""Render the same 350-soldier fixture through local request interception.
No network listener is opened. FLOWER_ROOT chooses the baseline checkout.
"""
import json,mimetypes,os
from pathlib import Path
from urllib.parse import urlparse,unquote
from playwright.sync_api import sync_playwright
root=Path(os.environ.get('FLOWER_ROOT',Path(__file__).resolve().parents[1])).resolve()
fixtures=json.loads(Path(os.environ.get('FIXTURES',Path(__file__).resolve().parents[1]/'docs/measurements/battlefield-traffic-fixtures.json')).read_text())
fixture=next(f for f in fixtures if f['seed']==73 and f['scenario']=='main-350')
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=browser.new_page(viewport={'width':1250,'height':800},service_workers='block');errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def route(req):
  url=urlparse(req.request.url);path=(root/unquote(url.path).lstrip('/')).resolve()
  if url.hostname!='flower.test' or not path.is_relative_to(root) or not path.is_file():return req.fulfill(status=404,body='')
  req.fulfill(path=str(path),content_type='text/javascript' if path.suffix=='.mjs' else mimetypes.guess_type(str(path))[0] or 'application/octet-stream')
 page.route('**/*',route);page.goto('http://flower.test/manifest.json')
 result=page.evaluate('''async fixture=>{
 const{Board}=await import('/src/model.mjs'),{createBattlefield}=await import('/src/battlefield-terrain.mjs');
 const{createFormationGroup,placeGroup,squadsFor}=await import('/src/unit-groups.mjs'),{layoutDeployment}=await import('/src/deployment-layout.mjs');
 const{orderSquad,updateSquadOrders}=await import('/src/squad-orders.mjs'),{createCharacter}=await import('/src/characters/engine.mjs');
 const{loadArtwork,render}=await import('/src/render.mjs'),{drawTerrain,terrainRenderStats}=await import('/src/terrain-render.mjs');
 const art=await loadArtwork(),board=new Board(144,112,{seed:fixture.seed});createBattlefield(board);
 const cv=document.createElement('canvas');cv.width=1250;cv.height=800;cv.style='position:fixed;inset:0;z-index:999999;background:#f7efda';document.body.append(cv);
 const ctx=cv.getContext('2d'),camera={x:550,y:40,scale:.0625};
 // Empty terrain: unchanged frames must use exactly one cached image copy.
 drawTerrain(ctx,art,board,camera,1250,800,1);const first=terrainRenderStats(ctx);let calls=0,original=ctx.drawImage.bind(ctx);ctx.drawImage=(...args)=>{calls++;return original(...args)};
 for(let i=0;i<10;i++)drawTerrain(ctx,art,board,camera,1250,800,1);
 if(calls!==10||terrainRenderStats(ctx).builds!==first.builds)throw Error('terrain cache regression');ctx.drawImage=original;
 const pending=[];for(const group of fixture.groups){const bp=layoutDeployment(createFormationGroup(group.size,'squad','',group.type),group.size,'');const g=placeGroup(board,bp,group.start,{team:'A',autoCombat:false,makeCharacter:m=>createCharacter(art.catalog,m.characterId)});if(!g)throw Error('fixture placement');pending.push([g.squads[0],group.target]);}for(const[id,target]of pending)orderSquad(board,id,'move',target);
 const durations=[],intervals=[];let previous=null;
 await new Promise(resolve=>{let frame=0;function draw(timestamp){const start=performance.now();board.update(.05);updateSquadOrders(board);render(ctx,art,board,{},camera,1250,800,1);if(frame>=30){durations.push(performance.now()-start);if(previous!==null)intervals.push(timestamp-previous);}previous=timestamp;if(++frame<150)requestAnimationFrame(draw);else resolve();}requestAnimationFrame(draw);});
 durations.sort((a,b)=>a-b);return{count:board.units.length,fps:1000/(intervals.reduce((a,b)=>a+b,0)/intervals.length),frameCpuP95ms:durations[Math.floor(durations.length*.95)],terrainCopiesPerFrame:calls/10,terrain:terrainRenderStats(ctx)};
 }''',fixture)
 print(json.dumps({'result':result,'errors':errors}));assert not errors;browser.close()
