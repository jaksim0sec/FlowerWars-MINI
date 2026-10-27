import {squadsFor} from './unit-groups.mjs';
import {project} from './model.mjs';

export function drawMatchOverlay(ctx,match,scale){
 if(!match)return;
 const polygon=(x1,x2,fill)=>{
  ctx.beginPath();[[x1,-.5],[x2,-.5],[x2,99.5],[x1,99.5]].forEach(([x,y],i)=>{const p=project(x,y);if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);});ctx.closePath();ctx.fillStyle=fill;ctx.fill();
 };
 polygon(-.5,49.5,'#397bb011');polygon(49.5,99.5,'#e3464d11');
 const a=project(49.5,-.5),b=project(49.5,99.5);
 ctx.save();ctx.strokeStyle=match.phase==='preparation'?'#fff4d9':'#fff4d966';ctx.lineWidth=1.5/scale;ctx.setLineDash([6/scale,6/scale]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([]);
 for(const [team,flag]of Object.entries(match.flags)){
  const p=project(flag.x,flag.y);ctx.save();ctx.translate(p.x,p.y);ctx.scale(1/scale,1/scale);
  ctx.fillStyle=team==='A'?'#dceefaec':'#f9dfddec';ctx.strokeStyle=team==='A'?'#3378a5':'#cd3944';ctx.lineWidth=2;
  ctx.beginPath();ctx.ellipse(0,0,18,10,0,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.moveTo(0,-3);ctx.lineTo(0,-39);ctx.lineTo(22,-34);ctx.lineTo(0,-25);ctx.stroke();
  ctx.fillStyle=ctx.strokeStyle;ctx.font='600 11px system-ui';ctx.textAlign='center';ctx.fillText(team==='A'?'내 깃발':'적 깃발',0,22);
  const health=flag.health;
  if(health){ctx.fillStyle='#4a352a66';ctx.fillRect(-23,28,46,5);ctx.fillStyle=team==='A'?'#327ca8':'#d74750';ctx.fillRect(-23,28,46*Math.max(0,health.current/health.max),5);ctx.font='600 9px system-ui';ctx.fillText(Math.ceil(health.current)+' / '+health.max,0,44);}
  ctx.restore();
 }
 ctx.restore();
}

export const TEAM_COLORS={A:'#287de0',B:'#e3464d'};
export const TEAM_MARKER_SCALE=.22;
const squadCenters=new WeakMap();
export function drawSquadTeamFlags(ctx,board,scale,camera,width,height,selectedIds=[]){
 if(scale>=TEAM_MARKER_SCALE)return;
 let cache=squadCenters.get(board);
 if(!cache||cache.epoch!==board.byId||board.time>=cache.next){
  const points=[];
  for(const squad of squadsFor(board).values()){
   let x=0,y=0,n=0;
   for(const id of squad.memberIds){const u=board.unit(id);if(u?.health.current>0){x+=u.visualX;y+=u.visualY;n++;}}
   if(n)points.push({id:squad.id,team:squad.team,x:x/n,y:y/n});
  }
  cache={epoch:board.byId,next:board.time+.2,points};squadCenters.set(board,cache);
 }
 const selected=new Set(selectedIds);
 for(const center of cache.points){
  const p=project(center.x,center.y),sx=p.x*scale+camera.x,sy=p.y*scale+camera.y;
  if(sx<-24||sx>width+24||sy<-24||sy>height+24)continue;
  ctx.save();ctx.translate(p.x,p.y);ctx.scale(.75/scale,.75/scale);ctx.globalAlpha*=.65;
  ctx.strokeStyle=selected.has(center.id)?'#fff0a3':'#fff9ef';ctx.lineWidth=1.5;ctx.lineJoin='round';ctx.fillStyle=TEAM_COLORS[center.team]||'#777';
  ctx.beginPath();ctx.moveTo(-6,4);ctx.lineTo(-6,-18);ctx.lineTo(10,-15);ctx.lineTo(10,-5);ctx.lineTo(-6,-7);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.restore();
 }
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
