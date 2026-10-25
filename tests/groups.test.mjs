import test from 'node:test';import assert from 'node:assert/strict';import{Board}from'../src/model.mjs';
import{createFormationGroup,placeGroup,groupsFor}from'../src/unit-groups.mjs';
test('group blueprint is serializable and places all members with one shared identity',()=>{
 const b=new Board(30,30),blueprint=JSON.parse(JSON.stringify(createFormationGroup(16,'squad','제1분대')));
 const group=placeGroup(b,blueprint,{x:15,y:15},{team:'A',makeCharacter:()=>null});assert.equal(group.memberIds.length,16);assert.equal(group.name,'제1분대');assert.equal(groupsFor(b).size,1);
 for(const id of group.memberIds){const u=b.unit(id);assert.equal(u.groupId,group.id);assert.equal(u.team,'A');}
 assert.ok(blueprint.members.some(m=>m.characterId==='banner-bearer'));assert.ok(blueprint.members.filter(m=>m.characterId==='scout').length>=8);
});
test('invalid or blocked group placement is atomic and consumes no IDs',()=>{
 const b=new Board(15,15),plan=createFormationGroup(8);b.spawn(8,8);const n=b.nextId;
 assert.equal(placeGroup(b,plan,{x:8,y:8},{makeCharacter:()=>null}),null);assert.equal(b.units.length,1);assert.equal(b.nextId,n);assert.equal(groupsFor(b).size,0);
 assert.equal(placeGroup(b,plan,{x:0,y:0},{makeCharacter:()=>null}),null);assert.equal(b.nextId,n);
});
test('reset clears groups, independent groups retain separate compositions and mirrored deployment',()=>{
 const b=new Board(40,40),a=placeGroup(b,createFormationGroup(8),{x:10,y:10},{team:'A',makeCharacter:()=>null}),c=placeGroup(b,createFormationGroup(8,'platoon'),{x:25,y:10},{team:'B',makeCharacter:()=>null});assert.notEqual(a.id,c.id);
 for(let i=0;i<8;i++){const u=b.unit(a.memberIds[i]),v=b.unit(c.memberIds[i]);assert.equal(u.x-10,25-v.x);assert.equal(u.y,v.y);}
 b.reset();assert.equal(groupsFor(b).size,0);
});
import{setupMovementScenario}from'../src/movement-scenarios.mjs';
test('test armies are grouped into two battalions with platoons',()=>{const b=new Board(),s=setupMovementScenario(b,'formation',64,()=>null);assert.equal(s.groupIds.length,2);for(const id of s.groupIds){const group=groupsFor(b).get(id);assert.equal(group.kind,'battalion');assert.equal(group.memberIds.length,32);assert.equal(group.blueprint.members.length,32);assert.equal(group.platoons.length,1);assert.equal(group.platoons[0].squadIds.length,3);assert.ok(group.memberIds.every(uid=>b.unit(uid).groupId===id));}});
test('group template edits never mutate another group or future defaults',()=>{const a=createFormationGroup(16),b=createFormationGroup(16),part=a.members.find(m=>m.role==='autumn');part.stats.damage=999;assert.notEqual(b.members.find(m=>m.role==='autumn').stats.damage,999);assert.notEqual(createFormationGroup(16).members.find(m=>m.role==='autumn').stats.damage,999);});
test('serialized member settings are applied without a custom options factory',()=>{const b=new Board(30,30),plan=createFormationGroup(8);for(const m of plan.members){m.stats={maxHealth:150,damage:9,attackPeriod:1,range:3,rangeShape:'king'};m.movement={stepTime:.5};}const group=placeGroup(b,JSON.parse(JSON.stringify(plan)),{x:15,y:15});for(const id of group.memberIds){const u=b.unit(id);assert.equal(u.health.max,150);assert.equal(u.damage,9);assert.equal(u.combat.range,3);assert.equal(u.movement.stepTime,.5);}});
