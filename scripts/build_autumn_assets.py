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
