export function deployReserves(match,type='mobile',maxSquads=Infinity){
 let count=0;
 for(let y=7;y<94&&match.reserve.A&&count<maxSquads;y+=5)for(let x=7;x<27&&match.reserve.A&&count<maxSquads;x+=4)
  if(match.deploy('A',type,{x,y}))count++;
 return count;
}
