import {PeerLink} from './peer.mjs';
import {SnapshotBackup} from './backup.mjs';
import {createFixture,stepFixture,applyFixtureCommand,saveMatchState,restoreMatchState,validateMatchState,snapshotMetadata} from './match-state.mjs';
import {saveIdentity,loadIdentity,clearIdentity} from './identity.mjs';
import {setOnlineActive} from './game-gate.mjs';

let socketScript;
export async function loadSocketClient(){if(globalThis.io)return globalThis.io;if(!socketScript)socketScript=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/socket.io/socket.io.js';const timer=setTimeout(()=>{script.remove();socketScript=null;reject(new Error('SERVER_UNAVAILABLE'));},60000);script.onload=()=>{clearTimeout(timer);resolve(globalThis.io);};script.onerror=()=>{clearTimeout(timer);socketScript=null;reject(new Error('SERVER_UNAVAILABLE'));};document.head.append(script);});return socketScript;}
const storage=name=>{try{return globalThis[name];}catch{return null;}};
export class OnlineSession extends EventTarget {
 constructor(){super();this.sessionStorage=storage('sessionStorage');this.localStorage=storage('localStorage');this.identity=loadIdentity(this.sessionStorage,this.localStorage);this.backup=new SnapshotBackup();this.room=null;this.state=null;this.peer=null;this.status='';this.peerStatus='미연결';this.clockOffset=0;this.appliedEpoch=-1;this.sequence=-1;this.frame=0;this.lastFrame=-1;this.messages=Promise.resolve();this.busy=false;this.publishing=false;this.initializing=false;this.lastCheckpoint=0;this.lastSent=0;this.lastTick=performance.now();this.timer=setInterval(()=>this.tick(),100);}
 changed(){this.dispatchEvent(new Event('change'));}
 error(code){this.status=code;this.changed();}
 persist(){if(this.identity){const deadline=this.room?.deadline;saveIdentity({...this.identity,expiresAt:Math.min(this.identity.expiresAt,deadline??Infinity)},this.sessionStorage,this.localStorage);}}
 async connect(){if(this.socket?.connected)return;if(this.connecting)return this.connecting;
  this.connecting=(async()=>{const io=await loadSocketClient();this.socket??=io({autoConnect:false,reconnection:true,reconnectionDelay:800,reconnectionDelayMax:10000,randomizationFactor:.5,timeout:20000});
   if(!this.bound){this.bound=true;this.socket.on('connect',()=>{this.status='';if(this.identity)this.authenticate('participant:recover',this.identity).catch(e=>this.authFailed(e));else this.changed();});
    this.socket.on('disconnect',()=>{this.peer?.close();this.peer=null;this.peerStatus='재연결 중';if(this.room){this.room={...this.room,state:'PAUSED',deadline:this.room.deadline??Date.now()+this.clockOffset+300000};this.persist();}this.changed();});
    this.socket.on('connect_error',()=>this.error('SERVER_UNAVAILABLE'));
    this.socket.on('room:update',room=>{if(this.identity&&room.roomCode===this.identity.roomCode)this.onRoom(room);});
    this.socket.on('chat:message',message=>{if(!this.room)return;this.room.chat=[...this.room.chat.filter(m=>m.id!==message.id),message].slice(-50);this.changed();});
    this.socket.on('room:expired',()=>this.ended('ROOM_EXPIRED'));
    this.socket.on('room:finished',()=>this.ended('ROOM_FINISHED'));
    this.socket.on('webrtc:signal',signal=>{if(this.peer)this.peer.accept(signal);else this.earlySignals=[...(this.earlySignals||[]),signal].slice(-64);});
    this.socket.on('snapshot:committed',meta=>{if(!this.room||meta.matchId!==this.room.matchId)return;this.room.checkpoint=meta;this.publishing=false;this.lastCheckpoint=performance.now();this.ensureSync().catch(e=>this.error(e.message));});
   }
   await new Promise((resolve,reject)=>{if(this.socket.connected){resolve();return;}const connected=()=>{clearTimeout(timer);resolve();};const timer=setTimeout(()=>{this.socket.off('connect',connected);reject(new Error('SERVER_UNAVAILABLE'));},25000);this.socket.once('connect',connected);this.socket.connect();});
  })().finally(()=>{this.connecting=null;});return this.connecting;
 }
 rpc(event,data={}){return new Promise((resolve,reject)=>{if(!this.socket?.connected){reject(new Error('OFFLINE'));return;}this.socket.timeout(8000).emit(event,data,(error,value)=>{if(error)reject(new Error('SERVER_TIMEOUT'));else if(!value?.ok)reject(new Error(value?.error||'SERVER_ERROR'));else resolve(value);});});}
 async authenticate(event,data){const generation=this.generation;const result=await this.rpc(event,data);if(this.disposed||this.generation!==generation)return result;clearTimeout(this.recoveryTimer);this.recoveryAttempt=0;this.recoveryUntil=null;if(this.identity?.clientId===result.session.clientId)Object.assign(this.identity,result.session);else this.identity=result.session;this.status='';setOnlineActive(true);this.onRoom(result.room);return result;}
 async create(){await this.connect();if(this.identity)throw new Error('ALREADY_JOINED');return this.authenticate('room:create',{});}
 async join(roomCode){await this.connect();if(this.identity)throw new Error('ALREADY_JOINED');return this.authenticate('room:join',{roomCode});}
 async recover(){if(!this.identity)return;setOnlineActive(true);this.peerStatus='기존 방 복구 중';this.changed();if(this.socket?.connected)await this.authenticate('participant:recover',this.identity);else await this.connect();}
 authFailed(error){
  if(['ROOM_UNAVAILABLE','AUTH_FAILED','INVALID_CODE'].includes(error.message)){this.ended(error.message);this.socket?.disconnect();return;}
  // A network switch can reconnect before the old socket times out. Never discard its token or backup.
  this.error(error.message);this.peerStatus='기존 연결 종료 대기';this.recoveryUntil??=Date.now()+300000;clearTimeout(this.recoveryTimer);
  if(!this.identity||this.disposed||Date.now()>=this.recoveryUntil)return;
  const delay=Math.min(10000,800*2**Math.min(4,this.recoveryAttempt??0));this.recoveryAttempt=(this.recoveryAttempt??0)+1;
  this.recoveryTimer=setTimeout(()=>{if(!this.identity||this.disposed)return;const attempt=this.socket?.connected?this.authenticate('participant:recover',this.identity):this.connect();attempt.catch(e=>this.authFailed(e));},Math.min(delay,this.recoveryUntil-Date.now()));this.recoveryTimer.unref?.();
 }
 onRoom(room){this.clockOffset=room.serverTime-Date.now();const oldEpoch=this.room?.epoch,wasPlaying=this.room?.state==='PLAYING';this.room=room;this.persist();if(oldEpoch!==room.epoch||!this.peer){this.appliedEpoch=-1;this.lastFrame=-1;this.sequence=room.checkpoint?.sequence??-1;this.publishing=false;this.syncedEpoch=null;
   if(room.players.length===2&&room.players.every(p=>p.online))this.openPeer();else {this.peer?.close();this.peer=null;this.peerStatus='상대 대기';}
  }
  if(wasPlaying&&room.state==='PAUSED'&&room.manualPause&&oldEpoch===room.epoch&&this.identity.role==='host'&&this.state){saveMatchState(this.state,Math.max(0,this.sequence)).then(snapshot=>{if(this.room?.epoch===room.epoch&&this.room.manualPause)this.peer?.send({kind:'state',epoch:room.epoch,frame:++this.frame,snapshot});}).catch(e=>this.error(e.message));}
  this.ensureSync().catch(e=>this.error(e.message));this.changed();
 }
 openPeer(){this.peer?.close();this.peerStatus='직접 연결 중';const epoch=this.room.epoch;
  const peer=this.peer=new PeerLink({role:this.identity.role,epoch,signal:data=>this.rpc('webrtc:signal',data).catch(e=>{if(this.peer===peer)peer.fail(e.message);}),onOpen:()=>{if(this.peer!==peer)return;this.peerStatus='직접 연결됨';peer.send({kind:'hello'});this.ensureSync().catch(e=>this.error(e.message));this.changed();},onMessage:value=>{this.messages=this.messages.then(()=>{if(this.peer===peer)return this.receive(value,epoch);}).catch(e=>{if(this.peer===peer){this.error(e.message);peer.fail('RECOVERY_FAILED');}});},onFailure:reason=>{if(this.peer!==peer)return;this.peerStatus='직접 연결 실패';this.error(reason);if(this.room){this.room={...this.room,state:'PAUSED'};this.rpc('peer:lost').catch(()=>{});}}});
  peer.start().then(async()=>{for(const signal of this.earlySignals||[])await peer.accept(signal);this.earlySignals=[];});
 }
 async ensureSync(){const room=this.room,identity=this.identity;if(!room||!identity||this.peer?.channel?.readyState!=='open'||this.syncedEpoch===room.epoch)return;const epoch=room.epoch,current=()=>this.identity===identity&&this.room?.epoch===epoch&&this.room?.roomCode===room.roomCode&&this.room?.matchId===room.matchId;
  if(!room.matchId){this.syncedEpoch=epoch;try{await this.rpc('participant:synced',{epoch,sequence:null,hash:null});}catch(e){if(current())this.syncedEpoch=null;throw e;}return;}
  if(!room.checkpoint){if(this.identity.role==='host'){if(this.initializing&&this.state?.matchId===room.matchId&&!this.publishing)await this.checkpoint();else if(!this.initializing)this.error('NO_CHECKPOINT');}return;}
  if(this.syncingEpoch===epoch)return;this.syncingEpoch=epoch;const job=this.syncJob=Symbol();
  try{const snapshot=await this.backup.get(room.roomCode,room.matchId,room.checkpoint);if(!current())return;
   if(!snapshot){this.peer.send({kind:'recovery:request',metadata:room.checkpoint});this.peerStatus='체크포인트 수신 대기';this.changed();return;}
   // A paused/recovered session rolls back BOTH sides to the last mutually durable checkpoint.
   const state=await restoreMatchState(snapshot);if(!current())return;this.state=state;this.sequence=Math.max(this.sequence,snapshot.sequence);this.appliedEpoch=epoch;this.syncedEpoch=epoch;
   await this.rpc('participant:synced',{epoch,sequence:snapshot.sequence,hash:snapshot.hash});if(current()){this.peerStatus='직접 연결됨';this.status='';}
  }finally{if(this.syncJob===job)this.syncingEpoch=null;this.changed();}
 }
 async receive(message,epoch){if(!this.room||!this.identity||this.room.epoch!==epoch)return;const identity=this.identity,code=this.room.roomCode,matchId=this.room.matchId,current=()=>this.identity===identity&&this.room?.epoch===epoch&&this.room?.roomCode===code&&this.room?.matchId===matchId;
  if(message.kind==='hello'){await this.ensureSync();return;}
  if(message.kind==='command'){if(this.identity.role==='host'&&this.room.state==='PLAYING'&&this.state)applyFixtureCommand(this.state,'guest',message.command);return;}
  if(message.kind==='recovery:request'){const meta=message.metadata;if(!meta||meta.matchId!==this.room.matchId||meta.hash!==this.room.checkpoint?.hash||meta.sequence!==this.room.checkpoint?.sequence)throw new Error('SNAPSHOT_MISMATCH');const snapshot=await this.backup.get(this.room.roomCode,this.room.matchId,meta);if(snapshot)this.peer.send({kind:'recovery:state',snapshot});else this.error('NO_CHECKPOINT');return;}
  if(message.kind==='checkpoint'||message.kind==='recovery:state'||message.kind==='state'){
   const snapshot=message.snapshot,valid=await validateMatchState(snapshot);if(!current())return;if(!valid||snapshot.matchId!==matchId)throw new Error('INVALID_SNAPSHOT');
   if(message.kind==='recovery:state'){
    if(snapshot.hash!==this.room.checkpoint?.hash||snapshot.sequence!==this.room.checkpoint?.sequence)throw new Error('SNAPSHOT_MISMATCH');await this.backup.put(code,snapshot);if(current())await this.ensureSync();return;
   }
   if(this.identity.role!=='guest')throw new Error('HOST_ONLY');
   if(message.kind==='checkpoint'){await this.backup.put(code,snapshot);if(current())await this.rpc('snapshot:stored',snapshotMetadata(snapshot));return;}
   if((this.room.state==='PLAYING'||this.room.state==='PAUSED'&&this.room.manualPause)&&message.epoch===epoch&&Number.isSafeInteger(message.frame)&&message.frame>this.lastFrame){this.lastFrame=message.frame;const state=await restoreMatchState(snapshot);if(current()){this.state=state;this.changed();}}return;
  }
 }
 async checkpoint(){if(this.publishing||!this.state||this.peer?.channel?.readyState!=='open')return;this.publishing=true;const epoch=this.room.epoch,code=this.room.roomCode;try{
   const snapshot=await saveMatchState(this.state,++this.sequence);await this.backup.put(code,snapshot);if(this.room?.epoch!==epoch){this.publishing=false;return;}
   await this.rpc('snapshot:publish',snapshotMetadata(snapshot));if(!this.peer.send({kind:'checkpoint',snapshot}))throw new Error('P2P_DISCONNECTED');
  }catch(e){this.publishing=false;throw e;}
 }
 async start(){this.initializing=true;const generation=this.generation;try{const result=await this.rpc('match:start');if(this.disposed||this.generation!==generation||!this.identity)return;this.state=createFixture(result.room.matchId);this.frame=0;this.sequence=-1;await this.ensureSync();this.changed();}catch(e){if(this.generation===generation)this.initializing=false;throw e;}}
 async tick(){const now=performance.now(),dt=Math.min(.1,Math.max(0,(now-this.lastTick)/1000));this.lastTick=now;
  if(!this.identity||!this.room||this.identity.role!=='host'||this.room.state!=='PLAYING'||!this.socket?.connected||this.peer?.channel?.readyState!=='open'||!this.state||this.appliedEpoch!==this.room.epoch)return;
  stepFixture(this.state,dt);this.changed();if(this.writingFrame)return;
  if(now-this.lastCheckpoint>=5000&&!this.publishing)this.checkpoint().catch(e=>this.peer?.fail(e.message));
  if(now-this.lastSent>=200){this.lastSent=now;this.writingFrame=true;const epoch=this.room.epoch;try{const snapshot=await saveMatchState(this.state,Math.max(0,this.sequence));if(this.room?.epoch===epoch&&this.room.state==='PLAYING')this.peer.send({kind:'state',epoch,frame:++this.frame,snapshot});}catch(e){this.error(e.message);}finally{this.writingFrame=false;}}
  if(this.state.phase==='finished'&&!this.finishing){this.finishing=true;this.rpc('match:finish').catch(e=>this.error(e.message));}
 }
 async ready(ready){await this.rpc('participant:ready',{ready});}
 async pause(){await this.rpc('match:pause');}
 async resume(){await this.rpc('match:resume');}
 async chat(text){await this.rpc('chat:send',{text});}
 command(command){if(this.room?.state!=='PLAYING'||!this.state)return false;if(this.identity.role==='host')return applyFixtureCommand(this.state,'host',command);return this.peer?.send({kind:'command',command})||false;}
 retryPeer(){if(this.socket?.connected&&this.room)return this.rpc('peer:lost');if(this.identity)return this.recover();return this.connect();}
 async leave(){try{if(this.socket?.connected&&this.identity)await this.rpc('room:leave');}finally{this.ended('');this.socket?.disconnect();}}
 cancelRecovery(){if(this.room)return;this.ended('',false);this.socket?.disconnect();}
 ended(status,clearBackup=true){const code=this.identity?.roomCode;this.generation=(this.generation??0)+1;clearTimeout(this.recoveryTimer);this.recoveryUntil=null;this.peer?.close();this.peer=null;this.identity=null;this.room=null;this.state=null;this.appliedEpoch=-1;this.syncedEpoch=null;this.syncingEpoch=null;this.syncJob=null;this.initializing=false;this.publishing=false;this.finishing=false;this.peerStatus='미연결';this.status=status;clearIdentity(this.sessionStorage,this.localStorage);if(code&&clearBackup)this.backup.clearRoom(code).catch(()=>{});setOnlineActive(false);this.changed();}
 dispose(){this.disposed=true;clearInterval(this.timer);clearTimeout(this.recoveryTimer);this.peer?.close();this.socket?.disconnect();this.backup.close().catch(()=>{});setOnlineActive(false);}
}
