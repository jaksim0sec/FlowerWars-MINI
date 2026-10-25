import {layoutCharacter} from './characters/engine.mjs';
const bounds=new WeakMap(),poses=new WeakMap();
export function characterRadius(catalog,instance){
 const rig=catalog.characters[instance.characterId].rig;let r=bounds.get(rig);
 if(r===undefined){r=0;for(const p of Object.values(rig.parts))for(const[x,y]of[[p.x,p.y],[p.x+p.w,p.y],[p.x,p.y+p.h],[p.x+p.w,p.y+p.h]])r=Math.max(r,Math.hypot(x-rig.foot[0],y-rig.foot[1]));let maxScale=1,maxShift=0;
  const visit=(nodes,scale=1,shift=0)=>{for(const n of nodes){let s=scale,t=shift;for(const op of n.transforms||[])if(op.editorAdjustment){s*=Math.max(...(op.scale||[1,1]).map(Math.abs));t+=Math.hypot(...(op.translate||[0,0]));}maxScale=Math.max(maxScale,s);maxShift=Math.max(maxShift,t);if(n.children)visit(n.children,s,t);}};
  visit(rig.nodes);r=(r+maxShift)*maxScale;bounds.set(rig,r);}
 let equipment=0;for(const a of Object.values(instance.equipment))if(a){const e=catalog.equipment[a.equipmentId];equipment=Math.max(equipment,e.w+e.h);}
 return (r+equipment+300+(rig.vitality?.scatter||22)*4)*rig.scale;
}
export function releasePose(instance){poses.delete(instance);}
export function onScreen(x,y,r,camera,w,h){const sx=x*camera.scale+camera.x,sy=y*camera.scale+camera.y,p=r*camera.scale;return sx+p>=0&&sx-p<=w&&sy+p>=0&&sy-p<=h;}
export function cachedPose(catalog,instance,time,scale){
 const a=instance.animation,fast=['attack','hit','death'].includes(a.state),rate=scale<.4?15:30;
 const key=[fast?time:Math.floor(time*rate),a.state,fast?a.elapsed:0,a.facing,a.phase,a.attackVector?.x,a.attackVector?.y,a.deathDirection,(instance.health?.injury||0).toFixed(3),(instance.health?.critical||0).toFixed(3),...Object.entries(instance.equipment).map(([s,e])=>s+':'+(e?e.equipmentId+e.hand+(e.overrides?.rotation||0):''))].join('|');
 const old=poses.get(instance),rig=catalog.characters[instance.characterId].rig;
 if(old?.key===key&&old.rig===rig)return{layout:old.layout,computed:false};
 const layout=layoutCharacter(catalog,instance,time);poses.set(instance,{key,rig,layout});return{layout,computed:true};
}
