import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
test('healers finish their move instead of repeatedly casting on wounded rear troops',()=>{
 const b=new Board(30,20),h=b.spawn(5,5,{characterId:'clover-mage'},{team:'A'}),w=b.spawn(5,6,null,{team:'A',stats:{maxHealth:1000}});
 w.health.current=1;b.move(h.id,12,5,{direct:true});
 for(let i=0;i<120;i++)b.update(.05);
 assert.equal(h.x,12);assert.equal(h.y,5);
 const patient=b.spawn(12,6,null,{team:'A'});patient.health.current=1;
 for(let i=0;i<30;i++)b.update(.05);
 assert.ok(patient.health.current>1,'healing resumes after catching up');
});
