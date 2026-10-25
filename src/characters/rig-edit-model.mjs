/** Serializable editor operations; no DOM or image data in exported files. */
export function nodesOf(rig) {
 const out=[];function visit(nodes,parent=null){for(const node of nodes){out.push({node,siblings:nodes,parent});if(node.children)visit(node.children,node);}}visit(rig.nodes);return out;
}
export function groupAdjustment(node) {
 node.transforms ||= [];
 let op=node.transforms.find(x=>x.editorAdjustment);
 if(!op){op={editorAdjustment:true,translate:[0,0],rotate:0,pivot:[...(node.transforms.find(x=>x.pivot)?.pivot || [0,0])],scale:[1,1]};node.transforms.push(op);}
 return op;
}
function validPart(p) {
 for(const name of ['x','y','w','h'])if(!Number.isFinite(p[name]))throw new Error(`${name}: 숫자가 필요합니다.`);
 if(p.w<1||p.h<1||p.w>10000||p.h>10000)throw new Error('크기는 1~10000 범위로 입력하세요.');
 if(!Array.isArray(p.origin)||p.origin.length!==2||p.origin.some(x=>!Number.isFinite(x)))throw new Error('회전축 값이 잘못되었습니다.');
 if(p.rotation!==undefined&&!Number.isFinite(p.rotation))throw new Error('회전 각도가 잘못되었습니다.');
}
export function editPart(rig,name,patch) {
 const p=rig.parts[name];if(!p)throw new Error('알 수 없는 파츠입니다.');
 const next={...p,...structuredClone(patch)};validPart(next);Object.assign(p,next);
 const groups=new Set(Object.values(rig.sockets || {}).filter(s=>s.part===name).map(s=>s.group));
 const pivot=[p.x+p.w*p.origin[0],p.y+p.h*p.origin[1]];
 const sync=node=>{for(const op of node.transforms || [])if(op.pivot&&!op.editorAdjustment)op.pivot=[...pivot];};
 for(const {node} of nodesOf(rig))if(groups.has(node.id))sync(node);
 for(const pose of Object.values(rig.twoHandedPoses || {}))for(const [id,node]of Object.entries(pose.nodes || {}))if(groups.has(id))sync(node);
 for(const states of Object.values(rig.slotPoses || {}))for(const overrides of Object.values(states))for(const [id,node]of Object.entries(overrides))if(groups.has(id))sync(node);
 return p;
}
export function exportEdits(catalog,ids=Object.keys(catalog.characters),completed=[]) {
 return {format:'doragami-rig-edits',version:1,characters:Object.fromEntries(ids.map(id=>[id,structuredClone(catalog.characters[id].rig)])),equipment:Object.fromEntries(Object.entries(catalog.equipment).map(([id,{image,...data}])=>[id,structuredClone(data)])),completed:completed.filter(id=>ids.includes(id))};
}
export function validateEdits(input,catalog) {
 const data=input?.parts&&input?.id ? {format:'doragami-rig-edits',version:1,characters:{[input.id]:input},equipment:{}} : input;
 if(data?.format!=='doragami-rig-edits'||data.version!==1||!data.characters||typeof data.characters!=='object')throw new Error('도라가미 리그 JSON 형식이 아닙니다.');
 function finite(value,depth=0){if(depth>60)throw new Error('JSON 구조가 너무 깊습니다.');if(typeof value==='number'&&!Number.isFinite(value))throw new Error('잘못된 숫자가 있습니다.');if(value&&typeof value==='object')for(const v of Object.values(value))finite(v,depth+1);}
 finite(data);
 if(data.completed!==undefined&&(!Array.isArray(data.completed)||data.completed.some(id=>!Object.hasOwn(catalog.characters,id))))throw new Error('완료 표시 데이터가 잘못되었습니다.');
 for(const [id,rig]of Object.entries(data.characters)) {
  const original=Object.hasOwn(catalog.characters,id)?catalog.characters[id].rig:null;if(!original||rig.id!==id)throw new Error(`등록되지 않은 캐릭터: ${id}`);
  if(!rig.parts||!Array.isArray(rig.nodes)||!rig.sockets)throw new Error(`${id}: 리그 구조가 잘못되었습니다.`);
  if(Object.keys(rig.parts).length!==Object.keys(original.parts).length)throw new Error(`${id}: 파츠 구성이 다릅니다.`);
  for(const [name,p]of Object.entries(rig.parts)){if(!original.parts[name]||p.asset!==original.parts[name].asset)throw new Error(`${id}: 원본 파츠 경로가 다릅니다.`);validPart(p);}
  const drawSet=r=>nodesOf(r).filter(x=>x.node.part||x.node.socket).map(({node})=>JSON.stringify([node.part||'',node.socket||'',node.clip||''])).sort().join('|');
  if(drawSet(rig)!==drawSet(original))throw new Error(`${id}: 그리기 파츠 구성이 다릅니다.`);
  for(const {node}of nodesOf(rig)){for(const op of node.transforms || [])if(op.editorAdjustment){if(!Array.isArray(op.scale)||op.scale.length!==2||op.scale.some(v=>!Number.isFinite(v)||v<=0)||!Number.isFinite(op.rotate))throw new Error('묶음 배율 또는 각도가 잘못되었습니다.');}if(node.part&&!rig.parts[node.part])throw new Error('없는 파츠를 참조합니다.');if(node.socket&&!rig.sockets[node.socket])throw new Error('없는 장착점을 참조합니다.');}
 }
 for(const [id,e]of Object.entries(data.equipment || {})){
  if(!Object.hasOwn(catalog.equipment,id)||e.asset!==catalog.equipment[id].asset||Object.hasOwn(e,'image'))throw new Error(`장비 경로가 다릅니다: ${id}`);
  if(!Number.isFinite(e.w)||!Number.isFinite(e.h)||e.w<1||e.h<1||!Array.isArray(e.grip)||e.grip.length!==2||e.grip.some(x=>!Number.isFinite(x)))throw new Error('장비 크기 또는 손잡이 값이 잘못되었습니다.');
 }
 if(data.preview)for(const[id,p]of Object.entries(data.preview)){
  if(!Object.hasOwn(catalog.characters,id)||!['idle','walk','attack','hit'].includes(p.state)||![-1,1].includes(p.facing))throw new Error('미리보기 상태가 잘못되었습니다.');
  for(const item of Object.values(p.equipment || {}))if(item&&(!Object.hasOwn(catalog.equipment,item.equipmentId)||!['left','right','both',...Object.keys(catalog.characters[id].rig.sockets || {})].includes(item.hand)))throw new Error('미리보기 장비가 잘못되었습니다.');
 }
 return structuredClone(data);
}
