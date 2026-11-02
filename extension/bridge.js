(() => {
 if(location.origin!=='https://uriban-ai-compare.vercel.app'||!['/compare','/compare.html'].includes(location.pathname)||window!==window.top)return;
 const post=data=>window.postMessage({source:'uriban-ai-extension',...data},location.origin);
 const send=async m=>{try{const r=await chrome.runtime.sendMessage(m);if(r?.error)post({type:'ERROR',message:r.error});if(r?.run)post({type:'RUN',run:r.run});return r;}catch{post({type:'ERROR',message:'확장 프로그램이 변경되었어요. 비교실을 새로고침해 주세요.'});}};
 let busy=false;
 document.addEventListener('click',async e=>{
  if(!e.isTrusted||busy)return;
  if(e.target.closest('#sendAll')){const prompt=document.getElementById('prompt')?.value,recordId=document.documentElement.dataset.compareRecord;if(!prompt?.trim())return;busy=true;try{await send({type:'START',prompt,recordId});}finally{busy=false;}}
  if(e.target.closest('#stopAll'))await send({type:'CANCEL',runId:document.documentElement.dataset.compareRun});
  const recover=e.target.closest('[data-recover-provider]');if(recover)await send({type:'RECOVER',runId:document.documentElement.dataset.compareRun,provider:recover.dataset.recoverProvider});
  const open=e.target.closest('[data-open-provider]');if(open)await send({type:'OPEN',runId:document.documentElement.dataset.compareRun,provider:open.dataset.openProvider});
 });
 window.addEventListener('message',e=>{if(e.source===window&&e.origin===location.origin&&e.data?.source==='uriban-ai-web'&&e.data.type==='SYNC')sync();});
 chrome.runtime.onMessage.addListener(m=>{if(m.type==='RUN')post(m);});
 function sync(){document.documentElement.dataset.aiBridge='1';post({type:'READY',version:chrome.runtime.getManifest().version});send({type:'SYNC'});}
 sync();
})();
