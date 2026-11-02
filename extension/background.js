import {PROVIDERS,terminal,isClient,isProvider,validStart,publicRun} from './protocol.js';
let queue=Promise.resolve();
const read=async()=> (await chrome.storage.session.get('runs')).runs||{};
const write=runs=>chrome.storage.session.set({runs});
async function notify(run){try{await chrome.tabs.sendMessage(run.clientId,{type:'RUN',run:publicRun(run)});}catch{/* Reloaded comparison tabs recover through SYNC. */}}
async function handle(m,sender){
 if(!sender.tab||sender.frameId!==0)return {error:'허용되지 않은 연결입니다.'};
 const runs=await read(),clientId=sender.tab.id;
 if(isClient(sender)){
  if(m.type==='SYNC'){const run=runs[clientId];return {run:run?publicRun(run):null};}
  if(m.type==='START'){
   if(!validStart(m))return {error:'질문은 1~30,000자까지 입력해 주세요.'};
   const old=runs[clientId];if(old?.jobs.some(j=>!terminal(j.state)))return {error:'진행 중인 비교를 먼저 중지해 주세요.'};
   const run={id:crypto.randomUUID(),recordId:m.recordId,clientId,prompt:m.prompt,started:Date.now(),jobs:Object.keys(PROVIDERS).map(provider=>({provider,state:'queued',message:'AI 화면 여는 중',text:'',tabId:null}))};
   runs[clientId]=run;await write(runs);
   for(const j of run.jobs){try{const tab=await chrome.tabs.create({url:PROVIDERS[j.provider].url,active:false});j.tabId=tab.id;}catch{j.state='error';j.message='탭을 열지 못했습니다. 크롬 사이트 권한을 확인해 주세요.';}}
   await write(runs);await notify(run);return {run:publicRun(run)};
  }
  const run=runs[clientId];if(!run||run.id!==m.runId)return {error:'현재 비교를 다시 확인해 주세요.'};
  if(m.type==='RECOVER'){const j=run.jobs.find(j=>j.provider===m.provider);if(!j||!terminal(j.state))return {error:'수집 중인 AI는 먼저 완료되거나 중지되어야 합니다.'};if(!j.tabId)return {error:'AI 탭이 없습니다. 새 비교로 실행해 주세요.'};try{await chrome.tabs.get(j.tabId);}catch{return {error:'AI 탭이 닫혔습니다. 새 비교로 실행해 주세요.'};}j.state='submitted';j.message='이 AI의 기존 답변을 다시 수집합니다. 질문이 입력창에 남아 있다면 직접 전송해 주세요.';j.baseline={count:0,text:''};run.started=Date.now();await write(runs);await chrome.tabs.reload(j.tabId);await notify(run);return {run:publicRun(run)};}
  if(m.type==='OPEN'){const j=run.jobs.find(j=>j.provider===m.provider);if(j?.tabId)try{await chrome.tabs.update(j.tabId,{active:true});}catch{return {error:'AI 탭이 닫혔습니다.'};}return {ok:true};}
  if(m.type==='CANCEL'){for(const j of run.jobs){if(!terminal(j.state)){j.state='cancelled';j.message='중지됨 · 이미 전송한 질문은 AI 사이트에 남습니다.';try{await chrome.tabs.sendMessage(j.tabId,{type:'STOP',runId:run.id});}catch{}}}await write(runs);await notify(run);return {run:publicRun(run)};}
  return {error:'지원하지 않는 요청입니다.'};
 }
 const run=Object.values(runs).find(r=>r.jobs.some(j=>j.tabId===clientId));if(!run)return {job:null};
 const job=run.jobs.find(j=>j.tabId===clientId);if(!isProvider(sender,job.provider))return {error:'다른 AI의 응답은 받을 수 없습니다.'};
 if(m.type==='HELLO')return {job:terminal(job.state)?null:{...job,runId:run.id,prompt:run.prompt,started:run.started}};
 if(m.runId!==run.id)return {error:'만료된 비교입니다.'};
 if(terminal(job.state))return {active:false};
 if(m.type==='CLAIM'){
  if(job.state!=='queued')return {active:false};job.state='preparing';job.message='질문 입력 중';await write(runs);await notify(run);return {active:true};
 }
 if(m.type==='ARM'){
  if(job.state!=='preparing')return {active:false};job.state='submitted';job.message='질문 전송 확인 중';job.baseline={count:Number(m.baseline?.count)||0,text:String(m.baseline?.text||'').slice(0,1000000)};await write(runs);await notify(run);return {active:true};
 }
 if(m.type==='STATUS'){
  const allowed=['queued','preparing','submitted','streaming','done','error'];if(!allowed.includes(m.state))return {error:'잘못된 상태입니다.'};
  if(m.state==='queued'&&job.state!=='queued')return {active:false};
  if(['submitted','streaming','done'].includes(m.state)&&!['submitted','streaming'].includes(job.state))return {active:false};
  job.state=m.state;job.message=String(m.message||'').slice(0,300);if(typeof m.text==='string')job.text=m.text.slice(0,1000000);
  await write(runs);await notify(run);return {active:true};
 }
 return {error:'지원하지 않는 요청입니다.'};
}
chrome.runtime.onMessage.addListener((m,sender,reply)=>{queue=queue.catch(()=>{}).then(()=>handle(m,sender));queue.then(reply,()=>reply({error:'연결 상태를 저장하지 못했습니다. 크롬을 확인해 주세요.'}));return true;});
chrome.tabs.onRemoved.addListener(id=>{queue=queue.catch(()=>{}).then(async()=>{const runs=await read();if(runs[id]){const r=runs[id];delete runs[id];for(const j of r.jobs)if(j.tabId)try{await chrome.tabs.sendMessage(j.tabId,{type:'STOP',runId:r.id});}catch{}await write(runs);return;}for(const r of Object.values(runs)){const j=r.jobs.find(j=>j.tabId===id);if(j&&!terminal(j.state)){j.state='error';j.message='AI 탭이 닫혔습니다. 새 비교로 다시 실행해 주세요.';await write(runs);await notify(r);}}});});
chrome.alarms.create('expire-runs',{periodInMinutes:1});
chrome.alarms.onAlarm.addListener(()=>{queue=queue.catch(()=>{}).then(async()=>{const runs=await read();for(const r of Object.values(runs)){if(Date.now()-r.started>10*60*1000){for(const j of r.jobs)if(!terminal(j.state)){j.state='error';j.message='10분 동안 완료하지 못했습니다. AI 탭의 로그인·제한·응답을 확인해 주세요.';}await notify(r);}}await write(runs);});});
