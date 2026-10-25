import {loadCatalog} from './catalog.mjs';
import {createCharacter,equip,unequip,drawCharacter} from './engine.mjs';
const status=document.querySelector('#status');
try {
 const catalog=await loadCatalog(),cards=[];
 for(const [id,def] of Object.entries(catalog.characters)) {
  const card=document.querySelector('#card').content.firstElementChild.cloneNode(true);
  card.dataset.character=id;card.querySelector('h2').textContent=def.name;
  const c=card.querySelector('canvas');c.setAttribute('aria-label',`${def.name} 미리보기`);
  const instance=createCharacter(catalog,id);cards.push({instance,ctx:c.getContext('2d'),scale:def.previewScale || .68});
  const select=cls=>card.querySelector('.'+cls);
  for(const side of ['left','right']) {
   select(side).add(new Option('맨손',''));
   for(const [key,e] of Object.entries(catalog.equipment).filter(([,e])=>!e.slot))select(side).add(new Option(e.name,key));
  }
  const accessorySelects={};
  for(const slot of Object.keys(def.rig.sockets).filter(slot=>!['left','right'].includes(slot))) {
   const label=document.createElement('label');label.textContent=slot==='back'?'등 장비':'허리 장비';
   const input=document.createElement('select');input.dataset.slot=slot;input.add(new Option('미장착',''));
   for(const [key,e] of Object.entries(catalog.equipment).filter(([,e])=>e.slot===slot))input.add(new Option(e.name,key));
   input.addEventListener('change',()=>{unequip(instance,slot);if(input.value)equip(catalog,instance,input.value,slot);});
   label.append(input);card.querySelector('.controls').append(label);accessorySelects[slot]=input;
  }
  function update() {
   const mode=select('mode').value,left=select('left').value,right=select('right').value;
   const previous=structuredClone(instance.equipment);
   try {
    unequip(instance,'both');
    if(mode==='both') {if(left)equip(catalog,instance,left,'both');}
    else {if(left)equip(catalog,instance,left,'left');if(right)equip(catalog,instance,right,'right');}
    select('right').disabled=mode==='both';
    select('loadout').textContent=mode==='both'&&left?'양손으로 함께 잡고 있어요.':!left&&(mode==='both'||!right)?'가볍게, 맨손으로 출발해요.':'선택한 장비를 들고 있어요.';
   }catch(e){instance.equipment=previous;select('loadout').textContent='이 무기는 선택한 방식으로 잡을 수 없어요.';}
  }
  for(const cls of ['left','right','mode'])select(cls).addEventListener('change',update);
  select('state').addEventListener('change',()=>{instance.animation.state=select('state').value;instance.animation.elapsed=0;});
  select('facing').addEventListener('change',()=>instance.animation.facing=Number(select('facing').value));instance.animation.facing=-1;
  select('clear').addEventListener('click',()=>{select('left').value=select('right').value='';select('mode').value='single';update();});
  select('recommended').addEventListener('click',()=>{select('mode').value='single';select('left').value=select('right').value='';select(def.recommendedHand || 'left').value=def.recommendedWeapon||'';update();for(const [slot,key] of Object.entries(def.recommendedAccessories || {})){accessorySelects[slot].value=key;equip(catalog,instance,key,slot);}});
  update();document.querySelector('#cards').append(card);
 }
 status.textContent='각 캐릭터의 동작과 장비를 자유롭게 바꿔보세요.';
 let last=0,time=0;
 function frame(now){const dt=last?Math.min((now-last)/1000,.05):0;last=now;time+=dt;
  for(const {instance,ctx,scale} of cards){instance.animation.elapsed+=dt;if(instance.animation.state==='attack')instance.animation.elapsed%=.85;if(instance.animation.state==='hit')instance.animation.elapsed%=.36;ctx.clearRect(0,0,640,760);ctx.save();ctx.translate(320,710);drawCharacter(ctx,catalog,instance,time,{scale});ctx.restore();}
  requestAnimationFrame(frame);
 }
 requestAnimationFrame(frame);
}catch(e){status.textContent=e.message;}
