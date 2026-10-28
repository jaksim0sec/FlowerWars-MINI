import {squadsFor} from '../unit-groups.mjs';
import {orderSquads,configureSquad,SQUAD_ACTIONS} from '../squad-orders.mjs';
const reject=reason=>({ok:false,reason});
const text=x=>typeof x==='string'&&x.length>0&&x.length<=100;
function target(board,value,depth=0){
 if(value==null)return null;if(typeof value!=='object'||Array.isArray(value)||depth>1)throw Error('INVALID_TARGET');const clean={};
 if('x'in value||'y'in value){if(!board.inside(value.x,value.y))throw Error('INVALID_TARGET');clean.x=value.x;clean.y=value.y;}
 if('squadId'in value&&value.squadId!==undefined){if(!text(value.squadId))throw Error('INVALID_TARGET');clean.squadId=value.squadId;}
 if('unitId'in value&&value.unitId!==undefined){if(!Number.isSafeInteger(value.unitId))throw Error('INVALID_TARGET');clean.unitId=value.unitId;}
 if(value.attackTarget)clean.attackTarget=target(board,value.attackTarget,depth+1);return clean;
}
export function applyBattleCommand(state,role,command){
 try{const board=state?.board,m=board?.match,team=role==='host'?'A':role==='guest'?'B':null;if(!m?.multiplayer||!team||!command||typeof command!=='object'||Array.isArray(command)||!['deploy','begin-battle','move','attack','orders','configure','charge'].includes(command.kind)||m.phase==='finished')return reject('UNAUTHORIZED');
  if(command.kind==='deploy'){if(!text(command.type)||!m.recruitment.has(command.type)||!board.inside(command.x,command.y)||!m.inTerritory(team,command))return reject('INVALID_DEPLOYMENT');const s=m.deploy(team,command.type,{x:command.x,y:command.y});return s?{ok:true,squadId:s.id}:reject('NO_SPACE');}
  if(command.kind==='begin-battle'){if(role!=='host'||!m.counts.A||!m.counts.B)return reject('HOST_ONLY_OR_EMPTY');return {ok:m.start()};}
  if(command.kind==='move'||command.kind==='attack'){const u=board.unit(command.unitId);if(!u||u.team!==team||u.health.current<=0)return reject('OWNERSHIP');return {ok:command.kind==='move'?board.move(u.id,command.x,command.y,{replace:true}):board.attack(u.id,command.targetId,{replace:true})};}
  const ids=command.kind==='charge'?m.squadIds[team]:command.ids;
  if(!Array.isArray(ids)||!ids.length||ids.length>128||new Set(ids).size!==ids.length||ids.some(id=>!text(id)||squadsFor(board).get(id)?.team!==team))return reject('OWNERSHIP');
  if(command.kind==='configure'){if(command.formation&&!['line','column','dense','spread','square'].includes(command.formation)||command.stance&&!['aggressive','balanced','avoid'].includes(command.stance))return reject('INVALID_CONFIGURATION');for(const id of ids)configureSquad(board,id,{formation:command.formation,stance:command.stance});return {ok:true,accepted:ids};}
  const action=command.kind==='charge'?'advance':command.action,aim=command.kind==='charge'?{x:m.flags[team==='A'?'B':'A'].x,y:m.flags[team==='A'?'B':'A'].y}:target(board,command.target);
  if(!Object.hasOwn(SQUAD_ACTIONS,action)||!m.canCommand(team,action,aim))return reject('INVALID_ORDER');const result=orderSquads(board,ids,action,aim);return {ok:result.accepted.length>0,...result};
 }catch{return reject('INVALID_COMMAND');}
}
