import {performance} from 'node:perf_hooks';
import {Board} from '../src/model.mjs';
import {setupMovementScenario,startMovementScenario,movementStats} from '../src/movement-scenarios.mjs';
const cases=[['crossing',16],['bottleneck',64],['obstacles',64],['crowd',256],['crowd',1000]];
for(const [type,count] of cases) {
  const board=new Board(),scenario=setupMovementScenario(board,type,count,()=>null);
  const start=performance.now();startMovementScenario(board,scenario);const commandMs=performance.now()-start;
  const samples=[];let maxExpansions=0;
  for(let i=0;i<4500;i++) {
    const t=performance.now();board.update(1/50);samples.push(performance.now()-t);
    maxExpansions=Math.max(maxExpansions,board.navigation.stats.lastExpansions);
    const owners=new Map();
    for(const u of board.units)for(const cell of [{x:u.x,y:u.y},...(u.step?[u.step]:[])]) {
      const n=cell.y*board.width+cell.x;
      if(owners.has(n)&&owners.get(n)!==u.id)throw Error(`collision: ${type}/${count}/${n}`);
      owners.set(n,u.id);
    }
  }
  samples.sort((a,b)=>a-b);
  console.log(JSON.stringify({type,count,simulatedSeconds:90,commandMs:+commandMs.toFixed(3),updateP50Ms:+samples[2250].toFixed(3),updateP95Ms:+samples[4275].toFixed(3),maxExpansionsPerPulse:maxExpansions,...movementStats(board,scenario)}));
}
