import test from 'node:test';
import assert from 'node:assert/strict';
import {percentile,createOnlinePerfHud} from '../src/online/perf-hud.mjs';
test('performance percentiles select a bounded ordered sample',()=>{
 assert.equal(percentile([]),0);assert.equal(percentile([100,2,10,4],50),4);
 assert.equal(percentile([100,2,10,4],95),100);
});
test('disabled diagnostics are safe outside the browser',()=>{
 const hud=createOnlinePerfHud({enabled:false});assert.doesNotThrow(()=>{hud.frame(100);hud.draw(8);});
});
