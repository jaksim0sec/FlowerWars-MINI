import {presentationStats} from './presentation.mjs';
// Opt-in performance diagnosis. Disabled mode allocates no samples or DOM.
export function percentile(values,p=95){
 if(!values.length)return 0;
 const sorted=[...values].sort((a,b)=>a-b);
 return sorted[Math.min(sorted.length-1,Math.ceil(p/100*sorted.length)-1)];
}
export function createOnlinePerfHud({getSession,getUnits,enabled=false}){
 if(!enabled||typeof document==='undefined')return {enabled:false,frame(){},draw(){},stage(){},read(){return null;}};
 const hud=document.createElement('pre');hud.setAttribute('aria-label','Online performance diagnostics');
 Object.assign(hud.style,{position:'fixed',top:'4px',left:'4px',zIndex:'2147483647',background:'#091623e8',color:'#d4f7eb',padding:'8px',borderRadius:'6px',pointerEvents:'none',font:'11px/1.35 monospace',whiteSpace:'pre',maxWidth:'calc(100vw - 12px)'});
 document.body.append(hud);
 let last=0,reportAt=0,raf=[],draw=[],lastFrame=-1,packetGaps=[],lastPacketAt=0,apply=[],lastSendAt=0,hostSendGaps=[],stages=new Map(),reports=[];
 const p=values=>values.length?percentile(values).toFixed(1):'?';
 const add=(name,ms)=>{if(!Number.isFinite(ms)||ms<0)return;let values=stages.get(name);if(!values){values=[];stages.set(name,values);}values.push(ms);};
 return {
  enabled:true,
  frame(now){
   if(last&&now>last)raf.push(now-last);last=now;
   const s=getSession?.(),role=s?.identity?.role;
   if(role==='guest'&&Number.isSafeInteger(s.lastFrame)&&s.lastFrame>=0&&s.lastFrame!==lastFrame){
    lastFrame=s.lastFrame;if(lastPacketAt)packetGaps.push(now-lastPacketAt);lastPacketAt=now;
    if(Number.isFinite(s.lastFrameApplyMs))apply.push(s.lastFrameApplyMs);
   }
   if(role==='host'&&Number.isFinite(s.lastFrameSentAt)&&s.lastFrameSentAt!==lastSendAt){
    if(lastSendAt)hostSendGaps.push(s.lastFrameSentAt-lastSendAt);
    lastSendAt=s.lastFrameSentAt;
   }
   if(now-reportAt<1200)return;const windowMs=now-reportAt;reportAt=now;
   const mean=raf.length?raf.reduce((a,b)=>a+b,0)/raf.length:0;
   const age=role==='guest'&&Number.isFinite(s?.guestFrameAt)?Math.max(0,now-s.guestFrameAt):null;
   const parts=Object.fromEntries([...stages].map(([name,values])=>[name,{p95:percentile(values),max:Math.max(...values),count:values.length}]));
   const presentation=presentationStats(s?.state?.board);
   const summary={renderFps:draw.length*1000/windowMs,bufferMs:presentation?.bufferMs??null,presentationLagMs:presentation?.lagMs??null,skippedFrames:s?.skippedFrames||0,bufferedBytes:s?.peer?.channel?.bufferedAmount??0,role:role||'offline',units:getUnits?.()??null,rafP95:percentile(raf),canvasP95:percentile(draw),canvasMax:draw.length?Math.max(...draw):0,rxGapP95:packetGaps.length?percentile(packetGaps):null,txGapP95:hostSendGaps.length?percentile(hostSendGaps):null,frameAge:age,applyP95:apply.length?percentile(apply):null,parts};
   reports.push(summary);if(reports.length>120)reports.shift();
   hud.textContent='RAF '+(mean?(1000/mean).toFixed(0):'?')+'fps p95 '+p(raf)+'ms'+
    '\nCanvas p95 '+p(draw)+' max '+(draw.length?Math.max(...draw).toFixed(1):'?')+'ms'+
    '\nTerrain '+p(stages.get('terrain')||[])+'  Overlay '+p(stages.get('overlay')||[])+'ms'+
    '\nPrepare '+p(stages.get('prepare')||[])+'  Units '+p(stages.get('units')||[])+'ms'+
    '\nEffects '+p(stages.get('effects')||[])+'  Loop '+p(stages.get('loop')||[])+'ms'+
    '\nRX '+p(packetGaps)+'  TX '+p(hostSendGaps)+'  apply '+p(apply)+'ms'+
    '\nRender '+summary.renderFps.toFixed(0)+'fps buffer '+(summary.bufferMs?.toFixed(0)??'?')+'ms skip '+summary.skippedFrames+
    '\nFrame age '+(age==null?'?':age.toFixed(0))+'ms  Units '+(summary.units??'?')+' '+summary.role;
   raf=[];draw=[];packetGaps=[];hostSendGaps=[];apply=[];stages=new Map();
  },
  draw(ms){if(Number.isFinite(ms))draw.push(ms);},
  stage:add,
  read(){return {last:reports.at(-1)||null,reports:[...reports]};}
 };
}
