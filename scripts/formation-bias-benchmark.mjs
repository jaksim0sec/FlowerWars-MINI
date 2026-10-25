import {formationBattle,advanceBattle} from '../tests/formation-bias-helpers.mjs';
const seedCount=Math.max(1,Number(process.argv.find(arg=>arg.startsWith('--seeds='))?.split('=')[1])||1000);
const seconds=Math.max(1,Number(process.argv.find(arg=>arg.startsWith('--seconds='))?.split('=')[1])||120);
const summary=()=>({victories:{A:0,B:0,draw:0},unresolved:0,leaders:{A:0,B:0,equal:0},survivors:{A:0,B:0},hits:0,probes:0});
const original=summary(),swapped=summary(),differences=[],examples=[];
function record(totals,result,board){
  if(result.winner)totals.victories[result.winner]++;else totals.unresolved++;
  totals.leaders[result.leader||'equal']++;
  for(const team of ['A','B'])totals.survivors[team]+=result.teams[team];
  totals.hits+=board.combatStats.hits;totals.probes+=board.combatStats.probes;
}
for(let seed=1;seed<=seedCount;seed++){
  const left=formationBattle(seed).board,right=formationBattle(seed,{swapPositions:true}).board;
  const a=advanceBattle(left,seconds),b=advanceBattle(right,seconds);
  record(original,a,left);record(swapped,b,right);
  if(JSON.stringify(a)!==JSON.stringify(b))differences.push({seed,original:a,swapped:b});
  if(seed<=24)examples.push({seed,...a,hits:left.combatStats.hits});
}
console.log(JSON.stringify({seedCount,seconds,original,swapped,positionSwapDifferences:differences,first24:examples},null,2));
