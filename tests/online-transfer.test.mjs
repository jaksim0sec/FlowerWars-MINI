import test from 'node:test';
import assert from 'node:assert/strict';
import {PeerLink} from '../src/online/peer.mjs';

const MAX_BYTES=8*1024*1024;
const CHUNK_BYTES=12000;
function makeLink(options={}) {
 const messages=[],errors=[],sent=[];
 const channel={readyState:'open',bufferedAmount:0,send(data){sent.push(data);this.other?.onmessage?.({data});},close(){this.readyState='closed';}};
 const link=new PeerLink({role:'host',epoch:1,signal(){},onMessage:value=>messages.push(value),onFailure:value=>errors.push(value),...options});
 link.bind(channel);
 return {link,channel,messages,errors,sent};
}
function pair(options={}) {const a=makeLink(options),b=makeLink(options);a.channel.other=b.channel;b.channel.other=a.channel;return {a,b,close(){a.link.close();b.link.close();}};}
function packet({id=1,index=0,total=2,count=1,data=Buffer.from('{}').toString('base64')}={}) {return JSON.stringify({kind:'transfer:chunk',id,index,total,count,data});}
function receive(peer,data){peer.channel.onmessage({data});}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('sendLarge carries a maximum-size UTF8 JSON value exactly once using bounded packets',async()=>{
 const peers=pair();try {
  const value={kind:'checkpoint',state:'🌸'.repeat(Math.floor((MAX_BYTES-100)/4))};
  value.state+='x'.repeat(MAX_BYTES-Buffer.byteLength(JSON.stringify(value)));
  assert.equal(Buffer.byteLength(JSON.stringify(value)),MAX_BYTES);
  assert.equal(await peers.a.link.sendLarge(value),true);
  assert.deepEqual(peers.b.messages,[value]);
  assert.ok(peers.a.sent.length>60);
  assert.ok(peers.a.sent.every(data=>Buffer.byteLength(data)<=16*1024));
  assert.deepEqual(peers.b.errors,[]);
 } finally {peers.close();}
});
test('frame and command results retain the small synchronous send API',()=>{
 const peers=pair();try {for(const kind of ['frame','command:result'])assert.equal(peers.a.link.send({kind,value:1}),true);assert.equal(peers.b.messages.length,2);}finally{peers.close();}
});
test('sendLarge rejects oversized, invalid, cyclic and concurrent values without queuing',async()=>{
 const peer=makeLink();try {
  assert.equal(await peer.link.sendLarge({kind:'checkpoint',data:'x'.repeat(MAX_BYTES)}),false);
  assert.equal(await peer.link.sendLarge({kind:'unknown'}),false);
  const cyclic={kind:'checkpoint'};cyclic.self=cyclic;
  assert.equal(await peer.link.sendLarge(cyclic),false);
  peer.channel.bufferedAmount=300000;
  const active=peer.link.sendLarge({kind:'checkpoint',data:'x'.repeat(70000)});
  assert.equal(await peer.link.sendLarge({kind:'frame',data:'x'.repeat(70000)}),false);
  peer.link.close();assert.equal(await active,false);
  assert.equal(peer.sent.length,0);
 } finally {peer.link.close();}
});
test('sendLarge pauses at channel backpressure and resumes after the buffer drains',async()=>{
 const peers=pair();try {
  peers.a.channel.bufferedAmount=300000;
  const pending=peers.a.link.sendLarge({kind:'checkpoint',data:'x'.repeat(70000)});
  await delay(20);assert.equal(peers.a.sent.length,0);
  peers.a.channel.bufferedAmount=0;
  assert.equal(await pending,true);assert.equal(peers.b.messages.length,1);
 } finally {peers.close();}
});
test('an outgoing transfer times out and releases its pending promise',async()=>{
 const peer=makeLink({transferTimeoutMs:25});try {
  peer.channel.bufferedAmount=300000;
  assert.equal(await peer.link.sendLarge({kind:'checkpoint',data:'x'.repeat(70000)}),false);
  assert.deepEqual(peer.errors,['P2P_TRANSFER_TIMEOUT']);
 }finally{peer.link.close();}
});
test('an incomplete incoming transfer times out without delivering partial state',async()=>{
 const peer=makeLink({transferTimeoutMs:25});try {
  receive(peer,packet({total:CHUNK_BYTES+1,count:2,data:Buffer.alloc(CHUNK_BYTES,32).toString('base64')}));
  await delay(40);assert.deepEqual(peer.messages,[]);assert.deepEqual(peer.errors,['P2P_TRANSFER_TIMEOUT']);
 }finally{peer.link.close();}
});
test('chunk envelopes reject malformed, oversized and mismatched metadata',()=>{
 const cases=[{id:0},{id:'1'},{id:1.1},{index:1},{total:MAX_BYTES+1},{count:2},{total:0},{data:'???'},{data:'e30='+'='},{total:3},{extra:true}];
 for(const changes of cases){const peer=makeLink();try {receive(peer,JSON.stringify({...JSON.parse(packet()),...changes}));assert.equal(peer.errors[0],'P2P_INVALID_MESSAGE',JSON.stringify(changes));assert.deepEqual(peer.messages,[]);}finally{peer.link.close();}}
});
test('reassembly applies application kind validation and never delivers nested envelopes',()=>{
 for(const value of [{kind:'unknown'},{kind:'transfer:chunk'},[],null,{kind:'heartbeat',data:1}]){
  const peer=makeLink();try {
   const body=JSON.stringify(value);
   receive(peer,packet({total:Buffer.byteLength(body),data:Buffer.from(body).toString('base64')}));
   assert.deepEqual(peer.messages,[]);
   if(value?.kind!=='heartbeat')assert.deepEqual(peer.errors,['P2P_INVALID_MESSAGE']);
  }finally{peer.link.close();}
 }
});
test('duplicate, stale, overlapping and nonsequential chunks are rejected',()=>{
 for(const variant of ['duplicate','stale','overlap','out-of-order']){
  const peer=makeLink();try {
   if(variant==='stale'){const body=JSON.stringify({kind:'checkpoint'});const data=packet({total:body.length,data:Buffer.from(body).toString('base64')});receive(peer,data);receive(peer,data);assert.equal(peer.messages.length,1);}
   else {const first={total:CHUNK_BYTES*3,count:3,data:Buffer.alloc(CHUNK_BYTES,32).toString('base64')};receive(peer,packet(first));receive(peer,packet({...first,...(variant==='overlap'?{id:2}:variant==='out-of-order'?{index:2}:{})}));assert.equal(peer.messages.length,0);}
   assert.deepEqual(peer.errors,['P2P_INVALID_MESSAGE']);
  }finally{peer.link.close();}
 }
});
test('ordinary gameplay still enforces its message flood limit',()=>{
 const peer=makeLink();try {for(let i=0;i<61;i++)receive(peer,JSON.stringify({kind:'command'}));assert.equal(peer.messages.length,60);assert.deepEqual(peer.errors,['P2P_INVALID_MESSAGE']);}finally{peer.link.close();}
});
test('closing immediately after sendLarge prevents even an already-writable packet',async()=>{
 const peer=makeLink();
 const pending=peer.link.sendLarge({kind:'checkpoint',data:'x'.repeat(70000)});
 peer.link.close();assert.equal(await pending,false);assert.equal(peer.sent.length,0);
});
test('mid-transfer backpressure holds the sender below its channel buffer bound',async()=>{
 const peers=pair();try {
  const send=peers.a.channel.send;
  peers.a.channel.send=function(data){send.call(this,data);this.bufferedAmount+=Buffer.byteLength(data);};
  const pending=peers.a.link.sendLarge({kind:'checkpoint',data:'x'.repeat(400000)});
  await delay(20);
  assert.ok(peers.a.sent.length>0);assert.equal(peers.b.messages.length,0);
  assert.ok(peers.a.channel.bufferedAmount<=256*1024);
  const paused=peers.a.sent.length;await delay(20);assert.equal(peers.a.sent.length,paused);
  const drain=setInterval(()=>{peers.a.channel.bufferedAmount=0;},5);
  try{assert.equal(await pending,true);assert.equal(peers.b.messages.length,1);}finally{clearInterval(drain);}
 }finally{peers.close();}
});
test('received bulk bytes cannot exceed the bounded burst budget',t=>{
 const peer=makeLink();t.mock.timers.enable({apis:['Date'],now:1700000000000});
 try {
  const body=Buffer.from(JSON.stringify({kind:'checkpoint',data:'x'.repeat(MAX_BYTES-100)}));
  const count=Math.ceil(body.length/CHUNK_BYTES);
  for(let id=1;id<=2&&!peer.link.closed;id++)for(let index=0;index<count&&!peer.link.closed;index++){
   receive(peer,packet({id,index,total:body.length,count,data:body.subarray(index*CHUNK_BYTES,(index+1)*CHUNK_BYTES).toString('base64')}));
  }
  assert.deepEqual(peer.errors,['P2P_INVALID_MESSAGE']);assert.equal(peer.messages.length,1);
 }finally{peer.link.close();t.mock.timers.reset();}
});
test('chunks reject invalid UTF8, malformed JSON and a changed count within a transfer',()=>{
 for(const bytes of [Buffer.from([0xff,0xfe]),Buffer.from('[] broken')]){
  const peer=makeLink();try {receive(peer,packet({total:bytes.length,data:bytes.toString('base64')}));assert.deepEqual(peer.errors,['P2P_INVALID_MESSAGE']);assert.deepEqual(peer.messages,[]);}finally{peer.link.close();}
 }
 const peer=makeLink();try {
  const first={total:CHUNK_BYTES*2,count:2,data:Buffer.alloc(CHUNK_BYTES,32).toString('base64')};
  receive(peer,packet(first));receive(peer,packet({...first,index:1,total:CHUNK_BYTES*3,count:3}));
  assert.deepEqual(peer.errors,['P2P_INVALID_MESSAGE']);assert.deepEqual(peer.messages,[]);
 }finally{peer.link.close();}
});
test('sendLarge also chunks medium messages to stay below the 16KiB packet limit',async()=>{
 const peers=pair();try {
  const value={kind:'checkpoint',data:'x'.repeat(30000)};
  assert.equal(await peers.a.link.sendLarge(value),true);
  assert.deepEqual(peers.b.messages,[value]);
  assert.ok(peers.a.sent.every(data=>Buffer.byteLength(data)<=16*1024));
 }finally{peers.close();}
});
test('small gameplay frames interleave with an active durable transfer',async()=>{
 const peers=pair();try {
  const pending=peers.a.link.sendLarge({kind:'checkpoint',data:'x'.repeat(70000)});
  assert.equal(peers.a.link.send({kind:'frame',seq:1}),true);
  assert.equal(await pending,true);
  assert.deepEqual(peers.b.messages.map(value=>value.kind),['frame','checkpoint']);
 }finally{peers.close();}
});
test('compressed envelopes charge advertised expansion before queuing any decompression work',()=>{const p=makeLink();try{const value=JSON.stringify({kind:'compressed',encoding:'gzip',byteLength:MAX_BYTES,data:'eA=='});receive(p,value);assert.equal(p.messages.length,1);receive(p,value);assert.equal(p.messages.length,1);assert.equal(p.link.closed,true);assert.deepEqual(p.errors,['P2P_INVALID_MESSAGE']);}finally{p.link.close();}});
test('a large valid compressed envelope is charged once up to its expanded size, not wire plus expansion',async()=>{const {randomBytes}=await import('node:crypto'),{packMessage}=await import('../src/online/wire-codec.mjs'),peers=pair();try{const raw={kind:'frame',data:'a'.repeat(2*1024*1024)+randomBytes(3*1024*1024).toString('base64')},packed=await packMessage(raw);assert.equal(packed.kind,'compressed');assert.ok(packed.byteLength+Buffer.byteLength(JSON.stringify(packed))>MAX_BYTES+65536);assert.equal(await peers.a.link.sendLarge(packed),true);assert.equal(peers.b.messages.length,1);assert.deepEqual(peers.b.errors,[]);}finally{peers.close();}});
