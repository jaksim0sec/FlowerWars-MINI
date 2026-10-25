"""Apply editor JSON to registered game rigs. No asset paths are taken from the upload.
Usage: python3 scripts/apply_rig_edits.py FILE.json [--check]
"""
import argparse,json,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def load(p):return json.loads(p.read_text())
def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('file',type=Path);parser.add_argument('--check',action='store_true');args=parser.parse_args()
 data=load(args.file);manifest=load(ROOT/'assets/characters.json');equipment_path=ROOT/'assets'/manifest['equipment'];equipment=load(equipment_path)
 if data.get('parts') and data.get('id'):data={'format':'doragami-rig-edits','version':1,'characters':{data['id']:data},'equipment':{}}
 if data.get('format')!='doragami-rig-edits' or data.get('version')!=1:raise ValueError('Unsupported rig editor format')
 writes={}
 def finite(value):
  if isinstance(value,float) and not math.isfinite(value):raise ValueError('Non-finite value')
  if isinstance(value,dict):
   for v in value.values():finite(v)
  if isinstance(value,list):
   for v in value:finite(v)
 finite(data)
 for id,rig in data['characters'].items():
  if id not in manifest['characters'] or rig.get('id')!=id:raise ValueError('Unknown character: '+id)
  path=ROOT/'assets'/manifest['characters'][id]['rig'];original=load(path)
  if set(rig['parts'])!=set(original['parts']) or not isinstance(rig.get('nodes'),list):raise ValueError('Invalid rig structure')
  for name,p in rig['parts'].items():
   if p['asset']!=original['parts'][name]['asset']:raise ValueError('Asset path changed')
   for k in ['x','y','w','h']:
    if not isinstance(p[k],(int,float)) or isinstance(p[k],bool):raise ValueError('Invalid part number')
   if not 1<=p['w']<=10000 or not 1<=p['h']<=10000:raise ValueError('Invalid part size')
   if len(p['origin'])!=2 or any(not isinstance(v,(int,float)) for v in p['origin']):raise ValueError('Invalid part pivot')
  writes[path]=rig
 for id,e in data.get('equipment',{}).items():
  if id not in equipment or e['asset']!=equipment[id]['asset'] or 'image' in e:raise ValueError('Unknown/changed equipment asset')
  if not 1<=e['w']<=10000 or not 1<=e['h']<=10000 or len(e['grip'])!=2:raise ValueError('Invalid equipment geometry')
  equipment[id]=e
 if data.get('equipment'):writes[equipment_path]=equipment
 if args.check:print(f'PASS: {len(data["characters"])} character rigs, {len(data.get("equipment",{}))} equipment records; no files changed');return
 for path,value in writes.items():path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
 print(f'Applied {len(data["characters"])} character rigs and {len(data.get("equipment",{}))} equipment records. Review and commit these files; rerunning asset registration will replace manually edited rigs.')
if __name__=='__main__':main()
