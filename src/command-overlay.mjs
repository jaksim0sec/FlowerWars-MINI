import {project} from './model.mjs';
import {squadsFor} from './unit-groups.mjs';
import {SQUAD_ACTIONS} from './squad-orders.mjs';

function marker(ctx,p,color){
 const point=project(p.x,p.y);ctx.beginPath();ctx.ellipse(point.x,point.y,12,8,0,0,Math.PI*2);ctx.strokeStyle=color;ctx.lineWidth=2;ctx.stroke();
 ctx.beginPath();ctx.moveTo(point.x-7,point.y);ctx.lineTo(point.x+7,point.y);ctx.moveTo(point.x,point.y-5);ctx.lineTo(point.x,point.y+5);ctx.stroke();
}
export function drawCommandOverlay(ctx,board,view,scale=1){
 const selected=new Set(view.selectedSquadIds||[]);
 const ids=[...squadsFor(board).values()].filter(s=>selected.has(s.id)||s.order&&!['wait','complete'].includes(s.order.phase)).map(s=>s.id);
 for(const id of ids){
  if(board.match&&!selected.has(id))continue;
  const s=squadsFor(board).get(id);if(!s)continue;
  const units=s.memberIds.map(id=>board.unit(id)).filter(u=>u?.health.current>0);
  if(!units.length)continue;
  const lead=units.find(u=>u.id===s.leaderId)||units[0],o=s.order;
  const pending=view.mode==='squad-target'&&view.commandSquadIds?.includes(id);
  const color=pending?'#fff2a1':o?.type==='retreat'?'#79c5cc':o?.type==='focus'?'#f2a173':'#ffe5a0';
  ctx.save();ctx.strokeStyle=color;ctx.lineWidth=(selected.has(id)?2:1)/scale;ctx.globalAlpha=selected.has(id)?1:.38;
  for(const u of selected.has(id)&&scale>=.22?units:[]){const p=project(u.visualX,u.visualY);ctx.beginPath();ctx.ellipse(p.x,p.y-1,35,14,0,0,Math.PI*2);ctx.stroke();}
  let target=pending?view.hover:o?.target;
  if(!pending&&target?.squadId){const squad=squadsFor(board).get(target.squadId);target=squad&&board.unit(squad.leaderId);}
  if(!pending&&target?.unitId)target=board.unit(target.unitId);
  if(target?.x!=null){
   const points=[{x:lead.visualX,y:lead.visualY},...(!pending?(o?.waypoints||[]):[]),target];
   ctx.beginPath();points.forEach((p,i)=>{const v=project(p.x,p.y);if(i)ctx.lineTo(v.x,v.y);else ctx.moveTo(v.x,v.y);});
   ctx.setLineDash([6/scale,5/scale]);ctx.stroke();ctx.setLineDash([]);
   for(const p of points.slice(1)){const v=project(p.x,p.y);ctx.save();ctx.translate(v.x,v.y);ctx.scale(1/scale,1/scale);marker(ctx,{x:0,y:0},color);ctx.restore();}
   const end=project(target.x,target.y),label=pending?SQUAD_ACTIONS[view.squadOrder]?.label:SQUAD_ACTIONS[o?.type]?.label;
   if(selected.has(id)){
    ctx.save();ctx.translate(end.x,end.y);ctx.scale(1/scale,1/scale);
    const caption=o?.after?'우회 → 집중 공격':label||'';
    ctx.font='600 11px system-ui';ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#443b2b';ctx.strokeText(caption,0,-23);ctx.fillStyle=color;ctx.fillText(caption,0,-23);ctx.restore();
   }
  }
  if(selected.has(id)&&!pending&&o?.goals){ctx.globalAlpha=.5;for(const p of o.goals.values()){const v=project(p.x,p.y);ctx.fillStyle=color;ctx.fillRect(v.x-3,v.y-3,6,6);}}
  ctx.restore();
 }
}
