/** Board/DOM-independent instance, animation, rig and equipment engine. */
export function createCharacter(catalog, characterId, options = {}) {
  if (!catalog.characters[characterId]) throw new Error(`Unknown character: ${characterId}`);
  return {characterId, equipment:Object.fromEntries(['left','right',...Object.keys(catalog.characters[characterId].rig.sockets || {})].map(slot=>[slot,null])), appearance:{parts:{}},
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
  const attachment={equipmentId, hand, overrides:{}};
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
    case 'abs':return Math.abs(a[0]);case 'max':return Math.max(...a);case 'min':return Math.min(...a);

    default:throw new Error(`Unknown animation expression: ${op}`);
  }
}
function channels(rig, instance, time, equipment) {
  const a=instance.animation;
  const vars={state:a.state,time,elapsed:a.elapsed,phase:a.phase,vectorX:a.attackVector?.x||0,vectorY:a.attackVector?.y||0};
  const overrides=Object.assign({},...equipment.map(e=>e.animation||{}));
  for(const [name,expr] of Object.entries({...rig.animations,...overrides,...instance.appearance.animations})) vars[name]=value(expr,vars);
  return vars;
}
/** Returns rig-space matrices, usable by Canvas, cards, tools and tests. */
export function layoutCharacter(catalog, instance, time=0) {
  const def=catalog.characters[instance.characterId],rig=def.rig;
  const unique=[...new Set(Object.values(instance.equipment).filter(Boolean))];
  const shared=unique.find(x=>x.hand==='both');
  const pose=shared ? rig.twoHandedPoses[catalog.equipment[shared.equipmentId].twoHandedPose] : null;
  const vars=channels(rig,instance,time,[]);
  const draws=[],sockets={};
  function visit(nodes,parent,ancestors=[]) {
    for(const node of nodes) {
      const override=pose?.nodes?.[node.id] || {};
      let m=parent;
      for(const op of override.transforms || node.transforms || []) {
        if(op.translate) m=multiply(m,translate(...op.translate.map(x=>value(x,vars))));
        if(op.rotate!==undefined) {const pivot=op.pivot||[0,0];m=multiply(m,multiply(translate(...pivot),multiply(rotate(value(op.rotate,vars)),translate(-pivot[0],-pivot[1]))));}
      }
      const lineage=[...ancestors,node.id];
      if(node.children) visit(node.children,m,lineage);
      if(node.socket) {
        const s=rig.sockets[node.socket],p=rig.parts[s.part];
        sockets[node.socket]={matrix:multiply(m,translate(p.x+p.w*s.grip[0],p.y+p.h*s.grip[1])),ancestors:lineage};
        draws.push({socket:node.socket,ancestors:lineage});
      }
      if(node.part) {
        const p=rig.parts[node.part];
        const matrix=multiply(m,multiply(translate(p.x+p.w*p.origin[0],p.y+p.h*p.origin[1]+value(node.dy,vars)),rotate((p.rotation||0)+value(node.rotation,vars))));
        draws.push({part:node.part,matrix,clip:node.clip?p[node.clip]:p.clip,ancestors:lineage});
      }
    }
  }
  visit(rig.nodes,I());
  const equipmentDraws={};
  for(const attachment of unique) {
    const e=catalog.equipment[attachment.equipmentId];
    const side=attachment.hand==='both' ? pose.primary : attachment.hand;
    const socket=sockets[side];
    const equipmentVars=channels(rig,instance,time,[e]);
    const rotation=(e.socketRotations?.[side] ?? e.rotation ?? 0)+value(e.motion||0,equipmentVars)+(attachment.overrides.rotation||0);
    const matrix=multiply(socket.matrix,rotate(rotation));
    equipmentDraws[side]={equipmentId:attachment.equipmentId,matrix,w:e.w,h:e.h,grip:e.grip};
    if(attachment.hand==='both') {
      const other=side==='left'?'right':'left', secondary=sockets[other];
      const target=point(matrix,(e.secondaryGrip[0]-e.grip[0])*e.w,(e.secondaryGrip[1]-e.grip[1])*e.h);
      const current=point(secondary.matrix),dx=target[0]-current[0],dy=target[1]-current[1];
      const group=rig.sockets[other].group;
      for(const draw of draws) if(draw.matrix && draw.ancestors.includes(group)) draw.matrix=multiply(translate(dx,dy),draw.matrix);
      secondary.matrix=multiply(translate(dx,dy),secondary.matrix);
    }
  }
  return {draws,sockets,equipmentDraws,vars};
}
export function drawCharacter(ctx,catalog,instance,time=0,{scale}={}) {
  const def=catalog.characters[instance.characterId],rig=def.rig;
  const {draws,equipmentDraws,vars}=layoutCharacter(catalog,instance,time);
  ctx.save();
  ctx.translate(...(rig.worldTranslate || [0,0]).map(expr=>value(expr,vars)));
  const s=scale ?? rig.scale;
  ctx.scale(instance.animation.facing===1?-s:s,s);ctx.translate(-rig.foot[0],-rig.foot[1]);
  for(const draw of draws) {
    const equipment=draw.socket && equipmentDraws[draw.socket];
    if(draw.socket && !equipment) continue;
    const p=equipment || rig.parts[draw.part],matrix=equipment?.matrix || draw.matrix;
    const image=equipment ? catalog.equipment[equipment.equipmentId].image : def.images[instance.appearance.parts[draw.part] || draw.part];
    if(!image) throw new Error(`Missing character part: ${draw.part}`);
    const origin=equipment ? p.grip : p.origin;
    ctx.save();ctx.transform(...matrix);
    if(draw.clip) {ctx.beginPath();draw.clip.forEach(([x,y],i)=>{const v=[(x-origin[0])*p.w,(y-origin[1])*p.h];if(i)ctx.lineTo(...v);else ctx.moveTo(...v);});ctx.closePath();ctx.clip();}
    ctx.drawImage(image,-p.w*origin[0],-p.h*origin[1],p.w,p.h);ctx.restore();
  }
  ctx.restore();
}
