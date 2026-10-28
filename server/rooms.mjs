import {randomInt, randomBytes, createHash, timingSafeEqual} from 'node:crypto';

export const GRACE_MS=300_000;
const LIFE_MS=6*60*60*1000;
const fail=code=>{throw new Error(code);};
const hash=value=>createHash('sha256').update(value).digest();
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const codeOK=value=>typeof value==='string'&&/^[A-Z]{6}$/.test(value);
const metaOK=m=>object(m)&&typeof m.matchId==='string'&&m.matchId.length<=64&&['fixture-v1','battle-v1'].includes(m.adapter)&&m.version===1&&Number.isSafeInteger(m.sequence)&&m.sequence>=0&&typeof m.hash==='string'&&/^[a-f0-9]{64}$/.test(m.hash);
const sameMeta=(a,b)=>a&&b&&a.matchId===b.matchId&&a.sequence===b.sequence&&a.hash===b.hash&&a.adapter===b.adapter&&a.version===b.version;

export class RoomStore {
  constructor({now=Date.now,emit=()=>{},maxRooms=100}={}){this.now=now;this.emit=emit;this.maxRooms=maxRooms;this.rooms=new Map();this.bindings=new Map();}
  view(room){return {roomCode:room.code,state:room.state,epoch:room.epoch,matchId:room.matchId,adapter:room.adapter,checkpoint:room.checkpoint,deadline:this.deadline(room),expiresAt:room.expiresAt,serverTime:this.now(),manualPause:room.manualPause,players:room.players.map(p=>({clientId:p.id,role:p.role,team:p.team,online:p.online,ready:p.ready,synchronized:p.syncedEpoch===room.epoch})),chat:room.chat};}
  deadline(room){const values=[room.linkDeadline,...room.players.map(p=>p.deadline)].filter(v=>v!==null);return values.length?Math.min(...values):null;}
  get(code){const room=this.rooms.get(code);if(!room)fail('ROOM_UNAVAILABLE');if(this.now()>=room.expiresAt||(this.deadline(room)!==null&&this.now()>=this.deadline(room))){this.close(room,'EXPIRED');fail('ROOM_UNAVAILABLE');}return room;}
  viewFor(socketId){const b=this.bindings.get(socketId);if(!b)fail('AUTH_REQUIRED');return this.view(this.get(b.code));}
  current(socketId){const b=this.bindings.get(socketId);if(!b)fail('AUTH_REQUIRED');const room=this.get(b.code),p=room.players.find(p=>p.id===b.id);if(!p||p.socketId!==socketId||!p.online)fail('AUTH_REQUIRED');return {room,p};}
  send(room,event='room:update',extra){this.emit(room.code,event,extra??this.view(room));}
  session(room,p,token){return {roomCode:room.code,role:p.role,clientId:p.id,reconnectToken:token,expiresAt:room.expiresAt};}
  add(room,role,socketId){const token=randomBytes(32).toString('base64url'),p={id:randomBytes(16).toString('hex'),role,team:role==='host'?'A':'B',tokenHash:hash(token),socketId,online:true,ready:false,syncedEpoch:null,deadline:null,chatTimes:[]};room.players.push(p);this.bindings.set(socketId,{code:room.code,id:p.id});return this.session(room,p,token);}
  invalidate(room){room.epoch++;room.pending=null;for(const p of room.players)p.syncedEpoch=null;}
  pause(room,reason){if(room.state!=='PAUSED'){room.beforePause=room.state;room.state='PAUSED';}this.invalidate(room);this.send(room,'match:paused',{reason,epoch:room.epoch});}
  maybeResume(room){if(room.players.length!==2||!room.players.every(p=>p.online&&p.syncedEpoch===room.epoch))return;
    if(room.matchId&&!room.checkpoint)return;
    for(const p of room.players)p.deadline=null;room.linkDeadline=null;
    if(!room.manualPause){room.state=room.finished?'FINISHED':room.matchId?'PLAYING':room.players.every(p=>p.ready)?'READY':'WAITING';this.send(room,'match:resumed',{epoch:room.epoch});}
  }
  close(room,state){room.state=state;this.send(room,state==='EXPIRED'?'room:expired':'room:finished',{state,roomCode:room.code});for(const p of room.players){if(p.socketId)this.bindings.delete(p.socketId);p.tokenHash.fill(0);}room.chat.length=0;room.players.length=0;room.pending=null;room.checkpoint=null;this.rooms.delete(room.code);this.send(room,'room:closed',{state});}
  sweep(){for(const room of this.rooms.values())if(this.now()>=room.expiresAt||(this.deadline(room)!==null&&this.now()>=this.deadline(room)))this.close(room,'EXPIRED');}
  disconnect(socketId){const b=this.bindings.get(socketId);if(!b)return;this.bindings.delete(socketId);const room=this.rooms.get(b.code),p=room?.players.find(p=>p.id===b.id);if(!p||p.socketId!==socketId)return;p.online=false;p.socketId=null;p.deadline??=this.now()+GRACE_MS;this.pause(room,'DISCONNECTED');this.send(room,'presence:changed');this.send(room);}
  handle(socketId,event,data={}){
    if(!object(data))fail('INVALID_PAYLOAD');
    if(event==='room:create'||event==='room:join'||event==='participant:recover'){
      if(event==='participant:recover'&&this.bindings.has(socketId)){
        const {room,p}=this.current(socketId);
        if(data.roomCode!==room.code||data.role!==p.role||data.clientId!==p.id||typeof data.reconnectToken!=='string'||data.reconnectToken.length>128||!timingSafeEqual(p.tokenHash,hash(data.reconnectToken)))fail('AUTH_FAILED');
        return {session:this.session(room,p,data.reconnectToken),room:this.view(room)};
      }
      if(this.bindings.has(socketId))fail('ALREADY_JOINED');let room,session;
      if(event==='room:create'){
        this.sweep();if(this.rooms.size>=this.maxRooms)fail('SERVER_FULL');let code;do{code=Array.from({length:6},()=>String.fromCharCode(65+randomInt(26))).join('');}while(this.rooms.has(code));
        room={code,state:'WAITING',beforePause:'WAITING',epoch:0,matchId:null,adapter:null,checkpoint:null,pending:null,linkDeadline:null,manualPause:false,players:[],chat:[],expiresAt:this.now()+LIFE_MS};this.rooms.set(code,room);session=this.add(room,'host',socketId);
      }else{
        if(!codeOK(data.roomCode))fail('INVALID_CODE');room=this.get(data.roomCode);
        if(event==='room:join'){
          if(room.players.length!==1||room.matchId)fail('ROOM_FULL');session=this.add(room,'guest',socketId);this.invalidate(room);
        }else{
          if(!['host','guest'].includes(data.role)||typeof data.clientId!=='string'||typeof data.reconnectToken!=='string'||data.reconnectToken.length>128)fail('AUTH_FAILED');
          const p=room.players.find(p=>p.id===data.clientId&&p.role===data.role);if(!p||!timingSafeEqual(p.tokenHash,hash(data.reconnectToken)))fail('AUTH_FAILED');if(p.online)fail('ALREADY_CONNECTED');
          p.online=true;p.socketId=socketId;p.syncedEpoch=null;this.bindings.set(socketId,{code:room.code,id:p.id});session=this.session(room,p,data.reconnectToken);
        }
      }
      this.send(room,'presence:changed');this.send(room);return {session,room:this.view(room)};
    }
    const {room,p}=this.current(socketId);
    if(event==='room:leave'){this.close(room,'FINISHED');return {};}
    if(event==='match:finish'){if(p.role!=='host')fail('HOST_ONLY');if(!room.matchId||room.state!=='PLAYING')fail('NOT_PLAYING');if(room.adapter==='battle-v1'){room.finished=true;room.state='FINISHED';this.send(room);return {room:this.view(room)};}this.close(room,'FINISHED');return {};}
    if(event==='participant:ready'){
      if(typeof data.ready!=='boolean'||room.matchId)fail('INVALID_READY');p.ready=data.ready;
      if(room.state!=='PAUSED')room.state=room.players.length===2&&room.players.every(p=>p.ready)?'READY':'WAITING';
    }else if(event==='match:start'){
      if(p.role!=='host')fail('HOST_ONLY');if(room.state!=='READY'||!room.players.every(p=>p.online&&p.syncedEpoch===room.epoch))fail('NOT_READY');
      if(data.adapter!==undefined&&!['fixture-v1','battle-v1'].includes(data.adapter))fail('INVALID_ADAPTER');room.matchId=randomBytes(16).toString('hex');room.adapter=data.adapter||'fixture-v1';room.linkDeadline=this.now()+GRACE_MS;this.pause(room,'INITIAL_SYNC');
    }else if(event==='participant:synced'){
      if(data.epoch!==room.epoch)fail('STALE_EPOCH');if(room.matchId){if(!room.checkpoint||data.sequence!==room.checkpoint.sequence||data.hash!==room.checkpoint.hash)fail('SNAPSHOT_MISMATCH');}else if(data.sequence!==null||data.hash!==null)fail('SNAPSHOT_MISMATCH');
      p.syncedEpoch=room.epoch;this.maybeResume(room);
    }else if(event==='match:pause'||event==='peer:lost'){
      if(event==='match:pause'){if(!room.matchId)fail('NOT_PLAYING');room.manualPause=true;room.state='PAUSED';this.send(room,'match:paused',{reason:'MANUAL',epoch:room.epoch});}
      else {room.linkDeadline??=this.now()+GRACE_MS;this.pause(room,'PEER_LOST');}
    }else if(event==='match:resume'){
      if(p.role!=='host')fail('HOST_ONLY');if(!room.players.every(p=>p.online&&p.syncedEpoch===room.epoch)||room.matchId&&!room.checkpoint)fail('NOT_SYNCHRONIZED');room.manualPause=false;this.maybeResume(room);
    }else if(event==='snapshot:publish'){
      if(p.role!=='host')fail('HOST_ONLY');if(!metaOK(data)||data.matchId!==room.matchId||data.adapter!==room.adapter)fail('INVALID_SNAPSHOT');if(room.pending||room.checkpoint&&data.sequence<=room.checkpoint.sequence)fail('STALE_SNAPSHOT');
      room.pending={matchId:data.matchId,adapter:data.adapter,version:data.version,sequence:data.sequence,hash:data.hash};this.send(room,'snapshot:available',room.pending);
    }else if(event==='snapshot:stored'){
      if(p.role!=='guest')fail('GUEST_ONLY');if(!sameMeta(room.pending,data))fail('SNAPSHOT_MISMATCH');room.checkpoint=room.pending;room.pending=null;this.send(room,'snapshot:committed',room.checkpoint);
    }else if(event==='chat:send'){
      if(typeof data.text!=='string'||!data.text.trim()||data.text.length>300)fail('INVALID_MESSAGE');const now=this.now();p.chatTimes=p.chatTimes.filter(t=>now-t<4000);if(p.chatTimes.length>=4)fail('RATE_LIMIT');p.chatTimes.push(now);
      const message={id:randomBytes(8).toString('hex'),at:now,role:p.role,text:data.text.trim()};room.chat.push(message);if(room.chat.length>50)room.chat.shift();this.send(room,'chat:message',message);return {message};
    }else fail('UNKNOWN_EVENT');
    this.send(room);return {room:this.view(room)};
  }
}
