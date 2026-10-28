// Real squad orders and Board reservations on generated terrain, no custom mover.
// Fixtures are shared with the baseline, so invalid starting cells cannot bias it.
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import fs from 'node:fs';
const repo=resolve(import.meta.dirname,'..'),root=process.env.FLOWER_ROOT||repo;
const load=(name,base=root)=>import(pathToFileURL(base+'/src/'+name+'.mjs'));
const {Board}=await load('model'),{createBattlefield}=await load('battlefield-terrain');
const {createFormationGroup,placeGroup,squadsFor}=await load('unit-groups');
const {layoutDeployment}=await load('deployment-layout'),{orderSquad,updateSquadOrders}=await load('squad-orders');
const fixtureFile=process.env.FIXTURES||resolve(repo,'docs/measurements/autumn-traffic-fixtures.json'),seconds=Number(process.env.SECONDS||180);
if(process.argv.includes('--fixtures')){
 const {Board:OldBoard}=await load('model',process.env.BASELINE_ROOT),{createBattlefield:oldTerrain}=await load('battlefield-terrain',process.env.BASELINE_ROOT);
 const fixtures=[];
 for(const seed of [7,29,73])for(const scenario of ['main-350','flank-24','opposing-48','merge-96']){
  const b=new Board(176,128,{seed}),old=new OldBoard(176,128,{seed});createBattlefield(b);oldTerrain(old);
  const used=new Set(),destinations=new Set(),groups=[];
  const common=(x,y)=>b.inside(x,y)&&!b.navigation.blocked(y*176+x)&&!old.navigation.blocked(y*176+x);
  function anchor(bp,box,site,claimed){
   box=box.map((v,i)=>Math.round(v*(i%2?127/111:175/143)));site={x:site.x*175/143,y:site.y*127/111};
   const candidates=[];
   for(let y=box[1];y<=box[3];y++)for(let x=box[0];x<=box[2];x++)candidates.push({x,y});
   candidates.sort((a,c)=>Math.hypot(a.x-site.x,a.y-site.y)-Math.hypot(c.x-site.x,c.y-site.y)||a.y-c.y||a.x-c.x);
   // Main/merge destinations retain an access gap between neighboring squads.
   const margin=claimed===destinations&&['main-350','merge-96'].includes(scenario)?1:0;
   for(const a of candidates){
    const cells=bp.members.map(m=>({x:a.x+m.offset.x,y:a.y+m.offset.y}));
    if(!cells.every(p=>common(p.x,p.y)&&!claimed.has(p.y*176+p.x)))continue;
    for(const p of cells)for(let dy=-margin;dy<=margin;dy++)for(let dx=-margin;dx<=margin;dx++)claimed.add((p.y+dy)*176+p.x+dx);
    return a;
   }
   throw Error('fixture does not fit '+seed+' '+scenario+' '+JSON.stringify(box));
  }
  const batches=scenario==='main-350'?[{n:350,size:24,start:[7,30,29,81],end:[57,39,91,75],source:{x:25,y:55},target:{x:84,y:55},pass:'main'}]:
   scenario==='flank-24'?[{n:24,size:6,start:[34,12,60,34],end:[83,12,111,34],source:{x:45,y:19},target:{x:97,y:20},pass:'east'}]:
   scenario==='opposing-48'?[{n:24,size:6,start:[34,12,60,34],end:[83,12,111,34],source:{x:45,y:19},target:{x:97,y:20},pass:'east'},
    {n:24,size:6,start:[83,12,111,34],end:[34,12,60,34],source:{x:97,y:20},target:{x:45,y:19},pass:'west'}]:
   [{n:48,size:6,start:[20,12,70,38],end:[66,42,88,69],source:{x:59,y:20},target:{x:79,y:51},pass:'merge'},
    {n:48,size:6,start:[20,74,70,102],end:[66,42,88,69],source:{x:59,y:91},target:{x:79,y:62},pass:'merge'}];
  for(const batch of batches)for(let i=0;i<batch.n;i+=batch.size){
   const size=Math.min(batch.size,batch.n-i),type=batch.size===6?'assault':'mixed',bp=layoutDeployment(createFormationGroup(size,'squad','',type),size,'');
   const start=anchor(bp,batch.start,batch.source,used),target=anchor(bp,batch.end,batch.target,destinations);
   groups.push({size,type,start,target,pass:batch.pass});
  }
  fixtures.push({seed,scenario,groups});
 }
 fs.writeFileSync(fixtureFile,JSON.stringify(fixtures,null,2));console.log('fixtures',fixtures.length);process.exit(0);
}
const results=[];
for(const fixture of JSON.parse(fs.readFileSync(fixtureFile))){
 const expectedCount={'main-350':350,'flank-24':24,'opposing-48':48,'merge-96':96}[fixture.scenario];
 if(fixture.groups.reduce((n,g)=>n+g.size,0)!==expectedCount)throw Error('invalid fixture count');
 const b=new Board(176,128,{seed:fixture.seed});createBattlefield(b);const squads=[],passed=new Map(),waitStarts=new Map();
 for(const group of fixture.groups){
  const bp=layoutDeployment(createFormationGroup(group.size,'squad','',group.type),group.size,'');
  const placed=placeGroup(b,bp,group.start,{team:'A',autoCombat:false});if(!placed)throw Error('shared fixture rejected');
  squads.push({s:squadsFor(b).get(placed.squads[0]),...group});
 }
 for(const group of squads)if(!orderSquad(b,group.s.id,'move',group.target))throw Error('order rejected');
 let idleSeconds=0,maxWait=0,collisions=0,maxExpansions=0,firstPass=null,lastPass=null,completeAt=null;
 const costs=[],timelines=[];
 for(let frame=0;frame<seconds*20;frame++){
  const now=performance.now();b.update(.05);updateSquadOrders(b);costs.push(performance.now()-now);
  const owners=new Map();let arrived=0;
  for(const group of squads)for(const id of group.s.memberIds){
   const u=b.unit(id),goal=group.s.order?.goals.get(id),atGoal=goal&&!u.step&&u.x===goal.x&&u.y===goal.y;
   if(atGoal)arrived++;
   const cross=group.pass==='main'?u.x>=Math.round(55*175/143):group.pass==='east'?u.x>=Math.round(80*175/143):group.pass==='west'?u.x<=Math.round(64*175/143):u.x>=Math.round(66*175/143)&&u.y>=Math.round(39*127/111)&&u.y<=Math.round(73*127/111);
   if(cross&&!passed.has(id)){passed.set(id,b.time);firstPass??=b.time;lastPass=b.time;}
   if(!u.step&&!atGoal){idleSeconds+=.05;if(!waitStarts.has(id))waitStarts.set(id,b.time);maxWait=Math.max(maxWait,b.time-waitStarts.get(id));}else waitStarts.delete(id);
   for(const p of [u,...(u.step?[u.step]:[])]){const key=p.y*176+p.x;if(owners.has(key)&&owners.get(key)!==u.id)collisions++;owners.set(key,u.id);}
  }
  if(b.reservations.size!==b.units.filter(u=>u.step).length)collisions++;
  maxExpansions=Math.max(maxExpansions,b.navigation.stats.lastExpansions);
  if(arrived===b.units.length&&completeAt===null)completeAt=b.time;
  if((frame+1)%600===0)timelines.push({at:Math.round(b.time),passed:passed.size,arrived});
 }
 costs.sort((a,b)=>a-b);const passTimes=[...passed.values()].sort((a,b)=>a-b);
 results.push({seed:fixture.seed,scenario:fixture.scenario,count:b.units.length,seconds,passed:passed.size,arrived:timelines.at(-1)?.arrived??squads.reduce((n,g)=>n+g.s.memberIds.filter(id=>{const u=b.unit(id),p=g.s.order?.goals.get(id);return p&&!u.step&&u.x===p.x&&u.y===p.y;}).length,0),completeAt,
  firstPass,lastPass,passP95:passTimes.length?passTimes[Math.floor(passTimes.length*.95)]:null,idleSeconds:+idleSeconds.toFixed(2),maxWait:+maxWait.toFixed(2),
  cpuMs:+costs.reduce((a,b)=>a+b,0).toFixed(2),updateP95ms:+costs[Math.floor(costs.length*.95)].toFixed(4),expansions:b.navigation.stats.expansions,maxTickExpansions:maxExpansions,collisions,timelines});
}
if(results.some(r=>r.collisions||r.maxTickExpansions>2048||r.passed!==r.count||r.scenario!=='main-350'&&r.arrived!==r.count))throw Error('traffic passage, collision, arrival or search budget regression');
console.log(JSON.stringify(results,null,2));
