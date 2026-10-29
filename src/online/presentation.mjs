import {guestVisual} from './game-gate.mjs';
const streams=new WeakMap();
// Presentation history only. Never write to engine positions, elapsed or indexes.
export function recordGuestFrame(board,frame,at){
 let s=streams.get(board);
 if(!s||frame.full||frame.time<s.time){s={actors:new WeakMap(),time:frame.time,at,delay:.2,cursor:-Infinity};streams.set(board,s);}
 const gap=frame.time-s.time;if(gap>0&&gap<1)s.delay=Math.max(.15,Math.min(.35,s.delay*.8+gap*1.2*.2));
 s.time=frame.time;s.at=at;
 for(const row of frame.units){const u=board.byId.get(row[0]);if(!u)continue;let h=s.actors.get(u);if(!h){h=[];s.actors.set(u,h);}
  h.push({time:frame.time,x:u.visualX,y:u.visualY,elapsed:u.elapsed,state:u.state,facing:u.facing,strike:u.strike,attackVector:u.attackVector,deathDirection:u.deathDirection});if(h.length>5)h.shift();
 }
}
export function guestRenderTime(board,ageMs){const s=streams.get(board);if(!s)return null;
 const target=Math.min(s.time,s.time+Math.max(0,ageMs)/1000-s.delay);s.cursor=Math.max(s.cursor,target);return s.cursor;
}
export function sampledGuestVisual(board,unit,time,ageMs){
 const s=streams.get(board),h=s?.actors.get(unit);if(time===null||!h?.length)return {...guestVisual(unit,ageMs),state:unit.state,facing:unit.facing,strike:unit.strike,attackVector:unit.attackVector,deathDirection:unit.deathDirection};
 let a=h[0],b=a;for(const next of h){if(next.time<=time)a=next;else {b=next;break;}b=a;}
 if(time<=a.time||a===b)return {...a,elapsed:a.elapsed+Math.max(0,Math.min(time-a.time,.35))};
 const t=Math.max(0,Math.min(1,(time-a.time)/(b.time-a.time)));
 return {...a,x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,elapsed:a.state===b.state&&b.elapsed>=a.elapsed?a.elapsed+(b.elapsed-a.elapsed)*t:a.elapsed+Math.max(0,time-a.time)};
}
export function presentationStats(board){const s=streams.get(board);return s?{bufferMs:s.delay*1000,lagMs:Math.max(0,(s.time-s.cursor)*1000)}:null;}
