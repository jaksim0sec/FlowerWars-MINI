import asyncio,os
BASE=os.environ.get("BASE_URL","http://127.0.0.1:10000")
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);errors=[]
  for w,h in [(320,568),(390,844),(1280,800)]:
   page=await b.new_page(viewport={'width':w,'height':h},service_workers='block');page.on('pageerror',lambda e:errors.append(str(e)));await page.goto(BASE);await page.wait_for_function("document.querySelector('#loading').hidden")
   await page.evaluate("""async()=>{const {battleViewReady}=await import('/src/online/game-gate.mjs'),v=await battleViewReady(),{createBattleState}=await import('/src/online/battle-state.mjs');const s=createBattleState('art',{seed:73,...v.options()});let done=false;for(let x=8;x<80&&!done;x++)for(let y=20;y<100&&!done;y++)done=!!s.board.match.deploy('A','mixed',{x,y});v.install(s,'host');}""")
   await page.locator('.squad-card').first.click();await page.wait_for_function("[...document.querySelectorAll('.quick-orders img')].length===5&&[...document.querySelectorAll('.quick-orders img')].every(i=>i.complete&&i.naturalWidth>0)")
   assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   assert await page.locator('.quick-orders button').count()==5
   await page.wait_for_timeout(300);await page.screenshot(path=f'/tmp/selected-ui-{w}.png');await page.locator('[data-squad-action=advance]').click();assert await page.locator('#squad-aim').is_visible();await page.locator('#squad-aim-cancel').click();await page.close();print(w,'pass',flush=True)
  assert not errors,errors;await b.close()
asyncio.run(main())
