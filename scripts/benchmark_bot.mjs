import {readFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {Board} from '../src/model.mjs';
import {FlagMatch} from '../src/flag-match.mjs';
import {updateSquadOrders} from '../src/squad-orders.mjs';
import {squadsFor} from '../src/unit-groups.mjs';
const profiles=JSON.parse(await readFile(new URL('../assets/characters.json',import.meta.url))).characters;
const board=new Board(),match=new FlagMatch(board,{unitProfiles:profiles,scenario:process.env.SCENARIO,
 makeCharacter:s=>({characterId:s.characterId}),optionsFor:c=>({stats:profiles[c.characterId].testCombat,movement:profiles[c.characterId].testMovement})});
for(let y=6;y<94&&match.reserve.A;y+=5)for(let x=7;x<47&&match.reserve.A;x+=4)match.deploy('A','mixed',{x,y});
if(match.reserve.A)throw Error('player army did not fit');
match.start();if(match.counts.B!==500)throw Error('bot army did not fit');
if(process.env.CHARGE!=='0')match.charge();
const samples=[];let expansions=0;
for(let tick=0;tick<Number(process.env.TICKS||1200)&&match.phase==='battle';tick++){
 const start=performance.now();board.update(.05);match.update(.05);if(tick%2===0)updateSquadOrders(board);samples.push(performance.now()-start);
 expansions=Math.max(expansions,board.navigation.stats.lastExpansions);
 const cells=new Map();
 for(const u of board.units)if(u.health.current>0)for(const p of [u,...(u.step?[u.step]:[])]){
  const key=p.y*100+p.x;if(board.navigation.blocked(key))throw Error('soldier entered X');
  if(cells.has(key)&&cells.get(key)!==u.id)throw Error('collision');cells.set(key,u.id);
 }
}
samples.sort((a,b)=>a-b);
console.log(JSON.stringify({scenario:match.command.scenario.id,seconds:board.time,p95Ms:samples[Math.floor(samples.length*.95)],expansions,counts:match.counts,
 roles:Object.fromEntries([...match.command.registry].map(([role,ids])=>[role,ids.size])),events:match.command.events,hits:board.combatStats.hits}));
if(process.env.DETAIL)console.log(JSON.stringify([...match.command.operations.values()].map(op=>({role:op.role,index:op.index,center:match.command.center(op),plan:match.command.planFor(op),squads:op.squadIds.map(id=>{const s=squadsFor(board).get(id);return {type:s.type,order:s.order?.type,target:s.order?.target,wait:s.memberIds.map(id=>board.unit(id)?.waitReason).filter(Boolean)}})}))));
