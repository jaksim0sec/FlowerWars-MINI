import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
import {FlagMatch} from '../src/flag-match.mjs';
import {squadsFor} from '../src/unit-groups.mjs';
import {survey,deployment,attackLane} from '../src/bot-strategy.mjs';
import {deployReserves} from './deployment-helpers.mjs';
function prepared(b,options={}){
 const m=new FlagMatch(b,options);let i=0;
 deployReserves(m);assert.equal(m.reserve.A,0);
 while(m.reserve.B)assert.ok(m.deployBot());return m;
}
test('automatic armies obey the 350 cap and deploy inside their own kingdom',()=>{
 const b=new Board(),m=prepared(b,{count:900});assert.deepEqual(m.counts,{A:350,B:350});assert.equal(b.units.length,700);
 assert.ok(b.units.every(u=>m.inTerritory(u.team,u)));assert.equal(new Set(b.units.map(u=>u.y*b.width+u.x)).size,400);
 assert.equal(b.spawn(0,0,null,{team:'A'}),null);
});
test('small and uneven requested armies remain exact and timers transition once',()=>{
 for(const count of [1,13,24]){const b=new Board(),m=prepared(b,{count});assert.deepEqual(m.counts,{A:count,B:count});m.update(299);assert.equal(m.phase,'preparation');m.update(1);assert.equal(m.phase,'battle');assert.equal(m.start(),false);}
});
test('preparation rejects crossing, hostile orders and attacks; skip starts combat',()=>{
 const b=new Board(),m=prepared(b,{count:24}),a=b.units.find(u=>u.team==='A'),enemy=b.units.find(u=>u.team==='B');
 assert.equal(b.move(a.id,60,20),false);assert.equal(b.attack(a.id,enemy.id),false);assert.equal(m.canCommand('B','move',{x:70,y:20}),false);assert.equal(m.canCommand('A','move',{x:20,y:20}),true);
 m.start();assert.equal(m.phase,'battle');assert.ok(b.units.every(u=>u.combat.auto));m.update(.1);assert.ok(m.decisions>0);assert.ok(m.squadIds.B.some(id=>squadsFor(b).get(id).order));
});
test('touching flags does not win; destroying the opposing flag wins and freezes battle',()=>{
 const b=new Board(),m=prepared(b,{count:12}),a=b.units.find(u=>u.team==='A');m.start();
 a.visualX=m.flags.A.x;a.visualY=m.flags.A.y;m.refreshStatus();assert.equal(m.phase,'battle');
 a.visualX=m.flags.B.x;a.visualY=m.flags.B.y;m.refreshStatus();assert.equal(m.phase,'battle');
 b.damage(m.flags.B.id,m.flags.B.health.max);m.refreshStatus();assert.equal(m.winner,'A');assert.equal(m.phase,'finished');const t=b.time;b.update(1);assert.equal(b.time,t);
});
test('a dead soldier cannot win by arriving and simultaneous flag destruction draws fairly',()=>{
 const b=new Board(),m=prepared(b,{count:12}),a=b.units.find(u=>u.team==='A'),enemy=b.units.find(u=>u.team==='B');m.start();
 b.damage(a.id,10000);a.visualX=95;a.visualY=50;m.refreshStatus();assert.equal(m.phase,'battle');
 b.damage(m.flags.A.id,m.flags.A.health.max);b.damage(m.flags.B.id,m.flags.B.health.max);m.refreshStatus();assert.equal(m.winner,'draw');
});
test('reset invalidates the match without retaining capture state',()=>{
 const b=new Board(),m=new FlagMatch(b,{count:12});b.reset();m.update(400);assert.equal(b.match,null);assert.equal(b.units.length,0);assert.equal(b.movementPolicy,undefined);
});
test('both sides start empty and the bot places reserves without walking or rearranging',()=>{
 const b=new Board(),m=new FlagMatch(b,{count:72});assert.equal(b.units.length,0);assert.deepEqual(m.reserve,{A:72,B:72});
 for(let i=0;i<120;i++){b.update(.05);m.update(.05);}
 assert.equal(m.phase,'preparation');
 assert.equal(m.counts.B,72);assert.equal(m.counts.A,0);
 assert.ok(b.units.every(u=>!u.command&&!u.step));
 assert.ok(b.units.every(u=>m.inTerritory(u.team,u)));assert.equal(b.combatStats.hits,0);
});
test('manual placement spends reserves atomically and rejects overlaps and enemy territory',()=>{
 const b=new Board(),m=new FlagMatch(b,{count:48});assert.ok(m.deploy('A','defense',{x:20,y:20}));assert.equal(m.reserve.A,24);
 assert.equal(m.deploy('A','defense',{x:20,y:20}),null);assert.equal(m.deploy('A','mobile',{x:65,y:20}),null);assert.equal(m.reserve.A,24);
 assert.ok(m.deploy('A','ranged',{x:16,y:67}));assert.equal(m.reserve.A,0);assert.equal(b.units.length,48);assert.ok(b.units.every(u=>!u.step&&!u.command));
 m.start();assert.equal(m.deploy('A','mobile',{x:15,y:70}),null);
});
test('strategic deployment reacts to player concentration and separates combat roles',()=>{
 const b=new Board(100,100);for(let i=0;i<12;i++)b.spawn(25+i,15,null,{team:'A'});
 const top=survey(b,{x:95,y:50});assert.equal(top.strongest,0);assert.notEqual(top.weakest,0);
 const guard={type:'defense',matchIndex:0},mage={type:'support',matchIndex:5},mobile={type:'mobile',matchIndex:3};
 assert.ok(deployment(guard,top).x<deployment(mage,top).x,'frontline protects support');
 assert.ok(deployment(mobile,top).y>30,'mobile unit chooses the weaker flank');assert.ok(Number.isInteger(attackLane(mobile,top)));
 for(const u of b.units){u.y=80;u.visualY=80;}const bottom=survey(b,{x:95,y:50});
 assert.equal(bottom.strongest,2);assert.notDeepEqual(deployment(guard,top),deployment(guard,bottom));
});
