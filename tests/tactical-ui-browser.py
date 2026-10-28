import asyncio,json,os
from pathlib import Path
BASE=os.environ.get("BASE_URL","http://127.0.0.1:10002")
Path("docs/ui-captures").mkdir(parents=True,exist_ok=True)
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);errors=[]
  for w,h in [(320,568),(390,844),(568,320),(1280,800)]:
   page=await b.new_page(viewport={'width':w,'height':h},service_workers='block');page.on('pageerror',lambda e:errors.append(str(e)));await page.goto(BASE);await page.wait_for_function("document.querySelector('#loading').hidden")
   await page.screenshot(path=f'docs/ui-captures/{w}-preparation.png')
   await page.evaluate("""async()=>{const gate=await import('/src/online/game-gate.mjs'),view=await gate.battleViewReady(),{createBattleState}=await import('/src/online/battle-state.mjs');const state=createBattleState('ui-check',{seed:73,...view.options()});window.uiState=state;for(const type of ['defense','ranged','mobile','support','assault']){let done=false;for(let x=8;x<80&&!done;x+=3)for(let y=12;y<110&&!done;y+=3)done=!!state.board.match.deploy('A',type,{x,y});}view.install(state,'host');}""")
   await page.locator('.squad-card').first.click();await page.screenshot(path=f'docs/ui-captures/{w}-orders.png')
   assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   for selector in ['#command-dock','.squad-card']:
    r=await page.locator(selector).first.bounding_box();assert r and r['x']>=0 and r['y']>=0 and r['x']+r['width']<=w+1 and r['y']+r['height']<=h+1,(w,h,selector,r)
   await page.locator('[data-squad-action=rally]').click();assert await page.locator('.quick-orders').is_visible()
   await page.locator('#selection-options').click();assert await page.locator('#squad-tools').is_visible();assert not await page.locator('#command-dock').is_visible();await page.screenshot(path=f'docs/ui-captures/{w}-formation.png');await page.locator('#squad-close').click()
   await page.locator('[data-squad-action=advance]').click();assert await page.locator('#squad-aim').is_visible();await page.locator('#squad-aim-cancel').click();assert await page.locator('.quick-orders').is_visible()
   print(w,h,'pass',flush=True);await page.close()
  assert not errors,errors;await b.close()
asyncio.run(main())
