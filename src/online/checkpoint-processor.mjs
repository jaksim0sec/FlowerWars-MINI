import {packMessage,unpackMessage} from './wire-codec.mjs';
import {checkpointMapProps} from './checkpoint-transfer.mjs';
import {validateMatchState} from './match-state.mjs';
import {sealBattleState} from './battle-state.mjs';
import {encodeStoredCheckpoint,decodeStoredCheckpoint,sealPackedCheckpoint,decodeCheckpointEnvelope} from './checkpoint-storage.mjs';

// Worker is optional in Node tests and unavailable browser environments.
// A failure falls back to the original verified path; recovery never skips validation.
let worker=null,sequence=0;
const pending=new Map();
const fallback=(kind,value)=>kind==='validate'?validateMatchState(value):kind==='unpack'?unpackMessage(value):kind==='seal'?sealBattleState(value):kind==='store'?encodeStoredCheckpoint(value):kind==='load'?decodeStoredCheckpoint(value):kind==='seal-packed'?sealPackedCheckpoint(value):kind==='checkpoint-envelope'?decodeCheckpointEnvelope(value):packMessage(value);
function stop(error){
 const current=worker;worker=null;current?.terminate();
 for(const job of pending.values()){clearTimeout(job.timer);job.reject(error);}
 pending.clear();
}
function ensureWorker(){
 if(typeof Worker!=='function')return null;
 if(worker)return worker;
 const created=new Worker(new URL('./checkpoint-worker.mjs',import.meta.url),{type:'module'});
 created.onmessage=({data})=>{
  const job=pending.get(data?.id);if(!job)return;
  pending.delete(data.id);clearTimeout(job.timer);
  if(data.ok)job.resolve(data.result);else job.reject(new Error('CHECKPOINT_WORKER_FAILED'));
 };
 created.onerror=()=>stop(new Error('CHECKPOINT_WORKER_FAILED'));
 created.onmessageerror=()=>stop(new Error('CHECKPOINT_WORKER_FAILED'));
 worker=created;return worker;
}
async function run(kind,value){
 let active;try{active=ensureWorker();}catch{return fallback(kind,value);}
 if(!active)return fallback(kind,value);
 try{return await new Promise((resolve,reject)=>{
  const id=++sequence,timer=setTimeout(()=>{stop(new Error('CHECKPOINT_WORKER_TIMEOUT'));},15000);
  pending.set(id,{resolve,reject,timer});
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
