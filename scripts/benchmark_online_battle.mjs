// Host engine/encoding cost, not browser FPS or real network throughput.
import {readFile,writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {createBattleState,stepBattle,saveBattleState,restoreBattleState} from '../src/online/battle-state.mjs';
import {BattleFrames,applyBattleFrame} from '../src/online/battle-wire.mjs';
import {packMessage,unpackMessage} from '../src/online/wire-codec.mjs';
import {applyBattleCommand} from '../src/online/battle-commands.mjs';
import {createCharacter,equip,unequip} from '../src/characters/engine.mjs';
const root=new URL('../',import.meta.url),json=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));
const manifest=await json('assets/characters.json'),equipment=await json('assets/'+manifest.equipment),characters={};
for(const [id,p]of Object.entries(manifest.characters))characters[id]={...p,rig:await json('assets/'+p.rig)};
const catalog={characters,equipment};
function makeCharacter(slot){const id=slot.characterId,c=createCharacter(catalog,id),p=characters[id];if(p.recommendedWeapon)equip(catalog,c,p.recommendedWeapon,p.recommendedHand||'left');for(const [hand,item]of Object.entries(p.recommendedAccessories||{}))equip(catalog,c,item,hand);if(slot.weapon){for(const hand of Object.keys(c.equipment))unequip(c,hand);equip(catalog,c,slot.weapon,'left');}return c;}
const optionsFor=c=>{const movement={...characters[c.characterId].testMovement};for(const attachment of new Set(Object.values(c.equipment).filter(Boolean)))movement.stepTime*=equipment[attachment.equipmentId].movement?.stepMultiplier||1;return {stats:characters[c.characterId].testCombat,movement,capabilities:characters[c.characterId].capabilities||[]};};
const seed=Number(process.env.SEED||73),duration=Number(process.env.DURATION||20),state=createBattleState('benchmark',{seed,unitProfiles:characters,makeCharacter,optionsFor}),b=state.board,m=b.match;
for(const team of ['A','B']){let index=0;const types=['mixed','defense','ranged','assault','mobile','support'];while(m.reserve[team]){let placed=false;const type=types[index++%types.length];for(let x=team==='A'?8:100;x<(team==='A'?85:170)&&!placed;x+=3)for(let y=8;y<120&&!placed;y+=3)if(m.deploy(team,type,{x,y}))placed=true;if(!placed)throw Error('Deployment failed '+team);}}
let t=performance.now();const initial=await saveBattleState(state,0),saveMs=performance.now()-t;t=performance.now();const guest=await restoreBattleState(initial),restoreMs=performance.now()-t;
m.start();for(const [role,team]of [['host','A'],['guest','B']])applyBattleCommand(state,role,{kind:'orders',ids:m.squadIds[team],action:'advance',target:{x:88,y:64}});
const stream=new BattleFrames(),cpu=[],wire=[],rawWire=[],frames=[],checkpoints=[];let collisions=0;
for(let tick=1;tick<=duration*20;tick++){t=performance.now();stepBattle(state,.05);cpu.push(performance.now()-t);if(tick%3===0){t=performance.now();const frame=stream.build(state),packed=await packMessage({kind:'frame',value:frame}),size=new TextEncoder().encode(JSON.stringify(packed)).length;rawWire.push(new TextEncoder().encode(JSON.stringify(frame)).length);const decoded=packed.kind==='compressed'?await unpackMessage(packed):packed;if(!applyBattleFrame(guest,decoded.value))throw Error('Frame rejected');frames.push(performance.now()-t);wire.push(size);}const cells=new Map();for(const u of b.units)if(u.health.current>0)for(const p of [u,...(u.step?[u.step]:[])]){const key=p.y*b.width+p.x;if(cells.has(key)&&cells.get(key)!==u.id)collisions++;cells.set(key,u.id);}if(tick%100===0){t=performance.now();const snap=await saveBattleState(state,tick);const saveMs=performance.now()-t,packed=await packMessage({kind:'checkpoint',snapshot:snap});checkpoints.push({time:tick/20,bytes:new TextEncoder().encode(JSON.stringify(snap)).length,packedBytes:new TextEncoder().encode(JSON.stringify(packed)).length,saveMs});}}
const p95=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length*.95)]||0;
const result={node:process.version,seed,seconds:duration,soldiers:700,size:[b.width,b.height],initialSnapshotBytes:new TextEncoder().encode(JSON.stringify(initial)).length,initialSaveMs:saveMs,initialRestoreMs:restoreMs,stepP95Ms:p95(cpu),frameBuildAndApplyP95Ms:p95(frames),maxFrameBytes:Math.max(...wire),averageRawFrameBytesPerSecond:rawWire.reduce((a,c)=>a+c,0)/duration,averageEncodedBytesPerSecond:wire.reduce((a,c)=>a+c,0)/duration,collisions,checkpoints};
const text=JSON.stringify(result,null,2);if(process.env.OUTPUT)await writeFile(process.env.OUTPUT,text+'\n');console.log(text);
