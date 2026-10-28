import {createFormationGroup} from './unit-groups.mjs';

export function deploymentBlueprint(size,type,name){
 const blueprint=createFormationGroup(Math.max(2,size),'squad',name,type);
 return layoutDeployment(blueprint,size,name);
}
export function layoutDeployment(template,size,name){
 const blueprint=structuredClone(template);blueprint.name=name;
 blueprint.squadSize=Math.max(blueprint.squadSize||12,size);
 blueprint.members=blueprint.members.slice(0,size);
 const priority=m=>({guard:0,scout:1,archer:2,healer:3,support:3,banner:4}[m.role]??1);
 blueprint.members.sort((a,b)=>priority(a)-priority(b));
 const troops=blueprint.members.filter(m=>m.role!=='banner'),flags=blueprint.members.filter(m=>m.role==='banner');
 const columns=['defense','ranged','mobile'].includes(blueprint.squadType)?5:size>12?6:4;
 let rank=0;
 for(const band of [0,1,2,3]){
  const members=troops.filter(m=>priority(m)===band);
  members.forEach((m,i)=>{const width=Math.min(columns,members.length-Math.floor(i/columns)*columns);m.offset={x:-(rank+Math.floor(i/columns)),y:i%columns-Math.floor(width/2)};});
  rank+=Math.ceil(members.length/columns);
 }
 flags.forEach((m,i)=>m.offset=blueprint.squadType==='mobile'&&size===10?{x:-1,y:2+i}:{x:-rank,y:i});
 return blueprint;
}
