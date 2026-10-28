export function selectFront(states,intent){
 const body=states.filter(s=>s.melee>0&&s.heal<s.count*.3);if(!body.length)return states.find(s=>s.fire>0)||states[0];
 const strike=['BREAKTHROUGH','FLANK','CAPTURE'].includes(intent);
 const score=s=>(strike?(s.spear||0)*3+(s.squad?.type==='assault'||s.squad?.type==='mobile'?8:0):(s.shield||0)*5)+(s.ratio??1)*3+Math.sqrt(s.power)-s.fire;
 const ready=body.filter(s=>(s.ratio??1)>=.35&&!s.squad?.aiRecovery);
 return [...(ready.length?ready:body)].sort((a,b)=>score(b)-score(a))[0];
}
export function createOperation(index,squadIds,anchor){return {index,squadIds,anchor,intent:null,nodeId:null,goal:anchor,route:[],waypoint:0,changedAt:-Infinity,lastProgressAt:0,bestDistance:Infinity,completed:0,stalls:0,role:'front'};}
export function trackProgress(operation,states,observer,time,metrics){
 const live=operation.squadIds.map(id=>states.get(id)).filter(Boolean);operation.liveIds=live.map(s=>s.id);if(!live.length){operation.failed='annihilated';return null;}
 const fighters=live.filter(s=>s.melee+s.fire>0&&s.heal<s.count*.15),body=fighters.length?fighters:live;
 const leader=selectFront(body,operation.intent);if(operation.leadId!==undefined&&operation.leadId!==leader.id){operation.bestDistance=Infinity;operation.previousDistance=null;}operation.leadId=leader.id;const center={x:leader.x,y:leader.y};
 const target=operation.route[operation.waypoint]||operation.goal,d=Math.hypot(target.x-center.x,target.y-center.y);
 if(d<5&&operation.waypoint<operation.route.length-1){operation.waypoint++;operation.bestDistance=Infinity;operation.lastProgressAt=time;}
 else if(d+1<operation.bestDistance){const measured=Number.isFinite(operation.bestDistance);operation.bestDistance=d;if(measured){operation.lastProgressAt=time;metrics.progress++;}operation.previousDistance=d;}
 if(d<6&&time-operation.changedAt>=2&&operation.waypoint>=operation.route.length-1&&!operation.arrived){operation.arrived=true;operation.completed++;metrics.completed++;}
 const power=live.reduce((n,s)=>n+s.power,0);
 operation.peakPower=Math.max(operation.peakPower||power,power);
 if(operation.lossWindow===undefined||time-operation.lossWindow>=8){operation.lossWindow=time;operation.windowPower=power;}
 operation.ineffective=power<operation.windowPower*.78&&time-operation.lastProgressAt>4;
 operation.stalled=time-operation.lastProgressAt>12&&d>8&&!live.some(s=>s.engaged)||operation.ineffective;
 if(operation.stalled&&!operation.stallRecorded){operation.stalls++;metrics.stalls++;operation.stallRecorded=true;}
 if(!operation.stalled)operation.stallRecorded=false;
 return {live,center,power:live.reduce((n,s)=>n+s.power,0),ratio:live.reduce((n,s)=>n+s.health,0)/live.reduce((n,s)=>n+s.maxHealth,0),speed:Math.min(...body.map(s=>s.speed))};
}
export function adopt(operation,candidate,observer,center,time,metrics){
 const changed=operation.intent!==candidate.intent||operation.nodeId!==candidate.node.id;
 if(!changed&&!operation.stalled&&operation.terrainRevision===observer.revision)return;
 operation.intent=candidate.intent;operation.nodeId=candidate.node.id;operation.goal=candidate.node;operation.route=observer.waypoints(center,observer.route(center,candidate.node));operation.waypoint=0;
 while(operation.waypoint<operation.route.length-1&&Math.hypot(operation.route[operation.waypoint].x-center.x,operation.route[operation.waypoint].y-center.y)<6)operation.waypoint++;
 operation.terrainRevision=observer.revision;operation.changedAt=time;operation.lastProgressAt=time;operation.bestDistance=Infinity;operation.previousDistance=null;operation.arrived=false;operation.stalled=false;operation.role=candidate.intent==='DEFEND'?'guard':candidate.intent==='FLANK'?'mobile':'front';metrics.replans++;
}
