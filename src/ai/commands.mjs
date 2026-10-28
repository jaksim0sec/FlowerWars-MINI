import {orderSquad} from '../squad-orders.mjs';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export class CommandGateway{
 constructor(match,observer,metrics){this.match=match;this.observer=observer;this.metrics=metrics;this.last=new Map();}
 issue(state,action,target=null,{urgent=false}={}){
  const b=this.match.board,s=state.squad;if(!s||s.team!=='B'||!state.count)return false;
  let aim=target;
  if(target?.x!==undefined){aim={x:Math.round(target.x),y:Math.round(target.y)};
   if(!b.inside(aim.x,aim.y)||b.navigation.blocked(aim.y*b.width+aim.x)||!Number.isFinite(this.observer.travel(state,aim))){this.metrics.invalid++;return false;}
  }
  if(action==='focus'){const enemy=aim?.unitId!==undefined?b.unit(aim.unitId):null;if(!enemy||enemy.team===s.team||enemy.health.current<=0)return false;}
  const old=s.order,same=old?.type===action&&(aim?.x!==undefined&&old.target?.x!==undefined?distance(old.target,aim)<5:JSON.stringify(old.target??null)===JSON.stringify(aim??null));
  if(same){this.metrics.deduplicated++;return true;}
  const last=this.last.get(s.id);if(!urgent&&(b.time-(last??-Infinity)<(aim?.x!==undefined?3:2)||state.engaged>0&&action!=='retreat')){this.metrics.deferred++;return false;}
  if(!orderSquad(b,s.id,action,aim))return false;
  this.last.set(s.id,b.time);this.metrics.orders++;if(old)this.metrics.replacements++;return true;
 }
}
