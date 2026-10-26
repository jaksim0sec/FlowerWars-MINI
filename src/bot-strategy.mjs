import {availableSquadBlueprints} from './unit-groups.mjs';
import {createRecruitmentCatalog,recruit,DOCTRINES} from './bot-doctrines.mjs';
export const LANES=[20,50,80];
const laneFor=y=>Math.min(2,Math.floor(y/34));

// Both armies are visible to the player; the bot reads the same board state.
// Cache one small strategic summary, not a full enemy scan per squad.
export function survey(board,flag){
 const pressure=[0,0,0],enemy={total:0,shields:0,mobile:0,ranged:0,healers:0};
 for(const u of board.units)if(u.health.current>0&&u.team==='A'){
  pressure[laneFor(u.y)]+=u.x>32?2:1;enemy.total++;
  const role=u.formationRole;
  if(u.healing||role==='healer')enemy.healers++;
  else if(role==='guard'||u.health.max>=150)enemy.shields++;
  else if(role==='archer'||u.combat.range>1)enemy.ranged++;
  else if(role==='scout'||u.movement.stepTime<.3)enemy.mobile++;
 }
 const weakest=pressure.indexOf(Math.min(...pressure)),strongest=pressure.indexOf(Math.max(...pressure));
 let intruder=null,closest=Infinity;
 for(const id of board.spatial.candidates(flag.x,flag.y,14)){
  const u=board.unit(id);if(!u||u.team!=='A'||u.health.current<=0)continue;
  const d=Math.abs(u.x-flag.x)+Math.abs(u.y-flag.y);if(d<closest&&d<=14){closest=d;intruder=u;}
 }
 return {pressure,weakest,strongest,enemy,intruderId:intruder?.id??null};
}

/** Commit a complementary four-squad force, rather than choosing each type alone. */
export function planOperation(plan,index,totalSquads,catalog=createRecruitmentCatalog(availableSquadBlueprints()),scenario=DOCTRINES[0],existing=[]){
 const e=plan.enemy,total=Math.max(1,e.total);
 const doctrine=e.ranged/total>=.35?'anti-ranged':e.shields/total>=.4?'anti-shield':e.mobile/total>=.5?'anti-mobile':'balanced';
 let role=scenario.opening[index];
 if(!role){role=Object.keys(scenario.ratios).sort((a,b)=>scenario.ratios[b]*(index+1)-existing.filter(o=>o.role===b).length-(scenario.ratios[a]*(index+1)-existing.filter(o=>o.role===a).length))[0];}
 const mission=role==='guard'?'guard':role==='mobile'?'flank':'attack';
 const frontIndex=existing.filter(o=>o.role==='front').length;
 const lane=role==='guard'?1:role==='mobile'?plan.weakest:role==='front'?[1,0,2][frontIndex%3]:plan.strongest;
 const needs=[role==='mobile'?'mobile':'screen','fire',role==='mobile'?'mobile':doctrine==='anti-shield'?'fire':doctrine==='anti-ranged'?'mobile':doctrine==='anti-mobile'?'screen':'strike','support'];
 const types=needs.map(need=>recruit(catalog,need));
 return {index,role,mission,lane,doctrine,types,needs,squadIds:[],anchor:{x:role==='guard'?81:role==='mobile'?75:56+(index%3)*10,y:LANES[lane]}};
}
export function deployment(s,plan){
 if(s.botOperation){const slot=s.botSlot;return {x:s.botOperation.anchor.x+(slot%2)*7,y:s.botOperation.anchor.y+(slot<2?-4:4)};}
 const index=s.matchIndex,platoon=Math.floor(index/4),band=s.type==='mobile'?plan.weakest:s.type==='defense'?plan.strongest:platoon%3;
 const depth=Math.floor(platoon/3)*5;
 const roleDepth={defense:0,assault:3,mobile:4,mixed:5,ranged:9,support:14}[s.type]??5;
 return {x:Math.min(86,58+roleDepth+depth),y:LANES[band]+(index%4-1.5)*6};
}
export function attackLane(s,plan){return s.botOperation?LANES[s.botOperation.lane]:Math.round(LANES[s.type==='mobile'?plan.weakest:Math.floor(s.matchIndex/4)%3]+(s.matchIndex%4-1.5)*5);}
