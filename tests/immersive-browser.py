import os,json
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BASE_URL','http://127.0.0.1:8016')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=b.new_page(viewport={'width':1200,'height':800});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BASE);page.get_by_text('전장 준비 완료',exact=False).wait_for();box=page.locator('#board').bounding_box();assert box['x']==box['y']==0 and box['width']==1200 and box['height']==800
 data=page.evaluate('''async()=>{
 const{loadArtwork,render}=await import('/src/render.mjs');const{Board}=await import('/src/model.mjs');const{createCharacter}=await import('/src/characters/engine.mjs');const{drawTerrain,terrainRenderStats}=await import('/src/terrain-render.mjs');
 const art=await loadArtwork(),board=new Board(200,200);for(let i=0;i<1000;i++)board.spawn(i%100,Math.floor(i/100),createCharacter(art.catalog,'archer'));
 board.time=1;const cv=document.createElement('canvas');cv.width=1000;cv.height=700;const ctx=cv.getContext('2d'),camera={x:500,y:0,scale:1};let first=render(ctx,art,board,{},camera,1000,700,1);board.update(.016);let second=render(ctx,art,board,{},camera,1000,700,1);
 if(first.visibleUnits>=500||second.posedUnits!==0)throw Error('offscreen/pose reuse failure');
 const initial=terrainRenderStats(ctx).builds;camera.x+=20;drawTerrain(ctx,art,board,camera,1000,700,1,true);camera.scale=1.03;drawTerrain(ctx,art,board,camera,1000,700,1,true);if(terrainRenderStats(ctx).builds!==initial)throw Error('gesture rebuilt cache');drawTerrain(ctx,art,board,camera,1000,700,1,false);if(terrainRenderStats(ctx).builds!==initial+1)throw Error('settled camera quality not restored');
 return{total:1000,visible:first.visibleUnits,firstPoseComputations:first.posedUnits,repeatedPoseComputations:second.posedUnits};
 }''');print('PASS crowd and camera reuse: '+json.dumps(data))
 # Move the entire army offscreen; an unchanged empty view must stop clearing.
 page.mouse.move(500,350);page.mouse.down();page.mouse.move(11500,10350,steps=4);page.mouse.up();page.wait_for_timeout(800)
 page.evaluate("()=>{const c=document.querySelector('#board').getContext('2d'),f=c.clearRect.bind(c);window.clearCount=0;c.clearRect=(...a)=>{window.clearCount++;return f(...a)}}");page.wait_for_timeout(350);assert page.evaluate('window.clearCount')==0,'unchanged empty view still redraws'
 page.screenshot(path='/workspace/work/fullscreen-desktop.png');assert not errors,errors;b.close();print('PASS fullscreen and no redraws in unchanged offscreen view')
