export const INTENTS=['HOLD','ADVANCE','BREAKTHROUGH','FLANK','COUNTERATTACK','DEFEND','REGROUP','CAPTURE'];
// Utility components are independent of operation stages and terrain lane counts.
export function evaluate(c,context){
 const {power,ratio,speed,homeDanger,reserve,current}=context;
 if(!Number.isFinite(c.travel)||c.travel>320||!c.node)return -Infinity;
 const superiority=(power+c.local.B*.35)/(c.local.A+1),risk=c.local.A/Math.max(1,power+c.local.B*.35);
 let score=c.progress*35+c.value-Math.min(2,superiority)*5-risk*12-c.travel/Math.max(1,speed)*.25-c.local.congestion*.15;
 if(c.intent==='HOLD')score=(reserve?34:-12)-c.travel*.3;
 if(c.intent==='ADVANCE')score+=8;
 if(c.intent==='BREAKTHROUGH')score+=Math.min(2,superiority)*9+(c.node.kind==='battle'?7:0);
 if(c.intent==='FLANK')score+=Math.min(3,superiority)*2+Math.min(10,c.exposure*6)-c.travel*.05;
 if(c.intent==='COUNTERATTACK')score+=c.exposure*12+(homeDanger?8:0);
 if(c.intent==='DEFEND')score+=(homeDanger?45: -35)+Math.min(25,c.local.A*2);
 if(c.intent==='REGROUP')score+=(ratio<.4?55: -32)+c.local.heal*3;
 if(c.intent==='CAPTURE')score+=c.local.A<power*.5?20:-15;
 if(reserve&&!homeDanger)score-=c.intent==='HOLD'?0:c.local.A>power*.3?5:20;
 if(current&&current.intent===c.intent&&current.nodeId===c.node.id)score+=10;
 return score;
}
