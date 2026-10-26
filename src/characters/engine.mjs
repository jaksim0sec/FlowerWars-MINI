import {createHealth,DEATH_DURATION} from './vitality.mjs';
/** Board/DOM-independent instance, animation, rig and equipment engine. */
export function createCharacter(catalog, characterId, options = {}) {
  if (!catalog.characters[characterId]) throw new Error(`Unknown character: ${characterId}`);
  return {characterId, health:createHealth(catalog.characters[characterId].maxHealth||100), equipment:Object.fromEntries(['left','right',...Object.keys(catalog.characters[characterId].rig.sockets || {})].map(slot=>[slot,null])), appearance:{parts:{}},
    animation:{state:'idle',elapsed:0,facing:-1,phase:0}, ...structuredClone(options)};
}
export function unequip(instance, hand) {
  if (hand!=='both' && !Object.hasOwn(instance.equipment,hand)) throw new Error(`Unknown hand: ${hand}`);
  for (const side of hand === 'both' ? ['left','right'] : [hand]) {
    const item=instance.equipment[side];
    for(const slot of Object.keys(instance.equipment)) if(instance.equipment[slot]===item) instance.equipment[slot]=null;
  }
}
export function equip(catalog, instance, equipmentId, hand) {
  const item=catalog.equipment[equipmentId];
  if (!item || (hand!=='both' && !Object.hasOwn(instance.equipment,hand))) throw new Error('Invalid equipment or hand');
  const rig=catalog.characters[instance.characterId].rig;
  if(hand==='both' && (!item.secondaryGrip || !item.twoHandedPose || !rig.twoHandedPoses?.[item.twoHandedPose]))
    throw new Error('Equipment has no compatible two-hand grip/pose');
  if(hand!=='both' && item.hands===2) throw new Error('Equipment requires both hands');
  if(item.slot ? item.slot!==hand : !['left','right','both'].includes(hand)) throw new Error('Equipment slot mismatch');
  unequip(instance,hand);
  const attachment={equipmentId, hand, overrides:{},...(item.battle?{battle:structuredClone(item.battle)}:{})};
  for(const slot of hand==='both'?['left','right']:[hand]) instance.equipment[slot]=attachment;
}
const I=()=>[1,0,0,1,0,0];
export function multiply(a,b) {
  return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
}
const translate=(x,y)=>[1,0,0,1,x,y];
const rotate=a=>[Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a),0,0];
export const point=(m,x=0,y=0)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
function value(expr, vars) {
  if(typeof expr==='number') return expr;
  if(typeof expr==='string') return vars[expr] ?? 0;
  if(!expr) return 0;
  const [op,...args]=expr;
  if(op==='state') return value(args[vars.state===args[0]?1:2],vars);
  if(op==='negativeY') return value(args[vars.vectorY<0?0:1],vars);
  if(op==='curve') {const t=value(args[0],vars),keys=args[1];if(t<=keys[0][0])return value(keys[0][1],vars);for(let i=1;i<keys.length;i++)if(t<=keys[i][0]){const f=(t-keys[i-1][0])/(keys[i][0]-keys[i-1][0]);return value(keys[i-1][1],vars)*(1-f)+value(keys[i][1],vars)*f;}return value(keys.at(-1)[1],vars);}
  const a=args.map(x=>value(x,vars));
  switch(op) {
    case '+':return a.reduce((x,y)=>x+y,0);case '*':return a.reduce((x,y)=>x*y,1);
    case '-':return a[0]-a[1];case '/':return a[0]/a[1];case 'sin':return Math.sin(a[0]);
    case 'abs':return Math.abs(a[0]);case 'max':return Math.max(...a);case 'min':return Math.min(...a);case 'atan2':return Math.atan2(a[0],a[1]);

    default:throw new Error(`Unknown animation expression: ${op}`);
  }
}
function channels(rig, instance, time, equipment) {
  const a=instance.animation;
  const vars={state:a.state,time,elapsed:a.elapsed,phase:a.phase,vectorX:a.attackVector?.x||0,vectorY:a.attackVector?.y||0};
  const overrides=Object.assign({},...equipment.map(e=>e.animation||{}));
  for(const [name,expr] of Object.entries({...rig.animations,...overrides,...instance.appearance.animations})) {
    vars[name]=value(expr,vars);
    if(name==='stride'||name==='wave')vars[name]*=1-(instance.health?.injury||0)*.18-(instance.health?.critical||0)*.12;
  }
  return vars;
}
/** Returns rig-space matrices, usable by Canvas, cards, tools and tests. */
export function layoutCharacter(catalog, instance, time=0) {
  const def=catalog.characters[instance.characterId],rig=def.rig;
  const unique=[...new Set(Object.values(instance.equipment).filter(Boolean))];
  const shared=unique.find(x=>x.hand==='both');
  const pose=shared ? rig.twoHandedPoses[catalog.equipment[shared.equipmentId].twoHandedPose] : null;
  // Equipment can select an authored rig pose without changing the base anatomy.
  // An independently equipped opposite hand keeps its own pose and animation.
  const equipmentPoses=unique.flatMap(a=>{
    const p=rig.equipmentPoses?.[catalog.equipment[a.equipmentId].rigPose]?.[a.hand];
    if(!p)return [];
    const support=a.hand==='left'?'right':'left';
    return [{...p,supportFree:!instance.equipment[support],supportGroup:rig.sockets[support]?.group}];
  });
  const equipmentNodes={};
  for(const p of equipmentPoses)for(const[id,node]of Object.entries(p.nodes||{}))
    if(p.supportFree||id!==p.supportGroup)equipmentNodes[id]=node;
  const slotNodes={};
  for(const [slot,states] of Object.entries(rig.slotPoses || {})){
    Object.assign(slotNodes,states[instance.equipment[slot]?'equipped':'empty'] || {});
  }
  const animationRig={...rig,animations:{...rig.animations,...Object.assign({},...unique.map(a=>catalog.equipment[a.equipmentId].rigAnimation||{}))}};
  const vars=channels(animationRig,instance,time,[]);
  const injury=instance.health?.injury||0,critical=instance.health?.critical||0,style=rig.vitality||{};
  const draws=[],sockets={},groups={};
  function visit(nodes,parent,ancestors=[]) {
    for(const node of nodes) {
      const override=pose?.nodes?.[node.id] || equipmentNodes[node.id] || slotNodes[node.id] || {};
      let m=parent,editorBase=parent;
      const operations=override.transforms ? [...override.transforms,...(node.transforms || []).filter(op=>op.editorAdjustment)] : node.transforms || [];
      for(const op of operations) {
        if(op.editorAdjustment)editorBase=m;
        if(op.translate) m=multiply(m,translate(...op.translate.map(x=>value(x,vars))));
        if(op.rotate!==undefined) {const pivot=op.pivot||[0,0];m=multiply(m,multiply(translate(...pivot),multiply(rotate(value(op.rotate,vars)),translate(-pivot[0],-pivot[1]))));}
        if(op.scale) {const pivot=op.pivot||[0,0],s=op.scale.map(x=>value(x,vars));m=multiply(m,multiply(translate(...pivot),multiply([s[0],0,0,s[1],0,0],translate(-pivot[0],-pivot[1]))));}
      }
      // y_common.css: anticipation at 55%, impact at 75%, then settle.
      // Retimed to the simulation's impact; special weapons keep a smaller
      // body accent so bows stay aimed and spears keep their straight thrust.
      if(vars.state==='attack'&&(node.id==='upper'||node.id==='neck')){
        const weight=unique.some(a=>a.equipmentId==='basic_sword')?1:0;
        const head=node.id==='neck',pivot=rig.neck||rig.foot;
        if(!head)m=multiply(m,translate(value('attackBodyX',vars)*weight,value('attackBodyY',vars)*weight));
        m=multiply(m,multiply(translate(...pivot),multiply(rotate(value(head?'headRock':'bodyRock',vars)*weight),translate(-pivot[0],-pivot[1]))));
      }
      if(node.id==='upper')m=multiply(m,translate(critical*Math.sin(time*8)*5,injury*9+critical*8));
      if(['neck','leftArm','rightArm'].includes(node.id)){
        const p=node.transforms?.find(op=>op.pivot)?.pivot||rig.neck||[0,0];
        const angle=node.id==='neck'?injury*(style.headDroop??.07)+critical*(.07+Math.sin(time*7)*(style.criticalSway??.065)):(node.id==='leftArm'?-1:1)*(injury*.10+critical*.07);
        m=multiply(m,multiply(translate(...p),multiply(rotate(angle),translate(-p[0],-p[1]))));
      }
      if(node.id) groups[node.id]={matrix:m,parentMatrix:parent,editorBase};
      const lineage=[...ancestors,node.id];
      if(node.children) visit(node.children,m,lineage);
      if(node.socket) {
        const s=rig.sockets[node.socket],p=rig.parts[s.part];
        const palm=multiply(m,multiply(translate(p.x+p.w*p.origin[0],p.y+p.h*p.origin[1]),multiply(rotate(p.rotation||0),translate((s.grip[0]-p.origin[0])*p.w,(s.grip[1]-p.origin[1])*p.h))));
        sockets[node.socket]={matrix:multiply(palm,rotate(s.rotation||0)),ancestors:lineage};
        draws.push({socket:node.socket,ancestors:lineage});
      }
      if(node.part) {
        const p=rig.parts[node.part];
        const matrix=multiply(m,multiply(translate(p.x+p.w*p.origin[0],p.y+p.h*p.origin[1]+value(node.dy,vars)),rotate((p.rotation||0)+value(node.rotation,vars))));
        draws.push({part:node.part,matrix,parentMatrix:m,clip:node.clip?p[node.clip]:p.clip,ancestors:lineage});
      }
    }
  }
  visit(rig.nodes,I());
  const equipmentDraws={};
  for(const attachment of unique) {
    const e=catalog.equipment[attachment.equipmentId];
    const side=attachment.hand==='both' ? pose.primary : attachment.hand;
    const socket=sockets[side];
    const equipmentVars=!e.animation?vars:Object.keys(e.animation).length===1&&Object.hasOwn(e.animation,'weapon')?{...vars,weapon:value(e.animation.weapon,vars)}:channels(rig,instance,time,[e]);
    const rotation=(e.socketRotations?.[side] ?? e.rotation ?? 0)+(rig.equipmentRotations?.[attachment.equipmentId]?.[side]||0)+value(e.motion||0,equipmentVars)*(e.socketMotionSigns?.[side]??1)+(attachment.overrides.rotation||0);
    const mirror=e.socketMirrors?.[side] ? [-1,0,0,1,0,0] : I();
    let matrix=multiply(socket.matrix,multiply(translate(...(e.offset || [0,0])),multiply(rotate(rotation),mirror)));
    if(e.thrust){
      const a=instance.animation,v=a.attackVector;
      const angle=a.state==='attack'&&v?Math.atan2(v.x*(a.facing===1?-1:1),-v.y):a.state==='walk'?-1.0:-.12;
      // Aim the shaft through the palm; the authored body lunge supplies the
      // forward thrust, so the weapon never slides out of the gripping hand.
      const sx=Math.hypot(socket.matrix[0],socket.matrix[1]),sy=Math.hypot(socket.matrix[2],socket.matrix[3]);
      matrix=multiply(translate(socket.matrix[4],socket.matrix[5]),multiply(rotate(angle+(attachment.overrides.rotation||0)),[sx,0,0,sy,0,0]));
    }
    equipmentDraws[side]={equipmentId:attachment.equipmentId,matrix,w:e.w,h:e.h,grip:e.grip,clip:e.clip};
    if(e.bow){
      const b=e.bow,local=([x,y])=>[(x-e.grip[0])*e.w,(y-e.grip[1])*e.h];
      const other=side==='left'?'right':'left',supportSocket=!instance.equipment[other]&&equipmentPoses.some(p=>p.supportFree)?other:null;
      const rest=local(b.nock),support=supportSocket?point(sockets[supportSocket].matrix):point(matrix,...rest);
      const det=matrix[0]*matrix[3]-matrix[1]*matrix[2],dx=support[0]-matrix[4],dy=support[1]-matrix[5];
      const palm=[(matrix[3]*dx-matrix[2]*dy)/det,(-matrix[1]*dx+matrix[0]*dy)/det];
      const t=instance.animation.elapsed,attacking=instance.animation.state==='attack';
      const tension=attacking?Math.min(1,t/b.grabAt)*Math.max(0,1-Math.max(0,t-b.releaseAt)/b.snapDuration):0;
      const nock=rest.map((v,i)=>v+(palm[i]-v)*tension);
      const length=Math.hypot(...palm)||1,drawDirection=palm.map(v=>-v/length);
      let direction=drawDirection;
      // Combat vectors are projected world vectors. Undo the root facing and
      // equipment affine transform so the visual release follows the same ray.
      const vector=instance.animation.attackVector;
      if(vector&&(vector.x||vector.y)){
        const flip=instance.animation.facing===1?-1:1;
        const x=vector.x*flip,y=vector.y;
        const v=[(matrix[3]*x-matrix[2]*y)/det,(-matrix[1]*x+matrix[0]*y)/det],norm=Math.hypot(...v);
        direction=v.map(n=>n/norm);
      }
      const flight=attacking&&t>=b.releaseAt&&t<b.flightEnd?(t-b.releaseAt)/(b.flightEnd-b.releaseAt):0;
      equipmentDraws[side].bow={tips:b.tips.map(local),rest,nock,supportSocket,loaded:attacking&&t>=b.grabAt&&t<b.releaseAt,flight,launched:attacking&&t>=b.releaseAt&&t<b.flightEnd,
        arrowTail:direction.map(v=>v*(-length+b.flightDistance*flight)),direction,arrowLength:length+b.arrowOverhang};
    }
    if(attachment.hand==='both') {
      const other=side==='left'?'right':'left', secondary=sockets[other];
      const target=point(matrix,(e.secondaryGrip[0]-e.grip[0])*e.w,(e.secondaryGrip[1]-e.grip[1])*e.h);
      const current=point(secondary.matrix),dx=target[0]-current[0],dy=target[1]-current[1];
      const group=rig.sockets[other].group;
      for(const draw of draws) if(draw.matrix && draw.ancestors.includes(group)) draw.matrix=multiply(translate(dx,dy),draw.matrix);
      secondary.matrix=multiply(translate(dx,dy),secondary.matrix);
    }
  }
  // Only the palm crosses the tunic while drawing; its shoulder remains in the
  // authored rear-arm layer. Both copies share the exact same arm matrix.
  for(const p of equipmentPoses)if(p.supportFree&&value(p.overlayWhen,vars))for(const overlay of p.overlays||[]){
    const source=draws.find(d=>d.part===overlay.part);
    if(source)draws.push({overlayPart:overlay.part,matrix:source.matrix,clip:overlay.clip,ancestors:source.ancestors});
  }
  if(instance.animation.state==='death'){
    const t=instance.animation.elapsed,dir=(instance.animation.deathDirection||1)*(instance.animation.facing===1?-1:1);
    const fall=Math.max(0,Math.min(1,(t-.12)/.48));
    const angle=dir*(Math.sin(Math.min(t/.24,1)*Math.PI)*.22+fall*(style.fallAngle??.62));
    const root=multiply(translate(rig.foot[0],rig.foot[1]),multiply(rotate(angle),translate(-rig.foot[0],-rig.foot[1])));
    const alpha=Math.min(1,Math.max(0,(DEATH_DURATION-t)/.35));
    const debris=(matrix,key,geometry)=>{
      let seed=0;for(const c of key)seed=(seed*31+c.charCodeAt(0))>>>0;
      const age=Math.max(0,t-(style.parts?.[key]?.delay??(.30+(seed%5)*.045)));
      const base=multiply(root,matrix);if(!age)return base;
      const anchor=point(base),duration=.48+(seed%3)*.05,p=Math.min(age/duration,1);
      const spun=multiply(base,rotate(((seed%9)-4)*.22*p));
      const origin=geometry.origin||geometry.grip;
      const bottom=Math.max(...[[0,0],[1,0],[1,1],[0,1]].map(([x,y])=>point(spun,(x-origin[0])*geometry.w,(y-origin[1])*geometry.h)[1]-anchor[1]));
      const destination=rig.foot[1]-8-bottom;
      const y=(destination-anchor[1])*p*p-Math.sin(p*Math.PI)*45;
      const bounce=age>duration?-Math.abs(Math.sin((age-duration)*15))*Math.exp(-(age-duration)*8)*22:0;
      return multiply(translate(dir*age*25+((seed%7)-3)*p*(style.scatter??22),y+bounce),spun);
    };
    for(const draw of draws)if(draw.matrix){
      if(draw.part==='shadow'){draw.alpha=alpha*(1-fall*.6);continue;}
      draw.matrix=debris(draw.matrix,draw.part||draw.overlayPart,rig.parts[draw.part||draw.overlayPart]);draw.alpha=alpha;
    }
    for(const[side,d]of Object.entries(equipmentDraws)){d.matrix=debris(d.matrix,'equipment-'+side,d);d.alpha=alpha;}
  }
  // Foreground equipment stays above the authored body layers on either hand.
  const layer=draw=>catalog.equipment[equipmentDraws[draw.socket]?.equipmentId]?.drawLayer==='foreground'?1:0;
  draws.sort((a,b)=>layer(a)-layer(b));
  return {draws,sockets,equipmentDraws,groups,vars};
}
export function drawCharacter(ctx,catalog,instance,time=0,{scale,layout}={}) {
  const def=catalog.characters[instance.characterId],rig=def.rig;
  const {draws,equipmentDraws,vars}=layout||layoutCharacter(catalog,instance,time);
  ctx.save();
  ctx.translate(...(rig.worldTranslate || [0,0]).map(expr=>value(expr,vars)));
  const s=scale ?? rig.scale;
  ctx.scale(instance.animation.facing===1?-s:s,s);ctx.translate(-rig.foot[0],-rig.foot[1]);
  for(const draw of draws) {
    const equipment=draw.socket && equipmentDraws[draw.socket];
    if(draw.socket && !equipment) continue;
    const part=draw.part||draw.overlayPart;
    const p=equipment || rig.parts[part],matrix=equipment?.matrix || draw.matrix;
    const image=equipment ? catalog.equipment[equipment.equipmentId].image : def.images[instance.appearance.parts[part] || part];
    if(!image) throw new Error(`Missing character part: ${draw.part}`);
    const origin=equipment ? p.grip : p.origin;
    ctx.save();if((equipment?.alpha??draw.alpha)!==undefined)ctx.globalAlpha=(ctx.globalAlpha??1)*(equipment?.alpha??draw.alpha);ctx.transform(...matrix);
    const clip=equipment?.clip||draw.clip;
    if(clip) {ctx.beginPath();clip.forEach(([x,y],i)=>{const v=[(x-origin[0])*p.w,(y-origin[1])*p.h];if(i)ctx.lineTo(...v);else ctx.moveTo(...v);});ctx.closePath();ctx.clip();}
    ctx.drawImage(image,-p.w*origin[0],-p.h*origin[1],p.w,p.h);ctx.restore();
    if(equipment?.bow){
      const b=equipment.bow,style=catalog.equipment[equipment.equipmentId].bow;
      ctx.save();ctx.globalAlpha=(ctx.globalAlpha??1)*(equipment.alpha??1);ctx.transform(...matrix);ctx.strokeStyle=style.stringColor;ctx.lineWidth=style.stringWidth;ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(...b.tips[0]);ctx.lineTo(...b.nock);ctx.lineTo(...b.tips[1]);ctx.stroke();
      if(b.loaded||b.launched){
        const tail=b.loaded?b.nock:b.arrowTail,tip=tail.map((v,i)=>v+b.direction[i]*b.arrowLength),normal=[-b.direction[1],b.direction[0]];
        ctx.globalAlpha*=b.loaded?1:1-b.flight;
        ctx.strokeStyle=style.arrowColor;ctx.lineWidth=style.arrowWidth;
        ctx.beginPath();ctx.moveTo(...tail);ctx.lineTo(...tip);ctx.stroke();
        ctx.fillStyle=style.arrowheadColor;ctx.beginPath();ctx.moveTo(...tip);
        ctx.lineTo(tip[0]-b.direction[0]*18+normal[0]*9,tip[1]-b.direction[1]*18+normal[1]*9);
        ctx.lineTo(tip[0]-b.direction[0]*18-normal[0]*9,tip[1]-b.direction[1]*18-normal[1]*9);ctx.closePath();ctx.fill();
        ctx.strokeStyle=style.fletchingColor;ctx.lineWidth=7;ctx.beginPath();
        for(const sign of [-1,1]){ctx.moveTo(tail[0]+b.direction[0]*10,tail[1]+b.direction[1]*10);ctx.lineTo(tail[0]+b.direction[0]*28+normal[0]*sign*10,tail[1]+b.direction[1]*28+normal[1]*sign*10);}ctx.stroke();
      }
      ctx.restore();
    }
  }
  ctx.restore();
}
