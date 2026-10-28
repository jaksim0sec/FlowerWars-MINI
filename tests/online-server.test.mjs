import test from 'node:test';
import assert from 'node:assert/strict';
import {io as connect} from 'socket.io-client';
import {createService} from '../server/index.mjs';

const wait=(socket,event)=>new Promise(resolve=>socket.once(event,resolve));
const ask=(socket,event,data={})=>new Promise(resolve=>socket.timeout(2000).emit(event,data,(error,value)=>resolve(error?{ok:false,error:error.message}:value)));
test('HTTP serves game only; Socket.IO authenticates chat, signaling, recovery and cleans up',async t=>{
 const svc=createService();await new Promise(r=>svc.http.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${svc.http.address().port}`;
 const sockets=[];t.after(async()=>{for(const s of sockets)s.disconnect();await svc.close();});
 const open=async()=>{const s=connect(base,{transports:['websocket'],reconnection:false});sockets.push(s);await wait(s,'connect');return s;};
 assert.equal((await fetch(base+'/health')).status,200);assert.match(await (await fetch(base)).text(),/src\/app.mjs/);
 for(const path of ['/.git/config','/server/rooms.mjs','/package.json','/docs/targeted-deployment-fix.md'])assert.equal((await fetch(base+path)).status,404,path);
 const a=await open(),b=await open(),x=await open();
 const created=await ask(a,'room:create');assert.equal(created.ok,true);const code=created.session.roomCode;
 const joined=await ask(b,'room:join',{roomCode:code});assert.equal(joined.ok,true);
 assert.equal((await ask(x,'room:join',{roomCode:code})).error,'ROOM_FULL');
 assert.equal((await ask(b,'match:start',{role:'host'})).error,'HOST_ONLY');
 const chat=wait(b,'chat:message');assert.equal((await ask(a,'chat:send',{text:'안녕하세요'})).ok,true);assert.equal((await chat).text,'안녕하세요');
 const forwarded=wait(b,'webrtc:signal');const epoch=joined.room.epoch;
 assert.equal((await ask(a,'webrtc:signal',{epoch,type:'offer',sdp:'v=0\r\n'})).ok,true);assert.equal((await forwarded).type,'offer');
 assert.equal((await ask(b,'webrtc:signal',{epoch,type:'offer',sdp:'fake'})).error,'HOST_ONLY');
 assert.equal((await ask(a,'webrtc:signal',{epoch:epoch-1,type:'offer',sdp:'v=0'})).error,'STALE_EPOCH');
 assert.equal((await ask(x,'webrtc:signal',{epoch,type:'answer',sdp:'v=0'})).error,'AUTH_REQUIRED');
 const presence=wait(b,'presence:changed');a.disconnect();await presence;
 const a2=await open();const r=await ask(a2,'participant:recover',created.session);assert.equal(r.ok,true);assert.equal(r.session.clientId,created.session.clientId);assert.equal(r.room.chat[0].text,'안녕하세요');assert.equal(r.room.state,'PAUSED');
 assert.equal((await ask(x,'participant:recover',created.session)).error,'ALREADY_CONNECTED');
 const finished=wait(b,'room:finished');await ask(a2,'room:leave');await finished;assert.equal(svc.store.rooms.size,0);
});
test('Render TLS proxy accepts same-origin requests and rejects cross-origin WebSocket handshakes',async t=>{
 const svc=createService();await new Promise(r=>svc.http.listen(0,'127.0.0.1',r));t.after(()=>svc.close());const port=svc.http.address().port,base=`http://127.0.0.1:${port}`;
 const proxy=await fetch(base+'/socket.io/?EIO=4&transport=polling',{headers:{Origin:`https://127.0.0.1:${port}`,'X-Forwarded-Proto':'https'}});assert.equal(proxy.status,200);
 const bad=await fetch(base+'/socket.io/?EIO=4&transport=polling',{headers:{Origin:'https://attacker.example','X-Forwarded-Proto':'https'}});assert.equal(bad.status,403);
});
