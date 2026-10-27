import test from 'node:test';
import assert from 'node:assert/strict';
import {SearchQueue} from '../src/search-queue.mjs';
test('search priority preserves f, descending g, and FIFO ties across interleaved arrivals',()=>{
 const queue=new SearchQueue(),expected=[];let seed=17,id=0;
 const add=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;const node={cell:id++,f:seed%37/5,g:seed%11};queue.push(node);expected.push(node);};
 for(let i=0;i<4000;i++){
  add();if(i%3!==0){expected.sort((a,b)=>a.f-b.f||b.g-a.g);assert.equal(queue.pop(),expected.shift());}
  assert.equal(queue.length,expected.length);
 }
 expected.sort((a,b)=>a.f-b.f||b.g-a.g);
 for(const node of expected)assert.equal(queue.pop(),node);
 assert.equal(queue.pop(),undefined);
});
