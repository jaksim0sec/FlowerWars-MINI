"""Regression checks for compact debug menu and responsive squad roster."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BASE_URL','http://127.0.0.1:8019')
def deploy(page):
    page.locator('#debug-tools > summary').click()
    page.locator('#group-tools > summary').click()
    page.locator('#group-name').fill('제1분대')
    page.locator('#group-place').click()
    page.locator('#board').focus()
    page.keyboard.press('ArrowRight');page.keyboard.press('ArrowLeft')
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
        deploy(page)
        assert page.locator('.squad-card').count()==1
        assert page.locator('#squad-roster').is_visible()
        assert page.locator('.squad-card-team').inner_text()=='A팀'
        page.wait_for_function("document.querySelector('.squad-avatar').complete && document.querySelector('.squad-avatar').naturalWidth>0")
        page.locator('.squad-card').first.click()
        assert page.locator('#squad-tools').is_visible()
        assert page.locator('#squad-tools').get_attribute('open') is not None
        assert '제1분대' in page.locator('#squad-name').inner_text()
        page.locator('#squad-command').select_option('hold')
        page.locator('#squad-execute').click()
        assert 'hold' in page.locator('#squad-status').inner_text()
        page.locator('#squad-command').select_option('advance')
        page.locator('#squad-execute').click()
        page.locator('#board').focus()
        page.keyboard.press('ArrowRight');page.keyboard.press('Enter')
        page.locator('#debug-tools > summary').click()
        page.locator('#legacy-controls-toggle').check()
        assert page.locator('#legacy-controls').is_visible()
        roster=page.locator('#squad-roster').bounding_box()
        if width<700:
            assert roster['y']+roster['height']>=height-2
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        else:
            assert roster['x']>width*0.7
        assert not errors,errors
        page.close()
    browser.close()
print('PASS squad command UI, commander face, folded debug, hidden legacy, desktop/mobile dock')
