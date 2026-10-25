import {squadsFor,groupsFor} from './unit-groups.mjs';

const TARGETED=new Set(['move','advance','retreat','focus','follow','assault','flank','support-focus']);
const ORDER_ALIASES={assault:'advance',fortify:'hold','firing-line':'hold',flank:'move','support-focus':'follow',reform:'rally'};
const STANCES=new Set(['aggressive','balanced','avoid']);
const FORMATIONS=new Set(['line','column','dense','spread']);
const alive=(board,squad)=>squad.memberIds.map(id=>board.unit(id)).filter(u=>u&&u.health.current>0);
/** The flag bearer commands while alive. After their loss, a surviving soldier
 * takes over without replacing or respawning the fallen character. */
const originalCommander=(board,squad)=>board.unit(squad.leaderId);
const commander=(board,squad)=>{
 const leader=originalCommander(board,squad);
 if(leader?.health.current>0)return leader;
 const incumbent=board.unit(squad.actingLeaderId);
 if(incumbent?.health.current>0)return incumbent;
 const successor=alive(board,squad).sort((a,b)=>a.id-b.id)[0]||null;
 squad.actingLeaderId=successor?.id??null;
 return successor;
};
const priority=u=>({'shield-guard':0,scout:1,archer:2,'clover-mage':3,scholar:4,'banner-bearer':5}[u.character?.characterId]??2);

function slots(board,squad,center,formation=squad.formation){
 const lead=commander(board,squad);
 const units=alive(board,squad).filter(u=>u.id!==lead?.id)
   .sort((a,b)=>priority(a)-priority(b)||a.id-b.id);
 if(lead)units.push(lead);
 const n=units.length,columns=formation==='column'?2:formation==='line'?6:4;
 const gap=formation==='spread'?2:1,sign=squad.team==='B'?-1:1;
 // Keep the commander behind every fighting rank, including in a column.
 const rearRank=Math.max(2,Math.floor(Math.max(0,n-2)/columns)+2)*gap;
 const claimed=new Set(),assignments=[];
 for(let i=0;i<n;i++){
   const leaderSlot=units[i].id===lead?.id;
   const rank=leaderSlot?rearRank:Math.floor(i/columns)*gap;
   const lane=leaderSlot?0:(i%columns-Math.floor(columns/2))*gap;
   const wanted={x:center.x-sign*rank,y:center.y+lane};
   let best=null;
   for(let radius=0;radius<=Math.max(10,Math.ceil(n/columns)*gap+2)&&!best;radius++)
     for(let dx=-radius;dx<=radius&&!best;dx++)for(let dy=-radius;dy<=radius;dy++){
       if(Math.max(Math.abs(dx),Math.abs(dy))!==radius)continue;
       const x=wanted.x+dx,y=wanted.y+dy,key=y*board.width+x;
       if(board.inside(x,y)&&!board.navigation.blocked(key)&&!claimed.has(key)){best={x,y};claimed.add(key);break;}
     }
   if(best)assignments.push([units[i],best]);
 }
 return assignments;
}

export function configureSquad(board,id,{stance,formation}={}){
 const s=squadsFor(board).get(id);if(!s)return false;
 if(stance&&STANCES.has(stance))s.stance=stance;
 if(formation&&FORMATIONS.has(formation))s.formation=formation;
 if(s.order)s.order.dirty=true;
 return true;
}

export function orderSquad(board,id,action,target=null){
 const s=squadsFor(board).get(id),lead=s&&commander(board,s);
 if(!s||!lead||lead.health.current<=0)return false;
 if(!['move','advance','hold','focus','rally','retreat','follow','wait','assault','fortify','firing-line','flank','support-focus','reform'].includes(action))return false;
 if(TARGETED.has(action)&&(!target||(!Number.isInteger(target.x)||!Number.isInteger(target.y))&&!target.squadId&&!target.unitId))return false;
 const real=ORDER_ALIASES[action]||action;
 if(real==='focus'&&!enemyUnits(board,s,target).length)return false;
 if(real==='follow'&&!followLeader(board,s,target))return false;
 s.order={type:real,source:action,target:real==='rally'?{x:lead.x,y:lead.y}:target?{...target}:null,dirty:true,previous:null,goals:new Map(),lastMembers:0};
 if(action==='firing-line')s.formation='spread';
 if(action==='flank')s.formation='column';
 if(action==='reform')s.formation='line';
 if(action==='fortify')s.formation='line';
 runOrder(board,s);
 return true;
}
function enemyUnits(board,s,target){
 const enemy=target.squadId?squadsFor(board).get(target.squadId):null;
 const units=enemy?alive(board,enemy):target.unitId?[board.unit(target.unitId)].filter(Boolean):[];
 return units.filter(u=>u.health.current>0&&u.team&&u.team!==s.team);
}
function followLeader(board,s,target){
 const ally=squadsFor(board).get(target.squadId);
 if(!ally||ally.team!==s.team||ally.id===s.id)return null;
 const lead=commander(board,ally);
 return lead?.health.current>0?lead:null;
}
function centerFor(board,s,order){
 if(order.type==='rally')return order.target;
 if(order.type==='follow'){
   const lead=followLeader(board,s,order.target);if(!lead)return null;
   return {x:Math.max(0,Math.min(board.width-1,lead.x+(s.team==='B'?2:-2))),y:lead.y};
 }
 return order.target?.x!=null?{x:order.target.x,y:order.target.y}:null;
}
function runOrder(board,s){
 const o=s.order;if(!o)return;
 const units=alive(board,s);
 if(!units.length){s.order=null;return;}
 if(o.type==='wait'||o.type==='hold'){
   // Holding ground never disables existing local self-defence. Respect a
   // deliberate "attack off" setting from the test/debug controls.
   for(const u of units)board.cancelCommand(u);
   o.dirty=false;return;
 }
 if(o.type==='focus'){
   const enemies=enemyUnits(board,s,o.target);
   if(!enemies.length){s.order=null;return;}
   const lead=commander(board,s);
   for(const u of units){
     // The commander does not pursue focus targets into the front line;
     // automatic point-blank defence remains available if enemies arrive.
     if(u.id===lead?.id){if(u.command)board.cancelCommand(u);continue;}
     if(u.command?.type==='attack'&&board.unit(u.command.target)?.health.current>0)continue;
     if(u.state!=='idle'||u.step)continue;
     const sorted=[...enemies].sort((a,b)=>(Math.abs(a.x-u.x)+Math.abs(a.y-u.y))-(Math.abs(b.x-u.x)+Math.abs(b.y-u.y))||a.id-b.id);
     board.attack(u.id,sorted[0].id);
   }
   o.dirty=false;return;
 }
 const center=centerFor(board,s,o);if(!center)return;
 const members=units.length,anchor=center.x+','+center.y+','+s.formation;
 if(anchor!==o.previous||members!==o.lastMembers||o.dirty){
   o.goals=new Map(slots(board,s,center,o.type==='rally'?'dense':s.formation).map(([u,p])=>[u.id,p]));
   o.previous=anchor;o.lastMembers=members;o.dirty=false;
 }
 board.batchCommands(()=>{
   for(const u of units){
     // Keep the unit's own auto-combat setting: all squad orders, including
     // moving, retreating and waiting, still defend against nearby enemies.
     // The debug "attack off" switch must not be silently re-enabled.
     const p=o.goals.get(u.id);
     if(!p||u.x===p.x&&u.y===p.y&&!u.step)continue;
     if(u.command?.type==='move'&&u.command.x===p.x&&u.command.y===p.y)continue;
     if(u.state!=='idle'||u.step)continue;
     board.move(u.id,p.x,p.y);
   }
 });
}
export function updateSquadOrders(board){
 for(const s of squadsFor(board).values())if(s.order&&!['wait','hold'].includes(s.order.type))runOrder(board,s);
}
export function squadSummary(board,id){
 const s=squadsFor(board).get(id);if(!s)return null;
 const active=commander(board,s),original=originalCommander(board,s);
 return {...s,alive:alive(board,s).length,
   commanderAlive:!!active,leaderAlive:!!original&&original.health.current>0,
   actingCommanderId:active?.id??null};
}
