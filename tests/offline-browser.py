"""Warm once online; then load all application pages and summon while offline."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BASE_URL','http://127.0.0.1:8019')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);c=b.new_context();page=c.new_page();page.set_default_timeout(10000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(BASE);page.get_by_text('전장 준비 완료',exact=False).wait_for();assert page.locator('link[rel="manifest"]').count()==1
 page.evaluate('async()=>{await navigator.serviceWorker.ready;}');c.set_offline(True);page.reload();page.get_by_text('전장 준비 완료',exact=False).wait_for()
 page.locator('#debug-tools > summary').click();page.locator('#movement-lab summary').click();page.locator('#movement-setup').click();assert page.locator('#unit-count').inner_text()=='용사 64';page.locator('#movement-start').click()
 page.goto(BASE+'/characters.html');page.locator('[data-character="shield-guard"]').wait_for();assert page.locator('[data-character]').count()==6
 page.goto(BASE+'/rig-editor.html');page.locator('#character option').first.wait_for(state='attached');assert page.locator('#character option').count()==6
 assert not errors,errors;b.close();print('PASS offline reload, full roster battle, preview and rig editor after single online warmup')
