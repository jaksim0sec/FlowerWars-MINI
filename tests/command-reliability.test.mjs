import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
import {placeGroup,createFormationGroup,squadsFor} from '../src/unit-groups.mjs';
import * as orders from '../src/squad-orders.mjs';
const {orderSquad,updateSquadOrders}=orders;

function squadFixture(){
 const b=new Board(60,35);
 const g=placeGroup(b,createFormationGroup(8,'squad','기동대','mobile'),{x:12,y:15},{team:'A',makeCharacter:m=>({characterId:m.characterId})});
 return [b,squadsFor(b).get(g.squads[0])];
}
function run(b,seconds){for(let i=0;i<seconds/.05;i++){b.update(.05);updateSquadOrders(b);}}
function safe(b){
 const cells=new Set();
 for(const u of b.units.filter(u=>u.health.current>0)){
  const key=u.y*b.width+u.x;assert.ok(!cells.has(key));cells.add(key);assert.equal(b.cells.get(key),u.id);
  if(u.step){assert.equal(b.reservations.get(u.step.y*b.width+u.step.x),u.id);assert.ok(!b.occupied(u.step.x,u.step.y,u.id));}
 }
}
test('retreat replaces a squad move immediately while preserving its in-flight step',()=>{
 const [b,s]=squadFixture();orderSquad(b,s.id,'advance',{x:40,y:15});
 const u=s.memberIds.map(id=>b.unit(id)).find(u=>u.step),step=u.step;
 assert.ok(orderSquad(b,s.id,'retreat',{x:7,y:15}));
 assert.equal(u.step,step);assert.ok(u.command.x<15,'old advance must be replaced at issue time');
 run(b,12);safe(b);assert.ok(s.memberIds.every(id=>b.unit(id).x<15));
});
test('a new focus target replaces an active attack instead of retaining the old enemy',()=>{
 const [b,s]=squadFixture(),a=b.spawn(35,10,null,{team:'B'}),c=b.spawn(45,20,null,{team:'B'});
 orderSquad(b,s.id,'focus',{unitId:a.id});
 assert.ok(orderSquad(b,s.id,'focus',{unitId:c.id}));
 assert.ok(s.memberIds.filter(id=>id!==s.leaderId).every(id=>b.unit(id).command?.target===c.id));safe(b);
});
test('team movement survives damage even when moving without auto combat',()=>{
 const b=new Board(20,5),u=b.spawn(1,2,null,{team:'A'});
 b.move(u.id,17,2);b.damage(u.id,10);b.update(8);
 assert.equal(u.x,17);safe(b);
});
test('repeating the same order keeps its goals and current step',()=>{
 const [b,s]=squadFixture();orderSquad(b,s.id,'advance',{x:40,y:15});
 const order=s.order,u=b.unit(s.memberIds[0]),step=u.step;
 assert.ok(orderSquad(b,s.id,'advance',{x:40,y:15}));assert.equal(s.order,order);assert.equal(u.step,step);
});
test('stationary troops with an open bypass cannot permanently stall a move',()=>{
 const b=new Board(30,24),u=b.spawn(1,12);
 for(let y=1;y<23;y++)b.spawn(7,y);
 b.move(u.id,25,12);
 for(let i=0;i<1200;i++){b.update(.05);safe(b);assert.ok(b.navigation.stats.lastExpansions<=2048);}
 assert.deepEqual([u.x,u.y],[25,12]);
});
test('fortify assembles a line before holding positions',()=>{
 const [b,s]=squadFixture();const before=s.memberIds.map(id=>{const u=b.unit(id);return [u.x,u.y];});
 assert.ok(orderSquad(b,s.id,'fortify'));run(b,20);safe(b);
 assert.ok(s.memberIds.some((id,i)=>{const u=b.unit(id);return u.x!==before[i][0]||u.y!==before[i][1];}));
 assert.ok(s.memberIds.every(id=>!b.unit(id).command));assert.equal(s.order.type,'fortify');
});
test('flank travels laterally before approaching the target',()=>{
 const [b,s]=squadFixture();assert.ok(orderSquad(b,s.id,'flank',{x:42,y:15}));
 run(b,3);safe(b);
 const members=s.memberIds.map(id=>b.unit(id));
 assert.ok(members.some(u=>Math.abs(u.y-15)>=6),'a flank must actually leave the direct approach');
 assert.ok(members.every(u=>u.x<25),'lateral staging comes before the advance');
 run(b,35);assert.ok(members.every(u=>u.x>30));safe(b);
});
test('invalid targets leave the current order intact',()=>{
 const [b,s]=squadFixture();orderSquad(b,s.id,'move',{x:40,y:15});const old=s.order;
 for(const target of [{x:-1,y:2},{x:100,y:2},null])assert.equal(orderSquad(b,s.id,'move',target),false);
 assert.equal(s.order,old);
});
test('shared movement orders keep friendly squad destinations distinct',()=>{
 const [b,s]=squadFixture();
 const g=placeGroup(b,createFormationGroup(8,'squad','2분대','mobile'),{x:12,y:27},{team:'A',makeCharacter:m=>({characterId:m.characterId})});
 const second=squadsFor(b).get(g.squads[0]);
 assert.equal(typeof orders.orderSquads,'function');
 const result=orders.orderSquads(b,[s.id,second.id],'move',{x:42,y:18});assert.equal(result.accepted.length,2);
 const goals=[...s.order.goals.values(),...second.order.goals.values()];
 assert.equal(new Set(goals.map(p=>p.y*b.width+p.x)).size,16);
 run(b,45);safe(b);assert.equal(s.order.phase,'arrived');assert.equal(second.order.phase,'arrived');
});
test('following refreshes a moving ally goal while followers are still walking',()=>{
 const [b,s]=squadFixture();
 const g=placeGroup(b,createFormationGroup(8,'squad','선두','mobile'),{x:32,y:15},{team:'A',makeCharacter:m=>({characterId:m.characterId})});
 const ally=squadsFor(b).get(g.squads[0]),lead=b.unit(ally.leaderId);
 orderSquad(b,s.id,'follow',{squadId:ally.id});b.move(lead.id,45,15);b.update(.4);updateSquadOrders(b);
 assert.ok(s.memberIds.every(id=>{const u=b.unit(id),goal=s.order.goals.get(id);return !goal||u.command?.x===goal.x&&u.command?.y===goal.y;}));
});
test('a stationary newcomer on a final slot makes the formation choose a free slot',()=>{
 const [b,s]=squadFixture();orderSquad(b,s.id,'move',{x:42,y:15});
 const goal=s.order.goals.get(s.memberIds[0]);assert.ok(b.spawn(goal.x,goal.y,null,{team:'A'}));
 run(b,35);safe(b);assert.equal(s.order.phase,'arrived');
});
test('retreat interrupts an unlanded strike without releasing an ongoing step reservation',()=>{
 const [b,s]=squadFixture(),u=b.unit(s.leaderId),enemy=b.spawn(u.x+1,u.y,null,{team:'B'});
 assert.ok(b.attack(u.id,enemy.id));assert.equal(u.state,'attack');
 orderSquad(b,s.id,'retreat',{x:4,y:23});b.update(.4);assert.equal(enemy.hits,0);safe(b);
});
test('edge destinations leave access around the formation until every member arrives',()=>{
 for(const action of ['move','fortify'])for(const target of [{x:0,y:0},{x:59,y:34}]){
  const b=new Board(60,35),g=placeGroup(b,createFormationGroup(12,'squad','기동대','mobile'),{x:12,y:15},{team:'A',makeCharacter:m=>({characterId:m.characterId})}),s=squadsFor(b).get(g.squads[0]);
  orderSquad(b,s.id,action,target);run(b,70);safe(b);
  assert.ok(s.memberIds.every(id=>!b.unit(id).command),`${action} ${target.x},${target.y} must finish`);
 }
});
test('shared edge targets fit the full group before spreading squad anchors',()=>{
 const b=new Board(60,35),ss=[9,20,29].map(y=>{
  const g=placeGroup(b,createFormationGroup(8,'squad','기동대','mobile'),{x:12,y},{team:'A',makeCharacter:m=>({characterId:m.characterId})});
  return squadsFor(b).get(g.squads[0]);
 });
 orders.orderSquads(b,ss.map(s=>s.id),'move',{x:0,y:0});run(b,90);safe(b);
 assert.ok(ss.every(s=>s.order.phase==='arrived'));
});
