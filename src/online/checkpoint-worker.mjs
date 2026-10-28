import {packMessage,unpackMessage} from './wire-codec.mjs';
import {validateMatchState} from './match-state.mjs';
import {sealBattleState} from './battle-state.mjs';
import {encodeStoredCheckpoint,decodeStoredCheckpoint,sealPackedCheckpoint,decodeCheckpointEnvelope} from './checkpoint-storage.mjs';

self.onmessage=async({data})=>{
 const {id,kind,value}=data||{};
 try{
  if(!Number.isSafeInteger(id)||!['pack','unpack','validate','seal','store','load','seal-packed','checkpoint-envelope'].includes(kind))throw new Error('INVALID_TASK');
  const result=kind==='validate'?await validateMatchState(value):kind==='unpack'?await unpackMessage(value):kind==='seal'?await sealBattleState(value):kind==='store'?await encodeStoredCheckpoint(value):kind==='load'?await decodeStoredCheckpoint(value):kind==='seal-packed'?await sealPackedCheckpoint(value):kind==='checkpoint-envelope'?await decodeCheckpointEnvelope(value):await packMessage(value);
  self.postMessage({id,ok:true,result});
 }catch{self.postMessage({id,ok:false});}
};
