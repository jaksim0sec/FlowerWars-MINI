import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../src/model.mjs';
import {FlagMatch} from '../src/flag-match.mjs';
for(const team of ['A','B'])test(`clipped deployment ${team} accepts half, retains a commander and charges only actual troops`,()=>{
 const b=new Board(),m=new FlagMatch(b),anchor={x:team==='A'?20:80,y:20},bp=m.deploymentPreview(team,'defense'),sign=team==='A'?1:-1;
 const block=member=>{const x=anchor.x+member.offset.x*sign,y=anchor.y+member.offset.y;b.setObstacle(x,y,{blocked:true});};
 bp.members.slice(7).forEach(block);
 const preview=m.deploymentPreview(team,'defense',anchor);assert.equal(preview.members.length,7);
 const s=m.deploy(team,'defense',anchor);assert.equal(s.memberIds.length,7);assert.equal(m.reserve[team],m.limit-7);
 const units=s.memberIds.map(id=>b.unit(id));assert.equal(units.filter(u=>u.formationRole==='banner').length,1);
 assert.ok(units.every(u=>!b.navigation.blocked(u.y*b.width+u.x)&&m.inTerritory(team,u)));
});
test('less than half rejects atomically without spending reserves',()=>{
 const b=new Board(),m=new FlagMatch(b),anchor={x:20,y:20},bp=m.deploymentPreview('A','defense');
 bp.members.slice(6).forEach(member=>b.setObstacle(anchor.x+member.offset.x,anchor.y+member.offset.y,{blocked:true}));
 assert.equal(m.deploy('A','defense',anchor),null);assert.equal(m.reserve.A,m.limit);assert.equal(b.units.length,0);
});
