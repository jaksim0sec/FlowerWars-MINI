import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
import {createFormationGroup,placeGroup,registerPlacedGroup,squadsFor,groupsFor} from '../src/unit-groups.mjs';
import {configureSquad,orderSquad,updateSquadOrders,squadSummary} from '../src/squad-orders.mjs';
import {setupMovementScenario} from '../src/movement-scenarios.mjs';

test('manual group becomes flag-led squads with unchanged parent group',()=>{
 const board=new Board(90,50),plan=createFormationGroup(32,'platoon','예비 소대');
 const group=placeGroup(board,plan,{x:30,y:15},{team:'A',makeCharacter:(s)=>({characterId:s.characterId})});
 assert.equal(groupsFor(board).size,1);
 assert.equal(group.memberIds.length,32);
 assert.equal(group.squads.length,3);
 for(const squadId of group.squads){
   const s=squadsFor(board).get(squadId);
   assert.ok(s.memberIds.length<=12&&s.memberIds.length>0);
   assert.equal(board.unit(s.leaderId).character.characterId,'banner-bearer');
   assert.ok(s.memberIds.every(id=>board.unit(id).groupId===group.id&&board.unit(id).squadId===s.id));
 }
 board.reset();assert.equal(groupsFor(board).size,0);assert.equal(squadsFor(board).size,0);
});

test('formation test armies retain two parent battalions and get flagged specialist squads',()=>{
 const board=new Board();
 const scenario=setupMovementScenario(board,'formation',64,()=>null);
 assert.equal(scenario.groupIds.length,2);
 for(const groupId of scenario.groupIds){
   const g=groupsFor(board).get(groupId);
   assert.equal(g.kind,'battalion');assert.equal(g.memberIds.length,32);assert.equal(g.squads.length,3);assert.equal(g.platoons.length,1);assert.deepEqual(g.squads.map(id=>squadsFor(board).get(id).type),['defense','assault','ranged']);
   for(const id of g.squads){
     const s=squadsFor(board).get(id);
     assert.equal(board.unit(s.leaderId).formationRole,'banner');
   }
 }
});

test('orders affect only their squad and promote surviving soldiers after leader loss',()=>{
 const board=new Board(100,40);
 const make=(member)=>({characterId:member.characterId});
 const a=placeGroup(board,createFormationGroup(12,'squad','돌격','assault'),{x:20,y:15},{team:'A',makeCharacter:make});
 const b=placeGroup(board,createFormationGroup(12,'squad','적'),{x:70,y:15},{team:'B',makeCharacter:make});
 const x=squadsFor(board).get(a.squads[0]),y=squadsFor(board).get(b.squads[0]);
 assert.ok(configureSquad(board,x.id,{formation:'column',stance:'avoid'}));
 assert.ok(orderSquad(board,x.id,'move',{x:40,y:15}));
 updateSquadOrders(board);
 assert.equal(x.order.type,'move');assert.equal(y.order,null);
 assert.equal(x.formation,'column');
 assert.ok(x.memberIds.some(id=>board.unit(id).command?.type==='move'||board.unit(id).step));
 assert.equal(y.memberIds.some(id=>board.unit(id).command),false);
 assert.ok(orderSquad(board,x.id,'focus',{squadId:y.id}));
 assert.ok(x.memberIds.some(id=>board.unit(id).command?.type==='attack'));
 assert.ok(orderSquad(board,x.id,'wait'));
 assert.ok(x.memberIds.every(id=>!board.unit(id).command));
 const flag=board.unit(x.leaderId);
 board.damage(flag.id,flag.health.current);
 const promoted=squadSummary(board,x.id);
 assert.equal(promoted.leaderAlive,false);
 assert.equal(promoted.commanderAlive,true);
 assert.notEqual(promoted.actingCommanderId,x.leaderId);
 assert.ok(orderSquad(board,x.id,'advance',{x:45,y:15}));
 assert.ok(x.memberIds.some(id=>id!==flag.id&&board.unit(id).command?.type==='move'));
});

test('specialized templates register commanders and unit roles',()=>{
 for(const kind of ['assault','defense','ranged','mobile','support','mixed']){
   const group=createFormationGroup(12,'squad','',kind);
   assert.equal(group.members.length,12);
   assert.ok(group.members.some(m=>m.characterId==='banner-bearer'));
   assert.equal(group.squadType,kind);
 }
});

test('moving, waiting, retreating and focusing keep automatic nearby combat enabled',()=>{
 const board=new Board(90,40),make=member=>({characterId:member.characterId});
 const a=placeGroup(board,createFormationGroup(12,'squad','A 방어','defense'),{x:25,y:12},{team:'A',makeCharacter:make});
 const b=placeGroup(board,createFormationGroup(12,'squad','B 돌격','assault'),{x:65,y:12},{team:'B',makeCharacter:make});
 const ourId=a.squads[0],enemyId=b.squads[0];
 const units=()=>squadsFor(board).get(ourId).memberIds.map(id=>board.unit(id));
 assert.ok(units().every(u=>u.combat.auto));
 for(const [command,aim] of [
  ['move',{x:40,y:12}],['advance',{x:41,y:12}],
  ['retreat',{x:18,y:12}],['wait',null],['hold',null],
  ['focus',{squadId:enemyId}]
 ]){
  assert.equal(orderSquad(board,ourId,command,aim),true,command);
  assert.ok(units().every(u=>u.combat.auto),command+' disabled nearby self-defence');
 }
 const s=squadsFor(board).get(ourId);
 assert.notEqual(board.unit(s.leaderId).command?.type,'attack',
   'flag bearer must not chase marked enemies');
 assert.ok(units().filter(u=>u.id!==s.leaderId).some(u=>u.command?.type==='attack'));
});

test('squad commands respect explicitly disabled auto-combat in debug tests',()=>{
 const board=new Board(75,40),make=m=>({characterId:m.characterId});
 const a=placeGroup(board,createFormationGroup(12,'squad','A 방어','defense'),{x:25,y:12},{team:'A',makeCharacter:make});
 const squadId=a.squads[0],troops=squadsFor(board).get(squadId).memberIds.map(id=>board.unit(id));
 board.setAutoCombat(false);
 for(const [order,aim] of [['move',{x:35,y:14}],['retreat',{x:15,y:12}],['wait'],['hold']]){
  assert.ok(orderSquad(board,squadId,order,aim));
  assert.ok(troops.every(u=>!u.combat.auto),order+' re-enabled explicitly disabled combat');
 }
});

test('leaderless squads keep following orders and elect a new temporary commander',()=>{
 const board=new Board(95,45),character=m=>({characterId:m.characterId});
 const origin=placeGroup(board,createFormationGroup(12,'squad','A 수비','defense'),{x:22,y:14},{team:'A',makeCharacter:character});
 const ally=placeGroup(board,createFormationGroup(12,'squad','A 지원','support'),{x:54,y:14},{team:'A',makeCharacter:character});
 const s=squadsFor(board).get(origin.squads[0]),friend=squadsFor(board).get(ally.squads[0]);
 assert.ok(orderSquad(board,s.id,'advance',{x:42,y:16}));
 const previous=board.unit(s.leaderId);
 board.damage(previous.id,previous.health.current);
 let summary=squadSummary(board,s.id);
 assert.equal(summary.leaderAlive,false);
 assert.ok(summary.commanderAlive&&summary.actingCommanderId!==s.leaderId);
 assert.ok(orderSquad(board,s.id,'move',{x:41,y:22}));
 updateSquadOrders(board);
 assert.ok(s.memberIds.some(id=>board.unit(id).health.current>0&&board.unit(id).command?.type==='move'));
 // Both followers and followed squads survive a lost original flag.
 const friendFlag=board.unit(friend.leaderId);
 board.damage(friendFlag.id,friendFlag.health.current);
 assert.ok(orderSquad(board,s.id,'follow',{squadId:friend.id}));
 const firstSuccessor=summary.actingCommanderId;
 const acting=board.unit(firstSuccessor);
 board.damage(acting.id,acting.health.current);
 summary=squadSummary(board,s.id);
 assert.ok(summary.commanderAlive);
 assert.notEqual(summary.actingCommanderId,firstSuccessor);
 assert.ok(orderSquad(board,s.id,'rally'));
 for(const id of s.memberIds){const member=board.unit(id);if(member.health.current>0)board.damage(id,member.health.current);}
 assert.equal(squadSummary(board,s.id).commanderAlive,false);
 assert.equal(orderSquad(board,s.id,'move',{x:45,y:23}),false);
});

test('the commander receives a safer rear target even when the formation is dense',()=>{
 for(const type of ['line','column','dense','spread']){
  const board=new Board(100,60),make=m=>({characterId:m.characterId});
  const g=placeGroup(board,createFormationGroup(12,'squad','A 돌격','assault'),{x:30,y:20},{team:'A',makeCharacter:make});
  const s=squadsFor(board).get(g.squads[0]);
  configureSquad(board,s.id,{formation:type});
  assert.ok(orderSquad(board,s.id,'advance',{x:70,y:30}));
  const leader=board.unit(s.leaderId),troops=s.memberIds.filter(id=>id!==leader.id).map(id=>board.unit(id));
  assert.equal(leader.command?.type,'move');
  assert.ok(troops.every(u=>u.command?.type==='move'));
  assert.ok(leader.command.x<Math.min(...troops.map(u=>u.command.x)),
   type+' exposed the leader ahead of another squad member');
 }
});

test('a moving squad actually attacks nearby enemies without explicit focus orders',()=>{
 const board=new Board(100,50),make=m=>({characterId:m.characterId});
 const group=placeGroup(board,createFormationGroup(12,'squad','A 전진','defense'),{x:25,y:20},{team:'A',makeCharacter:make});
 const squad=squadsFor(board).get(group.squads[0]);
 const fighters=squad.memberIds.map(id=>board.unit(id)).filter(u=>u.id!==squad.leaderId);
 const directions=[[1,0],[-1,0],[0,1],[0,-1]];
 let enemy=null;
 for(const soldier of fighters){
  for(const [dx,dy] of directions){
   const x=soldier.x+dx,y=soldier.y+dy;
   if(board.inside(x,y)&&!board.occupied(x,y)){
    enemy=board.spawn(x,y,null,{team:'B',autoCombat:false,stats:{maxHealth:500}});
    break;
   }
  }
  if(enemy)break;
 }
 assert.ok(enemy,'a vacant adjacent test cell must exist');
 assert.ok(orderSquad(board,squad.id,'move',{x:62,y:25}));
 for(let tick=0;tick<28;tick++)board.update(.05);
 assert.ok(enemy.health.current<enemy.health.max,
  'a soldier must strike an adjacent enemy while following a move order');
 assert.ok(board.combatStats.hits>0);
});

test('a focus order leaves the commander defending locally, not rushing at a distant mark',()=>{
 const board=new Board(100,50),make=m=>({characterId:m.characterId});
 const a=placeGroup(board,createFormationGroup(12,'squad','A 전진','mixed'),{x:24,y:20},{team:'A',makeCharacter:make});
 const b=placeGroup(board,createFormationGroup(12,'squad','B 적','mixed'),{x:75,y:20},{team:'B',makeCharacter:make});
 const s=squadsFor(board).get(a.squads[0]),leader=board.unit(s.leaderId);
 assert.ok(orderSquad(board,s.id,'move',{x:58,y:22}));
 assert.ok(leader.command?.type==='move');
 assert.ok(orderSquad(board,s.id,'focus',{squadId:b.squads[0]}));
 assert.equal(leader.command,null,'focus should stop a flag bearer advancing alone');
 assert.equal(leader.combat.auto,true,'commander retains automatic close-range self defence');
});

test('the last surviving soldier can still focus an enemy after the flag is lost',()=>{
 const board=new Board(100,50),make=m=>({characterId:m.characterId});
 const a=placeGroup(board,createFormationGroup(12,'squad','A 생존','mixed'),{x:25,y:20},{team:'A',makeCharacter:make});
 const b=placeGroup(board,createFormationGroup(12,'squad','B 적','mixed'),{x:75,y:20},{team:'B',makeCharacter:make});
 const s=squadsFor(board).get(a.squads[0]),survivor=board.unit(s.memberIds[s.memberIds.length-1]);
 for(const id of s.memberIds)if(id!==survivor.id){const u=board.unit(id);board.damage(id,u.health.current);}
 const summary=squadSummary(board,s.id);
 assert.equal(summary.alive,1);
 assert.equal(summary.leaderAlive,false);
 assert.equal(summary.actingCommanderId,survivor.id);
 assert.ok(orderSquad(board,s.id,'focus',{squadId:b.squads[0]}));
 assert.equal(survivor.command?.type,'attack');
});
