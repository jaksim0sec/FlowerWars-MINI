"""Compare six supplied assembled previews with actual Canvas rendering.
Usage: BASE_URL=http://127.0.0.1:8003 python3 scripts/compare_reference_rigs.py EXTRACTED_PACK [OUTPUT_JPG]
Left: reference. Right: live renderer, both fit to equal comparison cells.
"""
from playwright.sync_api import sync_playwright
from pathlib import Path
import os,sys,tempfile
from PIL import Image,ImageDraw
import json
root=Path(sys.argv[1]);work=Path(tempfile.mkdtemp(prefix='rig-comparison-'));base=os.environ.get('BASE_URL','http://127.0.0.1:8003');manifest=json.loads((root/'manifest.json').read_text())
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=b.new_page(viewport={'width':1000,'height':1300});page.goto(base+'/characters.html')
 for src in manifest['characters']:
  id=src[3:].replace('_','-')
  page.evaluate('''async id=>{const {loadCatalog}=await import('/src/characters/catalog.mjs');const{createCharacter,equip,drawCharacter}=await import('/src/characters/engine.mjs');const lib=await loadCatalog(),d=lib.characters[id],c=createCharacter(lib,id);if(d.recommendedWeapon)equip(lib,c,d.recommendedWeapon,d.recommendedHand||'left');for(const[s,k]of Object.entries(d.recommendedAccessories||{}))equip(lib,c,k,s);document.body.innerHTML='<canvas width="1000" height="1300"></canvas>';const ctx=document.querySelector('canvas').getContext('2d');ctx.translate(500,1250);drawCharacter(ctx,lib,c,0,{scale:1});}''',id)
  data=page.locator('canvas').evaluate("c=>c.toDataURL().split(',')[1]")
  import base64
  (work/(id+'-render.png')).write_bytes(base64.b64decode(data))
 b.close()
out=Image.new('RGB',(1800,1100),'#e8e3d0');draw=ImageDraw.Draw(out)
for i,(src,entry)in enumerate(manifest['characters'].items()):
 id=src[3:].replace('_','-');x=i%3*600;y=i//3*550
 for j,path in enumerate([root/entry['preview'],(work/(id+'-render.png'))]):
  im=Image.open(path).convert('RGBA');im=im.crop(im.getbbox());im.thumbnail((290,490));out.paste(im,(x+j*300+(290-im.width)//2,y+35),im)
 draw.text((x+10,y+5),id+'  reference | rendered',fill='black')
out.save(sys.argv[2] if len(sys.argv)>2 else 'docs/rig-comparison.jpg')
