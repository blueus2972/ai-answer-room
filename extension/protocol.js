export const PROVIDERS={gemini:{url:'https://gemini.google.com/app',host:'gemini.google.com'},claude:{url:'https://claude.ai/new',host:'claude.ai'},gpt:{url:'https://chatgpt.com/',host:'chatgpt.com'},grok:{url:'https://grok.com/',host:'grok.com'}};
export const terminal=s=>['done','error','cancelled'].includes(s);
export function isClient(sender){try{const u=new URL(sender.url);return sender.frameId===0&&u.origin==='https://uriban-ai-compare.vercel.app'&&['/compare','/compare.html'].includes(u.pathname);}catch{return false;}}
export function isProvider(sender,id){try{return sender.frameId===0&&new URL(sender.url).origin===new URL(PROVIDERS[id]?.url).origin;}catch{return false;}}
export function validStart(m){return typeof m.recordId==='string'&&/^[a-z0-9-]{1,80}$/i.test(m.recordId)&&typeof m.prompt==='string'&&m.prompt.trim().length>0&&m.prompt.length<=30000;}
export function publicRun(run){return {id:run.id,recordId:run.recordId,jobs:run.jobs.map(({provider,state,message,text,tabId})=>({provider,state,message,text,hasTab:!!tabId}))};}
