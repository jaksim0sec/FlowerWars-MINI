import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {Board} from '../src/model.mjs';
import {TacticalController} from '../src/ai/controller.mjs';
import {FlagMatch} from '../src/flag-match.mjs';
import {updateSquadOrders,orderSquad} from '../src/squad-orders.mjs';
import {squadsFor} from '../src/unit-groups.mjs';
import {deployReserves} from '../tests/deployment-helpers.mjs';
const profiles=JSON.parse(await readFile(new URL('../assets/characters.json',import.meta.url))).characters;
export function runScenario({implementation='legacy',seed=73,count=350,seconds=60,scenario='central'}={}){
 const b=new Board(),m=new FlagMatch(b,{count,seed,aiImplementation:'legacy',unitProfiles:profiles,makeCharacter:s=>({characterId:s.characterId}),optionsFor:c=>({stats:profiles[c.characterId].testCombat,movement:profiles[c.characterId].testMovement})});
 deployReserves(m,scenario==='ranged'?'ranged':'mixed');m.start();if(implementation==='utility'){m.aiImplementation='utility';m.command=new TacticalController(m);m.command.refresh();}m.charge();
 const initialRoster=createHash('sha256').update(JSON.stringify(b.units.map(u=>[u.id,u.team,u.unitType,u.x,u.y,u.health.max,u.damage,u.combat.period,u.combat.range,u.movement.stepTime]))).digest('hex');
 let resets=0,moveRequests=0,orders=0,reversals=0,stationary=0,moved=0,collisions=0,invalid=0,maxExpansions=0;const cpu=[],aiCpu=[],previous=new Map();
 const move=b.move.bind(b);b.move=(id,x,y,o)=>{const watched=b.unit(id)?.team==='B'&&o?.replace;if(watched)moveRequests++;const result=move(id,x,y,o);if(watched&&result)resets++;return result;};
 const think=m.think.bind(m);m.think=id=>{const t=performance.now();const before=squadsFor(b).get(id)?.order;think(id);if(before!==squadsFor(b).get(id)?.order)orders++;aiCpu.push(performance.now()-t);};
 const room=id=>{const r=b.battlefield.rooms.find(r=>r.id===id);return {x:Math.round(r.x),y:Math.round(r.y)};},actors=m.squadIds.A.slice(0,3);
 const woundedIds=b.units.filter(u=>u.team==='B'&&u.healing).map(u=>u.id),openingRevision=b.obstacleRevision;
 let topologyChangeMs=0;
 for(let tick=0;tick<seconds*20&&m.phase==='battle';tick++){
  if(tick===100&&scenario==='flank')for(const id of actors)orderSquad(b,id,'advance',room('merge-upper-B'));
  if(tick===100&&scenario==='feint'){for(const id of m.squadIds.A)orderSquad(b,id,'hold');orderSquad(b,actors[0],'advance',m.flags.B);}
  if(tick===100&&scenario==='rear')for(const id of actors)orderSquad(b,id,'advance',room('rear-B'));
  if(tick===200&&scenario==='support-loss')for(const id of woundedIds)b.damage(id,10000);
  if(tick%80===0&&scenario==='target-changes')for(const id of actors)orderSquad(b,id,'advance',room(tick%160===0?'merge-upper-B':'merge-lower-B'));
  if(tick===400&&scenario==='topology'){const begin=performance.now();let changed=0;for(const [n,info]of [...b.obstacles])if(info.kind==='forest'&&n%b.width>80&&changed++<12)b.setTerrain(n%b.width,Math.floor(n/b.width),'grass');topologyChangeMs=performance.now()-begin;}

  const t=performance.now();b.update(.05);m.update(.05);if(tick%2===0)updateSquadOrders(b);cpu.push(performance.now()-t);maxExpansions=Math.max(maxExpansions,b.navigation.stats.lastExpansions);
  if(tick%20===0){
   const occupied=new Map();for(const u of b.units)if(u.health.current>0){for(const p of [u,...(u.step?[u.step]:[])]){const n=p.y*b.width+p.x;if(b.navigation.blocked(n))invalid++;if(occupied.has(n)&&occupied.get(n)!==u.id)collisions++;occupied.set(n,u.id);}if(u.team!=='B')continue;
    const last=previous.get(u.id),dx=last?u.x-last.x:0,dy=last?u.y-last.y:0;if(last){if(!dx&&!dy&&u.state!=='attack'&&!u.healing)stationary++;moved+=Math.hypot(dx,dy);if(dx*last.dx+dy*last.dy<0)reversals++;}previous.set(u.id,{x:u.x,y:u.y,dx,dy});}

  }
 }
 m.refreshStatus();const p95=a=>a.sort((a,b)=>a-b)[Math.floor(a.length*.95)]||0;
 return {implementation,seed,count,scenario,initialRoster,seconds:b.time,orders,pathResets:resets,moveReplaceRequests:moveRequests,staticRouteBuilds:b.navigation.stats.staticBuilds,stationaryUnitSeconds:stationary,distanceMoved:moved,reversals,collisions,invalid,maxExpansions,expansions:b.navigation.stats.expansions,cpuP95ms:p95(cpu),aiSquadP95ms:p95(aiCpu),counts:m.counts,flagHealth:{A:m.flags.A.health.current,B:m.flags.B.health.current},winner:m.winner,topologyChanges:b.obstacleRevision-openingRevision,topologyChangeMs,operations:m.command.metrics||null};
}
if(process.argv[1]?.endsWith('benchmark_tactical_ai.mjs')){
 const results=[];for(const seed of (process.env.SEEDS||'17,73,191').split(',').map(Number))for(const scenario of (process.env.SCENARIOS||'central,ranged').split(','))results.push(runScenario({implementation:process.env.AI||'legacy',seed,scenario,seconds:Number(process.env.SECONDS||60)}));
 const output=JSON.stringify(results,null,2);if(process.env.OUTPUT)await writeFile(process.env.OUTPUT,output+'\n');else console.log(output);
}
