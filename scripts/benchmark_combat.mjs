import {performance} from 'node:perf_hooks';import {readFile} from 'node:fs/promises';
import {Board} from '../src/model.mjs';import {setupMovementScenario,startMovementScenario,movementStats} from '../src/movement-scenarios.mjs';
const manifest=JSON.parse(await readFile(new URL('../assets/characters.json',import.meta.url))),profiles=Object.values(manifest.characters).filter(d=>!d.hidden).map(d=>d.testCombat);
for(const count of [64,256,1000]){
 const b=new Board(),s=setupMovementScenario(b,'skirmish',count,()=>null,{combat:true,statsFor:(_,i)=>profiles[Math.floor(i/2)%profiles.length]});
 startMovementScenario(b,s);const samples=[];
 for(let i=0;i<600;i++){
  const t=performance.now();b.update(.02);samples.push(performance.now()-t);
  const owners=new Map();for(const u of b.units.filter(u=>u.health.current>0))for(const p of [{x:u.x,y:u.y},...(u.step?[u.step]:[])]){
   const key=p.y*b.width+p.x;if(owners.has(key)&&owners.get(key)!==u.id)throw Error('combat collision');owners.set(key,u.id);
  }
 }
 samples.sort((a,b)=>a-b);console.log(JSON.stringify({count,simulatedSeconds:12,updateP50Ms:+samples[300].toFixed(3),updateP95Ms:+samples[570].toFixed(3),...b.combatStats,...movementStats(b,s)}));
}
