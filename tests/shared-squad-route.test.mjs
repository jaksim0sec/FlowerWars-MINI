import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
import {createFormationGroup,placeGroup,squadsFor} from '../src/unit-groups.mjs';
import {orderSquad,updateSquadOrders} from '../src/squad-orders.mjs';
test('a squad shares its long static route, compresses through a gate, and restores its translated seats',()=>{
 const b=new Board(80,60);for(let y=0;y<60;y++)if(y<28||y>30)b.setObstacle(38,y,{blocked:true});
 const g=placeGroup(b,createFormationGroup(14,'squad','','defense'),{x:15,y:30},{team:'A'}),s=squadsFor(b).get(g.squads[0]);
 orderSquad(b,s.id,'move',{x:65,y:30});
 for(let i=0;i<3000&&s.order.phase!=='arrived';i++){b.update(.05);updateSquadOrders(b);assert.ok(b.navigation.stats.lastExpansions<=2048);}
 assert.equal(s.order.phase,'arrived');assert.equal(b.navigation.stats.sharedBuilds,1);
 assert.ok(b.navigation.stats.sharedHits>=10);
 for(const [id,p]of s.order.goals){const u=b.unit(id);assert.deepEqual([u.x,u.y],[p.x,p.y]);}
});
