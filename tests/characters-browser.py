"""Independent visible preview loadouts and board integration."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BASE_URL','http://127.0.0.1:8001')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1200,'height':1000});errors=[];requests=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('request',lambda r:requests.append(r.url))
 page.goto(BASE+'/characters.html');page.get_by_text('각 캐릭터의 동작과 장비',exact=False).wait_for()
 banner=page.locator('[data-character="banner-bearer"]');guard=page.locator('[data-character="shield-guard"]')
 assert banner.locator('.left').input_value()==''
 banner.locator('.recommended').click();assert banner.locator('.left').input_value()=='banner_bearer_banner'
 assert guard.locator('.left').input_value()==''
 banner.locator('.mode').select_option('both');assert banner.locator('.right').is_disabled()
 for state in ['idle','walk','attack','hit']:
  banner.locator('.state').select_option(state);page.wait_for_timeout(120)
 banner.locator('.facing').select_option('-1');banner.locator('.clear').click();assert banner.locator('.left').input_value()==''
 guard.locator('.left').select_option('basic_sword');guard.locator('.right').select_option('clover_staff')
 assert not any('/model.mjs' in r or '/render.mjs' in r for r in requests), 'preview depends on board'
 page.screenshot(path='/workspace/work/characters-preview.png',full_page=True)
 page.goto(BASE);page.evaluate("document.getElementById('debug-tools')?.setAttribute('open','');document.getElementById('legacy-controls')?.removeAttribute('hidden')");page.get_by_text('전장 준비 완료',exact=False).wait_for()
 page.get_by_label('소환할 캐릭터').select_option('clover-mage');page.get_by_role('button',name='새싹힐러 소환').click()
 page.locator('#board').focus();page.keyboard.press('Escape');page.keyboard.press('ArrowRight');page.keyboard.press('s');page.keyboard.press('Enter')
 assert '새싹힐러 3' in page.locator('#selection-name').inner_text()
 page.screenshot(path='/workspace/work/clover-board.png')
 assert not errors,errors
 b.close();print('PASS character preview: standalone, unarmed, equip, dual wield, shared grip UI, independent instances; clover mage board summon')
