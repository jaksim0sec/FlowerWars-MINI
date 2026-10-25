"""Register selected merged pack without changing its source PNGs or existing rigs.
Usage: python3 scripts/register_assets.py /path/to/extracted/flowerwars_selected_merged
"""
import copy,json,shutil,sys
from pathlib import Path
from PIL import Image
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
def read(p):return json.loads(p.read_text())
def write(p,v):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
def register(source):
 manifest=read(source/'manifest.json');catalog=read(ROOT/'assets/characters.json');equipment=read(ROOT/'assets/equipment/catalog.json')
 base=read(ROOT/'assets/units/gynari-warrior/rig.json')
 names=['방패수호자','꽃잎학자','깃발기수','클로버마법사','잎새궁수','꽃잎정찰병']
 weapons=['shield','book','banner','staff','bow',None]
 for index,(source_id,entry) in enumerate(manifest['characters'].items()):
  id=source_id[3:].replace('_','-');target=ROOT/'assets/units'/id;target.mkdir(parents=True,exist_ok=True)
  rig=copy.deepcopy(base);rig.update(id=id,version=1,note='Selected merged ZIP: source PNGs unchanged. Assembly coordinates are independent of exploded-sheet origins.')
  rig['parts']={};rig['animations']={'leftArm':['state','walk',['*','stride',.04],0],'rightArm':['state','walk',['*','stride',-.04],0]}
  sources=entry['parts'];mapping={'head':'head','hat':'head_deco','torso':'body','arm_left_screen':'hand_back','arm_right_screen':'hand_front','boot_left_screen':'leg_back','boot_right_screen':'leg_front','arm_upper':'hand_back','arm_lower':'hand_front','boot_upper':'leg_back','boot_lower':'leg_front'}
  for name,p in sources.items():
   if name not in mapping:continue
   dest=mapping[name];im=Image.open(source/p['path']);assert list(im.size)==p['size_wh']
   shutil.copyfile(source/p['path'],target/(dest+'.png'));w,h=im.size
   width={'head':548,'head_deco':680,'body':500 if id=='banner-bearer' else 365 if id=='scout' else 398,'hand_back':160,'hand_front':150,'leg_back':110,'leg_front':110}[dest]
   if dest=='head_deco' and id=='scholar':width=730
   height=width*h/w
   origin=[.5,.5];x=y=0
   if dest=='head':x=505-width/2;y=835-height;origin=[.5,.98]
   if dest=='body':x=505-width/2;y=810;origin=[.5,.1]
   if dest=='head_deco':x=190 if id!='scholar' else 150;y=260
   if id=='scout' and dest in ['head','head_deco']:y+=25
   if dest.startswith('leg_'):x=350 if dest=='leg_back' else 555;y=1110;origin=[.5,.05]
   if dest.startswith('hand_'):
    left=dest=='hand_back';origin=[.8,.18] if left else [.2,.18]
    if id=='scout':origin=[.5,.08]
    shoulder=(355 if left else 655)
    if id in ['clover-mage','archer']:shoulder+=35 if left else -35
    x=shoulder-width*origin[0];y=890-height*origin[1]
   if id=='banner-bearer' and dest.startswith('leg_'):y-=45
   rig['parts'][dest]={'asset':dest+'.png','file_dimensions':[w,h],'x':x,'y':y,'w':width,'h':height,'origin':origin}
  rig['parts']['shadow']=copy.deepcopy(base['parts']['shadow']);rig['parts']['shadow']['asset']='../gynari-warrior/shadow.webp'
  # Preserve original crown PNG and create an alpha-only front overlay. Some
  # crowns contain a face fragment: stop each column at its first pale skin run,
  # removing the fragment and its lower outer border, not repainting the crown.
  if id!='scholar':
   path=target/'head_deco.png';im=Image.open(path).convert('RGBA');pixels=np.array(im)
   rgb=pixels[:,:,:3].astype(int);r,g,b=rgb[:,:,0],rgb[:,:,1],rgb[:,:,2]
   skin=(r>180)&(g>160)&(b>135)&(r>=g)&(g>b*1.06)&(pixels[:,:,3]>100)
   for x in range(im.width):
    runs=np.convolve(skin[:,x].astype(int),np.ones(4,dtype=int),mode='valid')
    ys=np.flatnonzero(runs==4)
    if len(ys):pixels[int(ys[0]):,x,3]=0
   erased=(np.array(im)[:,:,3]>0)&(pixels[:,:,3]==0)
   expanded=erased.copy()
   for dx in range(1,13):
    expanded[:,dx:] |= erased[:,:-dx];expanded[:,:-dx] |= erased[:,dx:]
   pixels[expanded,3]=0
   Image.fromarray(pixels).save(target/'head_deco_overlay.png')
   rig['parts']['head_deco']['asset']='head_deco_overlay.png'
  rig['parts']['head_deco']['front_clip']=[[0,0],[1,0],[1,1],[0,1]]
  bottoms=[]
  for name in ['leg_back','leg_front']:
   p=rig['parts'][name];box=Image.open(target/p['asset']).getchannel('A').getbbox();bottoms.append(p['y']+p['h']*box[3]/p['file_dimensions'][1])
  rig['foot'][1]=max(bottoms);rig['parts']['shadow']['y']=rig['foot'][1]-rig['parts']['shadow']['h']*.5
  rig['neck']=[505,860 if id=='scout' else 835]
  def visit(nodes):
   for n in nodes:
    if n.get('id') in ['leftArm','rightArm']:
     side=n['id'][:-3];p=rig['parts']['hand_back' if side=='left' else 'hand_front'];pivot=[p['x']+p['w']*p['origin'][0],p['y']+p['h']*p['origin'][1]]
     n['transforms'][0]['pivot']=pivot;rig['twoHandedPoses']['hold']['nodes'][n['id']]['transforms'][0]['pivot']=pivot
    if n.get('id')=='neck':n['transforms'][0]['pivot']=rig['neck']
    visit(n.get('children',[]))
  visit(rig['nodes']);rig['sockets']['left']['grip']=[.28,.8];rig['sockets']['right']['grip']=[.72,.8]
  info={'name':names[index],'rig':f'units/{id}/rig.json'}
  if id=='banner-bearer':info['previewScale']=.48
  for name in [x for x in sources if x not in mapping]:
   p=sources[name];wid,hei=p['size_wh'];eid=id.replace('-','_')+'_'+name;dest=ROOT/'assets/equipment'/('accessories' if name in ['quiver','side_pouch'] else 'weapons')/(eid+'.png');dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source/p['path'],dest)
   width={'shield':350,'book':340,'banner':500,'staff':330,'bow':170,'quiver':170,'side_pouch':180}[name]
   grip={'shield':[.55,.55],'book':[.5,.85],'banner':[.16,.8],'staff':[.34,.72],'bow':[.48,.52],'quiver':[.6,.5],'side_pouch':[.5,.3]}[name]
   item={'name':{'shield':'수호 방패','book':'꽃잎 마도서','banner':'도라가미 깃발','staff':'클로버 마법봉','bow':'잎새 활','quiver':'화살통','side_pouch':'궁수 가방'}[name],'asset':str(dest.relative_to(ROOT/'assets/equipment')),'w':width,'h':width*hei/wid,'grip':grip,'hands':1,'motion':'weapon','rotation':0}
   if name in ['shield','book','banner']:item['animation']={'weapon':0}
   if name=='banner':
    mirrored=dest.with_name(dest.stem+'_left.png');Image.open(dest).transpose(Image.Transpose.FLIP_LEFT_RIGHT).save(mirrored)
    item['asset']=str(mirrored.relative_to(ROOT/'assets/equipment'));item['grip'][0]=1-item['grip'][0];item['rotation']=.05
   if name in ['banner','staff','bow']:item.update(secondaryGrip=[grip[0],min(.98,grip[1]+.12)],twoHandedPose='hold')
   if name in ['quiver','side_pouch']:
    slot='back' if name=='quiver' else 'waist';item.update(slot=slot,motion=0)
    rig['sockets'][slot]={'part':'body','grip':[.18,.3] if slot=='back' else [.17,.73],'group':'upper'}
    upper=rig['nodes'][1]['children'][2]['children'];upper.insert(0 if slot=='back' else 2,{'socket':slot})
    info.setdefault('recommendedAccessories',{})[slot]=eid
   equipment[eid]=item
   if name==weapons[index]:
    info['recommendedWeapon']=eid
    if id in ['archer','clover-mage']:info['recommendedHand']='right'
  write(target/'rig.json',rig);catalog['characters'][id]=info
  write(target/'source.json',entry)
 write(ROOT/'assets/characters.json',catalog);write(ROOT/'assets/equipment/catalog.json',equipment)
if __name__=='__main__':register(Path(sys.argv[1]).resolve())
