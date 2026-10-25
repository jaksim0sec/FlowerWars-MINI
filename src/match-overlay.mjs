import {project} from './model.mjs';

export function drawMatchOverlay(ctx,match,scale){
 if(!match)return;
 const polygon=(x1,x2,fill)=>{
  ctx.beginPath();[[x1,-.5],[x2,-.5],[x2,99.5],[x1,99.5]].forEach(([x,y],i)=>{const p=project(x,y);if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);});ctx.closePath();ctx.fillStyle=fill;ctx.fill();
 };
 polygon(-.5,49.5,'#397bb011');polygon(49.5,99.5,'#cc723311');
 const a=project(49.5,-.5),b=project(49.5,99.5);
 ctx.save();ctx.strokeStyle=match.phase==='preparation'?'#fff4d9':'#fff4d966';ctx.lineWidth=1.5/scale;ctx.setLineDash([6/scale,6/scale]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([]);
 for(const [team,flag]of Object.entries(match.flags)){
  const p=project(flag.x,flag.y);ctx.save();ctx.translate(p.x,p.y);ctx.scale(1/scale,1/scale);
  ctx.fillStyle=team==='A'?'#dceefaec':'#f9dfc9ec';ctx.strokeStyle=team==='A'?'#3378a5':'#b65b30';ctx.lineWidth=2;
  ctx.beginPath();ctx.ellipse(0,0,18,10,0,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.moveTo(0,-3);ctx.lineTo(0,-39);ctx.lineTo(22,-34);ctx.lineTo(0,-25);ctx.stroke();
  ctx.fillStyle=ctx.strokeStyle;ctx.font='600 11px system-ui';ctx.textAlign='center';ctx.fillText(team==='A'?'내 깃발':'적 깃발',0,22);ctx.restore();
 }
 ctx.restore();
}

const sprites=new WeakMap();
export function drawDistantSoldier(ctx,art,unit,drawCharacter){
 let cache=sprites.get(art);if(!cache){cache=new Map();sprites.set(art,cache);}
 const c=unit.character,key=c.characterId+':'+unit.facing+':'+Object.values(c.equipment).filter(Boolean).map(a=>a.equipmentId+':'+a.hand).join(',');
 let sprite=cache.get(key);
 if(!sprite){
  sprite=document.createElement('canvas');sprite.width=384;sprite.height=384;
  const context=sprite.getContext('2d');context.translate(192,300);
  const snapshot={...c,animation:{...c.animation,state:'idle',elapsed:0,facing:unit.facing,phase:0},health:{...c.health,injury:0,critical:0}};
  drawCharacter(context,art.catalog,snapshot,0);cache.set(key,sprite);
 }
 if(unit.state==='death')ctx.globalAlpha*=.4;
 ctx.drawImage(sprite,-192,-300);
}
