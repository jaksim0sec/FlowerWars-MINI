import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BASE_URL','http://127.0.0.1:8019')
def select(page,x,y):
 page.locator('#board').focus();page.keyboard.press('Escape');page.keyboard.press('ArrowRight');page.keyboard.press('ArrowLeft')
 for _ in range(x):page.keyboard.press('ArrowRight')
 for _ in range(y):page.keyboard.press('ArrowDown')
 page.keyboard.press('Enter')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=b.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BASE);page.evaluate("document.getElementById('debug-tools')?.setAttribute('open','');document.getElementById('legacy-controls')?.removeAttribute('hidden')");page.get_by_text('전장 준비 완료',exact=False).wait_for();page.locator('#movement-lab summary').click();page.locator('#movement-seed').fill('17');page.locator('#movement-mirror').check();page.locator('#movement-setup').click()
 select(page,16,10);assert '개나리 방패병 1' in page.locator('#selection-name').inner_text()
 select(page,24,10);assert '낙옆궁수 57' in page.locator('#selection-name').inner_text();assert '사거리 4' in page.locator('#selection-combat').inner_text()
 page.locator('#movement-mirror').uncheck();page.locator('#movement-setup').click();select(page,4,10);assert '낙옆궁수 57' in page.locator('#selection-name').inner_text();page.locator('#movement-start').click();page.wait_for_timeout(1000);assert not errors,errors;b.close();print('PASS seed/mirror controls, mirrored selection, ranged profile and battle start')
