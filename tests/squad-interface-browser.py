"""Responsive dock, dismissible command palette and one-tap orders."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BASE_URL','http://127.0.0.1:8019')
def place_squad(page):
    page.locator('#debug-tools > summary').click()
    page.locator('#group-tools > summary').click()
    page.locator('#group-name').fill('제1분대')
    page.locator('#group-place').click()
    page.locator('#board').focus()
    page.keyboard.press('ArrowRight')
    page.keyboard.press('ArrowLeft')
    for _ in range(8):page.keyboard.press('ArrowRight')
    for _ in range(10):page.keyboard.press('ArrowDown')
    page.keyboard.press('Enter')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox'])
    for width,height in [(1280,800),(390,844)]:
        page=browser.new_page(viewport={'width':width,'height':height})
        errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto(BASE)
        page.get_by_text('전장 준비 완료',exact=False).wait_for()
        assert page.locator('#legacy-controls').is_hidden()
        assert not page.locator('#debug-tools').get_attribute('open')
        assert page.locator('#squad-roster').is_hidden()
        assert page.locator('#squad-tools').is_hidden()
        place_squad(page)
        assert page.locator('.squad-card').count()==1
        assert page.locator('.squad-roster-head').count()==0
        assert page.locator('#squad-roster').evaluate("(e)=>getComputedStyle(e).backgroundColor")=='rgba(0, 0, 0, 0)'
        assert page.locator('.squad-card').evaluate("(e)=>getComputedStyle(e).backgroundColor")=='rgba(0, 0, 0, 0)'
        assert page.locator('.squad-card').evaluate("(e)=>parseFloat(getComputedStyle(e).borderTopWidth)")==0
        assert page.locator('.squad-card').bounding_box()['width']<=80
        page.locator('.squad-card').click()
        assert page.locator('#command-dock').is_visible()
        # Selection stays active while the command controls are used.
        page.locator('.squad-card').click()
        assert page.locator('#command-dock').is_visible()
        page.locator('#selection-options').click()
        assert page.locator('#squad-tools').is_visible()
        palette=page.locator('#squad-tools').bounding_box()
        assert palette['width']<=242 and palette['height']<=242, palette
        assert '제1분대' in page.locator('#squad-name').inner_text()
        page.locator('[data-squad-stance="aggressive"]').click()
        assert page.locator('[data-squad-stance="aggressive"]').get_attribute('aria-pressed')=='true'
        page.locator('[data-squad-formation="column"]').click()
        assert page.locator('[data-squad-formation="column"]').get_attribute('aria-pressed')=='true'
        page.locator('[data-squad-action="hold"]').click()
        assert page.locator('#squad-tools').is_hidden()
        page.locator('.squad-card').click()
        assert page.locator('#command-dock').is_visible()
        page.locator('[data-squad-action="advance"]').click()
        assert page.locator('#squad-tools').is_hidden()
        assert page.locator('#squad-aim').is_visible()
        page.locator('#squad-aim-cancel').click()
        assert page.locator('#squad-aim').is_hidden()
        page.locator('#selection-options').click()
        page.locator('#squad-close').click()
        assert page.locator('#squad-tools').is_hidden()
        # Bad North style: commander selected, then map tap = squad move, not single-unit move.
        page.locator('#board').focus()
        for _ in range(15):page.keyboard.press('ArrowLeft')
        for _ in range(15):page.keyboard.press('ArrowUp')
        page.keyboard.press('Enter')
        assert '이동' in page.locator('#squad-status').text_content()
        assert page.locator('#command-feedback').is_visible()
        assert page.locator('.squad-card.is-selected').count()==1
        # A direct map order must leave the commander selectable and panel closable.
        page.locator('.squad-card').click()
        assert page.locator('#squad-tools').is_visible()
        page.locator('#squad-close').click()
        page.locator('#debug-tools > summary').click()
        assert page.locator('#debug-tools').get_attribute('open') is not None
        page.locator('#debug-close').click()
        assert page.locator('#debug-tools').get_attribute('open') is None
        page.locator('#debug-tools > summary').click()
        page.locator('#legacy-controls-toggle').check()
        assert page.locator('#legacy-controls').is_visible()
        roster=page.locator('#squad-roster').bounding_box()
        if width<700:
            assert roster['y']+roster['height']>=height-2
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        else:
            assert roster['x']>width*.7
        assert not errors,errors
        page.close()
    browser.close()
print('PASS persistent portraits, shared quick orders, compact options, immediate actions and mobile dock')
