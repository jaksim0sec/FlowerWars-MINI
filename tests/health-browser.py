"""Real damage, selection-only HP, lethal hit, retirement and reset."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BASE_URL','http://127.0.0.1:8014')
def tile(page,x,y,enter=True):
 page.locator('#board').focus();page.keyboard.press('Escape');page.keyboard.press('ArrowRight');page.keyboard.press('ArrowLeft')
 for _ in range(x):page.keyboard.press('ArrowRight')
 for _ in range(y):page.keyboard.press('ArrowDown')
 if enter:page.keyboard.press('Enter')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=b.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BASE);page.evaluate("document.getElementById('debug-tools')?.setAttribute('open','');document.getElementById('legacy-controls')?.removeAttribute('hidden')");page.get_by_text('전장 준비 완료',exact=False).wait_for()
 for x in [0,1]:
  tile(page,x,0,False);page.keyboard.press('s');page.keyboard.press('Enter')
 assert page.locator('#unit-count').inner_text()=='용사 4'
 for n in range(4):
  tile(page,0,0);assert '100 / 100' in page.locator('#selection-health').inner_text();page.keyboard.press('a');page.keyboard.press('ArrowRight');page.keyboard.press('Enter');page.wait_for_timeout(750)
  if n<3:
   tile(page,1,0);assert f'{75-n*25} / 100' in page.locator('#selection-health').inner_text()
 assert page.locator('#unit-count').inner_text()=='용사 3'
 page.wait_for_timeout(1500);tile(page,1,0);assert page.locator('#selection-health').inner_text()==''
 page.locator('#reset').click();assert page.locator('#unit-count').inner_text()=='용사 2'
 assert not errors,errors
 b.close();print('PASS health: four real attacks, exact selected HP, lethal exclusion, retirement, empty tile and reset')
