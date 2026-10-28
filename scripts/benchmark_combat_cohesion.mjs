import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
const root=process.env.FLOWER_ROOT||resolve(import.meta.dirname,'..'),load=p=>import(pathToFileURL(resolve(root,p)));
const {Board}=await load('src/model.mjs'),{FlagMatch}=await load('src/flag-match.mjs'),{squadsFor}=await load('src/unit-groups.mjs'),{orderSquad,updateSquadOrders}=await load('src/squad-orders.mjs');
const profiles=JSON.parse(await readFile(resolve(root,'assets/characters.json'))).characters;
const d=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function run(seed,scenario){
 const b=new Board(),m=new FlagMatch(b,{seed,aiImplementation:'utility',unitProfiles:profiles,makeCharacter:s=>({characterId:s.characterId}),optionsFor:c=>({stats:profiles[c.characterId].testCombat,movement:profiles[c.characterId].testMovement})});
 let index=0;for(let y=8;y<b.height-8&&m.reserve.A;y+=7)for(let x=8;x<b.width*.42&&m.reserve.A;x+=9){const type=index<4?'defense':scenario==='flanking'&&index%5===0?'mobile':index%6===0?'support':'ranged';if(m.deploy('A',type,{x,y}))index++;}
 if(m.reserve.A)throw Error('Player deployment incomplete');m.start();if(m.reserve.B)throw Error('Current utility deployment incomplete');
 const point=id=>{const r=b.battlefield.rooms.find(r=>r.id===id);return {x:Math.round(r.x),y:Math.round(r.y)};},middle=point('battle');
 function command(time){for(const id of m.squadIds.A){const s=squadsFor(b).get(id),i=s.matchIndex;if(!s.memberIds.some(id=>b.unit(id)?.health.current>0))continue;let target={x:middle.x-9+(s.type==='defense'?6:0),y:middle.y+((i%5)-2)*6};
  if(s.type==='mobile')target=time<20?point('flank-stage-upper-A'):time<60?point('merge-upper-B'):point('rear-B');
  if(b.navigation.blocked(target.y*b.width+target.x)){let found;for(let r=1;r<=8&&!found;r++)for(let dx=-r;dx<=r&&!found;dx++)for(let dy=-r;dy<=r&&!found;dy++){const p={x:target.x+dx,y:target.y+dy};if(b.inside(p.x,p.y)&&!b.navigation.blocked(p.y*b.width+p.x))found=p;}if(!found)throw Error('No enemy fixture target');target=found;}
  if(!orderSquad(b,id,'advance',target))throw Error('Enemy fixture order rejected '+JSON.stringify(target));}}
 command(0);let orders=0,stalls=0,movementStalls=0,collisions=0,invalid=0;const cpu=[],snaps=[],last=new Map();
 const think=m.think.bind(m);m.think=id=>{const old=squadsFor(b).get(id)?.order;think(id);if(old!==squadsFor(b).get(id)?.order)orders++;};
 function snapshot(time){const live=b.units.filter(u=>u.health.current>0),centers=[];for(const id of m.squadIds.B){const units=live.filter(u=>u.squadId===id);if(units.length)centers.push({id,x:units.reduce((n,u)=>n+u.x,0)/units.length,y:units.reduce((n,u)=>n+u.y,0)/units.length,shield:units.filter(u=>u.formationRole==='guard').length,rear:units.some(u=>u.healing||u.combat.range>1)});}
  const shields=centers.filter(s=>s.shield),rear=centers.filter(s=>s.rear);const isolated=centers.filter(s=>!centers.some(o=>o.id!==s.id&&d(s,o)<18)).length;
  snaps.push({time,alive:{A:live.filter(u=>u.team==='A').length,B:live.filter(u=>u.team==='B').length},power:live.filter(u=>u.team==='B').reduce((n,u)=>n+u.health.current/u.health.max*(Math.sqrt(u.health.max/100)+(u.healing?0:u.damage/u.combat.period/35)),0),isolatedSquads:isolated,protectedRear:rear.filter(s=>shields.some(front=>front.x<=s.x+2&&d(s,front)<14)).length,rearSquads:rear.length,frontage:shields.length?Math.max(...shields.map(s=>s.y))-Math.min(...shields.map(s=>s.y)):0,engaged:b.units.filter(u=>u.team==='B'&&u.health.current>0&&u.state==='attack').length,orders,stalls,movementStalls,aiRefreshCpuMs:m.command.metrics.refreshMs,spatialCacheHits:b.spatial.queryStats?.hits??null,spatialCacheBuilds:b.spatial.queryStats?.builds??null,progress:m.command.metrics.progress,completed:m.command.metrics.completed,replans:m.command.metrics.replans,cpuP95ms:cpu.length?[...cpu].sort((a,b)=>a-b)[Math.floor(cpu.length*.95)]:0});}
 snapshot(0);for(let tick=1;tick<=2400&&m.phase==='battle';tick++){if(tick===400||tick===1200)command(tick*.05);const start=performance.now();b.update(.05);m.update(.05);if(tick%2===0)updateSquadOrders(b);cpu.push(performance.now()-start);
  if(tick%20===0){const cells=new Map();for(const u of b.units)if(u.health.current>0){for(const p of [u,...(u.step?[u.step]:[])]){const n=p.y*b.width+p.x;if(b.navigation.blocked(n))invalid++;if(cells.has(n)&&cells.get(n)!==u.id)collisions++;cells.set(n,u.id);}if(u.team==='B'){const prev=last.get(u.id);if(prev&&prev.x===u.x&&prev.y===u.y&&u.state!=='attack'&&!u.healing){stalls++;if(u.command?.type==='move'&&!u.step)movementStalls++;}last.set(u.id,{x:u.x,y:u.y});}}}
  if([400,1200,2400].includes(tick))snapshot(tick*.05);
 }
 return {seed,scenario,size:[b.width,b.height],snapshots:snaps,collisions,invalid,winner:m.winner};
}
const results=[];for(const seed of (process.env.SEEDS||'17,73,191').split(',').map(Number))for(const scenario of ['archers','flanking'])results.push(run(seed,scenario));
const text=JSON.stringify(results,null,2);if(process.env.OUTPUT)await writeFile(process.env.OUTPUT,text+'\n');else console.log(text);
