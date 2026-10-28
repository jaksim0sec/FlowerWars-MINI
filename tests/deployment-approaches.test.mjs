import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Board} from '../src/model.mjs';
import {FlagMatch} from '../src/flag-match.mjs';
import {deployReserves} from './deployment-helpers.mjs';
const profiles=JSON.parse(readFileSync(new URL('../assets/characters.json',import.meta.url))).characters;
test('B-side flank staging participates in capacity-aware recruitment without admitting enemy or central merge regions',()=>{
 for(const seed of [17,73,191]){
  const b=new Board(),m=new FlagMatch(b,{seed,aiImplementation:'utility',unitProfiles:profiles,makeCharacter:s=>({characterId:s.characterId}),optionsFor:c=>({stats:profiles[c.characterId].testCombat,movement:profiles[c.characterId].testMovement})});
  deployReserves(m,'ranged');const requested=[],recruit=m.command.recruit.bind(m.command);m.command.recruit=(...args)=>{const op=recruit(...args);requested.push(op.anchor);return op;};m.start();
  assert.ok(requested.some(n=>n.id?.startsWith('flank-stage-')&&n.id.endsWith('-B')),`seed ${seed} must use legal flank staging`);
  assert.ok(requested.every(n=>m.inTerritory('B',n)));assert.ok(requested.every(n=>Number.isFinite(m.command.observer.travel(m.flags.B,n))));assert.ok(!requested.some(n=>n.kind==='merge'&&n.x<b.width*.6));
  assert.equal(m.counts.B,350);assert.equal(m.reserve.B,0);const units=b.units.filter(u=>u.team==='B');assert.equal(new Set(units.map(u=>u.y*b.width+u.x)).size,350);
  for(const u of units){assert.ok(m.inTerritory('B',u));assert.equal(b.navigation.blocked(u.y*b.width+u.x),false);}
  const ops=[...m.botOperations.values()];for(let i=1;i<ops.length;i++)assert.ok(ops.slice(0,i).some(o=>Math.hypot(o.anchor.x-ops[i].anchor.x,o.anchor.y-ops[i].anchor.y)<=30));
 }
});
