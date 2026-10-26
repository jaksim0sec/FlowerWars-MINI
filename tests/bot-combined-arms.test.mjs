import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
import {FlagMatch} from '../src/flag-match.mjs';
import {squadsFor} from '../src/unit-groups.mjs';
import {survey} from '../src/bot-strategy.mjs';
import {deployReserves} from './deployment-helpers.mjs';

function army(type,count=144){
 const board=new Board(),match=new FlagMatch(board,{count,makeCharacter:m=>({characterId:m.characterId})});
 deployReserves(match,type);assert.equal(match.reserve.A,0);
 match.start();return {board,match,squads:match.squadIds.B.map(id=>squadsFor(board).get(id))};
}
test('bot recruits mobile attackers against ranged armies and more archers against shield armies',()=>{
 const ranged=army('ranged',240),shields=army('defense',240);
 const count=(force,type)=>force.squads.filter(s=>s.type===type).length;
 assert.ok(count(ranged,'mobile')>count(shields,'mobile'),'ranged opponents should change recruitment');
 assert.ok(count(shields,'ranged')>count(ranged,'ranged'),'shield opponents require more ranged firepower');
});
test('full bot operations pair frontline, firepower and healing in one lane',()=>{
 const {board,squads}=army('mixed',240),operations=new Map();
 for(const s of squads){assert.ok(s.botOperation,'squad needs an explicit mission');const key=s.botOperation.index;if(!operations.has(key))operations.set(key,[]);operations.get(key).push(s);}
 assert.ok([...operations.values()].some(group=>group[0].botOperation.mission==='guard'));
 assert.ok([...operations.values()].some(group=>group[0].botOperation.mission==='flank'));
 for(const group of operations.values()){
  if(group.length<4)continue;
  assert.ok(group.some(s=>s.type==='support'));
  assert.ok(group.some(s=>s.type==='ranged'));
  assert.ok(group.some(s=>['defense','assault','mobile'].includes(s.type)));
  const soldiers=group.flatMap(s=>s.memberIds.map(id=>board.unit(id)));
  assert.ok(Math.max(...soldiers.map(u=>u.y))-Math.min(...soldiers.map(u=>u.y))<=18,'partners must deploy together');
 }
});
test('bot retains reserves for later enemy deployment and skip reads the latest composition',()=>{
 const b=new Board(),m=new FlagMatch(b,{count:240,makeCharacter:s=>({characterId:s.characterId})});
 for(let i=0;i<24;i++)m.update(.25);
 assert.ok(m.counts.B>0&&m.reserve.B>0,'initial deployment must leave room to adapt');
 const before=new Map(b.units.map(u=>[u.id,[u.x,u.y]]));
 assert.equal(deployReserves(m,'defense',12),12);
 m.start();assert.equal(m.counts.B,240);
 for(const [id,position] of before){const u=b.unit(id);assert.deepEqual([u.x,u.y],position,'placed troops must not be shuffled');}
 const later=m.squadIds.B.slice(8).map(id=>squadsFor(b).get(id));
 assert.ok(later.filter(s=>s.type==='ranged').length>later.filter(s=>s.type==='mobile').length);
});

const center=(b,s)=>{
 const units=s.memberIds.map(id=>b.unit(id)).filter(u=>u.health.current>0&&u.formationRole!=='banner');
 return {x:units.reduce((n,u)=>n+u.x,0)/units.length,y:units.reduce((n,u)=>n+u.y,0)/units.length};
};
function relocate(b,units,anchor){
 for(const u of units){b.interrupt(u);b.cells.delete(u.y*b.width+u.x);b.spatial.remove(u);}
 units.forEach((u,i)=>{const x=anchor.x+i%4,y=anchor.y+Math.floor(i/4);assert.equal(b.occupied(x,y),false);b.setTerrain(x,y,'grass');u.x=u.visualX=x;u.y=u.visualY=y;b.cells.set(y*b.width+x,u.id);b.spatial.add(u);});
}
test('support advances beside its actual frontline rather than charging the distant objective',()=>{
 const {board:b,match:m,squads}=army('mixed',240),support=squads.find(s=>s.botOperation.mission==='attack'&&s.type==='support');
 const screen=squads.find(s=>s.botOperation===support.botOperation&&s.botSlot===0),front=center(b,screen);
 m.think(support.id);
 assert.notEqual(support.order?.type,'focus');
 assert.ok(Math.abs(support.order.target.x-front.x)<=6);
 assert.ok(Math.abs(support.order.target.y-front.y)<=6);
});
test('frontline regroups when its supporting squads have fallen far behind',()=>{
 const {board:b,match:m,squads}=army('mixed',240),screen=squads.find(s=>s.botOperation.mission==='attack'&&s.botSlot===0);
 const support=squads.find(s=>s.botOperation===screen.botOperation&&s.type==='support');
 relocate(b,support.memberIds.map(id=>b.unit(id)),{x:94,y:2});
 m.think(screen.id);assert.equal(screen.order?.type,'hold');
});
test('badly wounded troops retreat before selecting a nearby attack target and wait for recovery',()=>{
 const {board:b,match:m,squads}=army('mixed',144),screen=squads.find(s=>s.botOperation.mission==='attack'&&s.botSlot===0);
 relocate(b,screen.memberIds.map(id=>b.unit(id)),{x:64,y:35});
 const enemy=b.units.find(u=>u.team==='A');relocate(b,[enemy],{x:61,y:35});
 for(const id of screen.memberIds){const u=b.unit(id);b.damage(id,u.health.max*.8);}
 m.think(screen.id);assert.equal(screen.order?.type,'retreat');
 for(const id of screen.memberIds){const u=b.unit(id);u.health.current=u.health.max*.5;}
 m.think(screen.id);assert.equal(screen.order?.type,'retreat','do not immediately re-enter combat at half health');
});
test('home defense intercepts intruders without recalling a distant attack operation',()=>{
 const {board:b,match:m,squads}=army('mixed',240),guard=squads.find(s=>s.botOperation.mission==='guard'&&s.botSlot===0);
 const attack=squads.find(s=>s.botOperation.mission==='attack'&&s.botSlot===0);
 relocate(b,attack.memberIds.map(id=>b.unit(id)),{x:84,y:2});
 const enemy=b.units.find(u=>u.team==='A'),breach=[{x:95,y:50},{x:95,y:51},{x:96,y:50}].find(p=>!b.occupied(p.x,p.y));relocate(b,[enemy],breach);m.strategy=survey(b,m.flags.B);
 m.think(guard.id);m.think(attack.id);
 assert.equal(guard.order?.type,'focus');assert.equal(guard.order.target.unitId,enemy.id);
 assert.notEqual(attack.order?.type,'focus','distant attack force must keep its mission');
});
test('an isolated surviving banner does not become the frontline for its partners',()=>{
 const {board:b,match:m,squads}=army('mixed',144),team=squads.filter(s=>s.botOperation.role==='front'),screen=team[0],support=team[3],strike=team[2];
 for(const id of screen.memberIds)if(id!==screen.leaderId)b.damage(id,10000);
 relocate(b,[b.unit(screen.leaderId)],{x:94,y:2});
 m.think(support.id);const front=center(b,strike);
 const possible=squads.filter(s=>s.botOperation===support.botOperation&&s!==support&&s!==screen).map(s=>center(b,s));
 assert.ok(possible.some(front=>Math.abs(support.order.target.x-front.x)<=6&&Math.abs(support.order.target.y-front.y)<=6));
});
test('a force without surviving healers eventually rejoins combat after a bounded retreat',()=>{
 const {board:b,match:m,squads}=army('mixed',144),screen=squads.find(s=>s.botOperation.role==='front'&&s.botSlot===0);
 for(const s of squads)for(const id of s.memberIds){const u=b.unit(id);if(s.type==='support'||u.healing)b.damage(id,10000);}
 for(const id of screen.memberIds){const u=b.unit(id);if(u.health.current>0)b.damage(id,u.health.max*.8);}
 m.think(screen.id);assert.equal(screen.order?.type,'retreat');
 b.time+=10;m.think(screen.id);assert.notEqual(screen.order?.type,'retreat');
 b.time+=2;m.think(screen.id);assert.notEqual(screen.order?.type,'retreat','do not repeat the same futile recovery');
});
test('orphaned support joins a surviving fighting force instead of drifting alone',()=>{
 const {board:b,match:m,squads}=army('mixed',240),support=squads.find(s=>s.type==='support'&&s.botOperation.role==='front');
 for(const s of squads)if(s.botOperation===support.botOperation&&s!==support)for(const id of s.memberIds)b.damage(id,10000);
 const origin=center(b,support),hosts=squads.filter(s=>s.type!=='support'&&s.botOperation!==support.botOperation);
 hosts.sort((a,c)=>Math.max(Math.abs(center(b,a).x-origin.x),Math.abs(center(b,a).y-origin.y))-Math.max(Math.abs(center(b,c).x-origin.x),Math.abs(center(b,c).y-origin.y)));
 m.think(support.id);const host=center(b,hosts[0]);
 assert.ok(Math.abs(support.order.target.x-host.x)<=6&&Math.abs(support.order.target.y-host.y)<=6);
});
