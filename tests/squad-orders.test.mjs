import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
import {createFormationGroup,placeGroup,registerPlacedGroup,squadsFor,groupsFor} from '../src/unit-groups.mjs';
import {configureSquad,orderSquad,updateSquadOrders} from '../src/squad-orders.mjs';
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

test('formation test armies retain two parent platoons and get flagged sub-squads',()=>{
 const board=new Board();
 const scenario=setupMovementScenario(board,'formation',64,()=>null);
 assert.equal(scenario.groupIds.length,2);
 for(const groupId of scenario.groupIds){
   const g=groupsFor(board).get(groupId);
   assert.equal(g.memberIds.length,32);assert.equal(g.squads.length,3);
   for(const id of g.squads){
     const s=squadsFor(board).get(id);
     assert.equal(board.unit(s.leaderId).formationRole,'banner');
   }
 }
});

test('orders affect only their squad and enforce a living commander',()=>{
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
 board.unit(x.leaderId).health.current=0;
 assert.equal(orderSquad(board,x.id,'advance',{x:45,y:15}),false);
});

test('specialized templates register commanders and unit roles',()=>{
 for(const kind of ['assault','defense','ranged','mobile','support','mixed']){
   const group=createFormationGroup(12,'squad','',kind);
   assert.equal(group.members.length,12);
   assert.ok(group.members.some(m=>m.characterId==='banner-bearer'));
   assert.equal(group.squadType,kind);
 }
});
