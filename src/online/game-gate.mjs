// Shared small bridge; network code never reaches into the app's DOM or camera.
let onlineActive=false,view;
let resolveView;const ready=new Promise(resolve=>{resolveView=resolve;});
export const setOnlineActive=value=>{onlineActive=Boolean(value);};
export const pauseSinglePlayer=()=>onlineActive;
export const onlineContext={session:null};
export function registerBattleView(value){view=value;resolveView(value);}
export const battleViewReady=()=>view?Promise.resolve(view):ready;
export function playerTeam(){return onlineContext.session?.room?.matchId?(onlineContext.session.identity?.role==='guest'?'B':'A'):'A';}
