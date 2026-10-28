"""Browser diagnosis with real 700-unit battle/rendering and test-only ordered RTC.
DIAG_NO_CHECKPOINT=1 is a runtime-only ablation, never a game setting.
Run against npm start with Python Playwright and Chromium installed.
"""
import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
BASE=os.environ.get('BASE_URL','http://127.0.0.1:10000');ROOT=Path(__file__).resolve().parents[1]
INSTRUMENT=r'''(()=>{const d=window.diag={enabled:false,raf:[],paint:[],long:[],steps:[],frames:[],receives:[],checkpoints:[],positionChanges:0,samples:0,last:null};const raf=window.requestAnimationFrame;let prior=0;window.requestAnimationFrame=callback=>raf.call(window,time=>{const start=performance.now();callback(time);if(d.enabled){d.raf.push(prior?time-prior:0);d.paint.push(performance.now()-start);const s=window.ctx?.session,u=s?.state?.board?.units.find(u=>u.health.current>0&&u.state==='walk');if(u){const k=[u.id,u.visualX,u.visualY,u.elapsed].join();d.samples++;if(d.last!==k)d.positionChanges++;d.last=k;}prior=time;}});new PerformanceObserver(list=>{if(d.enabled)for(const e of list.getEntries())d.long.push({at:e.startTime,duration:e.duration});}).observe({type:'longtask',buffered:false});})();'''
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  pages={};contexts=[]
  async def wire(source,message):
   for page in pages.values():
    if not page.is_closed():await page.evaluate('m=>window.fixtureReceive?.(m)',message)
  for i in range(2):
   c=await browser.new_context(viewport={'width':1280,'height':850},service_workers='block');contexts.append(c);await c.expose_binding('fixtureWire',wire);await c.add_init_script("window.__pageRole='"+str(i)+"';\n"+(ROOT/'tests/fixtures/online-rtc.mjs').read_text());await c.add_init_script(INSTRUMENT)
   page=await c.new_page();pages[i]=page;await page.goto(BASE);await page.wait_for_function("document.querySelector('#loading').hidden");await page.evaluate("async()=>window.ctx=(await import('/src/online/game-gate.mjs')).onlineContext")
  host,guest=pages.values();await host.locator('#online-entry').click();await host.locator('#online-create').click();await host.wait_for_function("!document.querySelector('#online-room').hidden");code=await host.locator('#online-code').inner_text();await guest.goto(BASE+'/#join='+code);await guest.evaluate("async()=>window.ctx=(await import('/src/online/game-gate.mjs')).onlineContext")
  for page in [host,guest]:await page.wait_for_function("ctx.session.room?.players.length===2&&ctx.session.room.players.every(p=>p.synchronized)");await page.locator('#online-ready').click()
  await host.wait_for_function("ctx.session.room.state==='READY'");await host.locator('#online-start').click()
  for page in [host,guest]:await page.wait_for_function("ctx.session.room.state==='PLAYING'&&ctx.session.state?.board")
  for page in [host,guest]:
   while await page.evaluate("()=>{const s=ctx.session,t=s.identity.role==='host'?'A':'B';return s.state.board.match.reserve[t]}"):
    n=await page.evaluate('ctx.session.state.board.units.length');await page.evaluate("""()=>{const s=ctx.session,b=s.state.board,m=b.match,t=s.identity.role==='host'?'A':'B',type=['mixed','defense','ranged','assault','mobile','support'][m.squadIds[t].length%6];for(let x=t==='A'?8:100;x<(t==='A'?85:170);x+=3)for(let y=8;y<120;y+=3)if(m.deploymentPreview(t,type,{x,y})){if(s.command({kind:'deploy',type,x,y}))return;}throw Error('no deployment');}""");await page.wait_for_function('(n)=>ctx.session.state.board.units.length>n',arg=n)
  await host.evaluate("()=>{ctx.session.command({kind:'begin-battle'});for(const team of ['A','B']){if(team==='A')ctx.session.command({kind:'orders',ids:ctx.session.state.board.match.squadIds.A,action:'advance',target:{x:88,y:64}})}}")
  await guest.evaluate("()=>ctx.session.command({kind:'orders',ids:ctx.session.state.board.match.squadIds.B,action:'advance',target:{x:88,y:64}})")
  if os.environ.get('DIAG_NO_CHECKPOINT')=='1':await host.evaluate("()=>{const s=ctx.session;s.lastCheckpoint=performance.now();s.checkpoint=async()=>{s.lastCheckpoint=performance.now();}}")
  for page in [host,guest]:await page.evaluate("""()=>{const s=ctx.session,d=diag,b=s.state.board,p=Object.getPrototypeOf(b),update=p.update;p.update=function(...args){const t=performance.now();const r=update.apply(this,args);if(d.enabled)d.steps.push(performance.now()-t);return r;};const receive=s.receive;s.receive=async function(m,...a){const t=performance.now();if(d.enabled&&m.kind==='frame')d.frames.push(t);const waiting=receive.call(this,m,...a),sync=performance.now()-t;const r=await waiting;if(d.enabled)d.receives.push({kind:m.kind,ms:performance.now()-t,sync,at:t});return r;};const cp=s.checkpoint;s.checkpoint=async function(...a){const t=performance.now(),pending=cp.apply(this,a),sync=performance.now()-t;const r=await pending;if(d.enabled)d.checkpoints.push({at:t,sync,ms:performance.now()-t});return r;};d.enabled=true;}""")
  await host.wait_for_timeout(20000)
  results=[]
  for page in [host,guest]:results.append(await page.evaluate("""()=>{diag.enabled=false;const q=(a,p)=>[...a].sort((a,b)=>a-b)[Math.min(a.length-1,Math.floor(a.length*p))]||0,delta=diag.frames.slice(1).map((t,i)=>t-diag.frames[i]);return {role:ctx.session.identity.role,soldiers:ctx.session.state.board.units.length,elapsed:ctx.session.state.board.match.elapsed,rafSamples:diag.raf.length,rafP95:q(diag.raf,.95),rafMax:Math.max(...diag.raf),paintP95:q(diag.paint,.95),paintMax:Math.max(...diag.paint),stepP95:q(diag.steps,.95),positionSamples:diag.samples,positionChanges:diag.positionChanges,frameCount:diag.frames.length,frameGapP50:q(delta,.5),frameGapP95:q(delta,.95),frameGapMax:Math.max(0,...delta),receiveP95:q(diag.receives.map(x=>x.ms),.95),checkpoints:diag.checkpoints,checkpointReceives:diag.receives.filter(x=>x.kind==='checkpoint'),longTasks:diag.long};}"""))
  if os.environ.get('OUTPUT'):Path(os.environ['OUTPUT']).write_text(json.dumps(results,indent=2)+'\n')
  print(json.dumps(results,indent=2),flush=True)
  for page in [host,guest]:await page.evaluate('ctx.session.leave()')
  await browser.close()
asyncio.run(main())
