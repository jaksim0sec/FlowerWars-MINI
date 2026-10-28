import {evaluate} from './principles.mjs';
export function candidates(observer,snapshot,force,operation,{reserve=false,homeDanger=false,claimed=new Map()}={}){
 const match=observer.match,home=match.flags.B,objective=match.flags.A,homeDistance=observer.travel(home,objective),out=[];
 const add=(intent,node,value=0)=>{const travel=observer.travel(force.center,node);if(!Number.isFinite(travel))return;
  if(intent==='CAPTURE'&&travel>48)return;
  if(intent==='FLANK'&&(travel>65||force.live.reduce((n,s)=>n+s.count,0)>node.width*10))return;
  const local=observer.local(snapshot,node),progress=Number.isFinite(homeDistance)?Math.max(0,Math.min(1,1-observer.travel(node,objective)/homeDistance)):0;
  const exposure=Math.max(0,(snapshot.totalEnemy-local.A)/(snapshot.totalEnemy+1));
  const route=observer.route(force.center,node),routePressure=route.reduce((max,n)=>Math.max(max,observer.local(snapshot,n,14).A),0);
  const c={intent,node,travel,local,progress,value,exposure};c.score=evaluate(c,{...force,homeDanger,reserve,current:operation});c.score-=Math.max(0,routePressure-force.power*.6)*.5;c.score-=(claimed.get(node.id)||0)*10;if(operation.stalled&&operation.nodeId===node.id)c.score-=25;out.push(c);
 };
 for(const node of observer.nodes){
  if(node.kind==='objective'){if(node.id==='objective-A')add('CAPTURE',node,8);else if(homeDanger)add('DEFEND',node,12);continue;}
  const fromHome=observer.travel(home,node),fromEnemy=observer.travel(objective,node);
  if(node.kind==='staging'||node.kind==='deployment'){
   if(fromHome<45){add('HOLD',node,0);add('REGROUP',node,0);if(homeDanger)add('DEFEND',node,8);}
  }
  if(node.kind==='battle'||node.kind==='staging'||node.kind==='merge'){
   if(fromHome>18&&fromEnemy<homeDistance*.9){add('ADVANCE',node);add('BREAKTHROUGH',node,3);}
   if(fromHome<homeDistance*.6&&observer.local(snapshot,node).A>1)add('COUNTERATTACK',node,6);
  }
  if(['flank','entry','counter'].includes(node.kind)&&fromEnemy<homeDistance*.65)add('FLANK',node,5);
 }
 return out.sort((a,b)=>b.score-a.score||a.node.index-b.node.index);
}
export function choose(observer,snapshot,force,operation,options){
 const choices=candidates(observer,snapshot,force,operation,options),best=choices[0];if(!best)return null;
 const current=choices.find(c=>c.intent===operation.intent&&c.node.id===operation.nodeId);
 const emergency=options.homeDanger&&operation.intent!=='DEFEND';
 if(!emergency&&!operation.stalled&&current&&operation.terrainRevision===observer.revision){
  if(snapshot.time-operation.changedAt<8||best.score<current.score+9)return current;
 }
 return best;
}
