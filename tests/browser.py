"""Real pointer/touch acceptance checks. Run against `node server.mjs` on port 8000."""
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get('BASE_URL', 'http://127.0.0.1:8000')

def point(page, x, y):
    size = page.viewport_size
    scale = min((size['width'] - 48) / 1008, (size['height'] - 240) / 630, 1.1)
    scale = max(.25, scale)
    return (size['width']/2 + ((x-y)*72-72)*scale,
            (size['height']-44)/2 + ((x+y)*42-263)*scale)

def cell(page, x, y, touch=False):
    p = point(page,x,y)
    (page.touchscreen.tap if touch else page.mouse.click)(*p)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM', '/usr/bin/chromium'), args=['--no-sandbox'])
    page = browser.new_page(viewport={'width':1280,'height':900})
    page.set_default_timeout(7000)
    errors, failed = [], []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('response', lambda r: failed.append(r.url) if r.status >= 400 else None)
    page.goto(BASE)
    page.locator('canvas').wait_for()
    page.get_by_text('전장 준비 완료', exact=False).wait_for()
    page.get_by_role('button', name='개나리용사 소환').click()
    cell(page, 2, 4)
    assert page.locator('#unit-count').inner_text() == '용사 3'
    assert '개나리용사 3' in page.locator('#selection-name').inner_text()
    cell(page, 4, 4)
    assert '이동 중' in page.locator('#selection-detail').inner_text()
    page.wait_for_timeout(1000)
    assert '5, 5' in page.locator('#selection-detail').inner_text()
    page.get_by_role('button', name='공격', exact=True).click()
    cell(page, 5, 3)
    page.wait_for_timeout(1600)
    cell(page, 5, 3)
    assert '피격 1회' in page.locator('#selection-detail').inner_text()
    # A drag while summoning must move the camera without adding a unit.
    page.get_by_role('button', name='개나리용사 소환').click()
    start=point(page,1,3)
    page.mouse.move(*start);page.mouse.down();page.mouse.move(start[0]+90,start[1]+30,steps=10);page.mouse.up()
    assert page.locator('#unit-count').inner_text() == '용사 3'
    old=page.locator('#zoom-value').inner_text()
    page.mouse.wheel(0,-250);page.wait_for_timeout(100)
    assert page.locator('#zoom-value').inner_text()!=old
    page.get_by_role('button',name='전장 맞춤').click()
    cell(page,1,3)
    assert page.locator('#unit-count').inner_text() == '용사 4'
    # Reset while an action is in progress cannot deliver a stale hit.
    page.get_by_role('button',name='공격',exact=True).click();cell(page,5,3)
    page.get_by_role('button',name='초기화',exact=True).click();page.wait_for_timeout(1600)
    assert page.locator('#unit-count').inner_text() == '용사 2'
    # Selecting a tile allows mixing terrain; occupied summoning keeps the count.
    cell(page,0,3)
    assert page.locator('#selection-detail').inner_text() == '잔디 블럭'
    page.get_by_role('button',name='흙으로',exact=True).click()
    assert page.locator('#selection-detail').inner_text() == '흙 블럭'
    page.get_by_role('button',name='초기화',exact=True).click()
    cell(page,0,3)
    assert page.locator('#selection-detail').inner_text() == '잔디 블럭'
    page.get_by_role('button',name='개나리용사 소환').click();cell(page,2,2)
    assert page.locator('#unit-count').inner_text() == '용사 2'
    # Canvas keyboard controls offer the same select/place flow.
    page.locator('#board').focus();page.keyboard.press('Escape');page.keyboard.press('ArrowRight');page.keyboard.press('s');page.keyboard.press('Enter')
    assert page.locator('#unit-count').inner_text() == '용사 3'
    page.screenshot(path='/tmp/doragami-desktop.png')
    assert not errors, errors
    assert not failed, failed
    print('PASS desktop: assets, summon, selection, walking, attack/hit, drag, zoom, reset')

    mobile = browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=2)
    page=mobile.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BASE);page.get_by_text('전장 준비 완료',exact=False).wait_for()
    page.get_by_role('button',name='개나리용사 소환').tap();cell(page,2,4,True)
    assert page.locator('#unit-count').inner_text()=='용사 3'
    cell(page,4,4,True);page.wait_for_timeout(1000)
    assert '5, 5' in page.locator('#selection-detail').inner_text()
    page.get_by_role('button',name='공격',exact=True).tap();cell(page,5,3,True);page.wait_for_timeout(1600)
    cell(page,5,3,True)
    assert '피격 1회' in page.locator('#selection-detail').inner_text()
    cdp=mobile.new_cdp_session(page)
    def touches(event, points):
        cdp.send('Input.dispatchTouchEvent', {'type':event,'touchPoints':[{'x':x,'y':y,'id':i} for i,(x,y) in enumerate(points)]})
    old=page.locator('#zoom-value').inner_text()
    touches('touchStart',[(140,350),(240,350)])
    touches('touchMove',[(100,350),(280,350)])
    touches('touchEnd',[])
    page.wait_for_timeout(100)
    assert page.locator('#zoom-value').inner_text()!=old
    assert page.locator('#unit-count').inner_text()=='용사 3'
    page.get_by_role('button',name='전장 맞춤').tap()
    page.get_by_role('button',name='개나리용사 소환').tap()
    touches('touchStart',[(180,410)])
    touches('touchMove',[(230,445)])
    touches('touchEnd',[])
    assert page.locator('#unit-count').inner_text()=='용사 3'
    page.get_by_role('button',name='전장 맞춤').tap()
    page.screenshot(path='/tmp/doragami-mobile.png')
    assert not errors, errors
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    print('PASS mobile: touch summon, walk, attack, pinch, responsive layout')
    for w in [320,375,390]:
        small=browser.new_page(viewport={'width':w,'height':568})
        small.goto(BASE);small.get_by_text('전장 준비 완료',exact=False).wait_for()
        label=small.locator('#selection-detail').bounding_box()
        actions=small.locator('.actions').bounding_box()
        assert label['x']+label['width'] <= actions['x'] or label['y']+label['height'] <= actions['y'], f'selection overlaps controls at {w}px'
        small.close()
    print('PASS narrow screens: selection text and controls stay separate')
    # Missing approved assets must be named, never silently substituted.
    missing=browser.new_page()
    missing.route('**/grass.webp', lambda route: route.fulfill(status=404,body='missing'))
    missing.goto(BASE)
    missing.locator('#loading').filter(has_text='grass.webp').wait_for()
    assert '에셋을 확인' in missing.locator('#notice').inner_text()
    print('PASS missing artwork: reports required file without substitute images')
    browser.close()
