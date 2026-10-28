import {validateMatchState} from './match-state.mjs';
import {storeCheckpointOffThread,loadCheckpointOffThread} from './checkpoint-processor.mjs';
const result=request=>new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
const done=tx=>new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('BACKUP_ABORTED'));});
export class SnapshotBackup {
 constructor({indexedDB=globalThis.indexedDB,name='flowerwars-online-v1'}={}){this.indexedDB=indexedDB;this.name=name;}
 async open(){if(!this.db)this.db=new Promise((resolve,reject)=>{if(!this.indexedDB){reject(new Error('BACKUP_UNAVAILABLE'));return;}const req=this.indexedDB.open(this.name,1);req.onupgradeneeded=()=>req.result.createObjectStore('snapshots',{keyPath:'key'});req.onerror=()=>reject(req.error);req.onblocked=()=>reject(new Error('BACKUP_BLOCKED'));req.onsuccess=()=>{req.result.onversionchange=()=>req.result.close();resolve(req.result);};});return this.db;}
 async put(roomCode,snapshot,{verified=false,packed=null}={}){if(!verified&&!await validateMatchState(snapshot))throw new Error('INVALID_SNAPSHOT');// Wire-compressed packets were already produced and checked by the caller.
 const payload=packed?.kind==='compressed'?packed:await storeCheckpointOffThread(snapshot);
 const db=await this.open(),tx=db.transaction('snapshots','readwrite'),finished=done(tx),store=tx.objectStore('snapshots');store.put({key:`${roomCode}:${snapshot.matchId}:${snapshot.sequence}`,roomCode,matchId:snapshot.matchId,sequence:snapshot.sequence,savedAt:Date.now(),payload});
 const req=store.getAllKeys();req.onsuccess=()=>{const prefix=`${roomCode}:${snapshot.matchId}:`,all=req.result,matching=all.filter(k=>k.startsWith(prefix)).sort((a,b)=>Number(b.slice(prefix.length))-Number(a.slice(prefix.length))),removed=new Set(matching.slice(3));for(const key of removed)store.delete(key);const victims=all.filter(k=>!removed.has(k)&&!k.startsWith(prefix));for(const key of victims.slice(0,Math.max(0,all.length-removed.size-30)))store.delete(key);};await finished;}
 async get(roomCode,matchId,metadata=null){const db=await this.open(),prefix=`${roomCode}:${matchId}:`;let keys;if(metadata)keys=[prefix+metadata.sequence];else keys=(await result(db.transaction('snapshots').objectStore('snapshots').getAllKeys())).filter(k=>k.startsWith(prefix)).sort((a,b)=>Number(b.slice(prefix.length))-Number(a.slice(prefix.length)));for(const key of keys){const record=await result(db.transaction('snapshots').objectStore('snapshots').get(key));if(!record)continue;
  let snapshot;try{snapshot=record.payload!==undefined?await loadCheckpointOffThread(record.payload):record.snapshot;}catch{continue;}
  if(snapshot&&(!metadata?.hash||snapshot.hash===metadata.hash)&&await validateMatchState(snapshot))return snapshot;}return null;}
 async clearRoom(roomCode){const db=await this.open(),tx=db.transaction('snapshots','readwrite'),finished=done(tx),store=tx.objectStore('snapshots'),req=store.getAllKeys();req.onsuccess=()=>{for(const key of req.result)if(key.startsWith(roomCode+':'))store.delete(key);};await finished;}
 async close(){if(this.db)(await this.db).close();this.db=null;}
}
