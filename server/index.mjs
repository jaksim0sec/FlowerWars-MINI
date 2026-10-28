import express from 'express';
import {createServer} from 'node:http';
import {Server} from 'socket.io';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {RoomStore} from './rooms.mjs';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const EVENTS=['room:create','room:join','participant:recover','participant:ready','participant:synced','room:leave','chat:send','match:start','match:pause','match:resume','match:finish','peer:lost','snapshot:publish','snapshot:stored'];
export function createService({now=Date.now,maxRooms=100,maxConnections=256,origin=process.env.PUBLIC_ORIGIN}={}){
 const app=express(),http=createServer(app);
 const io=new Server(http,{maxHttpBufferSize:64*1024,perMessageDeflate:false,serveClient:true,pingInterval:10000,pingTimeout:10000,allowRequest:(req,done)=>{
   const forwarded=req.headers['x-forwarded-proto']?.split(',')[0].trim();
   const scheme=req.socket.encrypted||forwarded==='https'?'https':'http';
   let allowed=!req.headers.origin;try{allowed||=new URL(req.headers.origin).origin===(origin||`${scheme}://${req.headers.host}`);}catch{}done(null,allowed);
 }});
 const store=new RoomStore({now,maxRooms,emit:(code,event,data)=>{io.to(code).emit(event,data);if(event==='room:closed')io.in(code).socketsLeave(code);}});
 app.disable('x-powered-by');app.use((req,res,next)=>{res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','same-origin');next();});
 app.get('/health',(_req,res)=>res.set('Cache-Control','no-store').json({ok:true}));
 // Serve only public game paths. Never expose the repository root, server or lockfile.
 for(const dir of ['src','assets','legacy'])app.use('/'+dir,express.static(path.join(ROOT,dir),{dotfiles:'deny',index:false}));
 for(const file of ['index.html','characters.html','rig-editor.html','manifest.json','sw.js'])app.get('/'+file,(_req,res)=>{if(file==='sw.js')res.set('Cache-Control','no-cache');res.sendFile(path.join(ROOT,file));});
 app.get('/',(_req,res)=>res.sendFile(path.join(ROOT,'index.html')));
 app.use((_req,res)=>res.status(404).type('text').send('Not found'));
 const sweep=setInterval(()=>store.sweep(),1000);sweep.unref();
 io.use((socket,next)=>io.engine.clientsCount>maxConnections?next(new Error('SERVER_FULL')):next());
 io.on('connection',socket=>{
   let windowAt=now(),count=0;
   const authTimer=setTimeout(()=>{if(!store.bindings.has(socket.id))socket.disconnect(true);},15000);authTimer.unref();
   const limited=()=>{if(now()-windowAt>=10000){windowAt=now();count=0;}if(++count>100)throw new Error('RATE_LIMIT');};
   for(const event of EVENTS)socket.on(event,(payload,ack)=>{
     if(typeof ack!=='function')return;
     try{limited();const result=store.handle(socket.id,event,payload);if(result.session){socket.join(result.session.roomCode);clearTimeout(authTimer);}ack({ok:true,...result});}
     catch(error){ack({ok:false,error:error.message});}
   });
   socket.on('webrtc:signal',(data,ack)=>{
     if(typeof ack!=='function')return;
     try{
       limited();const {room,p}=store.current(socket.id);if(!data||data.epoch!==room.epoch)throw new Error('STALE_EPOCH');
       if(!['offer','answer','candidate'].includes(data.type))throw new Error('INVALID_SIGNAL');
       if(data.type==='offer'&&p.role!=='host')throw new Error('HOST_ONLY');if(data.type==='answer'&&p.role!=='guest')throw new Error('GUEST_ONLY');
       let signal={epoch:room.epoch,type:data.type};
       if(data.type==='candidate'){
         const c=data.candidate;if(!c||typeof c.candidate!=='string'||c.candidate.length>2048||c.sdpMid!==null&&typeof c.sdpMid!=='string'||typeof c.sdpMid==='string'&&c.sdpMid.length>256||c.sdpMLineIndex!==null&&(!Number.isInteger(c.sdpMLineIndex)||c.sdpMLineIndex<0||c.sdpMLineIndex>64))throw new Error('INVALID_SIGNAL');
         signal.candidate={candidate:c.candidate,sdpMid:c.sdpMid,sdpMLineIndex:c.sdpMLineIndex};
       }else{if(typeof data.sdp!=='string'||!data.sdp.length||data.sdp.length>32768)throw new Error('INVALID_SIGNAL');signal.sdp=data.sdp;}
       const other=room.players.find(q=>q.id!==p.id);if(!other?.online)throw new Error('PEER_OFFLINE');io.to(other.socketId).emit('webrtc:signal',signal);ack({ok:true});
     }catch(error){ack({ok:false,error:error.message});}
   });
   socket.on('disconnect',()=>{clearTimeout(authTimer);store.disconnect(socket.id);});
 });
 return {app,http,io,store,close:()=>new Promise(resolve=>{clearInterval(sweep);io.close(()=>{if(http.listening)http.close(()=>resolve());else resolve();});})};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const service=createService();service.http.listen(Number(process.env.PORT)||10000,'0.0.0.0',()=>console.log('FlowerWars online server ready'));
 for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>service.close().then(()=>process.exit(0)));
}
