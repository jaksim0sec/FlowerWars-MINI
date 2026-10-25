"""Match entry → preparation → skip → player command and restart on desktop/touch."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BASE_URL','http://127.0.0.1:8019')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for width,height in [(1280,800),(390,844)]:
        page=browser.new_page(viewport={'width':width,'height':height},has_touch=width<700,is_mobile=width<700)
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(BASE);page.get_by_text('전장 준비 완료',exact=False).wait_for()
        assert page.locator('#match-armies').text_content().startswith('배치 0/500')
        assert page.locator('.squad-card').count()==0
        assert page.locator('#deployment-tools').is_visible()
        page.locator('[data-deploy-type="defense"]').click()
        page.locator('#board').focus();page.keyboard.press('ArrowRight')
        for _ in range(19):page.keyboard.press('ArrowRight')
        for _ in range(20):page.keyboard.press('ArrowDown')
        page.keyboard.press('Enter')
        assert page.locator('.squad-card').count()==1
        assert '488' in page.locator('#deployment-reserve').text_content()
        assert page.locator('#match-skip').is_visible()
        assert page.locator('#match-charge').is_hidden()
        assert page.locator('#match-timer').text_content().startswith(('5:','4:'))
        page.locator('.squad-card').first.click()
        assert 'A' in page.locator('#command-selection').text_content()
        page.locator('#match-skip').click()
        assert page.locator('#match-phase').text_content()=='깃발 점령전'
        assert page.locator('#match-skip').is_hidden()
        assert page.locator('#match-charge').is_visible()
        page.locator('#match-charge').click();page.wait_for_timeout(700)
        assert '공격 이동' in page.locator('#command-state').text_content()
        assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
        page.screenshot(path=f'/tmp/flag-match-{width}.png')
        assert not errors,errors
        page.close()
    browser.close()
print('PASS empty deployment, manual placement, reserves, skip, charge and responsive HUD')
