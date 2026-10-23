import test from 'node:test';
import assert from 'node:assert/strict';
import { startAssemblyAiGeneration, getAssemblyGeneration, applyAssemblyAiResult, subscribeAssemblyGeneration } from '../src/services/assemblyAiClient.ts';
import { DEFAULT_ASSEMBLY_PARAMS } from '../src/services/assemblyService.ts';

class MemoryStorage implements Storage {
  values=new Map<string,string>();
  get length(){return this.values.size;}
  clear(){this.values.clear();}
  getItem(key:string){return this.values.get(key)??null;}
  key(index:number){return [...this.values.keys()][index]??null;}
  removeItem(key:string){this.values.delete(key);}
  setItem(key:string,value:string){this.values.set(key,value);}
}
const result=()=>({success:true,source:'ai',provider:'gemini',modelUsed:'modelo-real-simulado',generatedAt:new Date().toISOString(),plan:{status:'ready',title:'Casa por IA',explanation:'Casa com telhado de duas águas.',assumptions:[],params:{...DEFAULT_ASSEMBLY_PARAMS,model:'house',lid:false,openings:[]}}});
const initial={id:'old',svg:'<svg/>',title:'Anterior',description:''};

test('o resultado persiste mesmo sem componente montado e só afeta a conta que o pediu',async()=>{
  const storage=new MemoryStorage(),key='test-navigation';
  storage.setItem(key+':draft',JSON.stringify(initial));
  storage.setItem('another-account:draft',JSON.stringify(initial));
  let resolve!: (response:Response)=>void;
  const fetch=(()=>new Promise<Response>(r=>{resolve=r;})) as typeof globalThis.fetch;
  let changes=0;const unsubscribe=subscribeAssemblyGeneration(key,()=>changes++);
  const pending=startAssemblyAiGeneration(key,'uma casa',DEFAULT_ASSEMBLY_PARAMS,{storage,fetch});
  assert.equal(getAssemblyGeneration(key).status,'running');unsubscribe();
  resolve(Response.json(result()));await pending;
  const draft=JSON.parse(storage.getItem(key+':draft')!);
  assert.equal(draft.title,'Casa por IA');assert.equal(draft.generation.model,'modelo-real-simulado');
  assert.match(draft.svg,/data-part="roof-left"/);
  assert.equal(JSON.parse(storage.getItem(key+':previous')!).id,'old');
  assert.equal(JSON.parse(storage.getItem('another-account:draft')!).id,'old');
  assert.equal(changes,1);
});

test('uma falha da IA preserva o desenho, parâmetros e histórico',async()=>{
  const storage=new MemoryStorage(),key='test-failure';
  storage.setItem(key+':draft',JSON.stringify(initial));storage.setItem(key+':params',JSON.stringify(DEFAULT_ASSEMBLY_PARAMS));
  const before=[...storage.values.entries()];
  await startAssemblyAiGeneration(key,'uma casa',DEFAULT_ASSEMBLY_PARAMS,{storage,fetch:(async()=>Response.json({error:'Cota esgotada'},{status:503})) as typeof fetch});
  assert.deepEqual([...storage.values.entries()],before);assert.equal(getAssemblyGeneration(key).status,'error');
});

test('um desenho carregado durante a geração é preservado até aplicação explícita do resultado',async()=>{
  const storage=new MemoryStorage(),key='test-conflict';storage.setItem(key+':draft',JSON.stringify(initial));
  let resolve!:(response:Response)=>void;
  const pending=startAssemblyAiGeneration(key,'uma casa',DEFAULT_ASSEMBLY_PARAMS,{storage,fetch:(()=>new Promise<Response>(r=>{resolve=r;})) as typeof fetch});
  storage.setItem(key+':draft',JSON.stringify({...initial,id:'imported',title:'Importado'}));
  resolve(Response.json(result()));await pending;
  assert.equal(JSON.parse(storage.getItem(key+':draft')!).id,'imported');
  const job=getAssemblyGeneration(key);assert.equal(job.status,'done');assert.equal((job as any).applied,false);
  applyAssemblyAiResult(key,{storage});
  assert.equal(JSON.parse(storage.getItem(key+':draft')!).title,'Casa por IA');
  assert.equal(JSON.parse(storage.getItem(key+':previous')!).id,'imported');
});
