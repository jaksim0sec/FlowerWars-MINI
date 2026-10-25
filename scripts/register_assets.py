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
REFERENCE_LAYOUTS = {"shield-guard":{"center":220,"ground":558,"factor":1.8,"parts":{"head":[165,201,0.36],"head_deco":[68,0,0.76],"body":[103,279,0.68],"hand_back":[86,298,0.7],"hand_front":[270,236,0.76],"leg_back":[110,459,0.52],"leg_front":[242,452,0.72]},"grips":{"left":[0.15,0.55],"right":[0.72,0.8]}},"scholar":{"center":205,"ground":545,"factor":1.8,"parts":{"head":[162,208,0.36],"head_deco":[42,18,0.68],"body":[104,296,0.56],"hand_back":[62,314,0.56],"hand_front":[236,316,0.56],"leg_back":[96,464,0.56],"leg_front":[222,460,0.56]},"grips":{"left":[0.22,0.35],"right":[0.72,0.8]}},"banner-bearer":{"center":230,"ground":543,"factor":1.8,"parts":{"head":[212,235,0.28],"head_deco":[132,86,0.6],"body":[74,296,0.68],"hand_back":[72,315,0.64],"hand_front":[274,334,0.52],"leg_back":[122,462,0.64],"leg_front":[250,464,0.64]},"grips":{"left":[0.32,0.33],"right":[0.72,0.8]}},"clover-mage":{"center":165,"ground":544,"factor":1.8,"parts":{"head":[30,105,0.7],"head_deco":[14,10,0.68],"body":[36,274,0.6],"hand_back":[6,304,0.56],"hand_front":[190,300,0.42],"leg_back":[44,454,0.48],"leg_front":[174,450,0.52]},"grips":{"left":[0.28,0.8],"right":[0.84,0.58]}},"archer":{"center":196,"ground":626,"factor":1.5,"parts":{"head":[42,155,0.7],"head_deco":[30,6,0.84],"body":[66,322,0.72],"hand_back":[30,360,0.68],"hand_front":[242,346,0.52],"leg_back":[74,526,0.56],"leg_front":[216,518,0.56]},"grips":{"left":[0.28,0.8],"right":[0.87,0.69]}},"scout":{"center":170,"ground":640,"factor":1.55,"parts":{"head":[38,154,0.7],"head_deco":[4,0,1],"body":[50,338,1],"hand_back":[52,410,0.52],"hand_front":[234,400,1],"leg_back":[138,480,0.64],"leg_front":[46,552,1]},"grips":{"left":[0.28,0.8],"right":[0.72,0.8]}}}
REFERENCE_EQUIPMENT = {"shield_guard_shield":{"grip":[0.52,0.52],"w":357,"h":458.34193548387094},"scholar_book":{"grip":[0.47,0.56],"w":290,"h":218.80239520958085},"banner_bearer_banner":{"asset":"weapons/banner_bearer_banner.png","grip":[0.38,0.73],"rotation":0,"w":491.4,"h":867.6},"clover_mage_staff":{"grip":[0.1,0.66],"w":350,"h":593},"archer_bow":{"grip":[0.18,0.66],"w":210,"h":565.4587155963303}}

def apply_reference_layout(rig, unit_id, equipment):
 cfg=REFERENCE_LAYOUTS[unit_id];f=cfg['factor']
 rig['version']=rig.get('version',1)+1
 rig['note']='Assembled-preview alignment, shared tile-foot anchor and unmodified original part artwork'
 for name,(x,y,s) in cfg['parts'].items():
  p=rig['parts'][name];iw,ih=p['file_dimensions']
  p.update(x=round(505+(x-cfg['center'])*f,4),y=round(1228+(y-cfg['ground'])*f,4),w=round(iw*s*f,4),h=round(ih*s*f,4))
 rig['foot']=[505,1228]
 rig['parts']['head_deco']['asset']='head_deco.png'
 rig['parts']['head_deco'].pop('front_clip',None)
 rig['parts']['shadow']['x']=505-rig['parts']['shadow']['w']/2
 rig['parts']['shadow']['y']=1228-rig['parts']['shadow']['h']/2
 for side,grip in cfg['grips'].items():rig['sockets'][side]['grip']=grip
 def visit(nodes):
  for n in nodes:
   if n.get('id')=='neck':
    n['children']=[{'part':'head'},{'part':'head_deco'}]
    b=rig['parts']['body'];rig['neck']=[b['x']+b['w']*.5,b['y']+b['h']*.05]
    n['transforms'][0]['pivot']=rig['neck']
   if n.get('id') in ('leftArm','rightArm'):
    p=rig['parts']['hand_back' if n['id']=='leftArm' else 'hand_front']
    pt=[p['x']+p['w']*p['origin'][0],p['y']+p['h']*p['origin'][1]]
    n['transforms'][0]['pivot']=pt;rig['twoHandedPoses']['hold']['nodes'][n['id']]['transforms'][0]['pivot']=pt
   visit(n.get('children',[]))
 visit(rig['nodes'])
 for eid,change in REFERENCE_EQUIPMENT.items():
  if eid.startswith(unit_id.replace('-','_')+'_'):equipment[eid].update(change)

def apply_reference_pose(rig, unit_id, equipment):
    spec=read(ROOT/'assets/units/reference-poses.json')['characters'][unit_id]
    f=spec['factor']
    def world(x,y):return 505+(x-spec['center'])*f,1228+(y-spec['ground'])*f
    for name,(x,y,scale) in spec['parts'].items():
        p=rig['parts'][name];iw,ih=p['file_dimensions'];wx,wy=world(x,y)
        p.update(x=round(wx,4),y=round(wy,4),w=round(iw*scale*f,4),h=round(ih*scale*f,4))
    head=rig['parts']['head_deco'];head['asset']='head_deco.png'
    head.pop('front_clip',None);head.pop('clip',None)
    rig['foot']=[505,1228]
    shadow=rig['parts']['shadow'];shadow['x']=505-shadow['w']/2;shadow['y']=1228-shadow['h']/2
    b=rig['parts']['body'];rig['neck']=[round(b['x']+b['w']*.5,4),round(b['y']+b['h']*.1,4)]
    for side,name,ratio in [('left','hand_back',.13),('right','hand_front',.87)]:
        p=rig['parts'][name];sx=b['x']+b['w']*ratio;sy=b['y']+b['h']*.2
        p['origin']=[round((sx-p['x'])/p['w'],5),round((sy-p['y'])/p['h'],5)]
        rig['sockets'][side]['grip']=[.28,.8] if side=='left' else [.72,.8]
    def visit(nodes):
        for n in nodes:
            if n.get('id')=='neck':
                n['transforms'][0]['pivot']=rig['neck']
                n['children']=[{'part':'head_deco'}] if unit_id=='shield-guard' else [{'part':'head'},{'part':'head_deco'}]
            if n.get('id') in ('leftArm','rightArm'):
                p=rig['parts']['hand_back' if n['id']=='leftArm' else 'hand_front']
                pivot=[p['x']+p['w']*p['origin'][0],p['y']+p['h']*p['origin'][1]]
                n['transforms'][0]['pivot']=pivot
                rig['twoHandedPoses']['hold']['nodes'][n['id']]['transforms'][0]['pivot']=pivot
            visit(n.get('children',[]))
    visit(rig['nodes'])
    upper=next(n for n in rig['nodes'][1]['children'] if n.get('id')=='upper')
    nodes=upper['children'];left=next(n for n in nodes if n.get('id')=='leftArm')
    right=next(n for n in nodes if n.get('id')=='rightArm')
    body=next(n for n in nodes if n.get('part')=='body')
    neck=next(n for n in nodes if n.get('id')=='neck')
    others=[n for n in nodes if n.get('socket') in ('back','waist')]
    if unit_id in ('shield-guard','scholar'):
        left['children']=[{'part':'hand_back'},{'socket':'left'}]
        upper['children']=[body,left,right,neck]
    elif unit_id=='archer':
        upper['children']=[*[n for n in others if n.get('socket')=='back'],left,body,*[n for n in others if n.get('socket')=='waist'],right,neck]
    else:upper['children']=[left,body,right,neck]
    sizes={'shield_guard_shield':(310,398),'scholar_book':(334,252),'banner_bearer_banner':(273,482),'clover_mage_staff':(350,593),'archer_bow':(218,587),'archer_quiver':(233,297),'archer_side_pouch':(274,255)}
    for eid,entry in spec['equipment'].items():
        item=equipment[eid];ex,ey,scale=entry['position'];iw,ih=sizes[eid]
        item['w']=round(iw*scale*f,4);item['h']=round(ih*scale*f,4)
        item['grip']=entry['grip'];item['rotation']=0
        if eid=='banner_bearer_banner':item['asset']='weapons/banner_bearer_banner.png'
        x,y=world(ex,ey);x+=item['w']*item['grip'][0];y+=item['h']*item['grip'][1]
        slot=rig['sockets'][entry['hand']];p=rig['parts'][slot['part']]
        slot['grip']=[round((x-p['x'])/p['w'],5),round((y-p['y'])/p['h'],5)]
    rig['version']=rig.get('version',1)+1
    rig['note']='Reference-matched rig positions and painter order; source PNGs unmodified.'

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
  apply_reference_layout(rig,id,equipment)
  apply_reference_pose(rig,id,equipment)
  write(target/'rig.json',rig);catalog['characters'][id]=info
  write(target/'source.json',entry)
 write(ROOT/'assets/characters.json',catalog);write(ROOT/'assets/equipment/catalog.json',equipment)
if __name__=='__main__':register(Path(sys.argv[1]).resolve())
