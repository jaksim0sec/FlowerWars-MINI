# Browser smoke: real RTC by default. FIXTURE_TRANSPORT=1 is explicit test-only transport.
import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
BASE=os.environ.get('BASE_URL','http://127.0.0.1:10000')
FIXTURE=os.environ.get('FIXTURE_TRANSPORT')=='1'
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  contexts=[await browser.new_context(viewport={'width':1280,'height':850},service_workers='block'),await browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,service_workers='block')]
  pages={};errors=[]
  async def wire(source,message):
   for page in list(pages.values()):
    if not page.is_closed():await page.evaluate('message=>window.fixtureReceive?.(message)',message)
  if FIXTURE:
   for i,c in enumerate(contexts):
    await c.expose_binding('fixtureWire',wire)
    await c.add_init_script("window.__pageRole='"+str(i)+"';\n"+(Path(__file__).parent/'fixtures/online-rtc.mjs').read_text())
  async def new(role):
   page=await contexts[role].new_page();page.on('pageerror',lambda e:errors.append(str(e)));pages[role]=page;await page.goto(BASE);return page
  host=await new(0);guest=await new(1)
  await host.locator('#online-entry').click();await host.locator('#online-create').click();await host.wait_for_function("document.querySelector('#online-code').textContent.length===6");code=await host.locator('#online-code').inner_text();print('create',code,flush=True)
  await guest.locator('#online-entry').click();await guest.locator('#online-code-input').fill(code);await guest.locator('#online-join button').click()
  for page in [host,guest]:await page.wait_for_function("document.querySelector('#online-status').textContent.includes('직접 연결됨')",timeout=15000)
  print('fixture channel lobby connected' if FIXTURE else 'WebRTC lobby connected',flush=True)
  await guest.locator('#online-chat-input').fill('<b>안녕</b>');await guest.locator('#online-chat-form button').click();await host.wait_for_function("document.querySelector('#online-chat-log').textContent.includes('<b>안녕</b>')");assert await host.locator('#online-chat-log b').count()==0
  for page in [host,guest]:await page.locator('#online-ready').click()
  await host.locator('#online-start').click()
  for page in [host,guest]:await page.wait_for_function("document.querySelector('#online-status').textContent.includes('진행 중')",timeout=15000)
  print('playing',flush=True)
  await guest.locator('#online-fixture').click(position={'x':140,'y':40});await host.wait_for_timeout(6200)
  async def info(page):return await page.evaluate('''async()=>{const id=JSON.parse(sessionStorage.getItem('flowerwars-online')||localStorage.getItem('flowerwars-online'));const db=await new Promise((r,j)=>{const q=indexedDB.open('flowerwars-online-v1');q.onsuccess=()=>r(q.result);q.onerror=j;});const snapshots=await new Promise(r=>{const q=db.transaction('snapshots').objectStore('snapshots').getAll();q.onsuccess=()=>r(q.result.map(x=>x.snapshot));});db.close();return {id,snapshots};}''')
  original=await info(host);assert original['snapshots'];assert original['snapshots'][-1]['state']['units'][1]['x']<80;print('backup saved',flush=True)
  await host.close();await guest.wait_for_function("document.querySelector('#online-status').textContent.includes('일시 정지')",timeout=10000)
  frozen=await guest.locator('#online-fixture-state').inner_text();await guest.wait_for_timeout(1300);assert await guest.locator('#online-fixture-state').inner_text()==frozen
  host=await new(0);await host.wait_for_function("document.querySelector('#online-status').textContent.includes('진행 중')",timeout=15000)
  restored=await info(host);assert restored['id']['clientId']==original['id']['clientId'];assert restored['id']['roomCode']==code;assert restored['snapshots'][-1]['matchId']==original['snapshots'][-1]['matchId'];assert '<b>안녕</b>' in await host.locator('#online-chat-log').inner_text();print('host reopen passed',flush=True)
  before=await info(guest);await guest.reload();await guest.wait_for_function("document.querySelector('#online-status').textContent.includes('진행 중')",timeout=15000);assert (await info(guest))['id']['clientId']==before['id']['clientId'];print('guest reload passed',flush=True)
  await host.locator('#online-pause').click();await host.wait_for_function("document.querySelector('#online-status').textContent.includes('일시 정지')");await host.wait_for_timeout(1500);assert '일시 정지' in await host.locator('#online-status').inner_text();await host.locator('#online-resume').click();await host.wait_for_function("document.querySelector('#online-status').textContent.includes('진행 중')");print('pause/resume passed',flush=True)
  await guest.evaluate("async()=>{const m=await import('/src/online/backup.mjs');const b=new m.SnapshotBackup();await b.clearRoom(JSON.parse(sessionStorage.getItem('flowerwars-online')).roomCode);await b.close();}")
  await guest.reload();await guest.wait_for_function("document.querySelector('#online-status').textContent.includes('진행 중')",timeout=15000);assert (await info(guest))['snapshots'];print('peer backup passed',flush=True)
  # Recover the host FROM ITS GUEST: remove host IndexedDB before closing its tab.
  await host.evaluate("async()=>{const m=await import('/src/online/backup.mjs');const b=new m.SnapshotBackup();await b.clearRoom(JSON.parse(sessionStorage.getItem('flowerwars-online')).roomCode);await b.close();}")
  await host.close();host=await new(0);await host.wait_for_function("document.querySelector('#online-status').textContent.includes('진행 중')",timeout=15000);assert (await info(host))['snapshots'];print('host recovered from guest backup',flush=True)
  # An already-active old socket is transient: a reopening tab must keep credentials and retry.
  previous_host=host;original_id=(await info(host))['id']['clientId'];host=await new(0)
  await host.wait_for_function("document.querySelector('#online-error').textContent.includes('이미 연결')",timeout=15000)
  assert (await info(host))['id']['clientId']==original_id;assert (await info(host))['snapshots']
  await previous_host.close();await host.wait_for_function("document.querySelector('#online-status').textContent.includes('진행 중')",timeout=15000);assert (await info(host))['id']['clientId']==original_id;print('old active socket retry retained identity',flush=True)
  await host.screenshot(path='/tmp/online-desktop.png');await guest.screenshot(path='/tmp/online-mobile.png');assert await guest.evaluate('document.documentElement.scrollWidth<=innerWidth');assert await guest.evaluate("(()=>{const p=document.querySelector('#online-panel').getBoundingClientRect();return p.left>=0&&p.right<=innerWidth&&p.bottom<=innerHeight;})()")
  print('mobile bounds',await guest.evaluate("({entry:document.querySelector('#online-entry').getBoundingClientRect().toJSON(),hud:document.querySelector('#match-hud').getBoundingClientRect().toJSON()})"),flush=True)
  await guest.locator('#online-leave').click();await host.wait_for_function("document.querySelector('#online-error').textContent.includes('종료')");assert not errors,errors
  print(json.dumps({'transport':'test-only fixture; actual Socket.IO and IndexedDB' if FIXTURE else 'WebRTC DataChannel','errors':errors,'passed':['lobby','chat plain text','ready/start','guest command','backup','host reopen','guest reload','pause/resume','peer backup','host recovery from guest','active socket retry','mobile layout','leave']}),flush=True)
  await host.locator('#online-close').click();initial=await host.locator('#match-timer').inner_text();await host.wait_for_timeout(1300);assert await host.locator('#match-timer').inner_text()!=initial;print('single-player timer resumed',flush=True)
  await browser.close()
asyncio.run(main())
