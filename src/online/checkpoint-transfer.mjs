// Map entries survive structured clone; custom Map properties do not.
// Keep the small sidecar in the SAME postMessage graph to preserve object aliases.
export function checkpointMapProps(value){
 const source=(value?.draft??value)?.state?.source,props=[],seen=new Set();
 const add=order=>{const goals=order?.goals;if(!(goals instanceof Map)||!Object.hasOwn(goals,'handoffs')||seen.has(goals))return;seen.add(goals);props.push([goals,goals.handoffs]);};
 if(source?.registry?.squads instanceof Map)for(const squad of source.registry.squads.values())add(squad.order);
 if(source?.cooperations instanceof Set)for(const chain of source.cooperations)add(chain?.remote?.order);
 return props;
}
export function restoreCheckpointMapProps(props=[]){
 if(!Array.isArray(props))throw new Error('INVALID_CHECKPOINT_TRANSFER');
 for(const pair of props){
  if(!Array.isArray(pair)||pair.length!==2||!(pair[0] instanceof Map))throw new Error('INVALID_CHECKPOINT_TRANSFER');
  pair[0].handoffs=pair[1];
 }
}
