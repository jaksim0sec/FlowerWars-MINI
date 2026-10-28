"""Actual battlefield E2E. FIXTURE_TRANSPORT=1 mocks RTC only, never the combat engine."""
import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
BASE=os.environ.get('BASE_URL','http://127.0.0.1:10000');MOCK=os.environ.get('FIXTURE_TRANSPORT')=='1'
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  contexts=[await browser.new_context(viewport={'width':1280,'height':850},service_workers='block'),await browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,service_workers='block')]
  pages={};errors=[]
  async def wire(source,message):
   for page in list(pages.values()):
    if not page.is_closed():await page.evaluate('message=>window.fixtureReceive?.(message)',message)
  if MOCK:
   for i,c in enumerate(contexts):
    await c.expose_binding('fixtureWire',wire);await c.add_init_script("window.__pageRole='"+str(i)+"';\n"+(Path(__file__).parent/'fixtures/online-rtc.mjs').read_text())
  async def new(role):
   page=await contexts[role].new_page();pages[role]=page;page.on('pageerror',lambda e:errors.append(str(e)));await page.goto(BASE);await page.wait_for_function("document.querySelector('#loading').hidden");await page.evaluate("async()=>{window.ctx=(await import('/src/online/game-gate.mjs')).onlineContext;}");return page
  host=await new(0);guest=await new(1)
  await host.locator('#online-entry').click();await host.locator('#online-create').click();await host.wait_for_function("ctx.session.room?.roomCode");code=await host.locator('#online-code').inner_text();await guest.locator('#online-entry').click();await guest.locator('#online-code-input').fill(code);await guest.locator('#online-join button').click()
  for page in [host,guest]:await page.wait_for_function("ctx.session.room?.players.length===2&&ctx.session.room.players.every(p=>p.synchronized)",timeout=30000);await page.locator('#online-ready').click()
  await host.locator('#online-start').click()
  for page in [host,guest]:await page.wait_for_function("ctx.session.room?.state==='PLAYING'&&ctx.session.state?.board.match.multiplayer",timeout=30000)
  print('real multiplayer battlefield initialized',flush=True)
  async def read(page):return await page.evaluate("()=>{const s=ctx.session,b=s.state.board,m=b.match;return {id:s.identity.clientId,code:m.multiplayer&&s.room.roomCode,matchId:s.state.matchId,epoch:s.room.epoch,phase:m.phase,time:b.time,remaining:m.remaining,count:b.units.length,checkpoint:s.room.checkpoint?.sequence,units:b.units.map(u=>({id:u.id,team:u.team,x:u.x,y:u.y,hp:u.health.current,command:u.command})),error:s.status,flags:[m.flags.A.health.current,m.flags.B.health.current]};}")
  async def deploy(page,kind):
   await page.locator('[data-deploy-type="'+kind+'"]').click()
   point=await page.evaluate("""()=>{const m=ctx.session.state.board.match,b=m.board,team=ctx.session.identity.role==='host'?'A':'B',desired=team==='A'?84:92;let anchor;for(let d=0;d<25&&!anchor;d++)for(let dy=-d;dy<=d&&!anchor;dy++)for(const dx of [-d,d]){const p={x:desired+dx,y:64+dy},bp=m.deploymentPreview(team,document.querySelector('[data-deploy-type][aria-pressed=true]').dataset.deployType,p);if(bp&&bp.members.length===m.recruitment.get(document.querySelector('[data-deploy-type][aria-pressed=true]').dataset.deployType).blueprint.members.length){anchor=p;break;}}if(!anchor)throw Error('no deployment anchor');const r=document.querySelector('#board').getBoundingClientRect(),scale=Math.max(.02,Math.min((r.width-32)/((r.width<=700?100:144)*(b.width+b.height)/2),(r.height-220)/(42*(b.width+b.height)),.5)),cx=(b.width-1)/2,cy=(b.height-1)/2;return {x:r.width/2+((anchor.x-anchor.y)-(cx-cy))*72*scale,y:(r.height-20)/2+((anchor.x+anchor.y)-(cx+cy))*42*scale};}""")
   before=(await read(page))['count'];await page.locator('#board').click(position=point);await page.wait_for_function('(n)=>ctx.session.state.board.units.length>n',arg=before,timeout=10000)
  await deploy(host,'assault');await deploy(guest,'mixed');await deploy(host,'ranged');await deploy(guest,'support')
  await guest.wait_for_function("ctx.session.state.board.match.counts.A>0&&ctx.session.state.board.match.counts.B>0");print('both sides deployed through existing UI',flush=True)
  if os.environ.get('FILL_ARMIES')=='1':
   for page in [host,guest]:
    while await page.evaluate("()=>{const s=ctx.session,t=s.identity.role==='host'?'A':'B';return s.state.board.match.reserve[t];}"):
     previous=await page.evaluate("()=>ctx.session.state.board.units.length")
     await page.evaluate("""()=>{const s=ctx.session,m=s.state.board.match,b=m.board,t=s.identity.role==='host'?'A':'B',types=['mixed','defense','ranged','assault','mobile','support'],type=types[m.squadIds[t].length%6];for(let x=t==='A'?8:100;x<(t==='A'?85:170);x+=3)for(let y=8;y<120;y+=3){if(b.navigation.blocked(y*b.width+x)||b.occupied(x,y))continue;const p=m.deploymentPreview(t,type,{x,y});if(p){if(!s.command({kind:'deploy',type,x,y}))throw Error('command rejected');return;}}throw Error('no remaining footprint');}""")
     await page.wait_for_function('(n)=>ctx.session.state.board.units.length>n',arg=previous,timeout=10000)
   for page in [host,guest]:await page.wait_for_function('ctx.session.state.board.units.length===700',timeout=15000)
   print('700 actual soldiers synchronized',flush=True)
  assert not await guest.locator('#match-skip').is_enabled();await host.locator('#match-skip').click();await guest.wait_for_function("ctx.session.state.board.match.phase==='battle'")
  # Exercise real command UI: own roster selection and hold; ownership is additionally checked at host.
  await guest.locator('.squad-card').first.click();await guest.locator('[data-squad-action=hold]').click();await host.wait_for_function("[...(ctx.session.state.board.match.squadIds.B)].some(id=>ctx.session.state.board.units.some(u=>u.squadId===id&&u.combat.holdPosition))")
  for page in [host,guest]:await page.evaluate("async()=>{const s=ctx.session,t=s.identity.role==='host'?'A':'B';const m=s.state.board.match;s.command({kind:'orders',ids:m.squadIds[t],action:'advance',target:{x:88,y:64}});}")
  await host.wait_for_function("ctx.session.state.board.units.some(u=>u.health.current<u.health.max)",timeout=25000)
  await guest.wait_for_function("ctx.session.state.board.units.some(u=>u.health.current<u.health.max)",timeout=10000);print('real combat damage synchronized',flush=True)
  await host.wait_for_function("ctx.session.room.checkpoint.sequence>=2",timeout=20000);before=await read(host)
  # Ensure manual pause freezes actual battle timers without rolling back.
  await host.locator('#online-entry').click();await host.locator('#online-pause').click();await guest.wait_for_function("ctx.session.room.state==='PAUSED'");await host.wait_for_function("ctx.session.room.state==='PAUSED'");frozen=await read(host);await host.wait_for_timeout(1200);assert abs((await read(host))['time']-frozen['time'])<.001;await host.locator('#online-resume').click();await host.wait_for_function("ctx.session.room.state==='PLAYING'")
  # Delete host backup; its re-opened tab must retrieve the committed real army from guest.
  oldid=before['id'];await host.evaluate("()=>ctx.session.backup.clearRoom(ctx.session.room.roomCode)");await host.close();await guest.wait_for_function("ctx.session.room.state==='PAUSED'");frozen=await read(guest);await guest.wait_for_timeout(1000);assert (await read(guest))['time']==frozen['time']
  host=await new(0);await host.wait_for_function("ctx.session.room?.state==='PLAYING'&&ctx.session.state?.board.units.length>0",timeout=30000);restored=await read(host);assert restored['id']==oldid and restored['matchId']==before['matchId'] and restored['count']>0;assert restored['phase']=='battle';assert restored['time']>=before['time']-6;print('actual host army recovered from guest IndexedDB',flush=True)
  await guest.reload();await guest.evaluate("async()=>{window.ctx=(await import('/src/online/game-gate.mjs')).onlineContext;}");await guest.wait_for_function("ctx.session.room?.state==='PLAYING'&&ctx.session.state?.board.units.length>0",timeout=30000);assert (await read(guest))['matchId']==before['matchId'];print('actual guest recovery passed',flush=True)
  # Trigger destruction through the real flag-damage API to verify durable final-result delivery.
  await host.evaluate("()=>{const m=ctx.session.state.board.match;m.damageFlag('B',m.flags.B.health.current);m.refreshStatus();}")
  for page in [host,guest]:await page.wait_for_function("ctx.session.room?.state==='FINISHED'&&ctx.session.state.board.match.phase==='finished'",timeout=15000)
  assert await host.locator('#match-result-title').inner_text()=='승리';assert await guest.locator('#match-result-title').inner_text()=='패배';print('both final outcomes delivered',flush=True)
  await host.screenshot(path='/tmp/live-online-desktop.png');await guest.screenshot(path='/tmp/live-online-mobile.png');assert await guest.evaluate('document.documentElement.scrollWidth<=innerWidth')
  # No socket emits carry units/state; the server only has metadata (integration/unit tests inspect protocol).
  await guest.locator('#match-restart').click();await host.wait_for_function("!ctx.session.room");assert not errors,errors
  await host.wait_for_function("document.querySelector('#match-result').hidden");original_timer=await host.locator('#match-timer').inner_text();await host.wait_for_timeout(1300);assert await host.locator('#match-timer').inner_text()!=original_timer;print('single-player battlefield timer resumed',flush=True)
  print(json.dumps({'transport':'test-only ordered RTC' if MOCK else 'real WebRTC','errors':errors,'passed':['real battlefield','A/B UI deployment','guest hold','combat HP','timer pause','host army recovery from guest','guest recovery','durable final outcomes','mobile','leave']}),flush=True)
  await browser.close()
asyncio.run(main())
