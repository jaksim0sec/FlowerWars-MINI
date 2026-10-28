const KEY='flowerwars-online';
const valid=s=>s&&/^[A-Z]{6}$/.test(s.roomCode)&&['host','guest'].includes(s.role)&&typeof s.clientId==='string'&&/^[a-f0-9]{32}$/.test(s.clientId)&&typeof s.reconnectToken==='string'&&s.reconnectToken.length>=43&&s.reconnectToken.length<=128&&Number.isFinite(s.expiresAt);
export function saveIdentity(identity,session,local){if(!valid(identity))return;for(const storage of [session,local])try{storage?.setItem(KEY,JSON.stringify(identity));}catch{}}
export function loadIdentity(session,local,now=Date.now()){for(const storage of [session,local])try{const value=JSON.parse(storage?.getItem(KEY)||'null');if(valid(value)&&value.expiresAt>now)return value;storage?.removeItem(KEY);}catch{}return null;}
export function clearIdentity(session,local){for(const storage of [session,local])try{storage?.removeItem(KEY);}catch{}}
