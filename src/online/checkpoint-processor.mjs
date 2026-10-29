import {packMessage,unpackMessage} from './wire-codec.mjs';
import {checkpointMapProps} from './checkpoint-transfer.mjs';
import {validateMatchState} from './match-state.mjs';
import {sealBattleState} from './battle-state.mjs';
import {encodeStoredCheckpoint,decodeStoredCheckpoint,sealPackedCheckpoint,decodeCheckpointEnvelope} from './checkpoint-storage.mjs';

// Worker is optional in Node tests and unavailable browser environments.
// A failure falls back to the original verified path; recovery never skips validation.
const workers=new Map();let sequence=0;
const pending=new Map();
const fallback=(kind,value)=>kind==='validate'?validateMatchState(value):kind==='unpack'?unpackMessage(value):kind==='seal'?sealBattleState(value):kind==='store'?encodeStoredCheckpoint(value):kind==='load'?decodeStoredCheckpoint(value):kind==='seal-packed'?sealPackedCheckpoint(value):kind==='checkpoint-envelope'?decodeCheckpointEnvelope(value):packMessage(value);
function stop(slot,error){
 workers.get(slot)?.terminate();workers.delete(slot);
 for(const [id,job]of pending)if(job.slot===slot){clearTimeout(job.timer);job.reject(error);pending.delete(id);}
}
function ensureWorker(slot){
 if(typeof Worker!=='function')return null;
 if(workers.has(slot))return workers.get(slot);
 const created=new Worker(new URL('./checkpoint-worker.mjs',import.meta.url),{type:'module'});
 created.onmessage=({data})=>{
  const job=pending.get(data?.id);if(!job)return;
  pending.delete(data.id);clearTimeout(job.timer);
  if(data.ok)job.resolve(data.result);else job.reject(new Error('CHECKPOINT_WORKER_FAILED'));
 };
 created.onerror=()=>{if(workers.get(slot)===created)stop(slot,new Error('CHECKPOINT_WORKER_FAILED'));};
 created.onmessageerror=created.onerror;
 workers.set(slot,created);return created;
}
async function run(kind,value){
 // Small live deltas must not queue behind multi-megabyte snapshot sealing.
 const slot=kind==='pack'&&value?.kind==='frame'||kind==='checkpoint-envelope'&&value?.byteLength<=512000?'live':'checkpoint';
 let active;try{active=ensureWorker(slot);}catch{return fallback(kind,value);}
 if(!active)return fallback(kind,value);
 try{return await new Promise((resolve,reject)=>{
  const id=++sequence,timer=setTimeout(()=>{stop(slot,new Error('CHECKPOINT_WORKER_TIMEOUT'));},15000);
  pending.set(id,{resolve,reject,timer,slot});
  try{active.postMessage({id,kind,value,mapProps:(kind==='seal-packed'||kind==='seal')?checkpointMapProps(value):[]});}catch(error){pending.delete(id);clearTimeout(timer);reject(error);}
 });}catch{return fallback(kind,value);}
}
export const packOffThread=value=>run('pack',value);
export const validateOffThread=snapshot=>run('validate',snapshot);
export const unpackOffThread=packet=>run('unpack',packet);
export const sealOffThread=draft=>run('seal',draft);
export const storeCheckpointOffThread=snapshot=>run('store',snapshot);
export const loadCheckpointOffThread=payload=>run('load',payload);
export const sealPackedOffThread=value=>run('seal-packed',value);
export const decodeCheckpointEnvelopeOffThread=packet=>run('checkpoint-envelope',packet);
