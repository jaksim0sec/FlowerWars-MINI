import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
import {FlagMatch,GATE_SEGMENT_HEALTH} from '../src/flag-match.mjs';
import {KINGDOM_WALLS,GATE_FROM,GATE_TO,terrainStepMultiplier} from '../src/battlefield-terrain.mjs';

test('100x100 battlefield leaves the middle open and keeps each rear enclosed',()=>{
 const board=new Board(),match=new FlagMatch(board,{count:24});
 assert.equal(board.width,100);assert.equal(board.height,100);
 let open=0,total=0,forests=0;
 for(let y=22;y<78;y++)for(let x=35;x<65;x++){
  total++;if(!board.navigation.blocked(y*100+x))open++;
 }
 assert.ok(open/total>.95,'central field should support wide formations');
 for(let y=0;y<100;y++)for(const x of Object.values(KINGDOM_WALLS)){
  const blocked=board.navigation.blocked(y*100+x);
  assert.equal(blocked,y<GATE_FROM||y>=GATE_TO,'no outer edge bypass of gates');
 }
 for(const row of board.terrain)for(const tile of row)if(tile==='grove')forests++;
 assert.ok(forests>50,'visible, traversable forest exists');
 assert.equal(match.gates.A.length,5);assert.equal(match.gates.B.length,5);
});

test('friendly gate passage is unrestricted, but invaders strike before stepping through',()=>{
 const board=new Board(),match=new FlagMatch(board,{count:24});
 match.phase='battle';
 const y=50,x=KINGDOM_WALLS.B;
 const intruder=board.spawn(x-1,y,null,{team:'A',stats:{damage:30}});
 const defender=board.spawn(x+1,y,null,{team:'B'});
 const step={board,unit:intruder,from:{x:x-1,y},to:{x,y}};
 assert.equal(board.movementPolicy.beforeStep(step),'wait');
 assert.equal(intruder.state,'attack','a normal combat strike begins');
 assert.equal(board.movementPolicy.beforeStep({board,unit:defender,from:{x:x+1,y},to:{x,y}}),'move');
 const target=match.gateAt(x,y);
 board.update(.4);
 assert.ok(target.health.current<GATE_SEGMENT_HEALTH,'gate takes real unit damage');
});

test('damage on one gate section opens only its four cells',()=>{
 const board=new Board(),match=new FlagMatch(board,{count:24});match.phase='battle';
 const x=KINGDOM_WALLS.B,target=match.gateAt(x,48);
 const other=match.gateAt(x,52);
 assert.equal(target.health.current,GATE_SEGMENT_HEALTH);
 assert.equal(match.gateAt(x,51).health,target.health);
 assert.notEqual(target.health,other.health);
 const previous=board.terrainRevision;
 assert.equal(board.damage(target.id,GATE_SEGMENT_HEALTH),true);
 assert.equal(target.health.current,0);
 assert.equal(match.gateAt(x,51).health.current,0);
 assert.equal(other.health.current,GATE_SEGMENT_HEALTH);
 assert.equal(match.gateBlocksSight('A',x,48),false);
 assert.equal(match.gateBlocksSight('A',x,52),true);
 assert.ok(board.terrainRevision>previous,'cached gate appearance invalidates');
});

test('woodland slows movement but remains walkable',()=>{
 const board=new Board(),match=new FlagMatch(board,{count:24});
 let grove=null;
 for(let y=0;y<100&&!grove;y++)for(let x=0;x<100;x++)
  if(board.terrain[y][x]==='grove'){grove={x,y};break;}
 assert.ok(grove);
 assert.equal(board.navigation.blocked(grove.y*100+grove.x),false);
 assert.ok(terrainStepMultiplier(board,grove,grove)>1);
 assert.equal(match.inTerritory('A',{x:26,y:50}),true);
 assert.equal(match.inTerritory('A',{x:27,y:50}),false);
 assert.equal(match.inTerritory('B',{x:72,y:50}),false);
 assert.equal(match.inTerritory('B',{x:73,y:50}),true);
});

test('normal movement exits an allied gate and breaches an opposing gate with repeated attacks',()=>{
 const friendlyBoard=new Board(),friendlyMatch=new FlagMatch(friendlyBoard,{count:24});
 friendlyMatch.phase='battle';
 const friendly=friendlyBoard.spawn(73,50,null,{team:'B'});
 assert.ok(friendlyBoard.move(friendly.id,70,50,{direct:true}));
 for(let i=0;i<400&&friendly.x>70;i++)friendlyBoard.update(.05);
 assert.equal(friendly.x,70,'allied gate must not block outward traffic');

 const board=new Board(),match=new FlagMatch(board,{count:24});
 match.phase='battle';
 const x=KINGDOM_WALLS.B,invader=board.spawn(x-1,50,null,{team:'A',stats:{damage:300,attackPeriod:.45}});
 assert.ok(board.move(invader.id,x+2,50,{direct:true}));
 for(let i=0;i<1000&&invader.x<x+2;i++)board.update(.05);
 assert.equal(match.gateAt(x,50).health.current,0,'repeated strikes destroy the obstacle');
 assert.equal(invader.x,x+2,'the marching unit must pass through the breached section');
});
