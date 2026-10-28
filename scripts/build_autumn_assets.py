"""Pack user-provided RGBA artwork into a bounded runtime atlas; keep originals."""
import json,sys,zipfile,io,hashlib
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[1]/'assets/world/autumn';root.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(sys.argv[1]) as z:
 manifest=json.loads(z.read('flowerwars-autumn-assets/manifest.json'));atlas=Image.new('RGBA',(2048,1536));entries={}
 for i,a in enumerate(manifest['assets']):
  data=z.read('flowerwars-autumn-assets/'+a['path']);assert hashlib.sha256(data).hexdigest()==a['sha256']
  target=root/'source'/a['path'];target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
  im=Image.open(io.BytesIO(data));im.thumbnail((240,240),Image.Resampling.LANCZOS);x=i%8*256+(256-im.width)//2;y=i//8*256+256-im.height
  atlas.paste(im,(x,y));entries[a['id']]={'x':i%8*256,'y':i//8*256,'w':256,'h':256}
 (root/'source-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
 (root/'catalog.json').write_text(json.dumps({'version':1,'width':2048,'height':1536,'items':entries},indent=2)+'\n')
 atlas.save(root/'atlas.webp',quality=90,method=6)
# Prebaked distant forest from the supplied art, not runtime blur or particles.
import random
r=random.Random(73);back=Image.new('RGBA',(1600,1000))
for y in range(1000):
 t=y/1000;col=(int(238-18*t),int(229-27*t),int(204-37*t),255)
 back.paste(col,(0,y,1600,y+1))
for layer in range(3):
 for x in range(-120,1720,90):
  if 320<x<1280 and layer<2:continue
  im=Image.open(root/'source/01_nature'/('01_golden_tree_round.png' if r.random()<.65 else '02_golden_tree_tall.png'))
  size=r.randrange(150,270)+layer*45;im.thumbnail((size,size));px=x+r.randrange(-50,50);py=300+layer*170+r.randrange(-50,100)
  back.alpha_composite(im,(px,py))
# An alpha wash is baked into the bitmap, leaving the central battlefield readable.
wash=Image.new('RGBA',back.size,(246,237,214,175));back=Image.alpha_composite(back,wash)
back.convert('RGB').save(root/'distance.webp',quality=87,method=6)
