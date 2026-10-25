const BASE=new URL('../../assets/',import.meta.url);
export function visibleCharacters(catalog) {
 return Object.entries(catalog.characters).filter(([,definition])=>!definition.hidden);
}
async function json(url) {const r=await fetch(url);if(!r.ok)throw new Error(`설정을 불러오지 못했습니다: ${url.pathname}`);return r.json();}
export async function loadImage(url) {const image=new Image();image.src=url;try{await image.decode();}catch{throw new Error(`이미지를 불러오지 못했습니다: ${url.pathname}`);}return image;}
export async function loadCatalog() {
 const manifest=await json(new URL('characters.json',BASE));
 const equipmentURL=new URL(manifest.equipment,BASE),equipment=await json(equipmentURL);
 await Promise.all(Object.values(equipment).map(async item=>{item.image=await loadImage(new URL(item.asset,equipmentURL));}));
 const characters=Object.fromEntries(await Promise.all(Object.entries(manifest.characters).map(async([id,entry])=>{
  const url=new URL(entry.rig,BASE),rig=await json(url);
  if(rig.animationProfile) rig.animations={...await json(new URL(rig.animationProfile,url)),...rig.animations};
  const images=Object.fromEntries(await Promise.all(Object.entries(rig.parts).map(async([name,p])=>[name,await loadImage(new URL(p.asset,url))])));
  return [id,{...entry,rig,images}];
 })));
 return {characters,equipment};
}
