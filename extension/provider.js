(() => {
 const HOSTS={'gemini.google.com':'gemini','claude.ai':'claude','chatgpt.com':'gpt','grok.com':'grok'},id=HOSTS[location.hostname];
 if(!id||window!==window.top||globalThis.__uribanProvider)return;globalThis.__uribanProvider=true;
 const selectors={
  gemini:{edit:['.ql-editor[contenteditable="true"][role="textbox"]','[contenteditable="true"][aria-label*="Gemini"]'],send:['button.send-button','button[aria-label="Send message"]','button[aria-label="메시지 보내기"]'],answer:['model-response .markdown-main-panel','model-response message-content','model-response .markdown','model-response'],user:['user-query .query-text','user-query']},
  claude:{edit:['.ProseMirror[contenteditable="true"][role="textbox"]','[contenteditable="true"][aria-label*="Claude"]'],send:['button[data-testid="send-button"]','button[aria-label="Send message"]','button[aria-label="메시지 보내기"]'],answer:['[data-testid="assistant-message"] .standard-markdown','.font-claude-response-body','.font-claude-response','[data-testid="assistant-message"]'],user:['[data-testid="user-message"]']},
  gpt:{edit:['#prompt-textarea','[contenteditable="true"][role="textbox"]','textarea[data-id="root"]'],send:['button[data-testid="send-button"]','button[aria-label="Send prompt"]','button[aria-label="프롬프트 보내기"]'],answer:['[data-message-author-role="assistant"] .markdown','[data-message-author-role="assistant"]','[data-turn="assistant"]','[data-content-search-unit-key$=":assistant"]','[data-chatgpt-search-unit-key$=":assistant"]'],user:['[data-message-author-role="user"]','[data-turn="user"]']},
  grok:{edit:['.ProseMirror[contenteditable="true"][role="combobox"]','[contenteditable="true"][aria-label*="Grok"]','textarea[placeholder]'],send:['button[data-testid="chat-submit"]','button[aria-label="제출"]','button[aria-label="Submit"]','button[aria-label="Send"]','button[aria-label="전송"]'],answer:['[data-testid="assistant-message"] .response-content-markdown','[data-testid="assistant-message"]','[data-message-role="assistant"]','[data-role="assistant"]'],user:['[data-testid="user-message"]','[data-message-role="user"]','[data-role="user"]']}
 }[id];
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const visible=el=>!!el&&el.getBoundingClientRect().width>0&&el.getBoundingClientRect().height>0&&getComputedStyle(el).visibility!=='hidden';
 const first=ss=>{for(const s of ss){const el=[...document.querySelectorAll(s)].find(visible);if(el)return el;}return null;};
 const text=el=>el?(el instanceof HTMLTextAreaElement?el.value:el.innerText||el.textContent||''):'';
 const norm=s=>s.replaceAll('\r\n','\n').trim();
 function responses(){for(const s of selectors.answer){const nodes=[...document.querySelectorAll(s)].filter(visible);if(nodes.length)return nodes.map(el=>{const c=el.cloneNode(true);c.querySelectorAll('button,svg,script,style,[aria-hidden="true"]').forEach(n=>n.remove());c.querySelectorAll('br').forEach(n=>n.replaceWith('\n'));c.querySelectorAll('p,div,li,pre,h1,h2,h3,h4,blockquote').forEach(n=>n.append('\n'));return norm(c.textContent||'').replace(/\n{3,}/g,'\n\n');}).filter(Boolean);}return [];}
 function sendButton(){return first(selectors.send)||[...document.querySelectorAll('button')].find(el=>visible(el)&&/^(send|send message|send prompt|submit|보내기|전송|메시지 보내기|프롬프트 보내기|질문 보내기|전송하기|제출)(\s|$)/i.test(el.getAttribute('aria-label')||el.innerText||''));}
 function stopButton(){return first(['button[data-testid="stop-button"]','button.stop-button'])||[...document.querySelectorAll('button')].find(el=>visible(el)&&/^(stop|stop generating|stop response|중지|응답 중지|생성 중지|답변 중지|정지)(\s|$)/i.test(el.getAttribute('aria-label')||el.innerText||''));}
 let currentJob=null,cancelled=false,started=false;
 const send=async m=>{try{return await chrome.runtime.sendMessage(m);}catch{return {active:false};}};
 async function report(state,message,answer){const r=await send({type:'STATUS',runId:currentJob.runId,state,message,...(answer!==undefined?{text:answer}:{})});if(r?.active===false)cancelled=true;return r;}
 chrome.runtime.onMessage.addListener(m=>{if(m.type==='STOP'&&m.runId===currentJob?.runId){cancelled=true;if(['submitted','streaming'].includes(currentJob.state))stopButton()?.click();}});
 async function fill(editor,prompt){
  if(norm(text(editor)))throw Error('AI 입력창에 다른 내용이 있어 멈췄습니다. 새 비교로 다시 실행해 주세요.');
  editor.focus();
  if(editor instanceof HTMLTextAreaElement){Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(editor,prompt);editor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:prompt}));editor.dispatchEvent(new Event('change',{bubbles:true}));}
  else{
   const clipboard=new DataTransfer();clipboard.setData('text/plain',prompt);editor.dispatchEvent(new ClipboardEvent('paste',{clipboardData:clipboard,bubbles:true,cancelable:true}));await sleep(200);
   if(!norm(text(editor))){const range=document.createRange();range.selectNodeContents(editor);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);document.execCommand('insertText',false,prompt);}
  }
  await sleep(500);
  if(norm(text(editor))!==norm(prompt))throw Error('질문 전체가 입력된 것을 확인하지 못했습니다. AI 탭에서 내용을 확인해 주세요. 자동 재전송하지 않습니다.');
 }
 async function observe(job){
  let previous='',changedAt=Date.now(),firstAt=0,lastSent='',lastReport=0;const until=Date.now()+5*60*1000;
  while(!cancelled&&Date.now()<until){
   const replies=responses(),latest=replies.at(-1)||'',base=job.baseline||{count:0,text:''};
   const fresh=!!latest&&(replies.length>base.count||latest!==base.text);
   if(fresh){
    if(latest!==previous){previous=latest;changedAt=Date.now();firstAt||=Date.now();}
    if(latest!==lastSent&&Date.now()-lastReport>1000){await report('streaming','답변 받는 중',latest);lastSent=latest;lastReport=Date.now();}
    const editor=first(selectors.edit),ready=sendButton();
    if(Date.now()-changedAt>15000&&Date.now()-firstAt>15000&&!stopButton()&&editor&&!editor.disabled&&!norm(text(editor))){await report('done','답변 수집 완료',latest);return;}
   }else if(Date.now()-lastReport>10000){await report('submitted','응답 대기 중 · AI 탭에서 로그인·인증·사용량 제한을 확인할 수 있어요.');lastReport=Date.now();}
   await sleep(1200);
  }
  if(!cancelled)await report('error','응답 완료를 확인하지 못했습니다. AI 확인 버튼으로 확인해 주세요. 받은 내용은 보관했습니다.',previous||undefined);
 }
 async function run(job){
  currentJob=job;
  if(['submitted','streaming'].includes(job.state)){await observe(job);return;}
  if(job.state==='preparing'){await report('error','질문 입력 도중 화면이 다시 열렸습니다. 중복 전송을 막기 위해 멈췄어요. AI 탭을 확인해 주세요.');return;}
  let editor=null,lastReport=0;const until=Date.now()+120000;
  while(!cancelled&&Date.now()<until){editor=first(selectors.edit);if(editor&&!editor.disabled)break;if(Date.now()-lastReport>10000){await report('queued','입력창 대기 · AI 확인을 눌러 로그인·인증을 마쳐 주세요.');lastReport=Date.now();}await sleep(1000);}
  if(cancelled)return;if(!editor){await report('error','입력창을 찾지 못했습니다. 로그인이나 사이트 권한을 확인해 주세요.');return;}
  // Let initial placeholder composers hydrate before entering the prompt.
  await sleep(1500);editor=first(selectors.edit);if(!editor)throw Error('입력창이 변경됐습니다. 새 비교로 다시 실행해 주세요.');
  const claim=await send({type:'CLAIM',runId:job.runId});if(!claim?.active)return;
  await fill(editor,job.prompt);if(cancelled)return;
  let button=null;for(let i=0;i<20&&!cancelled;i++){button=sendButton();if(button&&!button.disabled)break;await sleep(300);}
  if(cancelled)return;if(!button||button.disabled)throw Error('전송 버튼이 활성화되지 않았습니다. AI 탭에서 확인해 주세요.');
  const before=responses(),baseline={count:before.length,text:before.at(-1)||''};
  const armed=await send({type:'ARM',runId:job.runId,baseline});if(!armed?.active||cancelled)return;
  currentJob.state='submitted';button.click();await observe({...job,baseline});
 }
 async function start(){if(started)return;const r=await send({type:'HELLO'});if(!r?.job)return;started=true;try{await run(r.job);}catch(e){if(!cancelled&&currentJob)await report('error',e.message||'AI 화면을 확인해 주세요.');}}
 // A new tab can finish loading before the service worker finishes assigning it.
 let probes=0;const probe=setInterval(async()=>{if(started||probes++>20){clearInterval(probe);return;}await start();},1000);start();
})();
