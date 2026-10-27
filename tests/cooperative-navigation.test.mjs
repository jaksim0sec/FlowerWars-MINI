import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
function safe(b){const cells=new Map();for(const u of b.units)if(u.health.current>0)for(const p of [u,...(u.step?[u.step]:[])]){const key=p.x+','+p.y;assert.ok(!cells.has(key)||cells.get(key)===u.id);cells.set(key,u.id);}assert.equal(b.reservations.size,b.units.filter(u=>u.step).length);}
function lane(team='A'){
 const b=new Board(9,3);for(let x=0;x<9;x++){b.setObstacle(x,0,{blocked:true});if(x!==4)b.setObstacle(x,2,{blocked:true});}
 const root=b.spawn(1,1,null,{team:'A'}),a=b.spawn(2,1,null,{team,movement:{stepTime:.7}}),c=b.spawn(3,1,null,{team,movement:{stepTime:.2}});return {b,root,a,c};
}
test('a same-team chain clears a passing bay in completion order without replacing commands',()=>{
 const {b,root,a,c}=lane();b.move(root.id,7,1,{direct:true});const original=root.command;
 for(let i=0;i<800&&root.x!==7;i++){b.update(.05);safe(b);if(root.command)assert.equal(root.command,original);assert.equal(a.command,null);assert.equal(c.command,null);}
 assert.equal(root.x,7);assert.ok(b.navigation.stats.cooperativeSteps>0);
});
test('enemies and explicit held allies are not displaced',()=>{
 for(const mode of ['enemy','hold','attack','healing']){
  const {b,root,a,c}=lane(mode==='enemy'?'B':'A');
  if(mode==='hold')a.combat.holdPosition=true;
  if(mode==='attack'||mode==='healing'){a.state='attack';a.strike={target:999,duration:99,impactTime:98,healing:mode==='healing'};}
  b.move(root.id,7,1,{direct:true});for(let i=0;i<50;i++){b.update(.05);safe(b);}
  assert.deepEqual([a.x,a.y],[2,1],mode);assert.deepEqual([c.x,c.y],[3,1],mode);
 }
});
test('new commands, death and hit recovery cancel outstanding cooperation safely',()=>{
 for(const action of ['command','death','hit']){
  const {b,root,a}=lane();b.move(root.id,7,1,{direct:true});for(let i=0;i<15;i++)b.update(.05);
  if(action==='command')b.move(root.id,0,1,{replace:true,direct:true});else b.damage(a.id,action==='death'?999:1);
  for(let i=0;i<200;i++){b.update(.05);safe(b);}
  assert.ok(!root.courtesy||root.courtesy.command===root.command);
 }
});
test('bounded chains terminate in a sealed corridor and record traffic without spending beyond the budget',()=>{
 const b=new Board(12,1),root=b.spawn(0,0,null,{team:'A'});
 for(let x=1;x<12;x++)b.spawn(x,0,null,{team:'A'});
 b.move(root.id,11,0,{direct:true});
 for(let i=0;i<200;i++){b.update(.05);safe(b);assert.ok(b.navigation.stats.lastExpansions<=2048);}
 assert.equal(root.x,0);assert.ok(root.waitReason);assert.ok(b.navigation.stats.cooperativeFailures>0);
});
test('a beforeStep hook canceling another member invalidates the pending courtesy step',()=>{
 const {b,root}=lane();let canceled=false;
 b.movementPolicy={beforeStep:({unit})=>{if(unit.id!==root.id&&unit.courtesy&&!canceled){canceled=true;b.cancelCommand(root);}return 'move';}};
 b.move(root.id,7,1,{direct:true});for(let i=0;i<50;i++){b.update(.05);safe(b);}
 assert.ok(canceled);assert.equal(root.command,null);assert.equal(b.navigation.cooperations.size,0);
 assert.ok(b.units.every(u=>!u.courtesy));
});
test('ordinary traffic does not evict an unrelated soldier from a completed destination',()=>{
 const b=new Board(12,5),anchor=b.spawn(5,1,null,{team:'A'});b.move(anchor.id,5,2,{direct:true});b.update(1);
 const mover=b.spawn(2,2,null,{team:'A'});b.move(mover.id,9,2,{direct:true});
 for(let i=0;i<200;i++){b.update(.05);safe(b);assert.deepEqual([anchor.x,anchor.y],[5,2]);}
 assert.equal(mover.x,9);
});
test('cooperative movement is deterministic for identical seeds and commands',()=>{
 const execute=()=>{const {b,root}=lane();b.move(root.id,7,1,{direct:true});const frames=[];for(let i=0;i<200;i++){b.update(.05);frames.push(b.units.map(u=>[u.x,u.y,u.step?.x??null,u.step?.y??null]));}return frames;};
 assert.deepEqual(execute(),execute());
});
