import {forwardFor} from './formation-planner.mjs';
const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];

export function coverPlan(board,squad,units,leader){
 const fighters=units.filter(u=>u.id!==leader.id&&!u.healing);
 if(!fighters.length)return new Map();
 const f=forwardFor(squad),side={x:-f.y,y:f.x};
 const infantry=fighters.filter(u=>u.combat.range<=1);
 const count=units.length>=6?2:units.length>=4?1:0;
 const retained=(squad.order.escortIds||[]).map(id=>infantry.find(u=>u.id===id)).filter(Boolean);
 const escorts=[...retained,...infantry.filter(u=>!retained.includes(u)).sort((a,b)=>distance(a,leader)-distance(b,leader)||a.id-b.id)].slice(0,count);
 squad.order.escortIds=escorts.map(u=>u.id);
 const body=fighters.filter(u=>!escorts.includes(u));
 const center={x:median((body.length?body:fighters).map(u=>u.x)),y:median((body.length?body:fighters).map(u=>u.y))};
 const result=new Map(),claimed=new Set();
 const pick=(unit,wanted)=>{
  let best=null,score=Infinity;
  for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++){
   const x=wanted.x+dx,y=wanted.y+dy,key=y*board.width+x;
   if(!board.inside(x,y)||board.navigation.blocked(key)||claimed.has(key)||board.occupied(x,y,unit.id))continue;
   const danger=[...board.spatial.candidates(x,y,3)].map(id=>board.unit(id)).filter(u=>u?.health.current>0&&u.team&&u.team!==unit.team&&Math.max(Math.abs(u.x-x),Math.abs(u.y-y))<=Math.max(2,u.combat.range)).length;
   const cost=(Math.abs(dx)+Math.abs(dy))*3+distance(unit,{x,y})*.2+danger*15;
   if(cost<score){score=cost;best={x,y};}
  }
  if(best){claimed.add(best.y*board.width+best.x);result.set(unit.id,best);}
 };
 // Follow the actual formation, not a distant destination or an old flag site.
 if(distance(leader,center)>6)pick(leader,{x:center.x-f.x*2,y:center.y-f.y*2});
 const rear=leader;
 for(let i=0;i<escorts.length;i++)pick(escorts[i],{x:rear.x+f.x+side.x*(i?1:-1),y:rear.y+f.y+side.y*(i?1:-1)});
 return result;
}
export function moveUnderCover(board,unit,goal){
 if(!goal||unit.state==='attack'||unit.state==='hit')return;
 if(!unit.step&&unit.x===goal.x&&unit.y===goal.y){if(unit.command)board.cancelCommand(unit);return;}
 if(unit.command?.type==='move'&&distance(unit.command,goal)<=1)return;
 board.move(unit.id,goal.x,goal.y,{replace:true,direct:true});
}
