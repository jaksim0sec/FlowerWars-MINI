import {createFormationGroup} from './unit-groups.mjs';

export function deploymentBlueprint(size,type,name){
 const blueprint=createFormationGroup(Math.max(2,size),'squad',name,type);
 blueprint.members=blueprint.members.slice(0,size);
 const priority=m=>({'shield-guard':0,scout:1,archer:2,'clover-mage':3,scholar:3,'banner-bearer':4}[m.characterId]??1);
 blueprint.members.sort((a,b)=>priority(a)-priority(b));
 const troops=blueprint.members.filter(m=>m.characterId!=='banner-bearer'),flags=blueprint.members.filter(m=>m.characterId==='banner-bearer');
 let rank=0;
 for(const band of [0,1,2,3]){
  const members=troops.filter(m=>priority(m)===band);
  members.forEach((m,i)=>{const width=Math.min(4,members.length-Math.floor(i/4)*4);m.offset={x:-(rank+Math.floor(i/4)),y:i%4-Math.floor(width/2)};});
  rank+=Math.ceil(members.length/4);
 }
 flags.forEach((m,i)=>m.offset={x:-(rank+1),y:i});
 return blueprint;
}
