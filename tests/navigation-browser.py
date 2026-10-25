"""Real UI: concurrent manual commands, opt-in scenarios, offscreen data, mobile."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BASE_URL','http://127.0.0.1:8018')
def select(page,x,y):
 page.locator('#board').focus();page.keyboard.press('Escape');page.keyboard.press('ArrowRight');page.keyboard.press('ArrowLeft')
 for _ in range(x):page.keyboard.press('ArrowRight')
 for _ in range(y):page.keyboard.press('ArrowDown')
 page.keyboard.press('Enter')
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1200,'height':800});page.set_default_timeout(5000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(BASE);page.evaluate("document.getElementById('debug-tools')?.setAttribute('open','');document.getElementById('legacy-controls')?.removeAttribute('hidden')");page.get_by_text('전장 준비 완료',exact=False).wait_for()
 assert not page.locator('#movement-lab').get_attribute('open')
 select(page,2,2)
 for _ in range(6):page.keyboard.press('ArrowRight')
 page.keyboard.press('Enter')
 assert '이동 중' in page.locator('#selection-detail').inner_text()
 select(page,3,5)
 assert page.locator('#attack').is_enabled(),'another actor must remain commandable'
 for _ in range(6):page.keyboard.press('ArrowDown')
 page.keyboard.press('Enter');assert '이동 중' in page.locator('#selection-detail').inner_text()
 # Move the camera out of range while both actors are still travelling.
 page.mouse.move(500,300);page.mouse.down();page.mouse.move(15000,12000,steps=3);page.mouse.up();page.wait_for_timeout(3000)
 select(page,8,2);assert '개나리 방패병 1' in page.locator('#selection-name').inner_text()
 select(page,3,11);assert '개나리소환사 2' in page.locator('#selection-name').inner_text()
 print('PASS simultaneous manual commands and offscreen completion')
 page.locator('#debug-tools > summary').click();page.locator('#movement-lab summary').click();page.locator('#movement-combat').uncheck();page.select_option('#movement-scenario','bottleneck');page.select_option('#movement-count','16');page.locator('#movement-setup').click()
 assert page.locator('#unit-count').inner_text()=='용사 16';assert '도착 0/16' in page.locator('#movement-stats').inner_text()
 page.locator('#movement-start').click();page.wait_for_timeout(500)
 assert page.locator('#movement-start').is_disabled();assert '대기' in page.locator('#movement-stats').inner_text()
 page.screenshot(path='/workspace/work/concurrent-movement-desktop.png')
 page.locator('#movement-default').click();assert page.locator('#unit-count').inner_text()=='용사 2'
 assert not errors,errors
 print('PASS scenario setup/start/statistics/default reset')
 mobile=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
 mobile.on('pageerror',lambda e:errors.append(str(e)));mobile.goto(BASE);mobile.evaluate("document.getElementById('debug-tools')?.setAttribute('open','');document.getElementById('legacy-controls')?.removeAttribute('hidden')");mobile.get_by_text('전장 준비 완료',exact=False).wait_for()
 mobile.locator('#movement-lab summary').tap();mobile.locator('#movement-combat').uncheck();mobile.select_option('#movement-scenario','crossing');mobile.select_option('#movement-count','64');mobile.locator('#movement-setup').tap();mobile.locator('#movement-start').tap();mobile.wait_for_timeout(500)
 assert mobile.locator('#unit-count').inner_text()=='용사 64'
 box=mobile.locator('#movement-lab').bounding_box();assert box['x']>=0 and box['x']+box['width']<=390 and box['height']<350
 assert mobile.evaluate('document.documentElement.scrollWidth<=innerWidth')
 mobile.screenshot(path='/workspace/work/concurrent-movement-mobile.png');assert not errors,errors
 print('PASS touch test menu and compact mobile layout');browser.close()
