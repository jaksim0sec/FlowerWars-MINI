"""Eight-type catalog, selected pack physical assembly and summon regressions."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BASE_URL','http://127.0.0.1:8002')
NEW=['shield-guard','scholar','banner-bearer','clover-mage','archer','scout']
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1280,'height':900});errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(BASE+'/characters.html');page.get_by_text('각 캐릭터의 동작과 장비',exact=False).wait_for()
 assert page.locator('#cards article').count()==8
 for id in NEW:
  card=page.locator(f'[data-character="{id}"]');card.locator('.recommended').click()
  for state in ['idle','walk','attack','hit']:
   card.locator('.state').select_option(state);card.locator('.facing').select_option('1');page.wait_for_timeout(50);card.locator('.facing').select_option('-1')
 failures=page.evaluate('''async()=>{
 const {loadCatalog}=await import('/src/characters/catalog.mjs');const {createCharacter,equip,layoutCharacter}=await import('/src/characters/engine.mjs');const lib=await loadCatalog(),failures=[];
 for(const [id,d] of Object.entries(lib.characters).filter(([id])=>!['gynari-warrior','sprout-healer'].includes(id)))for(const state of ['idle','walk','attack','hit']){
 const c=createCharacter(lib,id);Object.assign(c.animation,{state,elapsed:.2});const l=layoutCharacter(lib,c,.2),masks={};
 for(const name of ['head','body','hand_back','hand_front','leg_back','leg_front']){
 const cv=document.createElement('canvas');cv.width=600;cv.height=700;const ctx=cv.getContext('2d'),p=d.rig.parts[name],draw=l.draws.find(x=>x.part===name);ctx.translate(300,650);ctx.scale(.5,.5);ctx.translate(-d.rig.foot[0],-d.rig.foot[1]);ctx.transform(...draw.matrix);ctx.drawImage(d.images[name],-p.w*p.origin[0],-p.h*p.origin[1],p.w,p.h);masks[name]=ctx.getImageData(0,0,600,700).data;
 }
 for(const name of ['head','hand_back','hand_front','leg_back','leg_front']){
 let overlap=0;const a=masks[name],b=masks.body;for(let i=3;i<a.length;i+=4)if(a[i]>100&&b[i]>100)overlap++;
 if(overlap<10)failures.push(`${id}/${state}: ${name} detached (${overlap} pixels overlap)`);
 }
 }
 return failures;
 }''')
 assert not failures,'\n'.join(failures)
 page.goto(BASE);page.get_by_text('전장 준비 완료',exact=False).wait_for()
 assert page.locator('#character-type option').count()==8
 for id in NEW:
  page.locator('#reset').click();page.locator('#character-type').select_option(id);page.locator('#board').focus();page.keyboard.press('Escape');page.keyboard.press('ArrowRight');page.keyboard.press('s');page.keyboard.press('Enter')
  assert page.locator('#unit-count').inner_text()=='용사 3'
  assert '3' in page.locator('#selection-name').inner_text()
 assert not errors,errors
 b.close();print('PASS selected pack: 8 catalog types, 6 summons, both facings, 4 animations, physical head/limb overlap')
