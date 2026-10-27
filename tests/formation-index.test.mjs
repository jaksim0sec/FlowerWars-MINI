import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
import {settleFormation,repairOccupiedSeats} from '../src/formation-planner.mjs';
test('settlement respects direct map replacement and in-place seat edits across repeated calls',()=>{
 const b=new Board(20,12),a=b.spawn(5,5,{characterId:'scout'}),c=b.spawn(6,5,{characterId:'scout'}),units=[a,c],goals=new Map([[a.id,{x:6,y:5}],[c.id,{x:5,y:5}]]);
 settleFormation(units,goals);assert.deepEqual(goals.get(a.id),{x:5,y:5});
 goals.set(a.id,{x:6,y:5});goals.set(c.id,{x:5,y:5});settleFormation(units,goals);assert.deepEqual(goals.get(c.id),{x:6,y:5});
 goals.get(a.id).x=7;goals.get(c.id).x=5;settleFormation(units,goals);assert.deepEqual(goals.get(a.id),{x:5,y:5});assert.deepEqual(goals.get(c.id),{x:7,y:5});
});
test('unobstructed formation checks do not gather other squads goals',()=>{
 const b=new Board(20,12),a=b.spawn(5,5,null,{team:'A'}),squad={id:'own',order:{goals:new Map([[a.id,{x:5,y:5}]])}};a.squadId=squad.id;
 let scans=0;repairOccupiedSeats(b,squad,[a],()=>{scans++;return [];});assert.equal(scans,0);
 const foreign=b.spawn(6,5,null,{team:'A'});squad.order.goals.set(a.id,{x:6,y:5});
 repairOccupiedSeats(b,squad,[a],()=>{scans++;return [{x:5,y:4}];});assert.equal(scans,1);assert.notDeepEqual(squad.order.goals.get(a.id),{x:6,y:5});
 assert.notDeepEqual(squad.order.goals.get(a.id),{x:5,y:4});assert.ok(foreign);
});
