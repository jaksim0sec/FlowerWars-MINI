// Opt-in mobile performance diagnosis: append ?perf=1 to the battlefield URL.
// RAF measures browser responsiveness, draw measures Canvas cost, frame age measures network freshness.
export function percentile(values,p=95){
 if(!values.length)return 0;
 const sorted=[...values].sort((a,b)=>a-b);
 return sorted[Math.min(sorted.length-1,Math.ceil(p/100*sorted.length)-1)];
}
export function createOnlinePerfHud({getSession,getUnits,enabled=false}){
 if(!enabled||typeof document==='undefined')return {frame(){},draw(){}};
 const hud=document.createElement('pre');hud.setAttribute('aria-label','Online performance diagnostics');
 Object.assign(hud.style,{position:'fixed',top:'4px',left:'4px',zIndex:'2147483647',background:'#091623e8',color:'#d4f7eb',padding:'8px',borderRadius:'6px',pointerEvents:'none',font:'12px/1.35 monospace',whiteSpace:'pre',maxWidth:'calc(100vw - 12px)'});
 document.body.append(hud);
 let last=0,reportAt=0,raf=[],draw=[],lastFrame=-1,packetGaps=[],lastPacketAt=0;
 return {
  frame(now){
   if(last&&now>last)raf.push(now-last);last=now;
   const s=getSession?.();
   if(s?.identity?.role==='guest'&&Number.isSafeInteger(s.lastFrame)&&s.lastFrame>=0&&s.lastFrame!==lastFrame){
    lastFrame=s.lastFrame;if(lastPacketAt)packetGaps.push(now-lastPacketAt);lastPacketAt=now;
   }
   if(now-reportAt<1200)return;reportAt=now;
   const mean=raf.length?raf.reduce((a,b)=>a+b,0)/raf.length:0;
   const age=s?.identity?.role==='guest'&&Number.isFinite(s?.guestFrameAt)?Math.max(0,now-s.guestFrameAt):null;
   hud.textContent='RAF '+(mean?(1000/mean).toFixed(0):'?')+'fps  p95 '+percentile(raf).toFixed(0)+'ms'+
    '\nCanvas p95 '+percentile(draw).toFixed(1)+'ms  max '+(draw.length?Math.max(...draw):0).toFixed(1)+'ms'+
    '\nNet p95 '+(packetGaps.length?percentile(packetGaps).toFixed(0):'?')+'ms  age '+(age==null?'?':age.toFixed(0))+'ms'+
    '\nUnits '+(getUnits?.()??'?')+'  '+(s?.identity?.role||'offline');
   raf=[];draw=[];packetGaps=[];
  },
  draw(ms){if(Number.isFinite(ms))draw.push(ms);}
 };
}
