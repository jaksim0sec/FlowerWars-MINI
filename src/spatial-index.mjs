// Sparse buckets hold IDs at logical sources and reserved destinations. Visual
// interpolation stays between those cells, so movement needs no per-frame reindex.
export class SpatialIndex {
  constructor(width,height,bucketSize=8) {
    this.width=width;this.height=height;this.bucketSize=Math.max(1,Math.floor(bucketSize));
    this.columns=Math.ceil(width/this.bucketSize);this.buckets=new Map();this.memberships=new Map();
    this.versions=new Map();this.queries=new Map();this.queryStats={hits:0,builds:0};
  }
  touch(key){this.versions.set(key,(this.versions.get(key)||0)+1);}
  key(x,y) {
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>=this.width||y>=this.height)return null;
    return Math.floor(y/this.bucketSize)*this.columns+Math.floor(x/this.bucketSize);
  }
  add(actor){this.move(actor);}
  move(actor) {
    const keys=new Set([this.key(actor.x,actor.y)]);
    if(actor.step)keys.add(this.key(actor.step.x,actor.step.y));
    keys.delete(null);
    const previous=this.memberships.get(actor.id)||new Set();
    for(const key of previous)if(!keys.has(key)) {
      const bucket=this.buckets.get(key);bucket.delete(actor.id);this.touch(key);if(!bucket.size)this.buckets.delete(key);
    }
    for(const key of keys)if(!previous.has(key)) {
      if(!this.buckets.has(key))this.buckets.set(key,new Set());
      this.buckets.get(key).add(actor.id);this.touch(key);
    }
    this.memberships.set(actor.id,keys);
  }
  remove(actorOrId) {
    const id=typeof actorOrId==='object'?actorOrId.id:actorOrId;
    for(const key of this.memberships.get(id)||[]) {
      const bucket=this.buckets.get(key);bucket.delete(id);this.touch(key);if(!bucket.size)this.buckets.delete(key);
    }
    this.memberships.delete(id);
  }
  clear(){this.buckets.clear();this.memberships.clear();this.versions.clear();this.queries.clear();}
  *candidates(x,y,range) {
    if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(range)||range<0)return;
    const size=this.bucketSize,minX=Math.max(0,Math.floor((x-range)/size)),minY=Math.max(0,Math.floor((y-range)/size));
    const maxX=Math.min(this.columns-1,Math.floor((x+range)/size)),maxY=Math.min(Math.ceil(this.height/size)-1,Math.floor((y+range)/size));
    const key=minX+','+minY+','+maxX+','+maxY;
    let cached=this.queries.get(key),valid=!!cached,index=0;
    for(let by=minY;by<=maxY;by++)for(let bx=minX;bx<=maxX;bx++)if(cached?.versions[index++]!==(this.versions.get(by*this.columns+bx)||0))valid=false;
    if(valid){this.queryStats.hits++;yield* cached.ids;return;}
    const seen=new Set(),ids=[],versions=[];
    for(let by=minY;by<=maxY;by++)for(let bx=minX;bx<=maxX;bx++){
      const bucket=by*this.columns+bx;versions.push(this.versions.get(bucket)||0);
      for(const id of this.buckets.get(bucket)||[])if(!seen.has(id)){seen.add(id);ids.push(id);}
    }
    if(this.queries.size>=128)this.queries.delete(this.queries.keys().next().value);
    this.queries.set(key,{ids,versions});this.queryStats.builds++;yield* ids;
  }
}
