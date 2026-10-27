import os,json
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=b.new_page(viewport={'width':800,'height':500},service_workers='block')
 page.goto(os.environ.get('BASE_URL','http://127.0.0.1:8042')+'/manifest.json')
 print(page.evaluate('''async()=>{
 const{Board}=await import('/src/model.mjs'),{loadArtwork,render}=await import('/src/render.mjs'),{createCharacter}=await import('/src/characters/engine.mjs');
 const{createFormationGroup,placeGroup}=await import('/src/unit-groups.mjs'),{drawSquadTeamFlags}=await import('/src/match-overlay.mjs');
 const art=await loadArtwork(),board=new Board(24,24),canvas=document.createElement('canvas');canvas.width=800;canvas.height=500;document.body.replaceChildren(canvas);document.body.style.margin='0';const ctx=canvas.getContext('2d');
 for(const [team,x]of [['A',10],['B',14]])placeGroup(board,createFormationGroup(2,'squad','','defense'),{x,y:10},{team,makeCharacter:m=>createCharacter(art.catalog,m.characterId)});
 const camera={x:220,y:-450,scale:.8};render(ctx,art,board,{},camera,800,500,1);
 const pixels=ctx.getImageData(0,0,800,500).data;let blue=0,red=0;for(let i=0;i<pixels.length;i+=4){if(pixels[i]===40&&pixels[i+1]===125&&pixels[i+2]===224)blue++;if(pixels[i]===227&&pixels[i+1]===70&&pixels[i+2]===77)red++;}
 if(blue<10||red<10)throw Error('close team markers missing');window.markerFixture={art,board,canvas};return{blue,red};
 }'''))
 page.screenshot(path='/tmp/team-markers-close.png')
 print(page.evaluate('''()=>{
 const{art,board,canvas}=window.markerFixture;
 return import('/src/render.mjs').then(async({render})=>{
  const {drawSquadTeamFlags}=await import('/src/match-overlay.mjs');const ctx=canvas.getContext('2d'),camera={x:300,y:80,scale:.1};board.match={phase:'battle',flags:{},centers:{A:{x:1,y:1},B:{x:22,y:22}}};
  render(ctx,art,board,{},camera,800,500,1);
  let lookups=0;const old=board.unit.bind(board);board.unit=(id)=>{lookups++;return old(id);};
  drawSquadTeamFlags(ctx,board,.1,camera,800,500);drawSquadTeamFlags(ctx,board,.1,camera,800,500);
  if(lookups!==0)throw Error('squad center cache rebuilt within the same frame');return{cachedLookups:lookups};
 });
 }'''))
 page.screenshot(path='/tmp/team-markers-distant.png');b.close()
