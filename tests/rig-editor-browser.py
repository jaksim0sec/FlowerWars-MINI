"""Sequential rig editing, downloads, undo/redo, drag, import and mobile smoke test."""
from playwright.sync_api import sync_playwright
import json,os,tempfile,io
from PIL import Image,ImageChops,ImageStat
from pathlib import Path
BASE=os.environ.get("BASE_URL","http://127.0.0.1:8008")
WORK=Path(tempfile.mkdtemp(prefix="rig-editor-test-"))
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox']);page=b.new_page(viewport={'width':1440,'height':1000},accept_downloads=True);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(BASE+'/rig-editor.html');page.get_by_text('원본에서 시작',exact=True).wait_for()
 page.locator('#x').fill('300');page.locator('#x').press('Tab');page.wait_for_timeout(250)
 with page.expect_download() as info:page.locator('#export-one').click()
 dl=info.value;dl.save_as(str(WORK/'editor-one.json'));data=json.load(open(str(WORK/'editor-one.json')));assert data['characters']['shield-guard']['parts']['head']['x']==300
 page.locator('#undo').click();assert float(page.locator('#x').input_value())!=300
 page.locator('#redo').click();assert float(page.locator('#x').input_value())==300
 page.locator('#done').click();assert page.locator('#character').input_value()=='scholar'
 page.locator('#target').select_option('group:neck');page.locator('#rotation').fill('12');page.locator('#rotation').press('Tab')
 with page.expect_download() as info:page.locator('#export-all').click()
 info.value.save_as(str(WORK/'editor-all.json'));all=json.load(open(str(WORK/'editor-all.json')));assert len(all['characters'])==6;assert 'shield-guard' in all['completed']
 page.locator('#target').select_option('group:neck')
 box=page.locator('#editor-canvas').bounding_box();page.mouse.move(box['x']+box['width']*.5,box['y']+box['height']*.45);page.mouse.down();page.mouse.move(box['x']+box['width']*.5+35,box['y']+box['height']*.45+15,steps=5);page.mouse.up();assert page.locator('#target').input_value()=='group:neck';assert abs(float(page.locator('#x').input_value()))>5
 page.wait_for_timeout(250)
 page.screenshot(path=str(WORK/'editor-desktop.png'),full_page=True)
 page.reload();page.get_by_text('이전 작업 복원됨',exact=True).wait_for();assert page.locator('#character').input_value()=='scholar'
 page.locator('#import').set_input_files(str(WORK/'editor-all.json'));page.get_by_text('6종의 수정 데이터를 불러왔습니다.',exact=True).wait_for()
 page.locator('#character').select_option('shield-guard');page.locator('#target').select_option('part:head');page.locator('#guides').uncheck()
 page.locator('#rotation').fill('15');page.locator('#rotation').press('Tab');before=page.locator('#editor-canvas').screenshot()
 pivot=float(page.locator('#pivot-x').input_value());page.locator('#pivot-x').fill(str(pivot+30));page.locator('#pivot-x').press('Tab');after=page.locator('#editor-canvas').screenshot()
 difference=ImageStat.Stat(ImageChops.difference(Image.open(io.BytesIO(before)).convert('RGB'),Image.open(io.BytesIO(after)).convert('RGB')))
 assert max(difference.mean)<.2, difference.mean
 page.locator('#target').select_option('group:upper');assert float(page.locator('#pivot-x').input_value())>100;assert float(page.locator('#pivot-y').input_value())>100
 page.locator('#recommended').click();page.locator('[data-slot="left"]').select_option('basic_sword');page.locator('#holding-mode').select_option('both');assert page.locator('[data-slot="right"]').is_disabled();page.locator('#target').select_option('equipment:basic_sword:left')
 with page.expect_download() as info:page.locator('#export-one').click()
 info.value.save_as(str(WORK/'two-hand.json'));page.locator('#import').set_input_files(str(WORK/'two-hand.json'));page.get_by_text('1종의 수정 데이터를 불러왔습니다.',exact=True).wait_for()
 assert page.locator('#holding-mode').input_value()=='both';assert page.locator('[data-slot="right"]').is_disabled()
 assert not errors,errors
 mobile=b.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True);mobile.on('pageerror',lambda e:errors.append(str(e)));mobile.goto(BASE+'/rig-editor.html');mobile.get_by_text('원본에서 시작',exact=True).wait_for();assert mobile.evaluate('document.documentElement.scrollWidth<=innerWidth')
 box=mobile.locator('#editor-canvas').bounding_box();old=float(mobile.locator('#x').input_value());cdp=mobile.context.new_cdp_session(mobile)
 cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':box['x']+box['width']*.5,'y':box['y']+box['height']*.4,'id':0}]})
 cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':box['x']+box['width']*.5+20,'y':box['y']+box['height']*.4+10,'id':0}]})
 cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});assert abs(float(mobile.locator('#x').input_value())-old)>5
 mobile.screenshot(path=str(WORK/'editor-mobile.png'),full_page=True)
 assert not errors,errors;b.close();print('PASS editor: edit, undo/redo, sequential progress, single/all downloads, JSON import, draft restore, mobile layout')
