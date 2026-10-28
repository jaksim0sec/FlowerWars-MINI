import {packMessage} from './wire-codec.mjs';
import {validateMatchState} from './match-state.mjs';

self.onmessage=async({data})=>{
 const {id,kind,value}=data||{};
 try{
  if(!Number.isSafeInteger(id)||!['pack','validate'].includes(kind))throw new Error('INVALID_TASK');
  const result=kind==='validate'?await validateMatchState(value):await packMessage(value);
  self.postMessage({id,ok:true,result});
 }catch{self.postMessage({id,ok:false});}
};
