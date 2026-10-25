import test from 'node:test';
import assert from 'node:assert/strict';
import {Board,STEP_TIME} from '../src/model.mjs';

function safe(board) {
  const owners=new Map();
  for(const u of board.units.filter(u=>u.health.current>0)) {
    for(const p of [{x:u.x,y:u.y},...(u.step?[u.step]:[])]) {
      const key=`${p.x},${p.y}`;
      assert.ok(!owners.has(key)||owners.get(key)===u.id,`collision ${key}: ${owners.get(key)} / ${u.id}`);
      owners.set(key,u.id);
    }
  }
}
function run(b,seconds=20){for(let i=0;i<seconds*50;i++){b.update(.02);safe(b);}}

test('independent units move concurrently and only reserve their immediate step',()=>{
 const b=new Board(8,4),a=b.spawn(0,0),c=b.spawn(0,3);
 assert.equal(b.move(a.id,7,0),true);assert.equal(b.move(c.id,7,3),true);
 assert.ok(b.spawn(5,0),'a future route cell is not reserved');
 b.update(.1);assert.ok(Math.abs(a.visualX-a.x)+Math.abs(a.visualY-a.y)>0&&Math.abs(c.visualX-c.x)+Math.abs(c.visualY-c.y)>0);safe(b);
 run(b);assert.equal(c.x,7);assert.equal(a.x,7);
});
test('crossing and opposite traffic detour without cell sharing or edge swaps',()=>{
 const b=new Board(9,7),commands=[];
 for(let y=1;y<6;y++){commands.push([b.spawn(0,y),8,y]);commands.push([b.spawn(8,y),0,y]);}
 for(const[u,x,y]of commands)assert.ok(b.move(u.id,x,y));
 run(b,35);for(const[u,x,y]of commands)assert.deepEqual([u.x,u.y],[x,y]);
});
test('one-cell bottleneck queues then drains to distinct destinations',()=>{
 const b=new Board(10,9);for(let y=0;y<9;y++)if(y!==4)b.setObstacle(4,y,{kind:'wall',blocked:true,attackable:true});
 const commands=[];for(let y=1;y<8;y++)commands.push([b.spawn(1,y),8,y]);
 for(const[u,x,y]of commands)b.move(u.id,x,y);
 run(b,45);for(const[u,x,y]of commands)assert.deepEqual([u.x,u.y],[x,y]);
});
test('blocked moving goal waits, retries after clearance, and unreachable static goal is rejected',()=>{
 const b=new Board(7,1),a=b.spawn(0,0),c=b.spawn(3,0);assert.ok(b.move(a.id,6,0));
 run(b,2);assert.ok(a.command);assert.equal(a.state,'idle');assert.ok(a.waitReason);
 b.damage(c.id,100);run(b,5);assert.equal(a.x,6);
 const d=new Board(5,3),u=d.spawn(0,1);for(let y=0;y<3;y++)d.setObstacle(2,y,{blocked:true});
 assert.equal(d.move(u.id,4,1),false);
});
test('moving targets are chased to a currently adjacent cell and hit only if still in reach',()=>{
 const b=new Board(12,4),a=b.spawn(0,1),c=b.spawn(5,1);
 assert.ok(b.attack(a.id,c.id));assert.ok(b.move(c.id,10,1));run(b,10);
 assert.equal(c.health.current,75);assert.equal(c.hits,1);assert.equal(a.command,null);
});
test('hits finish a survivor step safely, death releases reservations, new obstacles invalidate routes',()=>{
 const b=new Board(8,3),a=b.spawn(0,1),c=b.spawn(0,2);
 b.move(a.id,7,1);b.move(c.id,7,2);b.update(.1);b.damage(a.id,25);safe(b);
 run(b,1);assert.equal(a.x,1);assert.equal(a.visualX,1);assert.equal(a.command,null);
 assert.ok(b.setObstacle(5,2,{blocked:true,kind:'wall'}));run(b,8);assert.equal(c.x,7);
 b.move(a.id,6,1);b.update(.1);b.damage(a.id,100);assert.equal(a.step,null);run(b,3);assert.equal(b.unit(a.id),undefined);
});
test('step hooks can wait/cancel and arrival hooks observe completed steps',()=>{
 const b=new Board(5,2),u=b.spawn(0,0);let allow=false,arrivals=0;
 b.movementPolicy={beforeStep:()=>allow?'move':'wait',onArrive:()=>arrivals++};
 assert.ok(b.move(u.id,4,0));run(b,1);assert.equal(u.x,0);
 allow=true;run(b,5);assert.equal(u.x,4);assert.equal(arrivals,4);
});
test('bounded search shares fields and idle/waiting agents do not launch a BFS every frame',()=>{
 const b=new Board(60,60);b.setObstacle(30,0,{blocked:true});for(let y=0;y<30;y++){const u=b.spawn(0,y);b.move(u.id,59,59);}
 for(let i=0;i<100;i++){b.update(.02);safe(b);assert.ok(b.navigation.stats.lastExpansions<=2048);}
 assert.ok(b.navigation.stats.fieldBuilds<=2);assert.ok(b.navigation.stats.cacheHits>0);
 const fields=b.navigation.stats.fieldBuilds;for(let i=0;i<100;i++)b.update(.02);assert.equal(b.navigation.stats.fieldBuilds,fields);
});
test('many distinct destinations continue progressing past the bounded field cache',()=>{
 const b=new Board(24,24),commands=[];for(let y=0;y<20;y++)commands.push([b.spawn(0,y),23,y]);
 for(const[u,x,y]of commands)b.move(u.id,x,y);run(b,40);
 for(const[u,x,y]of commands)assert.deepEqual([u.x,u.y],[x,y]);
 assert.ok(b.navigation.fields.size<=64);
});
test('step timing remains exact and simulation does not depend on a renderer',()=>{
 const b=new Board(),u=b.spawn(0,0);b.move(u.id,1,0);b.update(STEP_TIME);assert.equal(u.x,1);assert.equal(u.state,'idle');
});
test('opposing units use a passing bay and a sealed lane waits without oscillation',()=>{
 const b=new Board(7,3);for(let x=0;x<7;x++){b.setObstacle(x,0,{blocked:true});if(x!==3)b.setObstacle(x,2,{blocked:true});}
 const a=b.spawn(1,1),c=b.spawn(5,1);b.move(a.id,5,1);b.move(c.id,1,1);run(b,25);
 assert.deepEqual([a.x,a.y,c.x,c.y],[5,1,1,1]);
 const d=new Board(5,1),v=d.spawn(0,0),w=d.spawn(4,0);d.move(v.id,4,0);d.move(w.id,0,0);run(d,10);
 assert.ok(v.command&&w.command);assert.ok(v.waitReason&&w.waitReason);safe(d);
});
test('many obstacle routes keep compact guides instead of rebuilding evicted fields every step',()=>{
 const b=new Board(40,25);b.setObstacle(20,24,{blocked:true});const units=[];
 for(let y=0;y<20;y++)for(let x=0;x<4;x++){const u=b.spawn(x,y);units.push(u);}
 for(const u of units)b.move(u.id,39-u.x,u.y);
 run(b,20);assert.ok(b.navigation.stats.fieldBuilds<=100,`repeated BFS builds: ${b.navigation.stats.fieldBuilds}`);
 assert.ok(units.filter(u=>u.x>20).length>40);
});
test('large opposing streams keep passing lanes instead of permanent gridlock',()=>{
 const b=new Board(50,34),commands=[];
 for(let y=1;y<32;y+=2)for(let x=1;x<10;x+=2){commands.push([b.spawn(x,y),49-x,y]);commands.push([b.spawn(49-x,y),x,y]);}
 for(const[u,x,y]of commands)b.move(u.id,x,y);
 run(b,65);assert.equal(commands.filter(([u,x,y])=>u.x===x&&u.y===y).length,commands.length);
});
test('an isolated long move follows a shortest route without a traffic lane detour',()=>{
 const b=new Board(12,10),u=b.spawn(0,3);b.move(u.id,10,3);b.update(.1);
 assert.ok(u.visualX>0);assert.equal(u.visualY,3);run(b,4);assert.equal(u.x,10);
});
test('a conditional action killing or canceling the actor cannot reserve another step',()=>{
 for(const action of ['death','cancel']){
  const b=new Board(6,3),u=b.spawn(0,1);
  b.movementPolicy={beforeStep:()=>{if(action==='death')b.damage(u.id,100);else b.cancelCommand(u);return 'move';}};
  b.move(u.id,5,1);assert.equal(u.step,null);assert.equal(b.reservations.size,0);
  assert.equal(u.state,action==='death'?'death':'idle');
 }
});
test('step condition inputs cannot mutate the actual reserved destination',()=>{
 const b=new Board(5,3),u=b.spawn(0,1);
 b.movementPolicy={beforeStep:({to})=>{to.x=99;to.y=-5;return 'move';}};
 b.move(u.id,4,1);assert.deepEqual([u.step.x,u.step.y],[1,1]);run(b,4);assert.equal(u.x,4);
});
