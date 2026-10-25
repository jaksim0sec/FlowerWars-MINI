"""Commands must stay with their recipients when the player selects another squad."""
import os
import re
from playwright.sync_api import sync_playwright

BASE = os.environ.get('BASE_URL', 'http://127.0.0.1:8019')


def target_tile(page, x, y):
    detail = page.locator('#selection-detail').text_content()
    match = re.search(r'(\d+),\s*(\d+)', detail) or re.search(
        r'(\d+),\s*(\d+)', page.locator('#selection-name').text_content())
    start_x, start_y = (int(n) - 1 for n in match.groups()) if match else (0, 0)
    page.locator('#board').focus()
    page.evaluate("""({dx,dy}) => {
      const board=document.getElementById('board');
      for(const [key,count] of [[dx<0?'ArrowLeft':'ArrowRight',Math.abs(dx)],
                               [dy<0?'ArrowUp':'ArrowDown',Math.abs(dy)]])
        for(let i=0;i<count;i++)board.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}));
      board.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    }""", {'dx': x-start_x, 'dy': y-start_y})


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for width, height in [(1280, 800), (390, 844)]:
        page = browser.new_page(viewport={'width': width, 'height': height},
                                has_touch=True, is_mobile=width < 700)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE)
        page.get_by_text('전장 준비 완료', exact=False).wait_for()
        for y in [20, 32, 44]:
            target_tile(page, 20, y)
        cards = page.locator('.squad-card')
        assert cards.count() == 3
        cards.nth(0).click()
        target_tile(page, 20, 44)
        assert page.locator('.squad-card.is-selected').count() == 1
        assert cards.nth(2).get_attribute('aria-pressed') == 'true'
        cards.nth(0).click()
        page.locator('#selection-add').click()
        cards.nth(1).click()
        assert page.locator('.squad-card.is-selected').count() == 2
        assert page.locator('#selection-add').get_attribute('aria-pressed') == 'false', \
            'additional selection must be consumed by one pick'
        target_tile(page, 38, 70)
        first_order = cards.nth(0).locator('.squad-activity').get_attribute('title')
        second_order = cards.nth(1).locator('.squad-activity').get_attribute('title')
        assert '이동' in first_order and '이동' in second_order
        cards.nth(2).click()
        assert page.locator('.squad-card.is-selected').count() == 1
        target_tile(page, 36, 82)
        assert cards.nth(0).locator('.squad-activity').get_attribute('title') == first_order
        assert cards.nth(1).locator('.squad-activity').get_attribute('title') == second_order

        # A deliberate touch hold must also replace the prior selection.
        cards.nth(1).scroll_into_view_if_needed()
        box = cards.nth(1).bounding_box()
        session = page.context.new_cdp_session(page)
        session.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [
            {'x': box['x']+box['width']/2, 'y': box['y']+box['height']/2}]})
        page.wait_for_timeout(500)
        session.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        assert page.locator('.squad-card.is-selected').count() == 1, \
            'holding a squad must not silently merge it with the previous squad'
        assert cards.nth(1).get_attribute('aria-pressed') == 'true'

        # Issuing a command or clearing selection must disarm an unused +.
        page.locator('#selection-add').click()
        page.locator('#command-dock [data-squad-action="wait"]').click()
        assert page.locator('#selection-add').get_attribute('aria-pressed') == 'false'
        cards.nth(0).click()
        assert page.locator('.squad-card.is-selected').count() == 1
        page.locator('#selection-add').click()
        page.locator('#selection-clear').click()
        cards.nth(2).click()
        assert page.locator('#selection-add').get_attribute('aria-pressed') == 'false'
        assert page.locator('.squad-card.is-selected').count() == 1

        # Desktop modifier selection remains explicit and repeatable.
        cards.nth(0).click(modifiers=['Shift'])
        assert page.locator('.squad-card.is-selected').count() == 2
        cards.nth(1).click()
        assert page.locator('.squad-card.is-selected').count() == 1
        assert not errors, errors
        page.close()
    browser.close()
print('PASS one-shot add, separate orders, touch hold replacement, clear, modifier selection')
