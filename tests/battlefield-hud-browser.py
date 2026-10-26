import os
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for w,h in [(390,844),(320,568),(1280,800),(568,320)]:
  page=b.new_page(viewport={'width':w,'height':h});errs=[];page.on('pageerror',lambda e:errs.append(str(e)))
  page.goto(os.environ.get('BASE_URL','http://127.0.0.1:8028'));page.get_by_text('전장 준비 완료',exact=False).wait_for()
  for sel in ['.masthead','.camera-tools','#debug-tools','#match-home','#match-enemy','#match-hud>small','#deployment-reserve']:assert not page.locator(sel).is_visible(),sel
  page.locator('#board').focus()
  for _ in range(20):page.keyboard.press('ArrowRight')
  for _ in range(20):page.keyboard.press('ArrowDown')
  page.keyboard.press('Enter');page.locator('.squad-card').first.click();page.locator('#selection-options').click()
  page.wait_for_timeout(300)
  page.screenshot(path=f'/tmp/hud-{w}.png')
  page.locator('#command-dock').wait_for(state='hidden')
  assert page.locator('#command-dock').evaluate('(e)=>e.inert')
  assert page.locator('#squad-tools').evaluate('(e)=>e.contains(document.activeElement)')
  assert page.locator('.squad-card img').count()==0
  assert page.locator('.squad-emblem svg').count()>0
  panel=page.locator('#squad-tools').bounding_box()
  assert panel['x']>=0 and panel['y']>=0 and panel['x']+panel['width']<=w
  page.locator('[data-squad-formation=column]').click()
  assert page.locator('[data-squad-formation=column]').get_attribute('aria-pressed')=='true'
  page.locator('#squad-close').click()
  page.locator('#squad-tools').wait_for(state='hidden')
  page.locator('#command-dock').wait_for(state='visible')
  assert not page.locator('#command-dock').evaluate('(e)=>e.inert')
  page.wait_for_timeout(200)
  dock=page.locator('#command-dock').bounding_box()
  hud=page.locator('#match-hud').bounding_box()
  assert abs(hud['x']-12)<1
  assert dock['y']>=hud['y']+hud['height']
  assert dock['y']+dock['height']<=h-80
  print(w,page.evaluate("""()=>['#match-hud','#squad-roster','#command-dock','#squad-tools'].map(s=>{let e=document.querySelector(s),r=e.getBoundingClientRect();return[s,r.x,r.y,r.width,r.height,e.hidden]})"""))
  page.locator('#match-skip').click()
  assert page.locator('#match-phase').text_content()=='깃발 공성전'
  assert page.locator('#match-charge').is_visible()
  assert not errs,errs
  assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
  page.close()
 b.close()
