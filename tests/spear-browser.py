import os
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1260,'height':600})
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(os.environ.get('BASE_URL','http://127.0.0.1:8030'))
 page.get_by_text('전장 준비 완료',exact=False).wait_for()
 result=page.evaluate('''async()=>{
 const {loadCatalog}=await import('./src/characters/catalog.mjs');
 const {createCharacter,equip,drawCharacter}=await import('./src/characters/engine.mjs');
 const {Board}=await import('./src/model.mjs');
 const {FlagMatch}=await import('./src/flag-match.mjs');
 const catalog=await loadCatalog();
 const b=new Board(),match=new FlagMatch(b,{makeCharacter:m=>{const c=createCharacter(catalog,m.characterId);if(m.weapon)equip(catalog,c,m.weapon,'left');return c},optionsFor:c=>({stats:catalog.characters[c.characterId].testCombat,movement:catalog.characters[c.characterId].testMovement})});
 const squad=match.deploy('A','assault',{x:20,y:20});
 const spears=squad.memberIds.map(id=>b.unit(id)).filter(u=>u.character.characterId==='scout');
 if(spears.length!==10||spears.some(u=>u.damage!==28||u.combat.period!==3.2))throw Error('live deployment did not apply the spear exactly once');
 const layer=document.createElement('div');layer.style='position:fixed;inset:0;z-index:9999;display:flex;background:#ede2c5';document.body.append(layer);
 for(const [state,t,facing]of [['idle',0,-1],['walk',.1,-1],['attack',.14,-1]]){
  const canvas=document.createElement('canvas');canvas.width=420;canvas.height=600;layer.append(canvas);
  const ctx=canvas.getContext('2d');ctx.fillStyle='#4a3829';ctx.font='18px system-ui';ctx.fillText(state,20,32);
  const c=spears[0].character;Object.assign(c.animation,{state,elapsed:t,facing,attackVector:{x:-72,y:0}});
  ctx.save();ctx.translate(250,520);drawCharacter(ctx,catalog,c,t,{scale:.30});ctx.restore();
 }
 return spears.length;
}''')
 assert result==10
 page.screenshot(path='/tmp/spear-poses.png');assert not errors,errors
 browser.close()
print('PASS catalog, deployed spear equipment/stats, idle/walk/thrust rendering')
