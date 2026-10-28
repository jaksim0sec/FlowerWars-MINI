import assert from 'node:assert/strict';
import test from 'node:test';

// Profile storage is isolated from the browser and the real game account.
const memory=new Map();
globalThis.localStorage={
  getItem:key=>memory.get(key)??null,
  setItem:(key,value)=>memory.set(key,String(value))
};
const c=await import('../src/progression/core.mjs?campaign-regression');

test('initial profile exposes a playable, saved squad roster',()=>{
  const p=c.getProfile();
  assert.deepEqual(p.lineup,['defense','ranged','mixed']);
  assert.equal(p.squads.mobile.level,0);
  assert.ok(p.acorns>=30);
  assert.equal(c.isAllowedType('mobile'),true); // unrestricted practice / multiplayer
});
test('purchases, chest rewards, paths and lineup are durable',async()=>{
  assert.equal(c.train('defense').ok,true);
  assert.equal(c.getProfile().squads.defense.level,2);
  assert.equal(c.setPath('ranged','b').ok,true);
  assert.equal(c.buyChest().ok,false); // insufficient currency after training? checked below dynamically
});
test('an earned victory advances expedition, buffs only deployed units and pays once',()=>{
  assert.equal(c.beginExpedition().ok,true);
  assert.equal(c.beginBattle().ok,true);
  assert.equal(c.beginBattle().ok,false);
  assert.equal(c.isAllowedType('mobile'),false);
  assert.equal(c.isAllowedType('defense'),true);
  const u={damage:100,health:{current:100,max:100},movement:{stepTime:.4},healing:{amount:10}};
  const board={unit:id=>id===1?u:null};
  c.applyBonuses(board,{memberIds:[1]},'defense');
  assert.ok(u.damage>100,'training should affect combat damage');
  assert.ok(u.health.max>100,'defense specialty should affect combat health');
  const reward=c.finishBattle({winner:'A',alive:58,flagRatio:.9,types:['defense','ranged','mixed']});
  assert.equal(reward.outcome,'victory');
  assert.equal(c.finishBattle({winner:'A'}),null,'result cannot be claimed twice');
  const p=c.getProfile();
  assert.equal(p.expedition.stage,2);
  assert.equal(p.expedition.supply,45);
  assert.equal(p.chests,1);
  assert.ok(p.quests.includes('first')&&p.quests.includes('flag')&&p.quests.includes('diverse'));
  assert.equal(p.squads.ranged.wins,1);
});
test('supply and 3 wins complete expedition and persist',async()=>{
  assert.equal(c.buySupply('attack').ok,true);
  assert.equal(c.buySupply('health').ok,false);
  assert.equal(c.beginBattle().ok,true);
  assert.equal(c.finishBattle({winner:'A',alive:60,flagRatio:.5,types:['defense']}).stage,2);
  assert.equal(c.getProfile().expedition.stage,3);
  assert.equal(c.beginBattle().ok,true);
  const result=c.finishBattle({winner:'A',alive:3,flagRatio:.2,types:['defense']});
  assert.equal(result.complete,true);
  const state=c.getProfile();
  assert.equal(state.expedition,null);
  assert.ok(state.medals.includes('원정 완수'));
  assert.ok(state.medals.includes('최후의 잎'));
  assert.ok(state.medals.includes('생환 훈장'));
  const reloaded=await import('../src/progression/core.mjs?campaign-reloaded');
  assert.deepEqual(reloaded.getProfile(),state);
});
test('defeat ends only current expedition, retains progression',()=>{
  assert.equal(c.beginExpedition().ok,true);
  assert.equal(c.beginBattle().ok,true);
  c.finishBattle({winner:'B',alive:0,flagRatio:0,types:['ranged']});
  assert.equal(c.getProfile().expedition,null);
  assert.ok(c.getProfile().wins>=3);
  assert.equal(c.battleActive(),false);
});

test('each expedition stage grants its own goal bonus once',()=>{
  assert.equal(c.beginExpedition().ok,true);
  assert.equal(c.beginBattle().ok,true);
  const first=c.finishBattle({winner:'A',alive:80,flagRatio:.3,types:['defense']});
  assert.equal(first.objective,false);
  const before=c.getProfile().chests;
  assert.equal(c.beginBattle().ok,true);
  const second=c.finishBattle({winner:'A',alive:70,flagRatio:.6,types:['defense','ranged','mixed']});
  assert.equal(second.objective,true);
  assert.equal(c.getProfile().chests,before+2,'normal chest and goal chest');
  assert.equal(c.beginBattle().ok,true);
  const third=c.finishBattle({winner:'A',alive:45,flagRatio:.5,types:['defense']});
  assert.equal(third.objective,true);
  assert.equal(third.materials,4,'last battle gives 2 materials plus 2 from survival goal');
});
