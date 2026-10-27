import {squadsFor} from './unit-groups.mjs';
import {project} from './model.mjs';

export const TEAM_COLORS={A:'#287de0',B:'#e3464d'};
export const TEAM_MARKER_SCALE=.22;

function drawFlagGlyph(ctx,team,{number=null,selected=false,large=false}={}){
 ctx.save();ctx.scale(large?1.9:1,large?1.9:1);
 const color=TEAM_COLORS[team]||'#777';
 ctx.lineJoin='round';ctx.lineCap='round';
 ctx.fillStyle=large?'#fff9eddb':'#fff9edba';ctx.strokeStyle=color;ctx.lineWidth=large?1.35:1.1;
 ctx.beginPath();ctx.ellipse(0,1,large?10:5,large?4.5:2.5,0,0,Math.PI*2);ctx.fill();ctx.stroke();
 ctx.strokeStyle=large?'#594d42':color;ctx.lineWidth=1.8;
 ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-23);ctx.stroke();
 ctx.fillStyle=color;ctx.strokeStyle=selected?'#fff0a3':'#fff9ef';ctx.lineWidth=large?1.5:1.25;
 ctx.beginPath();ctx.moveTo(0,-23);ctx.quadraticCurveTo(8,-22,16,-19);ctx.quadraticCurveTo(18,-18,16,-15);
 ctx.lineTo(14,-9);ctx.quadraticCurveTo(8,-12,0,-11);ctx.closePath();ctx.fill();ctx.stroke();
 if(number!==null){
  ctx.fillStyle='#fff';ctx.font=`800 ${number.length>2?6.5:8}px system-ui`;
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(number,8,-16,14);
 }
 ctx.restore();
}

function squadNumber(squad){
 if(Number.isInteger(squad.matchIndex))return String(squad.matchIndex+1);
 return String(squad.name?.match(/(\d+)분대/)?.[1]??squad.id.match(/:(\d+)$/)?.[1]??'');
}

export function drawMatchOverlay(ctx,match,scale){
 if(!match)return;
 ctx.save();
 if(match.board.battlefield?.outline){ctx.beginPath();match.board.battlefield.outline.forEach((p,i)=>{const v=project(p.x,p.y);if(i)ctx.lineTo(v.x,v.y);else ctx.moveTo(v.x,v.y);});ctx.closePath();ctx.clip();}
 const mid=match.board.width/2-.5,right=match.board.width-.5,bottom=match.board.height-.5;
 const polygon=(x1,x2,fill)=>{
  ctx.beginPath();[[x1,-.5],[x2,-.5],[x2,bottom],[x1,bottom]].forEach(([x,y],i)=>{const p=project(x,y);if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);});ctx.closePath();ctx.fillStyle=fill;ctx.fill();
 };
 polygon(-.5,mid,'#397bb011');polygon(mid,right,'#e3464d11');
 const a=project(mid,-.5),b=project(mid,bottom);
 ctx.save();ctx.strokeStyle=match.phase==='preparation'?'#fff4d9':'#fff4d966';ctx.lineWidth=1.5/scale;ctx.setLineDash([6/scale,6/scale]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([]);
 ctx.restore();ctx.restore();ctx.save();
 for(const [team,flag]of Object.entries(match.flags)){
  const p=project(flag.x,flag.y);ctx.save();ctx.translate(p.x,p.y);ctx.scale(1/scale,1/scale);
  drawFlagGlyph(ctx,team,{large:true});
  ctx.fillStyle=TEAM_COLORS[team];ctx.font='700 11px system-ui';ctx.textAlign='center';ctx.fillText(team==='A'?'내 깃발':'적 깃발',0,22);
  const health=flag.health;
  if(health){ctx.fillStyle='#4a352a66';ctx.fillRect(-23,28,46,5);ctx.fillStyle=team==='A'?'#327ca8':'#d74750';ctx.fillRect(-23,28,46*Math.max(0,health.current/health.max),5);ctx.font='600 9px system-ui';ctx.fillText(Math.ceil(health.current)+' / '+health.max,0,44);}
  ctx.restore();
 }
 ctx.restore();
}

const squadCenters=new WeakMap();
export function drawSquadTeamFlags(ctx,board,scale,camera,width,height,selectedIds=[]){
 if(scale>=TEAM_MARKER_SCALE)return;
 let cache=squadCenters.get(board);
 if(!cache||cache.epoch!==board.byId||cache.liveCount!==board.cells.size||board.time>=cache.next){
  const points=[],previous=new Map(cache?.points.map(point=>[point.id,point]));
  for(const squad of squadsFor(board).values()){
   let x=0,y=0,n=0;
   for(const id of squad.memberIds){const u=board.unit(id);if(u?.health.current>0){x+=u.visualX;y+=u.visualY;n++;}}
   if(n)points.push({id:squad.id,team:squad.team,number:squadNumber(squad),x:x/n,y:y/n});
   else if(previous.has(squad.id)){
    const old=previous.get(squad.id),deadAt=old.deadAt??board.time;
    if(board.time-deadAt<1.1)points.push({...old,deadAt});
   }
  }
  cache={epoch:board.byId,liveCount:board.cells.size,next:board.time+.2,points};squadCenters.set(board,cache);
 }
 const selected=new Set(selectedIds);
 for(const center of cache.points){
  const p=project(center.x,center.y),sx=p.x*scale+camera.x,sy=p.y*scale+camera.y;
  if(sx<-24||sx>width+24||sy<-24||sy>height+24)continue;
  ctx.save();ctx.translate(p.x,p.y);ctx.scale(.75/scale,.75/scale);
  const fall=center.deadAt===undefined?0:Math.min(1,(board.time-center.deadAt)/1.1);
  ctx.globalAlpha*=.65*(1-fall);
  if(fall)ctx.rotate((center.team==='A'?1:-1)*Math.PI/2*(1-(1-fall)**2));
  drawFlagGlyph(ctx,center.team,{number:center.deadAt===undefined?center.number:null,selected:selected.has(center.id)});
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
