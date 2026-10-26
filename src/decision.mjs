// Seeded, team-neutral arbitration. No faction names enter this function.
export function mix(value){value=Math.imul(value^(value>>>16),0x7feb352d);value=Math.imul(value^(value>>>15),0x846ca68b);return (value^(value>>>16))>>>0;}
export function movementOptions(data={}){return {stepTime:Math.max(.15,Number(data.stepTime)||.425),waitBeforeDetour:Math.max(0,data.waitBeforeDetour??.24),yieldAfter:Math.max(.1,data.yieldAfter??.65)};}
