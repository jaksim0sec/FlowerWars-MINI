import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
test('unchanged held bottlenecks do not repeat failed searches and reopen immediately after movement',()=>{
 const b=new Board(40,25);for(let y=0;y<25;y++)if(y!==12)b.setObstacle(20,y,{blocked:true});
 const root=b.spawn(2,12,null,{team:'A'}),guard=b.spawn(20,12,null,{team:'A'});guard.combat.holdPosition=true;
 b.move(root.id,38,12,{direct:true});for(let i=0;i<400;i++)b.update(.05);
 const before=b.navigation.stats.expansions;for(let i=0;i<100;i++)b.update(.05);
 assert.ok(b.navigation.stats.expansions-before<64,'unchanged occupancy must reuse the failed-search result');
 guard.combat.holdPosition=false;b.move(guard.id,23,14,{replace:true,direct:true});
 for(let i=0;i<800&&root.x!==38;i++)b.update(.05);
 assert.equal(root.x,38);assert.equal(root.y,12);
});
