"""Regression: squad portrait -> battlefield target without command-button round trips."""
import os,re
from playwright.sync_api import sync_playwright

BASE=os.environ.get('BASE_URL','http://127.0.0.1:8019')

def move_keyboard_cursor(page,x,y):
    detail=page.locator('#selection-detail').text_content()
    match=re.search(r'(\d+),\s*(\d+)',detail)
    assert match,detail
    origin_x,origin_y=map(lambda value:int(value)-1,match.groups())
    page.locator('#board').focus()
    dx=x-origin_x;dy=y-origin_y
    for _ in range(abs(dx)):page.keyboard.press('ArrowRight' if dx>0 else 'ArrowLeft')
    for _ in range(abs(dy)):page.keyboard.press('ArrowDown' if dy>0 else 'ArrowUp')
    page.keyboard.press('Enter')

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox'])
    for size in [(1280,800),(390,844)]:
        context=browser.new_context(viewport={'width':size[0],'height':size[1]},has_touch=size[0]<700)
        page=context.new_page()
        errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto(BASE);page.get_by_text('전장 준비 완료',exact=False).wait_for()
        page.locator('#debug-tools > summary').click()
        page.locator('#movement-lab > summary').click()
        page.locator('#movement-scenario').select_option('formation')
        page.locator('#movement-count').select_option('64')
        page.locator('#movement-setup').click()
        assert page.locator('.squad-card').count()==6
        page.locator('[data-squad-id="battalion-1:1"]').click()
        page.locator('#squad-close').click()
        # With a commander selected, map taps target a whole squad.
        # Pick the enemy commander's original tile via the same public layout.
        target=page.evaluate("""async () => {
          const {battalionFormation}=await import('./src/test-formation.mjs');
          const plan=battalionFormation(32),slot=plan.slots.find(s=>s.squadIndex===0&&s.role==='banner');
          const width=Number(document.getElementById('board-columns').value);
          const front=2+plan.depth*2;
          return {x:width-1-(front-slot.depth*2),y:2+slot.row*2};
        }""")
        move_keyboard_cursor(page,target['x'],target['y'])
        assert '집중 공격' in page.locator('#squad-status').text_content()
        assert page.locator('#command-feedback').is_visible()
        assert page.locator('.squad-card.is-selected').count()==1
        assert page.locator('#squad-tools').is_hidden()
        # A camera pan must not silently issue another squad command.
        box=page.locator('#board').bounding_box()
        sx=box['x']+box['width']*.5;sy=box['y']+box['height']*.55
        page.mouse.move(sx,sy);page.mouse.down();page.mouse.move(sx+85,sy-35,steps=6);page.mouse.up()
        assert '집중 공격' in page.locator('#squad-status').text_content()
        assert not errors,errors
        context.close()
    browser.close()
print('PASS portrait-map focus, active squad persistence, transient feedback and pan isolation')
