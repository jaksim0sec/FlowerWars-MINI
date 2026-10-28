"""Invite entry regression: actual server/lobby; no simulated RTC or battle transport."""
import asyncio,json,os
from playwright.async_api import async_playwright
BASE=os.environ.get('BASE_URL','http://127.0.0.1:10000')
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  contexts=[];errors=[]
  async def page():
   context=await browser.new_context(service_workers='block');contexts.append(context);page=await context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));return page
  host=await page();await host.goto(BASE);await host.locator('#online-entry').click();await host.locator('#online-create').click();await host.wait_for_function("!document.querySelector('#online-room').hidden&&document.querySelector('#online-code').textContent.length===6");code=await host.locator('#online-code').inner_text()
  guest=await page()
  async def delay(route):
   await asyncio.sleep(2);await route.continue_()
  await guest.route('**/socket.io/socket.io.js',delay)
  await guest.goto(BASE+'/#join='+code)
  await guest.wait_for_function("document.body.classList.contains('online-lobby')")
  assert await guest.evaluate("async()=> (await import('/src/online/game-gate.mjs')).pauseSinglePlayer()")
  await guest.wait_for_function("document.querySelector('#loading').hidden")
  timer=await guest.locator('#match-timer').inner_text();await guest.wait_for_timeout(500);assert await guest.locator('#match-timer').inner_text()==timer
  await guest.wait_for_function("document.querySelector('#online-code').textContent.length===6")
  assert await guest.locator('#online-code').inner_text()==code
  assert '봇 비활성' in await guest.locator('#online-scope').inner_text()
  await guest.locator('#online-leave').click()
  # Stale private identity must be rejected and then the public invite retried.
  await host.locator('#online-create').click();await host.wait_for_function("!document.querySelector('#online-room').hidden&&document.querySelector('#online-code').textContent.length===6");code=await host.locator('#online-code').inner_text()
  stale=await page();await stale.add_init_script("localStorage.setItem('flowerwars-online',JSON.stringify({roomCode:'ZZZZZZ',role:'guest',clientId:'a'.repeat(32),reconnectToken:'b'.repeat(64),expiresAt:Date.now()+60000}))")
  await stale.goto(BASE+'/#join='+code);await stale.wait_for_function("document.querySelector('#online-code').textContent.length===6");assert await stale.locator('#online-code').inner_text()==code
  # Unavailable room stays in online mode until the user explicitly cancels.
  failed=await page();await failed.goto(BASE+'/#join=ZZZZZZ');await failed.wait_for_function("!document.querySelector('#online-error').hidden")
  assert await failed.evaluate("async()=> (await import('/src/online/game-gate.mjs')).pauseSinglePlayer()")
  await failed.locator('#online-cancel-recovery').click();assert not await failed.evaluate("async()=> (await import('/src/online/game-gate.mjs')).pauseSinglePlayer()")
  assert not errors,errors
  print(json.dumps({'passed':['delayed link auto join','bot paused before authentication','stale identity invite retry','failed invite remains paused','explicit single-player resume'],'errors':errors}))
  for c in contexts:await c.close()
  await browser.close()
asyncio.run(main())
