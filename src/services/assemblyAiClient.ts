import type { AssemblyParams } from '../utils/laserAssembly';
import { validateAssemblyPlan, type AssemblyAiResult } from './assemblyAiPlan';
import { describeAssembly } from './assemblyService';

export interface AssemblyDraft {
  id:string;title:string;svg:string;description:string;importedId?:string;
  generation?:{id:string;provider:string;model:string;prompt:string;generatedAt:string;assumptions:string[];explanation:string};
}
interface CompletedJob {id:string;prompt:string;result:AssemblyAiResult;applied:boolean}
type JobState={status:'idle'}|{status:'running';id:string}|({status:'done'}&CompletedJob)|{status:'error';error:string};
interface ClientDependencies {fetch?:typeof fetch;storage?:Storage}
const states=new Map<string,JobState>(),listeners=new Map<string,Set<()=>void>>();
const idle:JobState={status:'idle'};
const read=<T>(storage:Storage,key:string,fallback:T):T=>{try{return JSON.parse(storage.getItem(key)||'null')??fallback;}catch{return fallback;}};
const storageFor=(deps:ClientDependencies)=>deps.storage||window.localStorage;
function publish(key:string,state:JobState){states.set(key,state);listeners.get(key)?.forEach(fn=>fn());}
export function subscribeAssemblyGeneration(key:string,listener:()=>void){
  const group=listeners.get(key)||new Set();group.add(listener);listeners.set(key,group);
  return ()=>{group.delete(listener);if(!group.size)listeners.delete(key);};
}
export function getAssemblyGeneration(key:string):JobState {
  if(states.has(key))return states.get(key)!;
  try{
    const stored=read<CompletedJob|null>(window.localStorage,key+':ai-result',null);
    if(stored?.id&&stored.result?.source==='ai'){
      validateAssemblyPlan(stored.result.plan);
      const state:JobState={status:'done',...stored};states.set(key,state);return state;
    }
  }catch{/* An old or damaged result must not block the editor. */}
  return idle;
}

export function applyAssemblyAiResult(key:string,deps:ClientDependencies={}):void {
  const job=states.get(key);
  if(job?.status!=='done')return;
  const storage=storageFor(deps),{assembly,plan}=validateAssemblyPlan(job.result.plan);
  const current=read<AssemblyDraft|null>(storage,key+':draft',null);
  const draft:AssemblyDraft={id:job.id,title:plan.title,svg:assembly.svg,description:describeAssembly(assembly),generation:{id:job.id,provider:job.result.provider,model:job.result.modelUsed,prompt:job.prompt,generatedAt:job.result.generatedAt,assumptions:plan.assumptions,explanation:plan.explanation}};
  const keys=[key+':previous',key+':params',key+':draft',key+':ai-result'];
  const backup=keys.map(k=>storage.getItem(k));
  try{
    if(current?.svg&&current.id!==draft.id)storage.setItem(key+':previous',JSON.stringify(current));
    storage.setItem(key+':params',JSON.stringify(assembly.params));
    storage.setItem(key+':draft',JSON.stringify(draft));
    storage.setItem(key+':ai-result',JSON.stringify({...job,applied:true}));
  }catch{
    keys.forEach((k,i)=>{try{backup[i]===null?storage.removeItem(k):storage.setItem(k,backup[i]!);}catch{/* Best effort rollback when browser quota is exhausted. */}});
    throw new Error('O navegador não conseguiu salvar o resultado da IA. Libere espaço e clique em Usar resultado da IA.');
  }
  publish(key,{...job,applied:true});
}

/** The request lives outside React: menu changes do not discard an in-flight result. */
export async function startAssemblyAiGeneration(key:string,prompt:string,defaults:AssemblyParams,deps:ClientDependencies={}):Promise<void> {
  if(states.get(key)?.status==='running')return;
  const storage=storageFor(deps),expectedId=read<AssemblyDraft|null>(storage,key+':draft',null)?.id||'';
  const id=crypto.randomUUID();publish(key,{status:'running',id});
  try{
    const response=await (deps.fetch||fetch)('/api/ai/generate-assembly',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt,defaults:{...defaults,shelves:defaults.shelves??2}}),signal:AbortSignal.timeout(65000)});
    const body=await response.json().catch(()=>null);
    if(!response.ok||body?.source!=='ai'||body?.success!==true)throw new Error(body?.error||'Não foi possível obter o desenho da IA. Tente novamente.');
    if(body.provider!=='gemini'||typeof body.modelUsed!=='string'||!body.modelUsed||typeof body.generatedAt!=='string')throw new Error('A resposta não identifica o modelo de IA utilizado.');
    const {plan}=validateAssemblyPlan(body.plan);
    const result:AssemblyAiResult={success:true,source:'ai',provider:'gemini',modelUsed:body.modelUsed,generatedAt:body.generatedAt,plan};
    const job:JobState={status:'done',id,prompt,result,applied:false};
    // Retain the pending result when a different drawing was loaded during the request.
    try{storage.setItem(key+':ai-result',JSON.stringify(job));}catch{/* Result remains available in memory. */}
    states.set(key,job);
    if((read<AssemblyDraft|null>(storage,key+':draft',null)?.id||'')===expectedId){
      try{applyAssemblyAiResult(key,deps);}
      catch{publish(key,job);}
    }else publish(key,job);
  }catch(error){publish(key,{status:'error',error:(error as any)?.name==='TimeoutError'?'A IA demorou além do limite. Seu desenho foi preservado; tente novamente.':error instanceof Error?error.message:'Falha ao consultar a IA.'});}
}
