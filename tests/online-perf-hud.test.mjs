import test from 'node:test';
import assert from 'node:assert/strict';
import {percentile,createOnlinePerfHud} from '../src/online/perf-hud.mjs';
test('performance percentiles select a bounded ordered sample',()=>{
 assert.equal(percentile([]),0);assert.equal(percentile([100,2,10,4],50),4);
 assert.equal(percentile([100,2,10,4],95),100);
});
test('disabled diagnostics are safe outside the browser',()=>{
 const hud=createOnlinePerfHud({enabled:false});assert.doesNotThrow(()=>{hud.frame(100);hud.draw(8);hud.stage('terrain',4);assert.equal(hud.read(),null);});
});

test('enabled HUD samples render sections and host transmission gaps',()=>{
 const prior=globalThis.document;
 const element={style:{},setAttribute(){},textContent:''};
 globalThis.document={createElement:()=>element,body:{append(){}}};
 try{
  const session={identity:{role:'host'},lastFrameSentAt:100};
  const hud=createOnlinePerfHud({enabled:true,getSession:()=>session,getUnits:()=>700});
  hud.frame(1200);hud.stage('terrain',9);hud.stage('units',17);
  session.lastFrameSentAt=350;hud.frame(1400);
  session.lastFrameSentAt=600;hud.frame(2450);
  const report=hud.read().last;
  assert.equal(report.units,700);
  assert.equal(report.parts.terrain.p95,9);
  assert.equal(report.parts.units.p95,17);
  assert.equal(report.txGapP95,250);
  assert.match(element.textContent,/Terrain 9/);
 }finally{if(prior===undefined)delete globalThis.document;else globalThis.document=prior;}
});
