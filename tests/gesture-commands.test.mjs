import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
import {createFormationGroup,placeGroup} from '../src/unit-groups.mjs';
import {squadTapIntent} from '../src/gesture-commands.mjs';

function fixture(){
 const board=new Board(90,30),character=m=>({characterId:m.characterId});
 const a=placeGroup(board,createFormationGroup(12,'squad','A 돌격','assault'),{x:20,y:10},{team:'A',makeCharacter:character});
 const ally=placeGroup(board,createFormationGroup(12,'squad','A 궁병','ranged'),{x:38,y:10},{team:'A',makeCharacter:character});
 const enemy=placeGroup(board,createFormationGroup(12,'squad','B 방어','defense'),{x:72,y:10},{team:'B',makeCharacter:character});
 return {board,a,ally,enemy};
}
test('selected squad tap on empty terrain becomes whole-squad move',()=>{
 const {board,a}=fixture();
 assert.deepEqual(squadTapIntent(board,a.squads[0],null,{x:42,y:22}),
 {kind:'order',action:'move',aim:{x:42,y:22}});
});
test('opposing squad tap becomes focus; allied squad tap switches selection',()=>{
 const {board,a,ally,enemy}=fixture();
 assert.deepEqual(squadTapIntent(board,a.squads[0],board.unit(enemy.memberIds[0]),{x:72,y:10}),
 {kind:'order',action:'focus',aim:{squadId:enemy.squads[0]}});
 assert.deepEqual(squadTapIntent(board,a.squads[0],board.unit(ally.memberIds[0]),{x:38,y:10}),
 {kind:'select',squadId:ally.squads[0]});
 assert.deepEqual(squadTapIntent(board,a.squads[0],board.unit(a.memberIds[0]),{x:20,y:10}),
 {kind:'inspect'});
});
test('tap intent does not change board, does not create commands, and rejects invalid targets',()=>{
 const {board,a}=fixture(),orders=board.units.filter(u=>u.command).length;
 assert.deepEqual(squadTapIntent(board,'unknown',null,{x:22,y:12}),{kind:'none'});
 assert.deepEqual(squadTapIntent(board,a.squads[0],null,{x:-1,y:55}),{kind:'none'});
 assert.deepEqual(squadTapIntent(board,a.squads[0],null,null),{kind:'none'});
 assert.equal(board.units.filter(u=>u.command).length,orders);
});
test('neutral units remain inspectable without becoming hostile focus targets',()=>{
 const {board,a}=fixture(),neutral=board.spawn(51,21);
 assert.deepEqual(squadTapIntent(board,a.squads[0],neutral,{x:51,y:21}),{kind:'inspect'});
});
