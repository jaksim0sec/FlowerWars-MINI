"""Opt-in A/B king-range combat, selected class stats, offscreen actions, mobile."""
import os,re
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BASE_URL','http://127.0.0.1:8019')
def select(page,x,y):
 page.locator('#board').focus();page.keyboard.press('Escape');page.keyboard.press('ArrowRight');page.keyboard.press('ArrowLeft')
 for _ in range(x):page.keyboard.press('ArrowRight')
 for _ in range(y):page.keyboard.press('ArrowDown')
 page.keyboard.press('Enter')
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1200,'height':850});page.set_default_timeout(6000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(BASE);page.evaluate("document.getElementById('debug-tools')?.setAttribute('open','');document.getElementById('legacy-controls')?.removeAttribute('hidden')");page.get_by_text('전장 준비 완료',exact=False).wait_for();page.locator('#movement-lab summary').click()
 assert page.locator('#movement-combat').is_checked();page.select_option('#movement-scenario','skirmish');page.select_option('#movement-count','16');page.locator('#movement-setup').click();select(page,1,1)
 assert '180 / 180' in page.locator('#selection-health').inner_text();assert 'A' in page.locator('#selection-health').inner_text();assert '공격 38' in page.locator('#selection-combat').inner_text();assert '0.80' in page.locator('#selection-combat').inner_text()
 page.wait_for_timeout(600);assert '180 / 180' in page.locator('#selection-health').inner_text(),'setup must not start fighting'
 page.locator('#movement-start').click();page.wait_for_timeout(1000)
 hp=int(re.search(r'체력 (\d+)',page.locator('#selection-health').inner_text())[1]);assert hp<180
 assert 'A ' in page.locator('#movement-stats').inner_text() and 'B ' in page.locator('#movement-stats').inner_text();page.screenshot(path='/workspace/work/faction-combat-desktop.png')
 # The simulation and deaths must continue when the army is outside rendering range.
 page.mouse.move(500,350);page.mouse.down();page.mouse.move(15000,12000,steps=3);page.mouse.up();page.wait_for_timeout(300)
 page.evaluate("()=>{const c=document.querySelector('#board').getContext('2d'),f=c.clearRect.bind(c);window.combatClears=0;c.clearRect=(...a)=>{window.combatClears++;return f(...a)}}");page.wait_for_timeout(250)
 assert page.evaluate('window.combatClears')==0,'offscreen combat still redraws the empty battlefield'
 page.wait_for_timeout(6000)
 casualties=int(re.search(r'퇴장 (\d+)',page.locator('#movement-stats').inner_text())[1]);assert casualties>0
 page.locator('#movement-default').click();assert page.locator('#unit-count').inner_text()=='용사 2';assert not page.locator('#selection-combat').is_visible()
 print('PASS A/B data, idle auto attacks, selected stats, offscreen deaths and reset')
 page.locator('#movement-combat').uncheck();page.select_option('#movement-scenario','crossing');page.locator('#movement-setup').click();page.locator('#movement-start').click();page.wait_for_timeout(3000)
 assert page.locator('#unit-count').inner_text()=='용사 16';assert '퇴장 0' in page.locator('#movement-stats').inner_text();print('PASS combat-off navigation remains nonviolent')
 mobile=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True);mobile.on('pageerror',lambda e:errors.append(str(e)));mobile.goto(BASE);mobile.evaluate("document.getElementById('debug-tools')?.setAttribute('open','');document.getElementById('legacy-controls')?.removeAttribute('hidden')");mobile.get_by_text('전장 준비 완료',exact=False).wait_for()
 mobile.locator('#movement-lab summary').tap();mobile.select_option('#movement-scenario','skirmish');mobile.locator('#movement-setup').tap();select(mobile,1,1);mobile.locator('#movement-start').tap();mobile.wait_for_timeout(800)
 assert mobile.locator('#selection-combat').is_visible();assert '180' in mobile.locator('#selection-health').inner_text()
 assert mobile.evaluate('document.documentElement.scrollWidth<=innerWidth');box=mobile.locator('#movement-lab').bounding_box();assert box['height']<350 and box['x']>=0 and box['x']+box['width']<=390
 mobile.screenshot(path='/workspace/work/faction-combat-mobile.png');assert not errors,errors
 print('PASS mobile faction battle controls and visible selected stats');browser.close()
