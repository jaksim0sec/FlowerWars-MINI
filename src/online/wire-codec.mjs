import {MAX_LARGE_BYTES} from './peer.mjs';

const STATE_KINDS=new Set(['frame','checkpoint','recovery:state','state']);
const encoder=new TextEncoder();
const decoder=new TextDecoder('utf-8',{fatal:true});
const invalid=()=>new Error('INVALID_COMPRESSED_MESSAGE');
const stateMessage=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&STATE_KINDS.has(value.kind);

function base64(bytes){
 const parts=[];
 for(let i=0;i<bytes.length;i+=32768)parts.push(String.fromCharCode(...bytes.subarray(i,i+32768)));
 return btoa(parts.join(''));
}

// Allocate once at the advertised bound and cancel immediately on overflow.
// Never collect unbounded decompressed chunks or use Response.arrayBuffer().
async function boundedBytes(stream,limit){
 const bytes=new Uint8Array(limit);let length=0;
 const reader=stream.getReader();
 try {
  while(true){
   const {done,value}=await reader.read();
   if(done)return bytes.subarray(0,length);
   if(value.byteLength>limit-length)throw invalid();
   bytes.set(value,length);length+=value.byteLength;
  }
 }catch(error){
  try{await reader.cancel(error);}catch{}
  throw error;
 }finally{reader.releaseLock();}
}

// Old browsers and incompressible/control messages keep the original object.
// A compressed envelope must save at least 10% including its base64/header.
export async function packMessage(value){
 if(!stateMessage(value)||typeof globalThis.CompressionStream!=='function')return value;
 let bytes;
 try{bytes=encoder.encode(JSON.stringify(value));}catch{throw invalid();}
 if(bytes.length>MAX_LARGE_BYTES)throw invalid();
 if(bytes.length<1024)return value;
 try {
  const stream=new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  const compressed=await boundedBytes(stream,bytes.length);
  const envelope={kind:'compressed',encoding:'gzip',byteLength:bytes.length,data:base64(compressed)};
  const wireBytes=encoder.encode(JSON.stringify(envelope)).length;
  return wireBytes<=MAX_LARGE_BYTES&&wireBytes<=bytes.length*0.9?envelope:value;
 }catch{return value;}
}

// Call only for a kind:'compressed' envelope. Domain/state validation remains
// with the battle adapter after this codec checks the wire representation.
export async function unpackMessage(envelope){
 try {
  if(!envelope||typeof envelope!=='object'||Array.isArray(envelope)||Object.keys(envelope).length!==4||
   envelope.kind!=='compressed'||envelope.encoding!=='gzip'||
   !Number.isSafeInteger(envelope.byteLength)||envelope.byteLength<1||envelope.byteLength>MAX_LARGE_BYTES||
   typeof envelope.data!=='string'||envelope.data.length<4||envelope.data.length>4*Math.ceil(MAX_LARGE_BYTES/3)||
   typeof globalThis.DecompressionStream!=='function')throw invalid();
  const binary=atob(envelope.data);
  if(binary.length>MAX_LARGE_BYTES||btoa(binary)!==envelope.data)throw invalid();
  const compressed=Uint8Array.from(binary,char=>char.charCodeAt(0));
  const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
  const bytes=await boundedBytes(stream,envelope.byteLength);
  if(bytes.length!==envelope.byteLength)throw invalid();
  const value=JSON.parse(decoder.decode(bytes));
  if(!stateMessage(value))throw invalid();
  return value;
 }catch{throw invalid();}
}
