import {packMessage,unpackMessage} from './wire-codec.mjs';
import {sealBattleState} from './battle-state.mjs';
import {validateMatchState,snapshotMetadata} from './match-state.mjs';

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

export async function sealPackedCheckpoint({draft,final,peerCompression=true}){
 const snapshot=await sealBattleState(draft),message={kind:'checkpoint',snapshot,final:!!final};
 const stored=await packMessage(message);
 return {metadata:snapshotMetadata(snapshot),packet:peerCompression?stored:message,payload:stored.kind==='compressed'?stored:JSON.stringify(message)};
}
export async function decodeCheckpointEnvelope(packet){
 const message=await unpackMessage(packet);
 if(message.kind==='checkpoint'&&!message.final){
  if(!await validateMatchState(message.snapshot))throw new Error('INVALID_SNAPSHOT');
  return {kind:'verified-checkpoint',metadata:snapshotMetadata(message.snapshot)};
 }
 return {kind:'message',value:message};
}
