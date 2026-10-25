import {readFileSync} from 'node:fs';
import {Board} from '../src/model.mjs';
import {setupMovementScenario,startMovementScenario} from '../src/movement-scenarios.mjs';
const roster=JSON.parse(readFileSync(new URL('../assets/characters.json',import.meta.url))).characters;
const equipment=JSON.parse(readFileSync(new URL('../assets/equipment/catalog.json',import.meta.url)));

// Match the live formation's role overrides and equipped movement penalties.
export function formationBattle(seed,{swapPositions=false,count=64}={}) {
  const board=new Board();
  const scenario=setupMovementScenario(board,'formation',count,(_,slot)=>({characterId:slot.characterId,slot}),{
    seed,combat:true,
    statsFor:c=>c.slot.stats||roster[c.characterId].testCombat,
    movementFor:c=>{
      const profile={...roster[c.characterId].testMovement};
      const weapon=c.slot.weapon||roster[c.characterId].recommendedWeapon;
      profile.stepTime*=equipment[weapon]?.movement?.stepMultiplier||1;
      return profile;
    },
  });
  // Deliberately retain the ordinary board orientation, priorities and IDs.
  // A mirror option that also reverses decision rules can conceal side bias.
  if(swapPositions){
    board.cells.clear();board.spatial.clear();
    for(const u of board.units){u.x=board.width-1-u.x;u.visualX=u.x;board.cells.set(u.y*board.width+u.x,u.id);board.spatial.add(u);}
    for(const order of scenario.orders)order.x=board.width-1-order.x;
  }
  startMovementScenario(board,scenario);
  return {board,scenario};
}
export function battleResult(board){
  const teams={A:0,B:0},health={A:0,B:0};
  for(const u of board.units)if(u.health.current>0){teams[u.team]++;health[u.team]+=u.health.current;}
  return {teams,health,winner:teams.A===0?(teams.B?'B':'draw'):teams.B===0?'A':null,
    leader:teams.A===teams.B?null:teams.A>teams.B?'A':'B'};
}
export function advanceBattle(board,seconds=120){
  for(let n=0;n<Math.round(seconds/.02);n++){
    board.update(.02);
    if(n%50===0&&battleResult(board).winner)break;
  }
  return battleResult(board);
}
