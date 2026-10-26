import os
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for width,height in [(1280,800),(390,844)]:
        page=browser.new_page(viewport={'width':width,'height':height},has_touch=True)
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(os.environ.get('BASE_URL','http://127.0.0.1:8020'))
        page.get_by_text('전장 준비 완료',exact=False).wait_for()
        board=page.locator('#board');board.focus()
        for _ in range(20):page.keyboard.press('ArrowRight');page.keyboard.press('ArrowDown')
        page.keyboard.press('Enter');page.locator('.squad-card').first.click()
        buttons=page.locator('.quick-orders button')
        assert buttons.all_text_contents()==['이동','공격','우회','사수','집결']
        assert all(buttons.nth(i).is_visible() for i in range(5))
        boxes=[buttons.nth(i).bounding_box() for i in range(5)]
        assert max(box['x'] for box in boxes)-min(box['x'] for box in boxes)<=210
        page.locator('[data-squad-action="hold"]').click()
        assert '사수' in page.locator('#command-state').text_content()
        page.locator('#orders-toggle').click()
        page.locator('[data-squad-action="rally"]').click()
        assert '집결' in page.locator('#command-state').text_content()
        page.locator('#orders-toggle').click();page.locator('#selection-options').click()
        assert page.locator('[data-squad-stance]').count()==0
        assert page.locator('#squad-close .control-label').is_hidden()
        close=page.locator('#squad-close').bounding_box();panel=page.locator('#squad-tools').bounding_box()
        assert close['x']+close['width']<=panel['x']+panel['width']
        for formation in ['line','column','square','spread']:
            button=page.locator('[data-squad-formation="'+formation+'"]')
            assert button.locator('svg rect').count()>0
            button.click();assert button.get_attribute('aria-pressed')=='true'
        page.screenshot(path=f'/tmp/compact-orders-{width}.png')
        assert not errors,errors
        page.close()
    browser.close()
print('PASS five compact orders, hold/rally, four explicit formation SVGs, desktop/mobile')
