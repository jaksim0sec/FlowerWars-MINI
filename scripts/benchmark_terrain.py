import json,os,argparse,subprocess
parser=argparse.ArgumentParser();parser.add_argument("--baseline-ref",default="62c835a");args=parser.parse_args();baseline=subprocess.check_output(["git","show",args.baseline_ref+":src/render.mjs"],text=True)
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=b.new_page();page.route('**/src/render-baseline.mjs',lambda route:route.fulfill(content_type='text/javascript',body=baseline));page.goto(os.environ.get('BASE_URL','http://127.0.0.1:8015')+'/characters.html')
 data=page.evaluate('''async()=>{
 const old=await import('/src/render-baseline.mjs'),now=await import('/src/render.mjs'),{Board,fitBoardCamera}=await import('/src/model.mjs');const art=await now.loadArtwork(),samples=[];
 for(const size of [[5,16],[128,128]])for(const dpr of [1,2])for(const scale of [.1,.7,2.4]){
  const board=new Board(...size),camera=size[0]===5?{...fitBoardCamera(900,650,5,16),scale}:{x:450,y:-3200,scale};
  const canvases=[0,1].map(()=>{const c=document.createElement('canvas');c.width=900*dpr;c.height=650*dpr;return c;});const ctxs=canvases.map(c=>c.getContext('2d'));
  old.render(ctxs[0],art,board,{},camera,900,650,dpr);now.render(ctxs[1],art,board,{},camera,900,650,dpr);
  const a=ctxs[0].getImageData(0,0,900*dpr,650*dpr).data,b=ctxs[1].getImageData(0,0,900*dpr,650*dpr).data;let error=0,bad=0;for(let i=0;i<a.length;i++){const v=Math.abs(a[i]-b[i]);error+=v;if(v>8)bad++;}
  samples.push({size,dpr,scale,meanError:error/a.length,badFraction:bad/a.length});
 }
 const board=new Board(128,128),c=document.createElement('canvas');c.width=900;c.height=650;const ctx=c.getContext('2d'),camera={x:450,y:-3200,scale:1};
 const times=[];for(const r of [old,now]){r.render(ctx,art,board,{},camera,900,650,1);const t=performance.now();for(let i=0;i<15;i++)r.render(ctx,art,board,{},camera,900,650,1);times.push((performance.now()-t)/15);}
 return{samples,baselineMs:times[0],optimizedMs:times[1]};}''')
 print(json.dumps(data,indent=2));assert all(s['meanError']<.3 and s['badFraction']<.002 for s in data['samples']),data;b.close()
