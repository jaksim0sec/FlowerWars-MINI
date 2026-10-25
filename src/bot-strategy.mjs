const LANES=[20,50,80];
const laneFor=y=>Math.min(2,Math.floor(y/34));

// Both armies are visible to the player; the bot reads the same board state.
// Cache one small strategic summary, not a full enemy scan per squad.
export function survey(board,flag){
 const pressure=[0,0,0],enemy={total:0,shields:0,mobile:0,ranged:0,healers:0};
 for(const u of board.units)if(u.health.current>0&&u.team==='A'){
  pressure[laneFor(u.y)]+=u.x>32?2:1;enemy.total++;
  const role=u.formationRole,id=u.character?.characterId;
  if(u.healing||role==='healer')enemy.healers++;
  else if(role==='guard'||id==='shield-guard')enemy.shields++;
  else if(role==='archer'||id==='archer'||u.combat.range>1)enemy.ranged++;
  else if(role==='scout'||id==='scout')enemy.mobile++;
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
export function planOperation(plan,index,totalSquads){
 const e=plan.enemy,total=Math.max(1,e.total);
 const doctrine=e.ranged/total>=.35?'anti-ranged':e.shields/total>=.4?'anti-shield':e.mobile/total>=.5?'anti-mobile':'balanced';
 const mission=index===0&&totalSquads>=12?'guard':index%3===2?'flank':'attack';
 const lane=mission==='guard'?1:mission==='flank'?plan.weakest:plan.strongest;
 const types=mission==='guard'?['defense','ranged','mixed','support']:
  mission==='flank'?['mobile','ranged','assault','support']:
  doctrine==='anti-shield'?['defense','ranged','ranged','support']:
  doctrine==='anti-ranged'?['defense','ranged','mobile','support']:
  doctrine==='anti-mobile'?['defense','ranged','defense','support']:['defense','ranged','assault','support'];
 return {index,mission,lane,doctrine,types,anchor:{x:mission==='guard'?81:56+(index%3)*12,y:LANES[lane]}};
}
export function deployment(s,plan){
 if(s.botOperation){const slot=s.botSlot;return {x:s.botOperation.anchor.x+(slot%2)*7,y:s.botOperation.anchor.y+(slot<2?-4:4)};}
 const index=s.matchIndex,platoon=Math.floor(index/4),band=s.type==='mobile'?plan.weakest:s.type==='defense'?plan.strongest:platoon%3;
 const depth=Math.floor(platoon/3)*5;
 const roleDepth={defense:0,assault:3,mobile:4,mixed:5,ranged:9,support:14}[s.type]??5;
 return {x:Math.min(86,58+roleDepth+depth),y:LANES[band]+(index%4-1.5)*6};
}
export function attackLane(s,plan){return s.botOperation?LANES[s.botOperation.lane]:Math.round(LANES[s.type==='mobile'?plan.weakest:Math.floor(s.matchIndex/4)%3]+(s.matchIndex%4-1.5)*5);}
