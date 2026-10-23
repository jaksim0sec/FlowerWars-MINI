"""Regression for game/UI overlap in the supplied mobile screenshot."""
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get('BASE_URL', 'http://127.0.0.1:8000')
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM', '/usr/bin/chromium'), args=['--no-sandbox'])
    for width, height in [(375,640),(320,568),(390,844),(844,390),(1280,900)]:
        page=browser.new_page(viewport={'width':width,'height':height},is_mobile=width<900,has_touch=True)
        errors=[]
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(BASE);page.get_by_text('전장 준비 완료',exact=False).wait_for()
        header=page.locator('.masthead').bounding_box()
        field=page.locator('#board').bounding_box()
        footer=page.locator('.command-area').bounding_box()
        assert field['y'] >= header['y']+header['height']-1, f'field behind header at {width}px'
        assert field['y']+field['height'] <= footer['y']+1, f'field behind controls at {width}px'
        assert not page.locator('.field-caption').is_visible(), 'decorative title must not cover gameplay'
        assert footer['height'] <= 110 if width < 600 else footer['height'] <= 140, f'oversized controls at {width}px'
        # Reproduce 71% zoom, then pan aggressively. Canvas must stay clipped
        # to its own viewport, while all controls retain their screen positions.
        for i in range(4): page.get_by_role('button',name='확대',exact=True).click()
        page.mouse.move(width/2,field['y']+field['height']/2)
        page.mouse.down();page.mouse.move(width/2+160,field['y']+60,steps=8);page.mouse.up()
        assert page.locator('#board').bounding_box() == field
        assert page.locator('.command-area').bounding_box() == footer
        page.get_by_role('button',name='전장 맞춤').click()
        # Empty top-left terrain remains selectable after resize / browser bars.
        page.set_viewport_size({'width':width,'height':max(320,height-100)})
        page.wait_for_timeout(100)
        new_field=page.locator('#board').bounding_box()
        new_footer=page.locator('.command-area').bounding_box()
        assert new_field['y']+new_field['height'] <= new_footer['y']+1
        assert not errors, errors
        if width==375: page.screenshot(path='/tmp/doragami-layout-after.png')
        page.close()
    browser.close()
    print('PASS protected field, compact mobile controls, zoom/pan isolation and viewport resize (5 sizes)')
