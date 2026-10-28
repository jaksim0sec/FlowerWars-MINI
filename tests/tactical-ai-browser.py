"""Compare both commanders with identical deployed units through local file interception."""
import json,mimetypes
from pathlib import Path
from urllib.parse import urlparse,unquote
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1250,'height':800},service_workers='block');errors=[]
 page.on('pageerror',lambda error:errors.append(str(error)))
 def route(request):
  url=urlparse(request.request.url);path=(root/unquote(url.path).lstrip('/')).resolve()
  if url.hostname!='flower.test' or not path.is_relative_to(root) or not path.is_file():return request.fulfill(status=404,body='')
  request.fulfill(path=str(path),content_type='text/javascript' if path.suffix=='.mjs' else mimetypes.guess_type(str(path))[0] or 'application/octet-stream')
 page.route('**/*',route);page.goto('http://flower.test/manifest.json')
 result=page.evaluate('''async()=>{
 const {Board}=await import('/src/model.mjs'),{FlagMatch}=await import('/src/flag-match.mjs');
 const {TacticalController}=await import('/src/ai/controller.mjs'),{deployReserves}=await import('/tests/deployment-helpers.mjs');
 const {loadArtwork,render}=await import('/src/render.mjs'),{createCharacter}=await import('/src/characters/engine.mjs');
 const {updateSquadOrders}=await import('/src/squad-orders.mjs');const art=await loadArtwork(),results=[];
 const canvas=document.createElement('canvas');canvas.width=1250;canvas.height=800;document.body.replaceChildren(canvas);const ctx=canvas.getContext('2d');
 for(const implementation of ['legacy','utility']){
  const board=new Board(),match=new FlagMatch(board,{seed:73,aiImplementation:'legacy',unitProfiles:art.catalog.characters,makeCharacter:s=>createCharacter(art.catalog,s.characterId),optionsFor:c=>({stats:art.catalog.characters[c.characterId].testCombat,movement:art.catalog.characters[c.characterId].testMovement})});
  deployReserves(match,'mixed');match.start();if(implementation==='utility'){match.aiImplementation='utility';match.command=new TacticalController(match);match.command.refresh();}match.charge();
  const durations=[],intervals=[];let previous=null;
  await new Promise(resolve=>{let frame=0;function draw(timestamp){const start=performance.now();board.update(.05);match.update(.05);if(frame%2===0)updateSquadOrders(board);render(ctx,art,board,{}, {x:550,y:40,scale:.0625},1250,800,1);if(frame>=30){durations.push(performance.now()-start);intervals.push(timestamp-previous);}previous=timestamp;if(++frame<180)requestAnimationFrame(draw);else resolve();}requestAnimationFrame(draw);});
  durations.sort((a,b)=>a-b);results.push({implementation,count:board.units.length,fps:1000/(intervals.reduce((a,b)=>a+b,0)/intervals.length),frameCpuP95ms:durations[Math.floor(durations.length*.95)]});
 }return results;
 }''')
 print(json.dumps({'results':result,'errors':errors}));assert not errors;assert all(r['count']==700 for r in result);browser.close()
