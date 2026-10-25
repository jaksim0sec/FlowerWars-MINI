import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BASE_URL','http://127.0.0.1:8019')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=b.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BASE);page.evaluate("document.getElementById('debug-tools')?.setAttribute('open','');document.getElementById('legacy-controls')?.removeAttribute('hidden')");page.get_by_text('전장 준비 완료',exact=False).wait_for();page.locator('#group-tools summary').click();page.locator('#group-name').fill('제1분대');page.locator('#group-place').click();page.locator('#board').focus()
 page.keyboard.press('ArrowRight');page.keyboard.press('ArrowLeft')
 for _ in range(8):page.keyboard.press('ArrowRight')
 for _ in range(10):page.keyboard.press('ArrowDown')
 page.keyboard.press('Enter');assert page.locator('#unit-count').inner_text()=='용사 10';assert '제1분대' in page.locator('#selection-name').inner_text();assert '1개 부대' in page.locator('#group-status').inner_text()
 page.locator('#reset').click();assert '0개 부대' in page.locator('#group-status').text_content();assert page.locator('#unit-count').inner_text()=='용사 2';assert not errors,errors;b.close();print('PASS named squad placement, shared group selection and reset')
