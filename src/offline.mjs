// Registration is shared by the battlefield, preview and editor, without board imports.
if('serviceWorker' in navigator){
  navigator.serviceWorker.register(new URL('../sw.js',import.meta.url),{scope:new URL('../',import.meta.url).pathname,updateViaCache:'none'})
    .catch(error=>console.warn('오프라인 캐시 등록 실패:',error));
}
