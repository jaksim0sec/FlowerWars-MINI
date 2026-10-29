import {squadsFor} from './unit-groups.mjs';
import {project} from './model.mjs';

export const TEAM_COLORS={A:'#287de0',B:'#e3464d'};
export const TEAM_MARKER_SCALE=.22;

export function objectiveFlagScale(scale){return Math.min(5,Math.max(1.15,1.9*Math.sqrt(scale/.12)));}

function drawFlagGlyph(ctx,team,{number=null,selected=false,image=null}={}){
 ctx.save();
 const color=TEAM_COLORS[team]||'#777';
 ctx.lineJoin='round';ctx.lineCap='round';
 if(image){
  // The supplied illustration includes its pole and foot: anchor that foot,
  // rather than adding a separate platform underneath the image.
  const height=30,width=height*image.width/image.height;
  ctx.drawImage(image,-width*(team==='B'?.20:.25),-height*.94,width,height);
  if(number!==null){ctx.font=`800 ${number.length>2?5.5:7}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=1.4;ctx.strokeStyle='#513b28';ctx.strokeText(number,9,-20,13);ctx.fillStyle='#fff';ctx.fillText(number,9,-20,13);}
  ctx.restore();return;
 }
 ctx.strokeStyle=color;ctx.lineWidth=1.8;
 ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-23);ctx.stroke();
 ctx.fillStyle=color;ctx.strokeStyle=selected?'#fff0a3':'#fff9ef';ctx.lineWidth=1.1;
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

export function drawMatchOverlay(ctx,match,scale,flags=null){
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
  const size=objectiveFlagScale(scale);
  ctx.save();ctx.scale(size,size);drawFlagGlyph(ctx,team,{image:flags?.[team]});ctx.restore();
  const labelY=size*4+12;
  ctx.fillStyle=TEAM_COLORS[team];ctx.font='700 11px system-ui';ctx.textAlign='center';ctx.fillText(team===(match.viewTeam||'A')?'내 깃발':'적 깃발',0,labelY);
  const health=flag.health;
  if(health){ctx.fillStyle='#4a352a66';ctx.fillRect(-23,labelY+6,46,4);ctx.fillStyle=TEAM_COLORS[team];ctx.fillRect(-23,labelY+6,46*Math.max(0,health.current/health.max),4);ctx.font='600 9px system-ui';ctx.fillText(Math.ceil(health.current)+' / '+health.max,0,labelY+24);}
  ctx.restore();
 }
 ctx.restore();
}

const squadCenters=new WeakMap();
export function drawSquadTeamFlags(ctx,board,scale,camera,width,height,selectedIds=[],flags=null){
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
  const size=.75*Math.min(3,Math.max(1,Math.sqrt(scale/.1)));
  if(sx<-size*24||sx>width+size*24||sy<-size*24||sy>height+size*24)continue;
  ctx.save();ctx.translate(p.x,p.y);ctx.scale(size/scale,size/scale);
  const fall=center.deadAt===undefined?0:Math.min(1,(board.time-center.deadAt)/1.1);
  ctx.globalAlpha*=.65*(1-fall);
  if(fall)ctx.rotate((center.team==='A'?1:-1)*Math.PI/2*(1-(1-fall)**2));
  drawFlagGlyph(ctx,center.team,{number:center.deadAt===undefined?center.number:null,selected:selected.has(center.id),image:flags?.[center.team]});
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
