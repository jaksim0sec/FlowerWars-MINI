import {packMessage,unpackMessage} from './wire-codec.mjs';

// Never pass the multi-megabyte object graph to IndexedDB. Store either a
// compact compressed envelope or a JSON string, both produced in a Worker.
export async function encodeStoredCheckpoint(snapshot){
 const packet=await packMessage({kind:'checkpoint',snapshot});
 return packet.kind==='compressed'?packet:JSON.stringify(packet);
}
export async function decodeStoredCheckpoint(record){
 let packet;
 if(typeof record==='string')packet=JSON.parse(record);
 else if(record?.kind==='compressed')packet=await unpackMessage(record);
 else throw new Error('INVALID_SNAPSHOT');
 if(packet?.kind!=='checkpoint'||!packet.snapshot||typeof packet.snapshot!=='object')throw new Error('INVALID_SNAPSHOT');
 return packet.snapshot;
}
