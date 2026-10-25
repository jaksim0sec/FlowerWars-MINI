"""Player flow: select multiple squads, command, cancel, quick order, reset."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BASE_URL','http://127.0.0.1:8019')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for width,height in [(1280,800),(390,844)]:
        page=browser.new_page(viewport={'width':width,'height':height},is_mobile=width<700,has_touch=width<700)
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(BASE);page.get_by_text('전장 준비 완료',exact=False).wait_for()
        page.locator('#debug-tools > summary').click();page.locator('#movement-lab > summary').click()
        page.locator('#movement-setup').click()
        cards=page.locator('.squad-card');assert cards.count()==6
        cards.nth(0).click()
        assert page.locator('#command-dock').is_visible()
        if width>700:cards.nth(1).click(modifiers=['Shift'])
        else:
            page.locator('#selection-add').click();cards.nth(1).click();page.locator('#selection-add').click()
        assert page.locator('.squad-card[aria-pressed="true"]').count()==2
        assert '2개 분대' in page.locator('#command-selection').inner_text()
        if width>700:
            page.keyboard.press('m')
            assert page.locator('#squad-aim').is_visible(), 'shortcuts must work immediately after roster selection'
            page.locator('#squad-aim-cancel').click()
        page.locator('#command-dock [data-squad-action="move"]').click()
        assert page.locator('#squad-aim').is_visible()
        assert '2개 분대' in page.locator('#squad-aim-label').inner_text()
        page.locator('#squad-aim-cancel').click()
        assert page.locator('.squad-card[aria-pressed="true"]').count()==2
        page.locator('#selection-platoon').click()
        assert page.locator('.squad-card[aria-pressed="true"]').count()==3
        page.locator('#command-dock [data-squad-action="move"]').click()
        page.locator('#board').focus();page.keyboard.press('ArrowRight');page.keyboard.press('ArrowLeft')
        for _ in range(20):page.keyboard.press('ArrowRight')
        for _ in range(12):page.keyboard.press('ArrowDown')
        page.keyboard.press('Enter')
        assert page.locator('#squad-aim').is_hidden()
        page.wait_for_timeout(250)
        assert '이동' in page.locator('#command-state').inner_text()
        if width>700:
            page.locator('#board').click(position={'x':width*.5,'y':height*.4},button='right')
            assert page.locator('#squad-aim').is_hidden()
        page.locator('#command-dock [data-squad-action="wait"]').click()
        assert '정지' in page.locator('#command-state').inner_text()
        if width>700:
            page.mouse.move(400,300);page.mouse.down(button='right');page.mouse.move(460,330,steps=5);page.mouse.up(button='right')
            assert '정지' in page.locator('#command-state').inner_text(), 'camera drags must not issue orders'
        assert page.locator('.squad-card[aria-pressed="true"]').count()==3
        dock=page.locator('#command-dock').bounding_box()
        assert dock['x']>=0 and dock['x']+dock['width']<=width+1
        assert page.locator('.camera-tools').bounding_box()['height']<70
        assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
        page.screenshot(path=f'/tmp/flowerwars-command-{width}.png')
        page.locator('#board').focus();page.keyboard.press('Escape')
        assert page.locator('#command-dock').is_hidden()
        assert page.locator('.squad-card[aria-pressed="true"]').count()==0
        assert not errors,errors
        page.close()
    browser.close()
print('PASS desktop/mobile multi-selection, platoon commands, target cancel, quick stop, bounds and deselection')
