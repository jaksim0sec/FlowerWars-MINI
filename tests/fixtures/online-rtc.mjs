// Test-only RTC stand-in. Transport is a Playwright binding, never the application server.
window.__fixturePeers=new Map();let nextPeer=0;
class Channel {
 constructor(pc){this.pc=pc;this.readyState='connecting';this.bufferedAmount=0;}
 send(data){if(this.readyState!=='open')throw Error('closed');const size=new TextEncoder().encode(data).length;this.bufferedAmount+=size;this.queue=(this.queue||Promise.resolve()).then(()=>window.fixtureWire({target:this.pc.remoteId,kind:'data',data})).catch(()=>{}).finally(()=>{this.bufferedAmount-=size;});}
 close(){if(this.readyState==='closed')return;this.readyState='closed';this.onclose?.();if(this.pc.remoteId)window.fixtureWire({target:this.pc.remoteId,kind:'close'}).catch(()=>{});}
}
window.RTCPeerConnection=class {
 constructor(){this.id=window.__pageRole+'-'+(++nextPeer)+'-'+Math.random();this.connectionState='new';this.candidates=[];window.__fixturePeers.set(this.id,this);}
 createDataChannel(){return this.channel=new Channel(this);}
 async createOffer(){return {type:'offer',sdp:this.id};}
 async createAnswer(){return {type:'answer',sdp:this.id};}
 async setLocalDescription(description){this.localDescription=description;}
 async setRemoteDescription(description){this.remoteDescription=description;this.remoteId=description.sdp;if(description.type==='offer'){this.channel=new Channel(this);this.ondatachannel?.({channel:this.channel});}else {await window.fixtureWire({target:this.remoteId,kind:'open'});this.connectionState='connected';this.channel.readyState='open';this.channel.onopen?.();}}
 async addIceCandidate(candidate){this.candidates.push(candidate);}
 close(){this.connectionState='closed';this.channel?.close();}
};
window.fixtureReceive=message=>{const p=window.__fixturePeers.get(message.target);if(!p)return;if(message.kind==='open'){p.connectionState='connected';p.channel.readyState='open';p.channel.onopen?.();}else if(message.kind==='data')p.channel.onmessage?.({data:message.data});else if(message.kind==='close'){p.connectionState='closed';if(p.channel){p.channel.readyState='closed';p.channel.onclose?.();}}};
