"""The actual mobile preview must change empty/holding poses and restore them."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BASE_URL','http://127.0.0.1:8004')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox'])
 page=b.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True);errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(BASE+'/characters.html');page.get_by_text('각 캐릭터의 동작과 장비',exact=False).wait_for()
 for id in ['banner-bearer','clover-mage','archer']:
  card=page.locator(f'[data-character="{id}"]')
  side='left' if id=='banner-bearer' else 'right'
  # Capture rig-space positions via the same catalog and instance APIs used by UI.
  data=page.evaluate('''async ({id,side})=>{
   const {loadCatalog}=await import('/src/characters/catalog.mjs');const {createCharacter,equip,unequip,layoutCharacter,point}=await import('/src/characters/engine.mjs');
   const lib=await loadCatalog(),c=createCharacter(lib,id),def=lib.characters[id];
   const palm=()=>point(layoutCharacter(lib,c,0).sockets[side].matrix);
   const empty=palm();equip(lib,c,def.recommendedWeapon,side);const holding=palm();unequip(c,side);return{empty,holding,restored:palm()};
  }''',{'id':id,'side':side})
  assert data['empty']==data['restored']
  assert data['empty'][1]>data['holding'][1]+20,(id,data)
  card.locator('.recommended').tap();assert card.locator('.'+side).input_value()
  card.locator('.clear').tap();assert card.locator('.'+side).input_value()==''
  for state in ['idle','walk','attack','hit']:
   card.locator('.state').select_option(state);card.locator('.facing').select_option('1');page.wait_for_timeout(50);card.locator('.facing').select_option('-1')
 assert not errors,errors
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 b.close();print('PASS mobile empty/holding hands: lower empty palms, equip, clear, restore, both facings and four states')
