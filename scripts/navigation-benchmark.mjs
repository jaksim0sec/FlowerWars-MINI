// Deterministic model benchmark. FLOWER_ROOT selects an unchanged checkout.
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const root=process.env.FLOWER_ROOT||resolve(import.meta.dirname,'..');
const {Board}=await import(pathToFileURL(root+'/src/model.mjs'));
const {createFormationGroup,placeGroup,squadsFor}=await import(pathToFileURL(root+'/src/unit-groups.mjs'));
const {layoutDeployment}=await import(pathToFileURL(root+'/src/deployment-layout.mjs'));
const {orderSquad,updateSquadOrders}=await import(pathToFileURL(root+'/src/squad-orders.mjs'));
const counts=(process.env.COUNTS||'64,256,700').split(',').map(Number);
const seconds=Number(process.env.SECONDS||120),results=[];
for(const scenario of (process.env.SCENARIOS||'individual,squads').split(','))for(const count of counts){
 const b=new Board(100,100,{seed:73}),commands=[],squads=[];
 for(let y=0;y<100;y++)if(![10,11,12,28,29,30,46,47,48,64,65,66,82,83,84].includes(y))b.setObstacle(47,y,{blocked:true});
 if(scenario==='individual'){
  for(let i=0;i<count;i++){const x=4+i%16,y=5+Math.floor(i/16),u=b.spawn(x,y,null,{team:'A'});commands.push([u,70+i%16,y]);}
  b.batchCommands(()=>{for(const [u,x,y]of commands)b.move(u.id,x,y,{direct:true});});
 }else{
  let remaining=count,index=0;
  while(remaining){const n=Math.min(24,remaining),bp=layoutDeployment(createFormationGroup(n,'squad','','mixed'),n,''),anchor={x:20+index%2*12,y:7+Math.floor(index/2)*6};
   const g=placeGroup(b,bp,anchor,{team:'A'});if(!g)throw Error('fixture does not fit');
   const s=squadsFor(b).get(g.squads[0]);squads.push(s);orderSquad(b,s.id,'move',{x:anchor.x+50,y:anchor.y});remaining-=n;index++;
  }
 }
 const expected=new Map(commands.map(([u,x,y])=>[u.id,{x,y}])),stationary=new Map();
 const arrivals=()=>{let n=0;for(const [id,g]of expected){const u=b.unit(id);if(!u.step&&u.x===g.x&&u.y===g.y)n++;}return n;};
 const times=[];let waits=0,maxWait=0,collisions=0,arrived=0,lastExpansions=0,at90=null;
 for(let frame=0;frame<seconds*20;frame++){
  const t=performance.now();b.update(.05);if(scenario==='squads')updateSquadOrders(b);times.push(performance.now()-t);
  if(scenario==='squads')for(const s of squads)for(const [id,g]of s.order.goals)expected.set(id,g);
  const owners=new Map();
  for(const u of b.units){
   const goal=expected.get(u.id),waiting=goal&&!u.step&&(u.x!==goal.x||u.y!==goal.y)&&['idle','walk'].includes(u.state);
   if(waiting){waits+=.05;if(!stationary.has(u.id))stationary.set(u.id,b.time);maxWait=Math.max(maxWait,b.time-stationary.get(u.id));}else stationary.delete(u.id);
   for(const p of [u,...(u.step?[u.step]:[])]){const key=p.y*b.width+p.x,old=owners.get(key);if(old&&old!==u.id)collisions++;owners.set(key,u.id);}
  }
  if(b.reservations.size!==b.units.filter(u=>u.step).length)collisions++;
  if(frame===1799)at90={arrived:arrivals(),waitSeconds:+waits.toFixed(2),maxStationaryWait:+maxWait.toFixed(2)};
  lastExpansions=Math.max(lastExpansions,b.navigation.stats.lastExpansions);
 }
 if(scenario==='individual')arrived=commands.filter(([u,x,y])=>!u.step&&u.x===x&&u.y===y).length;
 else for(const s of squads)for(const [id,g]of s.order.goals){const u=b.unit(id);if(!u.step&&u.x===g.x&&u.y===g.y)arrived++;}
 times.sort((a,b)=>a-b);
 results.push({commands:b.units.filter(u=>u.command).length,returning:b.units.filter(u=>u.courtesyReturn).length,activeChains:b.navigation.cooperations?.size||0,scenario,count,seconds,arrived,at90,throughput:arrived/seconds,waitSeconds:+waits.toFixed(2),maxWait:+maxWait.toFixed(2),updateP95ms:+times[Math.floor(times.length*.95)].toFixed(4),cpuMs:+times.reduce((a,b)=>a+b,0).toFixed(2),expansions:b.navigation.stats.expansions,maxTickExpansions:lastExpansions,staticBuilds:b.navigation.stats.staticBuilds||null,sharedBuilds:b.navigation.stats.sharedBuilds||0,cooperativeSteps:b.navigation.stats.cooperativeSteps||0,collisions});
}
console.log(JSON.stringify(results,null,2));
