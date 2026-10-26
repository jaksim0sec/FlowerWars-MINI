// Editable strategy data. Recruitment asks for capabilities, never character IDs.
export const DOCTRINES=[
 {id:'envelopment',label:'양익 압박',ratios:{guard:.2,front:.4,breach:.2,mobile:.2},opening:['guard','front','mobile','breach','front'],weight:1,openingHold:0,frontCadence:3,gapHold:2,breachAhead:6},
 {id:'breakthrough',label:'일점 돌파',ratios:{guard:.2,front:.2,breach:.4,mobile:.2},opening:['guard','breach','mobile','front','breach'],weight:1,openingHold:0,frontCadence:2,gapHold:1.5,breachAhead:10},
 {id:'counterstroke',label:'방어 후 역습',ratios:{guard:.25,front:.4,breach:.15,mobile:.2},opening:['guard','front','mobile','front','breach'],weight:1,openingHold:8,frontCadence:4,gapHold:3,breachAhead:4}
];
export const NEEDS={
 screen:{tank:4,melee:1,fire:0,heal:0,speed:0},
 fire:{tank:0,melee:0,fire:6,heal:0,speed:0},
 strike:{tank:1,melee:3,fire:0,heal:0,speed:2},
 mobile:{tank:0,melee:2,fire:0,heal:0,speed:6},
 support:{tank:0,melee:0,fire:0,heal:10,speed:0}
};
export function createRecruitmentCatalog(blueprints,profiles={}){
 if(!Array.isArray(blueprints)||!blueprints.length)throw new Error('At least one squad blueprint is required');
 const ids=new Set();
 for(const blueprint of blueprints){
  if(!blueprint?.squadType||!Array.isArray(blueprint.members)||!blueprint.members.length||blueprint.members.length>12)throw new Error('Squad blueprints require a type and 1–12 members');
  if(ids.has(blueprint.squadType))throw new Error('Duplicate squad blueprint type');ids.add(blueprint.squadType);
 }
 return new Map(blueprints.map(blueprint=>{
  const features={tank:0,melee:0,fire:0,heal:0,speed:0};
  for(const member of blueprint.members){
   if(member.role==='banner')continue;
   const p=profiles[member.characterId]||{},stats=member.stats||p.testCombat||{},movement=member.movement||p.testMovement||{};
   const speedMultiplier=member.battle?.speedMultiplier||1;
   const healing=member.role==='healer'||member.capabilities?.includes('heal')||p.capabilities?.includes('heal')||stats.healAmount>0;
   features.heal+=healing?1:0;
   features.fire+=!healing&&(stats.range>1||member.role==='archer')?1:0;
   features.tank+=member.role==='guard'?1:Math.max(0,((stats.maxHealth||100)-110)/100);
   features.melee+=!healing&&!(stats.range>1||member.role==='archer')?1:0;
   features.speed+=movement.stepTime?Math.max(0,.42/movement.stepTime*speedMultiplier-1):member.role==='scout'?speedMultiplier:0;
  }
  const n=Math.max(1,blueprint.members.length-1);for(const key in features)features[key]/=n;
  return [blueprint.squadType,{blueprint,features}];
 }));
}
export function recruit(catalog,need){
 let selected=null,best=-Infinity;
 for(const [type,{features}]of catalog){
  const score=Object.entries(NEEDS[need]).reduce((n,[key,weight])=>n+features[key]*weight,0);
  if(score>best){selected=type;best=score;}
 }
 return selected;
}
