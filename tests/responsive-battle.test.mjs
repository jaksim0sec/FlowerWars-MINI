import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
import {FlagMatch} from '../src/flag-match.mjs';
import {createFormationGroup,placeGroup,squadsFor} from '../src/unit-groups.mjs';
import {configureSquad,updateSquadOrders} from '../src/squad-orders.mjs';
import {deployReserves} from './deployment-helpers.mjs';

test('foreign occupancy repairs only the blocked formation seat',()=>{
 const b=new Board(60,40),g=placeGroup(b,createFormationGroup(12,'squad','','defense'),{x:25,y:20},{team:'A',makeCharacter:m=>({characterId:m.characterId})}),s=squadsFor(b).get(g.squads[0]);
 configureSquad(b,s.id,{formation:'square'});
 const before=new Map([...s.order.goals].map(([id,p])=>[id,{...p}]));
 const blocked=[...before].find(([id,p])=>!b.occupied(p.x,p.y));assert.ok(blocked);
 const stranger=b.spawn(blocked[1].x,blocked[1].y,null,{team:'A'});assert.ok(stranger);
 for(let i=0;i<30;i++){b.update(.05);updateSquadOrders(b);}
 for(const [id,p]of before)if(id!==blocked[0])assert.deepEqual(s.order.goals.get(id),p,'unrelated seat was scattered');
 assert.notDeepEqual(s.order.goals.get(blocked[0]),blocked[1]);
 for(let i=0;i<1000&&s.order.phase!=='arrived';i++){b.update(.05);updateSquadOrders(b);}
 assert.equal(s.order.phase,'arrived');
});
test('explicit movement is never replaced by automatic ranged spacing',()=>{
 const b=new Board(20,12),u=b.spawn(5,5,null,{team:'A',autoCombat:true,stats:{range:4,preferredRange:3}}),enemy=b.spawn(7,5,null,{team:'B'});
 u.combat.targetId=enemy.id;
 b.move(u.id,14,5,{direct:true});
 assert.equal(u.step,null,'spacing overrode the requested movement');
 assert.equal(u.command.x,14);
});
test('melee troops close on an actual nearby shooter and retaliate without an explicit focus',()=>{
 const b=new Board(24,12),u=b.spawn(5,5,null,{team:'A',autoCombat:true,stats:{maxHealth:1000}}),archer=b.spawn(8,5,null,{team:'B',autoCombat:true,stats:{damage:1,range:4,maxHealth:5000,attackPeriod:1.4}});
 for(let i=0;i<180;i++)b.update(.05);
 assert.ok(u.hits>0);assert.ok(archer.hits>0,'melee stood still under nearby fire');
 assert.ok(u.x>5);
});
test('200 soldier armies replace three out of four banner bearers with rank-and-file troops',()=>{
 const b=new Board(),m=new FlagMatch(b,{count:999});deployReserves(m,'defense');
 while(m.reserve.B)assert.ok(m.deployBot());
 assert.deepEqual(m.counts,{A:200,B:200});
 for(const team of ['A','B']){
  const banners=b.units.filter(u=>u.team===team&&u.formationRole==='banner');
  assert.equal(banners.length,Math.ceil(m.squadIds[team].length/4));
 }
 const full=m.squadIds.A.map(id=>squadsFor(b).get(id)).filter(s=>s.memberIds.length===12);
 assert.ok(full.every(s=>s.memberIds.filter(id=>b.unit(id).formationRole==='guard').length>=10));
});
test('retaliation reacts promptly, keeps a short leash, and a new order cancels it',()=>{
 const b=new Board(24,12),u=b.spawn(5,5,null,{team:'A',autoCombat:true,stats:{maxHealth:1000}}),enemy=b.spawn(8,5,null,{team:'B'});
 b.damage(u.id,1,1,enemy.id);b.update(.3);
 assert.ok(u.step||u.x>5,'hit recovery must not leave nearby infantry idle');
 assert.equal(u.combat.retaliation.x,5);
 const step=u.step;
 assert.ok(b.move(u.id,2,5,{replace:true,direct:true}));
 assert.equal(u.combat.retaliation,null);assert.equal(u.step,step);
 const c=new Board(24,12),guard=c.spawn(5,5,null,{team:'A',autoCombat:true}),shooter=c.spawn(9,5,null,{team:'B'});
 c.damage(guard.id,1,1,shooter.id);
 for(let i=0;i<80;i++){c.update(.05);assert.ok(Math.max(Math.abs(guard.x-5),Math.abs(guard.y-5))<=3);}
});
test('arrived ranged formations do not alternate between spacing and returning to a seat',async()=>{
 const {orderSquad}=await import('../src/squad-orders.mjs');
 const b=new Board(60,40),g=placeGroup(b,createFormationGroup(12,'squad','','ranged'),{x:20,y:20},{team:'A',makeCharacter:m=>({characterId:m.characterId}),optionsFor:c=>c.characterId==='archer'?{stats:{range:4,preferredRange:3}}:{}}),s=squadsFor(b).get(g.squads[0]);
 orderSquad(b,s.id,'move',{x:35,y:20});
 for(let i=0;i<1200&&s.order.phase!=='arrived';i++){b.update(.05);updateSquadOrders(b);}
 assert.equal(s.order.phase,'arrived');
 const u=s.memberIds.map(id=>b.unit(id)).find(u=>u.character.characterId==='archer'&&[[1,0],[0,1],[-1,0],[0,-1]].some(([dx,dy])=>!b.occupied(u.x+dx,u.y+dy)));assert.ok(u);
 let enemy=null;
 for(const [dx,dy]of [[1,0],[0,1],[-1,0],[0,-1]])enemy ||=b.spawn(u.x+dx,u.y+dy,null,{team:'B',stats:{maxHealth:10000}});
 assert.ok(enemy);u.combat.targetId=enemy.id;
 for(let i=0;i<30;i++){b.update(.05);updateSquadOrders(b);assert.equal(u.step,null,'archer left and returned to its assigned seat');}
});
test('partial troop previews exactly match actual soldiers, equipment and offsets',()=>{
 for(const type of ['mixed','defense','support']){
  const b=new Board(),m=new FlagMatch(b,{count:20,makeCharacter:m=>({characterId:m.characterId})});
  assert.ok(m.deploy('A',type,{x:20,y:20}));
  const preview=m.deploymentPreview('A',type);assert.equal(preview.members.length,8);
  const anchor={x:20,y:50},s=m.deploy('A',type,anchor);assert.ok(s);
  const actual=s.memberIds.map(id=>b.unit(id));
  for(const member of preview.members)assert.ok(actual.some(u=>u.character.characterId===member.characterId&&u.x===anchor.x+member.offset.x&&u.y===anchor.y+member.offset.y));
  assert.ok(actual.every(u=>u.formationRole!=='banner'));
 }
});
