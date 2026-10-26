import {createCharacter,layoutCharacter,drawCharacter,point} from './characters/engine.mjs';

// Fit the complete head and shoulders, not a fixed crop of the full character.
export function portraitFrame(catalog,character){
 const layout=layoutCharacter(catalog,character,0),rig=catalog.characters[character.characterId].rig;
 const box=d=>{const p=rig.parts[d.part];return [[0,0],[p.w,0],[0,p.h],[p.w,p.h]].map(([x,y])=>point(d.matrix,x-p.w*p.origin[0],y-p.h*p.origin[1]));};
 const head=layout.draws.filter(d=>d.part&&/head|hair|hat|face/.test(d.part)).flatMap(box);
 const body=layout.draws.find(d=>d.part==='body');
 const chest=body?box(body):head;
 const minX=Math.min(...head.map(p=>p[0])),maxX=Math.max(...head.map(p=>p[0]));
 const top=Math.min(...head.map(p=>p[1])),chestTop=Math.min(...chest.map(p=>p[1])),chestBottom=Math.max(...chest.map(p=>p[1]));
 return {minX,maxX,top,bottom:Math.max(...head.map(p=>p[1]),chestTop+(chestBottom-chestTop)*.65)};
}
export function commanderPortrait(catalog,unit){
 const c=createCharacter(catalog,unit.character.characterId);
 c.appearance=structuredClone(unit.character.appearance||c.appearance);
 const frame=portraitFrame(catalog,c),rig=catalog.characters[c.characterId].rig;
 const canvas=document.createElement('canvas');canvas.width=208;canvas.height=200;
 const ctx=canvas.getContext('2d'),s=Math.min(192/(frame.maxX-frame.minX),192/(frame.bottom-frame.top));
 ctx.translate(104-(frame.minX+frame.maxX)/2*s+rig.foot[0]*s,8-frame.top*s+rig.foot[1]*s);
 drawCharacter(ctx,catalog,c,0,{scale:s});
 return canvas.toDataURL('image/png');
}
