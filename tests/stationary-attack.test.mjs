import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
import {createFormationGroup,placeGroup,squadsFor} from '../src/unit-groups.mjs';
import {configureSquad,updateSquadOrders} from '../src/squad-orders.mjs';

test('stationary attack cooldown does not animate walking or prevent the next strike',()=>{
 const b=new Board(20,20),u=b.spawn(5,5,null,{team:'A',autoCombat:true}),enemy=b.spawn(6,5,null,{team:'B'});
 u.command={type:'attack',target:enemy.id};u.target=enemy.id;u.state='walk';u.combat.nextAttackAt=.2;
 b.navigation.plan(u);assert.equal(u.state,'idle');
 for(let i=0;i<30;i++)b.update(.05);
 assert.ok(enemy.health.current<enemy.health.max);
});
test('formation goal rebuild leaves a committed strike intact',()=>{
 const b=new Board(40,40),g=placeGroup(b,createFormationGroup(8,'squad','','defense'),{x:20,y:20},{team:'A'}),s=squadsFor(b).get(g.squads[0]);
 configureSquad(b,s.id,{formation:'square'});
 const u=b.unit(s.memberIds[1]),strike={target:999,duration:1,impactTime:.3};u.state='attack';u.strike=strike;s.order.dirty=true;
 updateSquadOrders(b);assert.equal(u.strike,strike);assert.equal(u.state,'attack');
});
