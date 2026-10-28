import {inviteCode} from './invite.mjs';
// Shared small bridge; network code never reaches into the app's DOM or camera.
let onlineActive=Boolean(inviteCode(globalThis.location?.href)),view;
let resolveView;const ready=new Promise(resolve=>{resolveView=resolve;});
export const setOnlineActive=value=>{onlineActive=Boolean(value);};
export const pauseSinglePlayer=()=>onlineActive;
export const onlineContext={session:null};
export function registerBattleView(value){view=value;resolveView(value);}
export const battleViewReady=()=>view?Promise.resolve(view):ready;
export function playerTeam(){return onlineContext.session?.room?.matchId?(onlineContext.session.identity?.role==='guest'?'B':'A'):'A';}

// Presentation-only extrapolation. Never mutate authoritative occupancy or combat state.
export function guestVisual(unit,ageMs=0){
 const age=Number.isFinite(ageMs)?Math.max(0,ageMs)/1000:0;
 let x=unit.visualX,y=unit.visualY;
 const step=unit.step;
 if(unit.state==='walk'&&step&&Number.isFinite(step.x)&&Number.isFinite(step.y)&&Number.isFinite(unit.x)&&Number.isFinite(unit.y)&&Number.isFinite(step.duration)&&step.duration>0&&Number.isFinite(step.elapsed)){
  const t=Math.max(0,Math.min(1,(step.elapsed+age)/step.duration));
  x=unit.x+(step.x-unit.x)*t;y=unit.y+(step.y-unit.y)*t;
 }
 return {x,y,elapsed:unit.elapsed+age};
}
