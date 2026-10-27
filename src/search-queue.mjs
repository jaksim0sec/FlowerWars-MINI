// Stable binary heap for incremental A*: identical f/g/FIFO ordering to the
// previous sorted array, without shifting the frontier on every expansion.
export class SearchQueue{
 constructor(nodes=[]){this.items=[];this.sequence=0;for(const node of nodes)this.push(node);}
 get length(){return this.items.length;}
 before(a,b){return a.f<b.f||a.f===b.f&&(a.g>b.g||a.g===b.g&&a.order<b.order);}
 push(node){
  node.order=this.sequence++;const heap=this.items;let index=heap.length;heap.push(node);
  while(index){const parent=(index-1)>>1;if(!this.before(node,heap[parent]))break;heap[index]=heap[parent];index=parent;}
  heap[index]=node;
 }
 pop(){
  const heap=this.items;if(!heap.length)return undefined;
  const result=heap[0],last=heap.pop();if(!heap.length)return result;
  let index=0;
  while(index*2+1<heap.length){
   let child=index*2+1;
   if(child+1<heap.length&&this.before(heap[child+1],heap[child]))child++;
   if(!this.before(heap[child],last))break;
   heap[index]=heap[child];index=child;
  }
  heap[index]=last;return result;
 }
}
