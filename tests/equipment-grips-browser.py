"""Painted grip anchors must land on solid handles, including support hands."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BASE_URL','http://127.0.0.1:8010')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox'])
 page=b.new_page();page.goto(BASE+'/characters.html')
 failures=page.evaluate('''async()=>{
 const{loadCatalog}=await import('/src/characters/catalog.mjs');const lib=await loadCatalog(),failures=[];
 for(const[id,e]of Object.entries(lib.equipment)){
  const cv=document.createElement('canvas');cv.width=e.image.naturalWidth;cv.height=e.image.naturalHeight;
  const ctx=cv.getContext('2d');ctx.drawImage(e.image,0,0);
  for(const key of ['grip','secondaryGrip'])if(e[key]){
   const[x,y]=e[key].map((v,i)=>Math.round(v*((i?cv.height:cv.width)-1)));
   if(ctx.getImageData(x,y,1,1).data[3]<128)failures.push(`${id}/${key}: grip is outside the painted handle`);
  }
 }
 return failures;
 }''')
 assert not failures,'\n'.join(failures)
 b.close();print('PASS painted equipment handles: primary and support grips remain inside artwork')
