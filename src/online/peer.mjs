export const MAX_WIRE_BYTES=65536;
export const MAX_LARGE_BYTES=8*1024*1024;
export const MAX_CHUNK_PACKET_BYTES=16*1024;
const CHUNK_BYTES=12000;
const BUFFER_LIMIT=256*1024;
const BULK_BUFFER_LIMIT=32*1024;
const BYTE_RATE=2*1024*1024;
const BYTE_BURST=MAX_LARGE_BYTES+MAX_WIRE_BYTES;
const encoder=new TextEncoder();
const decoder=new TextDecoder('utf-8',{fatal:true});
function applicationMessage(value){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&KINDS.has(value.kind);}
function encodeChunk(bytes){let text='';for(const byte of bytes)text+=String.fromCharCode(byte);return btoa(text);}

const KINDS=new Set(['hello','checkpoint','recovery:request','recovery:state','state','command','frame','command:result','compressed','heartbeat','heartbeat:ack']);
export class PeerLink {
 constructor({role,epoch,signal,onOpen=()=>{},onMessage=()=>{},onFailure=()=>{},RTC=globalThis.RTCPeerConnection,transferTimeoutMs=30000}){Object.assign(this,{role,epoch,signal,onOpen,onMessage,onFailure,RTC,transferTimeoutMs});this.incoming=null;this.outgoing=null;this.nextTransferId=0;this.lastTransferId=0;this.receiveBudget={tokens:BYTE_BURST,at:Date.now()};this.sendBudget={tokens:BYTE_BURST,at:Date.now()};this.candidates=[];this.closed=false;this.failed=false;this.receivedAt=Date.now();this.windowAt=Date.now();this.messageCount=0;}
 async start(){try{this.pc=new this.RTC({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});this.pc.onicecandidate=e=>{if(e.candidate)this.signal({epoch:this.epoch,type:'candidate',candidate:e.candidate.toJSON()});};this.pc.onconnectionstatechange=()=>{if(['failed','disconnected'].includes(this.pc.connectionState))this.fail('P2P_DISCONNECTED');};this.pc.ondatachannel=e=>{if(this.role==='guest')this.bind(e.channel);};this.timeout=setTimeout(()=>this.fail('P2P_TIMEOUT'),20000);this.timeout.unref?.();
 if(this.role==='host'){this.bind(this.pc.createDataChannel('flowerwars-v1',{ordered:true}));const offer=await this.pc.createOffer();await this.pc.setLocalDescription(offer);this.signal({epoch:this.epoch,type:'offer',sdp:offer.sdp});}}catch{this.fail('P2P_UNAVAILABLE');}}
 bind(channel){this.channel=channel;channel.onopen=()=>{if(this.closed)return;clearTimeout(this.timeout);this.receivedAt=Date.now();this.heartbeat=setInterval(()=>{if(Date.now()-this.receivedAt>6000){this.fail('P2P_TIMEOUT');return;}this.send({kind:'heartbeat'});},2000);this.heartbeat.unref?.();this.onOpen();};channel.onclose=()=>this.fail('P2P_DISCONNECTED');channel.onerror=()=>this.fail('P2P_ERROR');channel.onmessage=e=>{
  if(this.closed)return;
  try {
   if(typeof e.data!=='string')throw Error();
   const bytes=encoder.encode(e.data).length;
   if(bytes>MAX_WIRE_BYTES)throw Error();
   const value=JSON.parse(e.data);
   if(value?.kind==='transfer:chunk'){
    if(bytes>MAX_CHUNK_PACKET_BYTES)throw Error();
    this.receiveChunk(value);
   }else {
    if(!this.consumeBytes(this.receiveBudget,bytes))throw Error();
    this.deliver(value,bytes);
   }
  }catch{this.fail('P2P_INVALID_MESSAGE');}
 };}
 async accept(signal){if(this.closed||signal.epoch!==this.epoch)return;try{if(signal.type==='candidate'){if(this.pc.remoteDescription)await this.pc.addIceCandidate(signal.candidate);else if(this.candidates.length<64)this.candidates.push(signal.candidate);return;}
 if(signal.type==='offer'&&this.role==='guest'){await this.pc.setRemoteDescription({type:'offer',sdp:signal.sdp});await this.flush();const answer=await this.pc.createAnswer();await this.pc.setLocalDescription(answer);this.signal({epoch:this.epoch,type:'answer',sdp:answer.sdp});}else if(signal.type==='answer'&&this.role==='host'){await this.pc.setRemoteDescription({type:'answer',sdp:signal.sdp});await this.flush();}}catch{this.fail('P2P_NEGOTIATION_FAILED');}}
 async flush(){for(const candidate of this.candidates)await this.pc.addIceCandidate(candidate);this.candidates.length=0;}
 // Ordinary gameplay keeps its synchronous boolean API and 60-message/s limit.
 send(value){
  if(this.closed||this.channel?.readyState!=='open'||this.channel.bufferedAmount>BUFFER_LIMIT)return false;
  let json;
  try{if(!applicationMessage(value))return false;json=JSON.stringify(value);if(encoder.encode(json).length>MAX_WIRE_BYTES)return false;}catch{return false;}
  try{this.channel.send(json);return true;}catch{this.fail('P2P_ERROR');return false;}
 }
 consumeBytes(budget,bytes){
  const now=Date.now();budget.tokens=Math.min(BYTE_BURST,budget.tokens+Math.max(0,now-budget.at)*BYTE_RATE/1000);budget.at=now;
  if(bytes>budget.tokens)return false;budget.tokens-=bytes;return true;
 }
 deliver(value,wireBytes=0){
  if(!applicationMessage(value))throw Error();
  if(value.kind==='compressed'&&(!Number.isSafeInteger(value.byteLength)||value.byteLength<1||value.byteLength>MAX_LARGE_BYTES||!this.consumeBytes(this.receiveBudget,Math.max(0,value.byteLength-wireBytes))))throw Error();
  const now=Date.now();
  if(now-this.windowAt>=1000){this.windowAt=now;this.messageCount=0;}
  if(++this.messageCount>60)throw Error();
  this.receivedAt=now;
  if(value.kind==='heartbeat'){this.send({kind:'heartbeat:ack'});return;}
  if(value.kind!=='heartbeat:ack')this.onMessage(value);
 }
 receiveChunk(value){
  const {id,index,total,count,data}=value;
  if(Object.keys(value).length!==6||!Number.isSafeInteger(id)||id<=this.lastTransferId||
   !Number.isSafeInteger(total)||total<1||total>MAX_LARGE_BYTES||
   !Number.isSafeInteger(count)||count!==Math.ceil(total/CHUNK_BYTES)||
   !Number.isSafeInteger(index)||index<0||index>=count||typeof data!=='string')throw Error();
  const expected=Math.min(CHUNK_BYTES,total-index*CHUNK_BYTES);
  if(data.length!==4*Math.ceil(expected/3))throw Error();
  const binary=atob(data);
  if(binary.length!==expected||btoa(binary)!==data)throw Error();
  if(this.incoming){
   if(this.incoming.id!==id||this.incoming.index!==index||this.incoming.total!==total||this.incoming.count!==count)throw Error();
  }else {
   if(index!==0)throw Error();
   this.incoming={id,total,count,index:0,bytes:new Uint8Array(total),timer:setTimeout(()=>this.fail('P2P_TRANSFER_TIMEOUT'),this.transferTimeoutMs)};
   this.incoming.timer.unref?.();
  }
  if(!this.consumeBytes(this.receiveBudget,expected))throw Error();
  const incoming=this.incoming;
  for(let i=0;i<binary.length;i++)incoming.bytes[index*CHUNK_BYTES+i]=binary.charCodeAt(i);
  incoming.index++;this.receivedAt=Date.now();
  if(incoming.index===count){
   clearTimeout(incoming.timer);this.incoming=null;this.lastTransferId=id;
   this.deliver(JSON.parse(decoder.decode(incoming.bytes)),incoming.total);
  }
 }
 // One active transfer, with no pending queue. Callers can skip newer live frames
 // while a durable checkpoint finishes. Success means queued to the RTC channel.
 async sendLarge(value){
  if(this.closed||this.outgoing||this.channel?.readyState!=='open')return false;
  let bytes;
  try{if(!applicationMessage(value))return false;bytes=encoder.encode(JSON.stringify(value));}catch{return false;}
  if(bytes.length>MAX_LARGE_BYTES)return false;
  if(bytes.length<=MAX_CHUNK_PACKET_BYTES)return this.send(value);
  const transfer={id:++this.nextTransferId,deadline:Date.now()+this.transferTimeoutMs,wake:null};
  this.outgoing=transfer;
  const count=Math.ceil(bytes.length/CHUNK_BYTES);
  try{
   for(let index=0;index<count;index++){
    const chunk=bytes.subarray(index*CHUNK_BYTES,Math.min(bytes.length,(index+1)*CHUNK_BYTES));
    if(!await this.waitWritable(transfer,chunk.length)||this.closed||this.channel?.readyState!=='open')return false;
    const packet=JSON.stringify({kind:'transfer:chunk',id:transfer.id,index,total:bytes.length,count,data:encodeChunk(chunk)});
    if(encoder.encode(packet).length>MAX_CHUNK_PACKET_BYTES)throw Error();
    this.channel.send(packet);
    if(index%4===3)await new Promise(resolve=>setTimeout(resolve,0));
   }
   return !this.closed;
  }catch{this.fail('P2P_ERROR');return false;}
  finally{if(this.outgoing===transfer)this.outgoing=null;}
 }
 async waitWritable(transfer,bytes){
  while(!this.closed&&this.channel?.readyState==='open'){
   if(Date.now()>=transfer.deadline){this.fail('P2P_TRANSFER_TIMEOUT');return false;}
   if(this.channel.bufferedAmount<=BULK_BUFFER_LIMIT-MAX_CHUNK_PACKET_BYTES&&this.consumeBytes(this.sendBudget,bytes))return true;
   await new Promise(resolve=>{
    // A short poll also works with channels lacking bufferedamountlow events.
    const timer=setTimeout(()=>{transfer.wake=null;resolve();},Math.min(10,Math.max(1,transfer.deadline-Date.now())));
    transfer.wake=()=>{clearTimeout(timer);transfer.wake=null;resolve();};
   });
  }
  return false;
 }

 fail(reason){if(this.closed||this.failed)return;this.failed=true;this.onFailure(reason);this.close();}
 close(){this.closed=true;if(this.incoming){clearTimeout(this.incoming.timer);this.incoming=null;}this.outgoing?.wake?.();clearTimeout(this.timeout);clearInterval(this.heartbeat);if(this.channel){this.channel.onclose=null;this.channel.close();}this.pc?.close();}
}
