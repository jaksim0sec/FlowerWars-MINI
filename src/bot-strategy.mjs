const LANES=[20,50,80];
const laneFor=y=>Math.min(2,Math.floor(y/34));

// Both armies are visible to the player; the bot reads the same board state.
// Cache one small strategic summary, not a full enemy scan per squad.
export function survey(board,flag){
 const pressure=[0,0,0];
 for(const u of board.units)if(u.health.current>0&&u.team==='A')pressure[laneFor(u.y)]+=u.x>32?2:1;
 const weakest=pressure.indexOf(Math.min(...pressure)),strongest=pressure.indexOf(Math.max(...pressure));
 let intruder=null,closest=Infinity;
 for(const id of board.spatial.candidates(flag.x,flag.y,14)){
  const u=board.unit(id);if(!u||u.team!=='A'||u.health.current<=0)continue;
  const d=Math.abs(u.x-flag.x)+Math.abs(u.y-flag.y);if(d<closest&&d<=14){closest=d;intruder=u;}
 }
 return {pressure,weakest,strongest,intruderId:intruder?.id??null};
}
export function deployment(s,plan){
 const index=s.matchIndex,platoon=Math.floor(index/4),band=s.type==='mobile'?plan.weakest:s.type==='defense'?plan.strongest:platoon%3;
 const depth=Math.floor(platoon/3)*5;
 const roleDepth={defense:0,assault:3,mobile:4,mixed:5,ranged:9,support:14}[s.type]??5;
 return {x:Math.min(86,58+roleDepth+depth),y:LANES[band]+(index%4-1.5)*6};
}
export function attackLane(s,plan){return Math.round(LANES[s.type==='mobile'?plan.weakest:Math.floor(s.matchIndex/4)%3]+(s.matchIndex%4-1.5)*5);}
