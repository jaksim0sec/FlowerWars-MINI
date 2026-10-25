import {loadCatalog,visibleCharacters} from './catalog.mjs';
import {createCharacter,equip,unequip,drawCharacter,layoutCharacter,multiply,point} from './engine.mjs';
import {editPart,exportEdits,validateEdits,nodesOf,groupAdjustment} from './rig-edit-model.mjs';
const $=id=>document.getElementById(id),KEY='doragami-rig-editor-v1',RAD=Math.PI/180;
const names={head:'얼굴',head_deco:'머리장식',body:'몸통',hand_back:'왼팔',hand_front:'오른팔',leg_back:'왼다리',leg_front:'오른다리',shadow:'그림자',neck:'머리 전체',leftArm:'왼팔 묶음',rightArm:'오른팔 묶음',upper:'상체 전체',recoil:'몸 전체'};
const I=[1,0,0,1,0,0];
function inverse(m){const d=m[0]*m[3]-m[1]*m[2];if(Math.abs(d)<1e-9)throw new Error('배율이 너무 작습니다.');return[m[3]/d,-m[1]/d,-m[2]/d,m[0]/d,(m[2]*m[5]-m[3]*m[4])/d,(m[1]*m[4]-m[0]*m[5])/d];}
const delta=(m,x,y)=>[m[0]*x+m[2]*y,m[1]*x+m[3]*y];
const round=n=>Number(n.toFixed(3));
let catalog,original,ids,id,instance,selection={kind:'part',key:'head'},completed=[],undo=[],redo=[],mode='move',playing=false,time=0,last=0,drag=null,saveTimer,ready=false,view=I,layout,width=0,height=0,dpr=1;
const canvas=$('editor-canvas'),ctx=canvas.getContext('2d'),instances=new Map();
function message(text){$('message').textContent=text;}
function previewData(keys=ids){return Object.fromEntries([...instances].filter(([key])=>keys.includes(key)).map(([key,c])=>[key,{equipment:structuredClone(c.equipment),state:c.animation.state,facing:c.animation.facing}]));}
function snapshot(){return {...exportEdits(catalog,ids,completed),activeCharacter:id,preview:previewData()};}
function checkpoint(){undo.push(snapshot());if(undo.length>60)undo.shift();redo=[];historyButtons();}
function historyButtons(){$('undo').disabled=!undo.length;$('redo').disabled=!redo.length;}
function persist(){clearTimeout(saveTimer);$('save-state').textContent='임시 저장 중…';saveTimer=setTimeout(()=>{try{localStorage.setItem(KEY,JSON.stringify(snapshot()));$('save-state').textContent='이 브라우저에 저장됨';}catch{$('save-state').textContent='임시 저장 실패 · JSON을 내보내세요.';}},160);}
function applyBundle(data){for(const[k,r]of Object.entries(data.characters))catalog.characters[k].rig=structuredClone(r);for(const[k,e]of Object.entries(data.equipment||{}))Object.assign(catalog.equipment[k],structuredClone(e));completed=(data.completed||[]).filter(k=>ids.includes(k));if(data.preview){instances.clear();for(const[key,p]of Object.entries(data.preview)){const c=createCharacter(catalog,key),seen=new Set();for(const item of Object.values(p.equipment||{}))if(item&&!seen.has(item.hand+':'+item.equipmentId)){seen.add(item.hand+':'+item.equipmentId);equip(catalog,c,item.equipmentId,item.hand);}Object.assign(c.animation,{state:p.state||'idle',facing:p.facing??-1});instances.set(key,c);}if(id&&instances.has(id))instance=instances.get(id);}}
function rig(){return catalog.characters[id].rig;}
function currentNode(){return nodesOf(rig()).find(({node})=>selection.kind==='group'?node.id===selection.key:selection.kind==='part'?node.part===selection.key:node.socket===selection.side);}
function ensureGroupAdjustment(){
 const node=currentNode().node,exists=node.transforms?.some(op=>op.editorAdjustment),hasPivot=node.transforms?.some(op=>op.pivot&&!op.editorAdjustment);
 refreshLayout();const base=layout.groups[selection.key].matrix,points=layout.draws.filter(d=>d.part&&d.ancestors.includes(selection.key)).flatMap(bounds),op=groupAdjustment(node);
 if(!exists&&!hasPivot&&points.length){const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);op.pivot=point(inverse(base),(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2);}
 return op;
}
function descriptor(){
 if(selection.kind==='part'){const p=rig().parts[selection.key];return{p,x:p.x,y:p.y,w:p.w,h:p.h,angle:p.rotation||0,pivot:p.origin.map((v,i)=>v*(i?p.h:p.w))};}
 if(selection.kind==='equipment'){const p=catalog.equipment[selection.key];return{p,x:p.offset?.[0]||0,y:p.offset?.[1]||0,w:p.w,h:p.h,angle:p.socketRotations?.[selection.side]??p.rotation??0,pivot:p.grip.map((v,i)=>v*(i?p.h:p.w))};}
 const p=groupAdjustment(currentNode().node);return{p,x:p.translate[0],y:p.translate[1],w:p.scale[0]*100,h:p.scale[1]*100,angle:p.rotate,pivot:p.pivot};
}
function fields(){const d=descriptor(),group=selection.kind==='group';for(const[key,n]of Object.entries({x:d.x,y:d.y,w:d.w,h:d.h,rotation:d.angle/RAD,'pivot-x':d.pivot[0],'pivot-y':d.pivot[1]}))$(key).value=round(n);
 $('label-x').textContent=group?'X 이동량':'X 위치';$('label-y').textContent=group?'Y 이동량':'Y 위치';$('label-w').textContent=group?'가로 배율 %':'너비';$('label-h').textContent=group?'세로 배율 %':'높이';$('label-px').textContent=group?'회전축 X (리그 안)':'회전축 X (파츠 안)';$('label-py').textContent=group?'회전축 Y (리그 안)':'회전축 Y (파츠 안)';}
function refreshLayout(){layout=layoutCharacter(catalog,instance,time);return layout;}
function selectedDraw(){return layout.draws.find(d=>d.part===selection.key);}
function bounds(draw){const p=rig().parts[draw.part],o=p.origin;return[[0,0],[1,0],[1,1],[0,1]].map(([x,y])=>point(draw.matrix,(x-o[0])*p.w,(y-o[1])*p.h));}
function corners(){
 if(selection.kind==='part'){const d=selectedDraw();return d?bounds(d):[];}
 if(selection.kind==='equipment'){const d=layout.equipmentDraws[selection.side];if(!d)return[];return[[0,0],[1,0],[1,1],[0,1]].map(([x,y])=>point(d.matrix,(x-d.grip[0])*d.w,(y-d.grip[1])*d.h));}
 const points=layout.draws.filter(d=>d.part&&d.ancestors.includes(selection.key)).flatMap(bounds);if(!points.length)return[];const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);return[[Math.min(...xs),Math.min(...ys)],[Math.max(...xs),Math.min(...ys)],[Math.max(...xs),Math.max(...ys)],[Math.min(...xs),Math.max(...ys)]];
}
function anchor(){return corners()[0];}
function moveMatrix(){
 if(selection.kind==='group')return layout.groups[selection.key].editorBase;
 if(selection.kind==='equipment')return layout.sockets[selection.side].matrix;
 return Object.values(rig().sockets).some(s=>s.part===selection.key)?I:selectedDraw()?.parentMatrix||I;
}
function moveBy(dx,dy){const d=descriptor(),v=delta(inverse(moveMatrix()),dx,dy);
 if(selection.kind==='part')editPart(rig(),selection.key,{x:d.x+v[0],y:d.y+v[1]});
 else if(selection.kind==='equipment')d.p.offset=[d.x+v[0],d.y+v[1]];
 else d.p.translate=[d.x+v[0],d.y+v[1]];
 refreshLayout();
}
function mutate(values,preserve=false){refreshLayout();const before=preserve&&$('preserve-pivot').checked?anchor():null;const d=descriptor();
 if(selection.kind==='part')editPart(rig(),selection.key,values);
 else if(selection.kind==='equipment'){
  for(const k of ['w','h'])if(values[k]!==undefined)d.p[k]=values[k];
  if(values.x!==undefined||values.y!==undefined)d.p.offset=[values.x??d.x,values.y??d.y];
  if(values.rotation!==undefined){if(d.p.socketRotations)d.p.socketRotations[selection.side]=values.rotation;else d.p.rotation=values.rotation;}
  if(values.origin)d.p.grip=values.origin;
 }else{
  if(values.x!==undefined||values.y!==undefined)d.p.translate=[values.x??d.x,values.y??d.y];
  if(values.w!==undefined||values.h!==undefined)d.p.scale=[(values.w??d.w)/100,(values.h??d.h)/100];
  if(values.rotation!==undefined)d.p.rotate=values.rotation;
  if(values.origin)d.p.pivot=values.origin;
 }
 refreshLayout();if(before){const after=anchor();if(after)moveBy(before[0]-after[0],before[1]-after[1]);}persist();
}
let layerEntries=[];
function layerOptions(preferred){layerEntries=nodesOf(rig());$('layer-entry').replaceChildren(...layerEntries.map(({node},i)=>new Option(node.id?(names[node.id]||node.id):node.part?`${names[node.part]||node.part}${node.clip?' · 마스크':''}`:`장비 · ${node.socket}`,String(i))));const index=layerEntries.findIndex(e=>e.node===(preferred||currentNode()?.node));$('layer-entry').value=String(Math.max(0,index));}
function selectTarget(value){const[kind,key,side]=value.split(':');selection={kind,key,side};if(kind==='group')ensureGroupAdjustment();refreshLayout();fields();layerOptions();}
function targetOptions(){const previous=$('target').value;$('target').replaceChildren();
 const parts=document.createElement('optgroup');parts.label='파츠';for(const key of Object.keys(rig().parts))parts.append(new Option(names[key]||key,`part:${key}`));$('target').append(parts);
 const groups=document.createElement('optgroup');groups.label='묶음 조정';for(const{node}of nodesOf(rig()).filter(x=>x.node.id))groups.append(new Option(names[node.id]||node.id,`group:${node.id}`));$('target').append(groups);
 const equipment=document.createElement('optgroup');equipment.label='장착한 장비';for(const[side,item]of Object.entries(refreshLayout().equipmentDraws))equipment.append(new Option(`${catalog.equipment[item.equipmentId].name} (${side})`,`equipment:${item.equipmentId}:${side}`));$('target').append(equipment);
 const available=[...$('target').options].some(o=>o.value===previous);$('target').value=available?previous:'part:head';selectTarget($('target').value);
}
function equipmentControls(){$('equipment-slots').replaceChildren();for(const side of Object.keys(instance.equipment)){
 const label=document.createElement('label');label.textContent={left:'왼손',right:'오른손',back:'등',waist:'허리'}[side]||side;const input=document.createElement('select');input.dataset.slot=side;input.add(new Option('미장착',''));
 for(const[key,e]of Object.entries(catalog.equipment))if(e.slot?e.slot===side:['left','right'].includes(side))input.add(new Option(e.name,key));input.value=instance.equipment[side]?.equipmentId||'';input.disabled=side==='right'&&$('holding-mode').value==='both';
 input.addEventListener('change',()=>{const previous=structuredClone(instance.equipment);try{const hand=side==='left'&&$('holding-mode').value==='both'?'both':side;unequip(instance,hand);if(input.value)equip(catalog,instance,input.value,hand);equipmentControls();targetOptions();persist();}catch(e){instance.equipment=previous;message(e.message);equipmentControls();}});label.append(input);$('equipment-slots').append(label);
}}
function recommended(){$('holding-mode').value='single';unequip(instance,'both');const d=catalog.characters[id];if(d.recommendedWeapon)equip(catalog,instance,d.recommendedWeapon,d.recommendedHand||'left');for(const[slot,key]of Object.entries(d.recommendedAccessories||{}))equip(catalog,instance,key,slot);}
function showCharacter(next){id=next;$('character').value=id;if(!instances.has(id)){instance=createCharacter(catalog,id);instances.set(id,instance);recommended();}instance=instances.get(id);time=0;playing=false;$('play').textContent='재생';$('play').setAttribute('aria-pressed','false');$('time').value=0;$('state').value=instance.animation.state;$('facing').value=String(instance.animation.facing);$('holding-mode').value=Object.values(instance.equipment).some(e=>e?.hand==='both')?'both':'single';equipmentControls();targetOptions();progress();if(ready)persist();}
function progress(){const index=ids.indexOf(id);$('progress').textContent=`${index+1} / ${ids.length} · 조정 완료 ${completed.length}종`;$('previous').disabled=index===0;$('next').disabled=index===ids.length-1;$('done').textContent=index===ids.length-1?'조정 완료':'조정 완료 · 다음';}
function switchBy(amount){const index=ids.indexOf(id)+amount;if(index>=0&&index<ids.length)showCharacter(ids[index]);}
function download(idsToExport){const data={...exportEdits(catalog,idsToExport,completed),activeCharacter:id,preview:previewData(idsToExport)},blob=new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=idsToExport.length===1?`${id}-rig-edits.json`:'doragami-all-rig-edits.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message('JSON 파일을 내보냈습니다. 이 파일을 전달하면 실제 게임 리그에 적용할 수 있습니다.');}
function worldAt(event){const rect=canvas.getBoundingClientRect();return point(inverse(view),event.clientX-rect.left,event.clientY-rect.top);}
function pivotWorld(){const d=descriptor();if(selection.kind==='part')return point(selectedDraw().matrix);if(selection.kind==='equipment')return point(layout.equipmentDraws[selection.side].matrix);return point(layout.groups[selection.key].editorBase,d.p.translate[0]+d.p.pivot[0],d.p.translate[1]+d.p.pivot[1]);}
function inPolygon(points,p){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
canvas.addEventListener('pointerdown',event=>{if(!catalog)return;playing=false;$('play').textContent='재생';$('play').setAttribute('aria-pressed','false');refreshLayout();const p=worldAt(event);
 if(mode==='move'&&!inPolygon(corners(),p)){const draw=[...layout.draws].reverse().find(d=>d.part&&inPolygon(bounds(d),p));if(draw){$('target').value=`part:${draw.part}`;selectTarget($('target').value);}}
 checkpoint();drag={last:p,angle:Math.atan2(p[1]-pivotWorld()[1],p[0]-pivotWorld()[0])};canvas.setPointerCapture(event.pointerId);canvas.focus({preventScroll:true});});
canvas.addEventListener('pointermove',event=>{if(!drag)return;const p=worldAt(event),d=descriptor();try{
 if(mode==='move')moveBy(p[0]-drag.last[0],p[1]-drag.last[1]);
 if(mode==='rotate'){const pivot=pivotWorld(),a=Math.atan2(p[1]-pivot[1],p[0]-pivot[0]);let difference=a-drag.angle;if(difference>Math.PI)difference-=2*Math.PI;if(difference<-Math.PI)difference+=2*Math.PI;mutate({rotation:d.angle+difference});drag.angle=a;}
 if(mode==='pivot'){
  let origin;if(selection.kind==='part'){const local=point(inverse(selectedDraw().matrix),...p);origin=[d.p.origin[0]+local[0]/d.w,d.p.origin[1]+local[1]/d.h];}
  else if(selection.kind==='equipment'){const local=point(inverse(layout.equipmentDraws[selection.side].matrix),...p);origin=[d.p.grip[0]+local[0]/d.w,d.p.grip[1]+local[1]/d.h];}
  else {const local=point(inverse(layout.groups[selection.key].editorBase),...p);origin=[local[0]-d.p.translate[0],local[1]-d.p.translate[1]];}
  mutate({origin},true);
 }
 drag.last=p;fields();persist();}catch(e){message(e.message);}});
function endDrag(e){drag=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);persist();}canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);
for(const key of ['x','y','w','h','rotation','pivot-x','pivot-y']){
 let fieldCheckpoint=false;
 $(key).addEventListener('focus',()=>{fieldCheckpoint=false;});
 $(key).addEventListener('input',()=>{const n=$(key).valueAsNumber;if(!Number.isFinite(n))return;if(['w','h'].includes(key)&&(n<1||n>10000))return;if(!fieldCheckpoint){checkpoint();fieldCheckpoint=true;}const d=descriptor(),v={};
 if(key==='rotation')v.rotation=n*RAD;
 else if(key==='pivot-x'||key==='pivot-y'){const o=[...d.pivot];o[key==='pivot-x'?0:1]=n;v.origin=selection.kind==='group'?o:[o[0]/d.w,o[1]/d.h];}
 else {v[key]=n;if($('aspect').checked&&key==='w')v.h=d.h*n/d.w;if($('aspect').checked&&key==='h')v.w=d.w*n/d.h;}
 try{mutate(v,key.startsWith('pivot'));for(const other of ['w','h'])if(other!==key)$(other).value=round(descriptor()[other]);}catch(e){message(e.message);}});
 $(key).addEventListener('change',()=>{fields();fieldCheckpoint=false;});
}
$('target').addEventListener('change',()=>selectTarget($('target').value));$('character').addEventListener('change',()=>showCharacter($('character').value));$('previous').addEventListener('click',()=>switchBy(-1));$('next').addEventListener('click',()=>switchBy(1));$('done').addEventListener('click',()=>{if(!completed.includes(id))completed.push(id);persist();switchBy(1);progress();});
$('holding-mode').addEventListener('change',()=>{const previous=structuredClone(instance.equipment);try{const key=instance.equipment.left?.equipmentId||instance.equipment.right?.equipmentId;unequip(instance,'both');if(key)equip(catalog,instance,key,$('holding-mode').value==='both'?'both':'left');equipmentControls();targetOptions();persist();}catch(e){instance.equipment=previous;$('holding-mode').value='single';message(e.message);equipmentControls();}});
$('recommended').addEventListener('click',()=>{recommended();equipmentControls();targetOptions();persist();});$('bare').addEventListener('click',()=>{$('holding-mode').value='single';for(const slot of Object.keys(instance.equipment))unequip(instance,slot);equipmentControls();targetOptions();persist();});
for(const button of document.querySelectorAll('[data-mode]'))button.addEventListener('click',()=>{mode=button.dataset.mode;for(const b of document.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b===button));});
$('play').addEventListener('click',()=>{playing=!playing;$('play').textContent=playing?'일시정지':'재생';$('play').setAttribute('aria-pressed',String(playing));});$('state').addEventListener('change',()=>{instance.animation.state=$('state').value;time=0;persist();});$('facing').addEventListener('change',()=>{instance.animation.facing=Number($('facing').value);persist();});$('time').addEventListener('input',()=>{time=Number($('time').value);});
for(const [key,direction]of [['backward',-1],['forward',1]])$(key).addEventListener('click',()=>{const entry=layerEntries[Number($('layer-entry').value)]||currentNode();if(!entry)return;const at=entry.siblings.indexOf(entry.node),next=at+direction;if(next<0||next>=entry.siblings.length)return;checkpoint();[entry.siblings[at],entry.siblings[next]]=[entry.siblings[next],entry.siblings[at]];layerOptions(entry.node);persist();});
$('undo').addEventListener('click',()=>{if(!undo.length)return;redo.push(snapshot());applyBundle(undo.pop());targetOptions();progress();historyButtons();persist();});$('redo').addEventListener('click',()=>{if(!redo.length)return;undo.push(snapshot());applyBundle(redo.pop());targetOptions();progress();historyButtons();persist();});
$('reset').addEventListener('click',()=>{checkpoint();catalog.characters[id].rig=structuredClone(original.characters[id]);completed=completed.filter(k=>k!==id);targetOptions();progress();persist();message('이 캐릭터를 원본으로 복원했습니다. 되돌리기로 취소할 수 있습니다.');});
$('export-one').addEventListener('click',()=>download([id]));$('export-all').addEventListener('click',()=>download(ids));
$('import').addEventListener('change',async()=>{const file=$('import').files[0];if(!file)return;try{if(file.size>4*1024*1024)throw new Error('JSON 파일은 4MB 이하로 선택하세요.');const data=validateEdits(JSON.parse(await file.text()),catalog);checkpoint();applyBundle(data);if(!data.preview)instances.clear();showCharacter(ids.includes(data.activeCharacter)?data.activeCharacter:ids.find(key=>Object.hasOwn(data.characters,key))||id);persist();message(`${Object.keys(data.characters).length}종의 수정 데이터를 불러왔습니다.`);}catch(e){message(`불러오기 실패: ${e.message}`);}finally{$('import').value='';}});
let refURL;$('reference').addEventListener('change',()=>{const file=$('reference').files[0];if(!file)return;if(refURL)URL.revokeObjectURL(refURL);refURL=URL.createObjectURL(file);$('reference-image').src=refURL;$('reference-image').hidden=false;});
canvas.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();checkpoint();const step=e.shiftKey?10:1;moveBy(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0,e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0);fields();persist();});
function render(now){const dt=last?Math.min((now-last)/1000,.05):0;last=now;
 if(catalog){if(playing)time=(time+dt)%2;const rect=canvas.getBoundingClientRect();width=rect.width;height=rect.height;dpr=Math.min(devicePixelRatio||1,2);if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
 instance.animation.elapsed=instance.animation.state==='attack'?time%.65:instance.animation.state==='hit'?time%.36:time;
 const s=Math.min(width/1050,height/1200)*Number($('zoom').value),sign=instance.animation.facing===1?-1:1;
 view=[s*sign,0,0,s,width/2-rig().foot[0]*s*sign,height*.94-rig().foot[1]*s];
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.save();ctx.translate(width/2,height*.94);
 try{drawCharacter(ctx,catalog,instance,time,{scale:s});ctx.restore();refreshLayout();
 if($('guides').checked){ctx.save();ctx.strokeStyle='#6e765650';ctx.lineWidth=1;ctx.setLineDash([4,5]);const floor=point(view,...rig().foot);ctx.beginPath();ctx.moveTo(0,floor[1]);ctx.lineTo(width,floor[1]);ctx.moveTo(width/2,0);ctx.lineTo(width/2,height);ctx.stroke();ctx.setLineDash([]);
 const polygon=corners().map(p=>point(view,...p));if(polygon.length){ctx.strokeStyle='#417a92';ctx.lineWidth=1.5;ctx.beginPath();polygon.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.stroke();const pivot=point(view,...pivotWorld());ctx.strokeStyle='#d25c35';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(pivot[0]-9,pivot[1]);ctx.lineTo(pivot[0]+9,pivot[1]);ctx.moveTo(pivot[0],pivot[1]-9);ctx.lineTo(pivot[0],pivot[1]+9);ctx.stroke();ctx.beginPath();ctx.arc(...pivot,5,0,Math.PI*2);ctx.stroke();}ctx.restore();}
 }catch(e){ctx.restore();message(e.message);playing=false;}
 $('time-value').textContent=`${time.toFixed(2)}초`;if(playing)$('time').value=time;
 }
 requestAnimationFrame(render);
}
try{catalog=await loadCatalog();ids=visibleCharacters(catalog).map(([key])=>key);original=snapshot();let restored=false,resume=ids[0];
 try{const saved=localStorage.getItem(KEY);if(saved){const savedData=validateEdits(JSON.parse(saved),catalog);applyBundle(savedData);if(ids.includes(savedData.activeCharacter))resume=savedData.activeCharacter;restored=true;}}catch{message('이전 임시 저장을 복원하지 못했습니다. JSON을 불러오거나 원본에서 편집하세요.');}
 for(const key of ids)$('character').add(new Option(catalog.characters[key].name,key));showCharacter(resume);ready=true;$('save-state').textContent=restored?'이전 작업 복원됨':'원본에서 시작';requestAnimationFrame(render);
}catch(e){message(e.message);$('save-state').textContent='불러오기 실패';}
