"""Legacy definitions stay importable but never appear in current UI or seeds."""
import os,json
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BASE_URL','http://127.0.0.1:8012')
VISIBLE=['shield-guard','scholar','banner-bearer','clover-mage','archer','scout']
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox'])
 page=b.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(BASE+'/characters.html');page.get_by_text('각 캐릭터의 동작과 장비',exact=False).wait_for()
 assert page.locator('[data-character]').evaluate_all('(cards)=>cards.map(c=>c.dataset.character)')==VISIBLE
 page.goto(BASE);page.get_by_text('전장 준비 완료',exact=False).wait_for()
 assert page.locator('#character-type option').evaluate_all('(options)=>options.map(o=>o.value)')==VISIBLE
 for moves,name in [(['ArrowRight']*2+['ArrowDown']*2,'개나리 방패병 1'),(['ArrowRight']*3+['ArrowDown']*5,'개나리소환사 2')]:
  page.locator('#board').focus();page.keyboard.press('Escape')
  for key in moves:page.keyboard.press(key)
  page.keyboard.press('Enter');assert page.locator('#selection-name').inner_text()==name
 page.locator('#reset').click();assert page.locator('#unit-count').inner_text()=='용사 2'
 page.goto(BASE+'/rig-editor.html');page.get_by_text('원본에서 시작',exact=True).wait_for()
 bundle=page.evaluate('''async()=>{const{loadCatalog}=await import('/src/characters/catalog.mjs');const{exportEdits}=await import('/src/characters/rig-edit-model.mjs');const d=exportEdits(await loadCatalog());d.activeCharacter='gynari-warrior';d.completed=['gynari-warrior'];return d;}''')
 page.evaluate("d=>localStorage.setItem('doragami-rig-editor-v1',JSON.stringify(d))",bundle);page.reload();page.get_by_text('이전 작업 복원됨',exact=True).wait_for()
 assert page.locator('#character option').evaluate_all('(options)=>options.map(o=>o.value)')==VISIBLE
 assert page.locator('#character').input_value()=='shield-guard'
 page.locator('#import').set_input_files({'name':'old-all.json','mimeType':'application/json','buffer':json.dumps(bundle).encode()});page.get_by_text('8종의 수정 데이터를 불러왔습니다.',exact=True).wait_for()
 assert page.locator('#character').input_value()=='shield-guard'
 assert not errors,errors
 b.close();print('PASS visibility: 6 UI types, visible starting units, legacy draft/import fallback, legacy definitions retained')
