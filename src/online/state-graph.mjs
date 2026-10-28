// Bounded data-only graph. Aliases matter: navigation compares commands, units,
// squad orders and courtesy chains by identity. No class names are instantiated.
const MAX_NODES=100000,MAX_ITEMS=500000,MAX_DEPTH=160;
const typed={Uint8Array,Int8Array,Uint16Array,Int16Array,Uint32Array,Int32Array,Float32Array,Float64Array};
const safeKey=k=>typeof k==='string'&&k.length<=256&&!['__proto__','prototype','constructor'].includes(k);
const plain=o=>o&&[Object.prototype,null].includes(Object.getPrototypeOf(o));
const exact=(o,keys)=>plain(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
const fail=()=>{throw new Error('INVALID_STATE_GRAPH');};
export function encodeStateGraph(root,projections=new Map()){
 const nodes=[],seen=new Map();let items=0;
 function encode(value,depth=0){
  if(depth>MAX_DEPTH||++items>MAX_ITEMS)fail();
  if(value===null||typeof value==='boolean')return value;
  if(typeof value==='number'){if(!Number.isFinite(value))fail();return value;}
  if(typeof value==='string'){if(value.length>65536)fail();return value;}
  if(value===undefined)return {$undefined:true};
  if(typeof value!=='object')fail();
  if(seen.has(value))return {$ref:seen.get(value)};
  if(nodes.length>=MAX_NODES)fail();
  const index=nodes.length;seen.set(value,index);nodes.push(null);
  const projected=projections.get(value)||value;let node;
  const properties=o=>Object.keys(o).map(k=>{if(!safeKey(k))fail();return[k,encode(o[k],depth+1)];});
  if(Array.isArray(projected))node={type:'array',values:projected.map(v=>encode(v,depth+1))};
  else if(projected instanceof Map)node={type:'map',entries:[...projected].map(([k,v])=>[encode(k,depth+1),encode(v,depth+1)]),props:properties(projected)};
  else if(projected instanceof Set)node={type:'set',values:[...projected].map(v=>encode(v,depth+1))};
  else if(ArrayBuffer.isView(projected)&&Object.hasOwn(typed,projected.constructor.name))node={type:projected.constructor.name,values:[...projected].map(v=>encode(v,depth+1))};
  else if(plain(projected))node={type:'object',entries:properties(projected)};
  else fail();
  nodes[index]=node;return {$ref:index};
 }
 return {root:encode(root),nodes};
}
export function decodeStateGraph(graph){
 if(!exact(graph,['root','nodes'])||!Array.isArray(graph.nodes)||graph.nodes.length>MAX_NODES)fail();
 let items=0;const objects=graph.nodes.map(node=>{
  if(!plain(node))fail();
  switch(node.type){case'object':if(!exact(node,['type','entries']))fail();return {};case'array':case'set':if(!exact(node,['type','values']))fail();return node.type==='array'?[]:new Set();case'map':if(!exact(node,['type','entries','props']))fail();return new Map();default:if(!Object.hasOwn(typed,node.type)||!exact(node,['type','values'])||!Array.isArray(node.values)||node.values.length>65536)fail();return new typed[node.type](node.values.length);}
 });
 function value(v){
  if(++items>MAX_ITEMS)fail();
  if(v===null||typeof v==='boolean')return v;
  if(typeof v==='number'){if(!Number.isFinite(v))fail();return v;}
  if(typeof v==='string'){if(v.length>65536)fail();return v;}
  if(exact(v,['$undefined'])&&v.$undefined===true)return undefined;
  if(!exact(v,['$ref'])||!Number.isSafeInteger(v.$ref)||v.$ref<0||v.$ref>=objects.length)fail();return objects[v.$ref];
 }
 function entries(list,apply){if(!Array.isArray(list))fail();const keys=new Set();for(const entry of list){if(!Array.isArray(entry)||entry.length!==2||!safeKey(entry[0])||keys.has(entry[0]))fail();keys.add(entry[0]);apply(entry[0],value(entry[1]));}}
 for(let i=0;i<objects.length;i++){
  const node=graph.nodes[i],object=objects[i];
  if(node.type==='object')entries(node.entries,(k,v)=>{object[k]=v;});
  else if(node.type==='map'){
   if(!Array.isArray(node.entries))fail();for(const entry of node.entries){if(!Array.isArray(entry)||entry.length!==2)fail();const k=value(entry[0]);if(object.has(k))fail();object.set(k,value(entry[1]));}
   entries(node.props,(k,v)=>{if(k!=='handoffs')fail();object[k]=v;});
  }else{
   if(!Array.isArray(node.values))fail();for(let j=0;j<node.values.length;j++){const v=value(node.values[j]);if(node.type==='array')object.push(v);else if(node.type==='set')object.add(v);else{if(typeof v!=='number')fail();object[j]=v;if(object[j]!==v)fail();}}
  }
 }
 const root=value(graph.root);
 // Reject unreachable records and excessively deep graphs, including malformed
 // cyclic input: an ancestor alias is legal, an unbounded chain is not.
 const seen=new Set();function visit(o,depth){if(!o||typeof o!=='object'||seen.has(o))return;if(depth>MAX_DEPTH)fail();seen.add(o);if(o instanceof Map)for(const[k,v]of o){visit(k,depth+1);visit(v,depth+1);}else if(o instanceof Set)for(const v of o)visit(v,depth+1);else if(!ArrayBuffer.isView(o))for(const v of Object.values(o))visit(v,depth+1);if(o instanceof Map)for(const v of Object.values(o))visit(v,depth+1);}
 visit(root,0);if(seen.size!==objects.length)fail();return root;
}
