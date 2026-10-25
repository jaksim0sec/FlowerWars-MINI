"""Seed/mirror controls and registered ranged roles in structured battalion test."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BASE_URL','http://127.0.0.1:8019')

def select(page,x,y):
    page.locator('#board').focus()
    page.keyboard.press('Escape')
    page.keyboard.press('ArrowRight');page.keyboard.press('ArrowLeft')
    for _ in range(x):page.keyboard.press('ArrowRight')
    for _ in range(y):page.keyboard.press('ArrowDown')
    page.keyboard.press('Enter')

def coords(slot,width,depth,team,mirror):
    front=2+depth*2
    x=front-slot['depth']*2 if team=='A' else width-1-front+slot['depth']*2
    if mirror:x=width-1-x
    return x,2+slot['row']*2

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox'])
    page=browser.new_page()
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BASE);page.get_by_text('전장 준비 완료',exact=False).wait_for()
    page.locator('#debug-tools > summary').click()
    page.locator('#movement-lab > summary').click()
    page.locator('#movement-seed').fill('17')
    page.locator('#movement-mirror').check()
    page.locator('#movement-setup').click()
    plan=page.evaluate("async () => (await import('./src/test-formation.mjs')).battalionFormation(32)")
    width=int(page.locator('#board-columns').input_value())
    guard=next(s for s in plan['slots'] if s['role']=='guard')
    archer=next(s for s in plan['slots'] if s['role']=='archer')
    assert page.locator('.squad-card').count()==6
    assert '돌격대' in page.locator('#squad-roster-list').inner_text()
    assert '궁병대' in page.locator('#squad-roster-list').inner_text()
    select(page,*coords(guard,width,plan['depth'],'A',True))
    assert '개나리 방패병' in page.locator('#selection-name').inner_text()
    select(page,*coords(archer,width,plan['depth'],'B',True))
    assert '낙옆궁수' in page.locator('#selection-name').inner_text()
    assert '사거리 4' in page.locator('#selection-combat').inner_text()
    page.locator('#movement-mirror').uncheck()
    page.locator('#movement-setup').click()
    select(page,*coords(archer,width,plan['depth'],'B',False))
    assert '낙옆궁수' in page.locator('#selection-name').inner_text()
    page.locator('#movement-start').click();page.wait_for_timeout(800)
    assert not errors,errors
    browser.close()
print('PASS battalion roles, mirrored positions, ranged unit stats and movement start')
