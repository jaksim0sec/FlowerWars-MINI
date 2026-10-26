"""Lost/cancelled gestures and pans must never leak into movement commands."""
import os
from playwright.sync_api import sync_playwright

BASE=os.environ.get('BASE_URL','http://127.0.0.1:8026')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for width,height in [(1280,800),(390,844)]:
        page=browser.new_page(viewport={'width':width,'height':height},has_touch=True,is_mobile=width<700)
        errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto(BASE)
        page.get_by_text('전장 준비 완료',exact=False).wait_for()
        # Observe the real command boundary without adding production debug APIs.
        page.evaluate("""async()=>{
          const {Board}=await import('./src/model.mjs');
          const original=Board.prototype.move;
          window.moves=[];
          Board.prototype.move=function(...args){if(this.unit(args[0])?.team==='A')window.moves.push(args);return original.apply(this,args)};
        }""")
        # Keyboard deploy at the initial (0,0) cursor, then select its roster card.
        page.locator('#board').focus()
        for _ in range(20):page.keyboard.press('ArrowRight')
        for _ in range(20):page.keyboard.press('ArrowDown')
        page.keyboard.press('Enter')
        page.locator('.squad-card').first.wait_for()
        page.locator('.squad-card').first.click()
        page.locator('#match-skip').click()
        box=page.locator('#board').bounding_box()
        point={'x':box['width']/2,'y':(box['height']-20)/2}
        page.mouse.move(point['x'],point['y'])
        page.mouse.down()
        page.evaluate("""({x,y})=>{
          window.moves=[];
          document.querySelector('#board').dispatchEvent(new PointerEvent('pointerup',
            {pointerId:1,clientX:x+12,clientY:y,button:0,bubbles:true}));
        }""",point)
        assert page.evaluate('moves.length')==0,'pan release was interpreted as a move order'
        page.mouse.up()
        # Losing capture must clear the stale pointer and suppress its release.
        page.mouse.down()
        page.evaluate("""()=>{
          window.moves=[];
          document.querySelector('#board').dispatchEvent(new PointerEvent('lostpointercapture',
            {pointerId:1,bubbles:true}));
        }""")
        page.mouse.up()
        assert page.evaluate('moves.length')==0,'capture loss leaked a move order'
        page.mouse.click(point['x'],point['y'])
        assert page.evaluate('moves.length')>0,'next ordinary move was swallowed'
        if width<700:
            session=page.context.new_cdp_session(page)
            page.evaluate('moves=[]')
            session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[point]})
            session.send('Input.dispatchTouchEvent',{'type':'touchCancel','touchPoints':[]})
            assert page.evaluate('moves.length')==0,'cancelled touch issued an order'
            session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[
                {'x':point['x']-20,'y':point['y']},{'x':point['x']+20,'y':point['y']}]})
            session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
            assert page.evaluate('moves.length')==0,'two-finger gesture issued an order'
            # A new actual touch is accepted after cancellation/multitouch.
            scale=min((width-32)/14400,(height-220)/8400,.5)
            fresh={'x':point['x']-85*72*scale,'y':point['y']-4*42*scale}
            session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[fresh]})
            session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
            assert page.evaluate('moves.length')>0,'touch remained stuck after cancellation'
        assert not errors,errors
        page.close()
    browser.close()
print('PASS desktop/mobile: release displacement rejected, capture loss cleared, next tap commands')
