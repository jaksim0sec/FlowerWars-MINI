import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {packMessage,unpackMessage} from '../src/online/wire-codec.mjs';
const MAX=8*1024*1024;
const envelope=(bytes,byteLength=bytes.length)=>({kind:'compressed',encoding:'gzip',byteLength,data:gzipSync(bytes).toString('base64')});
const invalid=value=>assert.rejects(()=>unpackMessage(value),/INVALID_COMPRESSED_MESSAGE/);

test('native gzip round trips a 700-unit array with measurable wire and encoding savings',async t=>{
 const value={kind:'checkpoint',state:{units:Array.from({length:700},(_,id)=>({id,team:id<350?'A':'B',health:{current:100,max:100,injury:0},movement:{state:'walk',stepTime:0.425,path:Array.from({length:45},(_,n)=>({x:(id+n)%176,y:(id*3+n)%128}))},combat:{damage:25,nextAttackAt:123.45,targetId:id+1},equipment:{left:'shield',right:'spear'},formation:Array.from({length:10},(_,n)=>[id+n,id-n])}))}};
 const raw=Buffer.byteLength(JSON.stringify(value));const before=performance.now();
 const packed=await packMessage(value);const elapsed=performance.now()-before;
 const wire=Buffer.byteLength(JSON.stringify(packed));
 assert.equal(packed.kind,'compressed');assert.equal(packed.encoding,'gzip');assert.equal(packed.byteLength,raw);
 assert.ok(wire<raw/2);assert.deepEqual(await unpackMessage(packed),value);
 t.diagnostic(`700 units: raw=${raw} bytes, gzip envelope=${wire} bytes, ratio=${(wire/raw).toFixed(3)}, encode=${elapsed.toFixed(2)}ms`);
});
test('small and control messages keep identity and old browsers fall back to JSON',async()=>{
 const small={kind:'frame',rows:[]};assert.equal(await packMessage(small),small);
 const control={kind:'command',data:'x'.repeat(5000)};assert.equal(await packMessage(control),control);
 const original=globalThis.CompressionStream;
 try{globalThis.CompressionStream=undefined;const value={kind:'checkpoint',data:'x'.repeat(5000)};assert.equal(await packMessage(value),value);}finally{globalThis.CompressionStream=original;}
});
test('packing refuses oversize raw JSON and preserves high-entropy messages when base64 cancels savings',async()=>{
 await assert.rejects(()=>packMessage({kind:'checkpoint',data:'x'.repeat(MAX)}),/INVALID_COMPRESSED_MESSAGE/);
 let seed=17;const noise=Array.from({length:1300},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return String.fromCharCode(33+seed%90);}).join('');
 const value={kind:'frame',data:noise};assert.equal(await packMessage(value),value);
});
test('all supported state kinds round trip and unknown or nested decoded kinds are rejected',async()=>{
 for(const kind of ['frame','checkpoint','recovery:state','state']){const value={kind,data:'🌸'.repeat(1000)};assert.deepEqual(await unpackMessage(await packMessage(value)),value);}
 for(const value of [{kind:'compressed'},{kind:'command'},null,[],{kind:'unknown'}])await invalid(envelope(Buffer.from(JSON.stringify(value))));
});
test('compressed headers and base64 are canonical and bounded before allocation',async()=>{
 const valid=envelope(Buffer.from('{"kind":"state"}'));
 for(const changes of [{kind:'state'},{encoding:'deflate'},{byteLength:0},{byteLength:-1},{byteLength:1.2},{byteLength:MAX+1},{byteLength:'16'},{data:4},{data:''},{data:'???'},{data:valid.data+'='},{data:'a'.repeat(4*Math.ceil(MAX/3)+4)},{extra:true}])await invalid({...valid,...changes});
 for(const value of [null,[],{},'gzip'])await invalid(value);
});
test('decompression rejects bombs, byte-count mismatches, invalid gzip, UTF8 and JSON',async()=>{
 await invalid(envelope(Buffer.alloc(MAX+1,32),100));
 const bytes=Buffer.from('{"kind":"state"}');
 await invalid(envelope(bytes,bytes.length-1));await invalid(envelope(bytes,bytes.length+1));
 await invalid({kind:'compressed',encoding:'gzip',byteLength:100,data:Buffer.from('invalid gzip').toString('base64')});
 await invalid(envelope(Buffer.from([0xff,0xfe])));await invalid(envelope(Buffer.from('{broken')));
 const bad=gzipSync(bytes);bad[bad.length-8]^=1;
 await invalid({kind:'compressed',encoding:'gzip',byteLength:bytes.length,data:bad.toString('base64')});
});
test('unpack reports an explicit validation error when native decompression is unavailable',async()=>{
 const original=globalThis.DecompressionStream;
 try{globalThis.DecompressionStream=undefined;await invalid(envelope(Buffer.from('{"kind":"state"}')));}finally{globalThis.DecompressionStream=original;}
});
