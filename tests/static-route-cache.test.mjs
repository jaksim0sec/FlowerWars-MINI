import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
const solve=(b,u,x,y,key)=>{let path;for(let i=0;i<100;i++){path=b.navigation.staticRoute(u,x,y,key);if(path!==null)return path;b.navigation.refill();}assert.fail('search did not finish');};
test('identical static routes reuse work without sharing mutable guides and invalidate on terrain edits',()=>{
 const b=new Board(40,30);for(let y=0;y<26;y++)if(y!==15)b.setObstacle(20,y,{blocked:true});
 const actor=()=>({x:2,y:8,command:{type:'move',x:35,y:8}});
 const first=solve(b,actor(),35,8,'one'),before=b.navigation.stats.expansions,second=solve(b,actor(),35,8,'two');
 assert.deepEqual(second,first);assert.notEqual(second,first);assert.equal(b.navigation.stats.expansions,before,'cached static work must consume no new search budget');
 second.pop();assert.deepEqual(solve(b,actor(),35,8,'three'),first);
 const cell=first[Math.floor(first.length/2)];b.setObstacle(cell%40,Math.floor(cell/40),{blocked:true});
 const changed=solve(b,actor(),35,8,'four');assert.ok(changed);assert.ok(!changed.includes(cell));
});
test('static route caching preserves directional tie-breaking',()=>{
 const b=new Board(12,12);b.setObstacle(5,6,{blocked:true});
 const east=solve(b,{x:5,y:5,command:{x:9,y:8}},5,8,'east');
 const west=solve(b,{x:5,y:5,command:{x:1,y:8}},5,8,'west');
 assert.equal(east[0],5*12+6);assert.equal(west[0],5*12+4);
});
