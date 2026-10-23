import React,{useEffect,useRef,useState,useSyncExternalStore} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {buildGeometricAssembly,createLaserMaterials} from './LaserModel3D';
import {useLocalStorageState} from '../../utils/useLocalStorageState';
import {useFirebase} from '../../services/firebase/FirebaseContext';
import {generateLaserAssembly,readAssemblyFromSvg,assemblyPartSvg,generateFitCoupon,type AssemblyParams,type LaserAssembly} from '../../utils/laserAssembly';
import {ASSEMBLY_PRESETS,DEFAULT_ASSEMBLY_PARAMS,parseAssemblyPrompt,describeAssembly} from '../../services/assemblyService';
import {sanitizeSvg} from '../../utils/sanitizeSvg';
import {applyKerfToSvg,calculateSvgMetrics,convertSvgToDxf,serializeSceneGroupToStl} from '../../utils/cncExporters';
import type {Material,Machine} from '../../types';
import type {NestingTransfer} from '../../utils/nestingEngine';
import type {GeneratedVectorArtifact} from './DesignStudioAiView';
import {createStandardMetadataBlock} from '../../services/geminiCncService';
import {startAssemblyAiGeneration,subscribeAssemblyGeneration,getAssemblyGeneration,applyAssemblyAiResult,type AssemblyDraft} from '../../services/assemblyAiClient';
import {APP_RELEASE} from '../../version';

type Draft=AssemblyDraft;
interface Props {
 materials?:Material[]; machines?:Machine[]; initialArtifact?:{id:string;title:string;svgString:string;thickness_mm:number}|null;
 onSendTo3D?:(artifact:GeneratedVectorArtifact)=>void; onSendToNesting?:(part:NestingTransfer)=>void;
}
const button='rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:border-amber-400 disabled:opacity-40';
const field='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
const emptyDraft:Draft={id:'',title:'',svg:'',description:''};

function AssemblyPreview({svg,explode,selected,cameraView}:{svg:string;explode:number;selected:string;cameraView:string}) {
 const mount=useRef<HTMLDivElement>(null), explodeRef=useRef(explode),selectedRef=useRef(selected);
 const viewRef=useRef(cameraView);
 const [error,setError]=useState('');
 useEffect(()=>{explodeRef.current=explode;},[explode]);
 useEffect(()=>{selectedRef.current=selected;},[selected]);
 useEffect(()=>{viewRef.current=cameraView;},[cameraView]);
 useEffect(()=>{
  const container=mount.current;if(!container||!svg)return;
  let renderer:THREE.WebGLRenderer|undefined,frame=0,observer:ResizeObserver|undefined;
  let controls:OrbitControls|undefined,scene:THREE.Scene|undefined;
  try {
   setError('');
   const kit=readAssemblyFromSvg(svg);
   scene=new THREE.Scene();scene.background=new THREE.Color('#f5f7fb');
   const w=Math.max(container.clientWidth,1),h=Math.max(container.clientHeight,400);
   const camera=new THREE.PerspectiveCamera(38,w/h,0.01,10000);
   renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(w,h);renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));container.appendChild(renderer.domElement);
   controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;
   scene.add(new THREE.AmbientLight(0xffffff,2));
   const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(30,50,40);scene.add(light);
   const materials=createLaserMaterials('mdf-cru',false);
   const model=buildGeometricAssembly(svg,kit?.params.thickness||3,undefined,materials);
   scene.add(model.group);
   const box=new THREE.Box3().setFromObject(model.group),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
   const radius=Math.max(size.x,size.y,size.z,1);
   controls.target.copy(center);controls.minDistance=radius*0.1;controls.maxDistance=radius*12;
   const grid=new THREE.GridHelper(radius*4,20,0xcbd5e1,0xe2e8f0);grid.position.y=box.min.y-0.01;scene.add(grid);
   const parts=model.parts.map((part,i)=>{
    if(part.mesh instanceof THREE.Mesh){
     const material=part.mesh.material;
     part.mesh.material=Array.isArray(material)?material.map(m=>m.clone()):material.clone();
     part.mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(part.mesh.geometry),new THREE.LineBasicMaterial({color:0x684425,transparent:true,opacity:0.5})));
    }
    return {...part,id:part.mesh.userData.partId||String(i),base:part.mesh.position.clone()};
   });
   let lastView='',lastExplode=-1;
   const animate=()=>{
    frame=requestAnimationFrame(animate);
    parts.forEach(part=>{
     part.mesh.position.copy(part.base).addScaledVector(part.explodeVector,explodeRef.current);
     if(part.mesh instanceof THREE.Mesh){
      const all=Array.isArray(part.mesh.material)?part.mesh.material:[part.mesh.material];
      all.forEach(material=>{material.transparent=!!selectedRef.current&&part.id!==selectedRef.current;material.opacity=material.transparent?0.18:1;material.depthWrite=!material.transparent;});
     }
    });
    if(viewRef.current!==lastView || lastExplode!==explodeRef.current){
     const newView=viewRef.current!==lastView;
     lastView=viewRef.current;lastExplode=explodeRef.current;
     const mode=lastView.split(':')[0];
     const direction=newView ? (mode==='front'?new THREE.Vector3(0,0,1):mode==='top'?new THREE.Vector3(0,1,0.001):mode==='side'?new THREE.Vector3(1,0,0):new THREE.Vector3(1,0.75,1)) : camera.position.clone().sub(controls!.target);
     const sphere=new THREE.Box3().setFromObject(model.group).getBoundingSphere(new THREE.Sphere());
     const vertical=THREE.MathUtils.degToRad(camera.fov),horizontal=2*Math.atan(Math.tan(vertical/2)*camera.aspect);
     const distance=sphere.radius/Math.sin(Math.min(vertical,horizontal)/2)*1.15;
     controls!.target.copy(sphere.center);camera.position.copy(sphere.center).add(direction.normalize().multiplyScalar(distance));
    }
    controls!.update();renderer!.render(scene!,camera);
   };animate();
   observer=new ResizeObserver(()=>{const width=Math.max(container.clientWidth,1),height=Math.max(container.clientHeight,1);camera.aspect=width/height;camera.updateProjectionMatrix();renderer!.setSize(width,height);});observer.observe(container);
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível abrir a prévia 3D.');}
  return ()=>{cancelAnimationFrame(frame);observer?.disconnect();controls?.dispose();scene?.traverse(obj=>{
   if(obj instanceof THREE.Mesh||obj instanceof THREE.LineSegments){obj.geometry.dispose();const mats=Array.isArray(obj.material)?obj.material:[obj.material];mats.forEach(m=>m.dispose());}
  });renderer?.dispose();renderer?.domElement.remove();};
 },[svg]);
 return <div className="relative"><div ref={mount} data-testid="assembly-3d" className="h-[440px] w-full rounded-xl overflow-hidden border border-slate-200"/>{error&&<p role="alert" className="absolute inset-4 h-fit rounded-lg bg-white p-4 text-red-700">{error} Use a chapa 2D para revisar os contornos.</p>}</div>;
}

export function LaserAssemblyWorkspace({materials=[],machines=[],initialArtifact,onSendTo3D,onSendToNesting}:Props){
 const {user,isAuthenticated,projects,syncProjectMutation}=useFirebase();
 const key=`cnc-laser-workspace-v1:${user?.uid||'guest'}`;
 const [params,setParams]=useLocalStorageState<AssemblyParams>(key+':params',DEFAULT_ASSEMBLY_PARAMS);
 const [prompt,setPrompt]=useLocalStorageState(key+':prompt','Crie uma caixa com tampa removível e encaixes, 140 x 100 x 85 mm');
 const [draft,setDraft]=useLocalStorageState<Draft>(key+':draft',emptyDraft);
 const [previous,setPrevious]=useLocalStorageState<Draft>(key+':previous',emptyDraft);
 const [lastImport,setLastImport]=useLocalStorageState(key+':last-import','');
 const [view,setView]=useLocalStorageState<'assembly'|'sheet'>(key+':view','assembly');
 const [materialId,setMaterialId]=useLocalStorageState(key+':material','');
 const [explode,setExplode]=useState(0),[selected,setSelected]=useState(''),[cameraView,setCameraView]=useState('iso');
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[saving,setSaving]=useState(false),[zoom,setZoom]=useState(1);
 const [compensated,setCompensated]=useState(true);
 const generation=useSyncExternalStore(React.useCallback(listener=>subscribeAssemblyGeneration(key,listener),[key]),()=>getAssemblyGeneration(key));
 const generating=generation.status==='running';
 useEffect(()=>{
  if(generation.status==='done'&&generation.applied){
   try{
    const saved=JSON.parse(localStorage.getItem(key+':draft')||'null') as Draft|null;
    if(saved?.generation?.id===generation.id&&saved.id!==draft.id){
     setDraft(saved);setParams(generation.result.plan.params);
     const old=JSON.parse(localStorage.getItem(key+':previous')||'null');if(old)setPrevious(old);
     setError('');setNotice(`Desenho gerado com ${generation.result.modelUsed}. Revise medidas, aberturas e encaixes.`);setSelected('');setExplode(0);setZoom(1);
    }
   }catch{setError('Não foi possível carregar o resultado salvo.');}
  }
 },[generation,key]);
 const assemblyState=React.useMemo(()=>{try{return {kit:draft.svg?readAssemblyFromSvg(draft.svg):null,error:''};}catch(e){return {kit:null,error:e instanceof Error?e.message:String(e)};}},[draft.svg]);
 const kit=assemblyState.kit;
 const draftInvalid=!!assemblyState.error;
 const metricResult=React.useMemo(()=>{try{return {metrics:draft.svg?calculateSvgMetrics(draft.svg):null,error:''};}catch(e){return {metrics:null,error:e instanceof Error?e.message:String(e)};}},[draft.svg]);
 const metrics=metricResult.metrics;
 const material=materials.find(m=>m.id===materialId);
 const dirty=kit&&JSON.stringify(kit.params)!==JSON.stringify(params);
 const run=(action:()=>void)=>{setError('');setNotice('');try{action();}catch(e){setError(e instanceof Error?e.message:String(e));}};
 const install=(assembly:LaserAssembly)=>{
  if(draft.svg)setPrevious(draft);
  setDraft({id:crypto.randomUUID(),title:assembly.title,svg:assembly.svg,description:describeAssembly(assembly)});
  setParams(assembly.params);setSelected('');setExplode(0);setZoom(1);setNotice('Montagem atualizada. O 3D e a chapa usam as mesmas peças.');
 };
 useEffect(()=>{
  if(!initialArtifact||lastImport===initialArtifact.id)return;
  try{
   const imported=readAssemblyFromSvg(initialArtifact.svgString);
   if(draft.svg)setPrevious(draft);
   setDraft({id:initialArtifact.id,title:initialArtifact.title,svg:initialArtifact.svgString,description:imported?describeAssembly(imported):'Vetor importado: a extrusão não comprova encaixes ou montagem.',importedId:initialArtifact.id});
   if(imported)setParams(imported.params);
   setLastImport(initialArtifact.id);
   setSelected('');setExplode(0);
  }catch(e){setError(e instanceof Error?e.message:String(e));}
 },[initialArtifact?.id,key]);
 const setParam=(name:keyof AssemblyParams,value:number|boolean|string)=>setParams(p=>({...p,[name]:value}));
 const exportSvg=()=>{
  if(!draft.svg)throw new Error('Gere ou abra um projeto primeiro.');
  if(draftInvalid)throw new Error(assemblyState.error);
  if(dirty)throw new Error('Aplique os novos parâmetros antes de exportar.');
  const kerf=kit?.params.kerf??params.kerf;
  return compensated?applyKerfToSvg(draft.svg,kerf):draft.svg;
 };
 const download=(text:string,extension:string,mime:string)=>{
  const url=URL.createObjectURL(new Blob([text],{type:mime}));const link=document.createElement('a');link.href=url;link.download=`${draft.title.replace(/[^a-zA-Z0-9À-ÿ-]/g,'_')}.${extension}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 const artifact=():GeneratedVectorArtifact=>{
  if(draftInvalid)throw new Error(assemblyState.error);
  if(dirty)throw new Error('Aplique os novos parâmetros antes de salvar ou transferir.');
  if(!metrics)throw new Error('O projeto não tem geometria válida.');
  return {id:draft.id,title:draft.title,description:draft.description,width_mm:metrics.widthMm,height_mm:metrics.heightMm,thickness_mm:kit?.params.thickness||metrics.thicknessMm||params.thickness,
   cutLength_mm:metrics.totalCutLengthMm,engraveArea_cm2:metrics.engraveAreaCm2,materialName:material?.name||`Chapa ${kit?.params.thickness||params.thickness} mm`,model3dType:'padrao',partsCount:kit?.parts.length||metrics.elementCount,
   svgString:draft.svg,estimatedLaserSeconds:0,aiPromptUsed:draft.generation?.prompt||prompt,metadata:createStandardMetadataBlock(kit?.params.thickness||params.thickness,kit?.params.kerf??params.kerf,draft.generation?.model||'parametric-assembly-v1')};
 };
 const sendNesting=()=>{
  if(!onSendToNesting)return;
  const a=artifact();
  const parts=kit?.parts.map(part=>{const nominal=assemblyPartSvg(kit,part),svgContent=compensated?applyKerfToSvg(nominal,kit.params.kerf):nominal,m=calculateSvgMetrics(svgContent);return {name:`${a.title} · ${part.name}`,width:m.widthMm,height:m.heightMm,cutLength_mm:m.totalCutLengthMm,svgContent,quantity:1};});
  onSendToNesting({name:a.title,width:a.width_mm,height:a.height_mm,cutLength_mm:a.cutLength_mm,svgContent:a.svgString,quantity:1,parts});
 };
 const save=async()=>{
  setError('');if(!isAuthenticated||!user){setError('Entre na sua conta para salvar na nuvem. O rascunho permanece neste navegador.');return;}
  setSaving(true);try{const a=artifact();await syncProjectMutation({id:a.id,name:a.title,ownerId:user.uid,svgContent:a.svgString,widthMm:a.width_mm,heightMm:a.height_mm,cutLengthMm:a.cutLength_mm,engraveAreaCm2:a.engraveArea_cm2,recommendedThicknessMm:a.thickness_mm,materialCategory:material?.category||'MDF',source:'local_vector'});setNotice('Projeto salvo na nuvem.');}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setSaving(false);}
 };
 const load=(svg:string,title:string,id:string)=>run(()=>{
  const loaded=readAssemblyFromSvg(svg);
  const checked=calculateSvgMetrics(svg);if(checked.totalCutLengthMm<=0)throw new Error('O SVG não contém percursos de corte.');
  if(draft.svg)setPrevious(draft);
  setDraft({id,title,svg,description:loaded?describeAssembly(loaded):'Vetor sem metadados de encaixes. A prévia mostra somente a extrusão.'});
  if(loaded)setParams(loaded.params);setSelected('');setExplode(0);
 });
 return <div className="h-full overflow-y-auto bg-slate-50 p-4 md:p-6 space-y-5 text-slate-900">
  <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest text-amber-700">Corte laser · montagem paramétrica · v{APP_RELEASE}</p><h1 className="mt-1 text-2xl font-bold">Do encaixe à montagem</h1><p className="mt-1 text-sm text-slate-600">Descreva o objeto, ajuste a chapa e confira as peças antes de exportar.</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-800">Rascunho salvo neste navegador</span></header>
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{ASSEMBLY_PRESETS.map(preset=><button key={preset.id} className={button+' text-left '+(params.model===preset.model&&(preset.model!=='box'||params.lid===preset.lid)?'border-amber-500 bg-amber-50':'')} onClick={()=>run(()=>{setPrompt(preset.prompt);install(generateLaserAssembly(parseAssemblyPrompt(preset.prompt,{...params,thickness:material?.thickness_mm||params.thickness})));})}><span className="block font-semibold">{preset.name}</span><span className="text-xs text-slate-500">Espigas, rasgos e montagem 3D</span></button>)}</div>
  {assemblyState.error&&<p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{assemblyState.error} Use Atualizar medidas e encaixes para gerar novamente este modelo.</p>}
  {error&&<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
  {notice&&<p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
  {generation.status==='error'&&<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{generation.error}</p>}
  {generating&&<p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">A IA está desenhando o projeto. Você pode trocar de menu; o resultado será salvo neste navegador.</p>}
  {generation.status==='done'&&!generation.applied&&<div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">O resultado da IA está pronto. Seu desenho atual foi preservado. <button className={button+' ml-2'} onClick={()=>run(()=>applyAssemblyAiResult(key))}>Usar resultado da IA</button></div>}
  <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
   <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 h-fit">
    <div><h2 className="font-semibold">1. Descreva sua montagem</h2><label className="mt-3 block text-xs font-medium" htmlFor="assembly-prompt">Pedido do modelo</label><textarea id="assembly-prompt" maxLength={4000} className={field+' mt-1 min-h-28'} value={prompt} onChange={e=>setPrompt(e.target.value)}/><p className="mt-2 text-xs text-slate-500">Medidas: largura × profundidade × altura. Ex.: casa 180 × 120 × 110 mm com janelas redondas, MDF 3 mm.</p><button disabled={generating||!prompt.trim()} className="mt-3 w-full rounded-lg bg-amber-500 px-4 py-2.5 font-semibold text-white hover:bg-amber-600 disabled:opacity-50" onClick={()=>{setError('');setNotice('');void startAssemblyAiGeneration(key,prompt,params).catch(()=>setError('Não foi possível iniciar a geração. Verifique o armazenamento do navegador.'));}}>{generating?'Gerando com IA…':'Gerar com IA'}</button><p className="mt-2 text-xs text-slate-500">Gemini interpreta o pedido; o CAD confere espigas, rasgos e aberturas. Famílias: caixa, casa de um andar e organizador.</p><button disabled={generating} className={button+' mt-2 w-full'} onClick={()=>run(()=>install(generateLaserAssembly(parseAssemblyPrompt(prompt,params))))}>Gerar localmente</button><p className="mt-1 text-xs text-slate-500">Modelos e interpretação local de medidas, sem consumir IA.</p></div>
    {draft.generation&&<div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950"><h2 className="font-semibold">Desenho por IA · {draft.generation.model}</h2><p className="mt-1">{draft.generation.explanation}</p>{draft.generation.assumptions.length>0&&<details className="mt-2"><summary className="cursor-pointer">Medidas e suposições da IA</summary><ul className="mt-2 list-disc pl-4 space-y-1">{draft.generation.assumptions.map((item,i)=><li key={i}>{item}</li>)}</ul></details>}</div>}
    <div className="border-t pt-4"><h2 className="font-semibold">2. Ajuste para o material</h2>
     {materials.length>0&&<label className="mt-3 block text-xs">Material cadastrado<select aria-label="Material cadastrado" className={field+' mt-1'} value={materialId} onChange={e=>{setMaterialId(e.target.value);const m=materials.find(m=>m.id===e.target.value);if(m)setParams(p=>({...p,thickness:m.thickness_mm,tabWidth:Math.max(p.tabWidth,2*m.thickness_mm)}));}}><option value="">Espessura manual</option>{materials.map(m=><option key={m.id} value={m.id}>{m.name} · {m.thickness_mm} mm</option>)}</select></label>}
     <div className="mt-3 grid grid-cols-2 gap-3">{([['width','Largura'],['depth','Profundidade'],['height','Altura das paredes'],['thickness','Espessura real'],['tabWidth','Largura da espiga'],['clearance','Folga de encaixe'],['kerf','Kerf do laser']] as const).map(([name,label])=><label key={name} className="text-xs">{label} (mm)<input aria-label={`${label} (mm)`} type="number" step={['kerf','clearance'].includes(name)?0.01:0.1} min="0" className={field+' mt-1'} value={params[name]} onChange={e=>setParam(name,e.target.value===''?0:Number(e.target.value))}/></label>)}</div>
     {params.model==='shelf'&&<label className="mt-3 block text-xs">Quantidade de prateleiras<input aria-label="Quantidade de prateleiras" type="number" min="1" max="8" step="1" className={field+' mt-1'} value={params.shelves??2} onChange={e=>setParam('shelves',Number(e.target.value))}/></label>}
     {params.model==='box'&&<label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={params.lid} onChange={e=>setParam('lid',e.target.checked)}/>Incluir tampa removível</label>}
     <p className="mt-3 text-xs text-slate-500">Folga é o espaço adicional no rasgo. Kerf é a largura removida pelo laser: será compensado uma única vez no arquivo de corte.</p>
     <button className={button+' mt-3 w-full'} onClick={()=>run(()=>install(generateLaserAssembly(params)))}>Atualizar medidas e encaixes</button>
     <button className={button+' mt-2 w-full'} onClick={()=>run(()=>{generateLaserAssembly(params);const coupon=generateFitCoupon(params);download(compensated?applyKerfToSvg(coupon,params.kerf):coupon,'svg','image/svg+xml');})}>Baixar teste de encaixe</button>
     <p className="mt-2 text-xs text-slate-500">Amostra: três rasgos, com folgas de {Math.max(0,params.clearance-0.05).toFixed(2)}, {params.clearance.toFixed(2)} e {(params.clearance+0.05).toFixed(2)} mm, da esquerda para a direita, e uma espiga para testar.</p>
     {dirty&&<p className="mt-2 text-xs text-amber-800">Há alterações de parâmetros. Atualize para aplicá-las à montagem e aos arquivos.</p>}
    </div>
    <details className="border-t pt-3"><summary className="cursor-pointer text-sm font-medium">Abrir projeto</summary><label className="mt-3 block text-xs">Importar SVG<input aria-label="Importar SVG" className="mt-2 block w-full text-xs" type="file" accept=".svg,image/svg+xml" onChange={async e=>{const file=e.target.files?.[0];if(file){if(file.size>5000000){setError('O SVG deve ter no máximo 5 MB.');return;}try{load(await file.text(),file.name.replace(/\.svg$/i,''),crypto.randomUUID());}catch(err){setError(String(err));}}}}/></label>{projects.map(project=><button key={project.id} className={button+' mt-2 w-full text-left'} onClick={()=>load(project.svgContent,project.name,project.id)}>{project.name}</button>)}{!projects.length&&<p className="mt-2 text-xs text-slate-500">Nenhum projeto disponível na nuvem.</p>}</details>
   </section>
   <section className="min-w-0 space-y-4">
    {!draft.svg?<div className="flex min-h-96 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><div><h2 className="text-xl font-semibold">Seu próximo projeto começa aqui</h2><p className="mt-2 text-sm text-slate-500">Escolha um modelo acima ou descreva sua montagem.</p></div></div>:<>
     <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 space-y-4">
      <div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-lg font-semibold">{draft.title}</h2><p className="text-xs text-slate-500">{kit?`${kit.parts.length} peças · ${kit.joints.length} pares de encaixes`:'Vetor importado · encaixes não verificados'}{metrics&&` · chapa de corte ${metrics.widthMm.toFixed(1)} × ${metrics.heightMm.toFixed(1)} mm`}</p></div><div className="flex rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Visualização"><button role="tab" aria-selected={view==='assembly'} className={button+(view==='assembly'?' bg-amber-100':'')} onClick={()=>setView('assembly')}>{kit?'Montagem 3D':'Extrusão 3D'}</button><button role="tab" aria-selected={view==='sheet'} className={button+(view==='sheet'?' bg-amber-100':'')} onClick={()=>setView('sheet')}>Chapa 2D</button></div></div>
      {view==='assembly'?<div key="assembly"><AssemblyPreview svg={draft.svg} explode={explode} selected={selected} cameraView={cameraView}/><div className="mt-3 flex flex-wrap gap-2">{(['iso','front','side','top'] as const).map((v,i)=><button className={button} key={v} onClick={()=>setCameraView(previous=>`${v}:${Number(previous.split(':')[1]||0)+1}`)}>{['Perspectiva','Frente','Lateral','Topo'][i]}</button>)}</div><label className="mt-3 flex items-center gap-3 text-sm">Vista explodida<input aria-label="Vista explodida" type="range" min="0" max="1" step="0.01" value={explode} onChange={e=>setExplode(Number(e.target.value))} className="flex-1 accent-amber-500"/><span>{Math.round(explode*100)}%</span></label></div>:<div key="sheet"><div data-testid="assembly-sheet" className="h-[440px] overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-5"><div style={{width:`${zoom*100}%`,height:`${zoom*100}%`}} className="[&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{__html:sanitizeSvg(draft.svg)}}/></div><div className="mt-3 flex items-center gap-3"><button aria-label="Diminuir zoom" className={button} onClick={()=>setZoom(Math.max(0.5,zoom-0.25))}>−</button><span className="text-xs">{Math.round(zoom*100)}%</span><button aria-label="Aumentar zoom" className={button} onClick={()=>setZoom(Math.min(3,zoom+0.25))}>+</button><span className="text-xs text-slate-500">Vermelho: corte nominal, incluindo todos os rasgos.</span></div></div>}
      {kit&&<div><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Peças da montagem · selecione para destacar no 3D</h3><div className="mt-2 flex flex-wrap gap-2"><button className={button} onClick={()=>setSelected('')}>Todas</button>{kit.parts.map(p=><button key={p.id} className={button+(selected===p.id?' border-amber-500 bg-amber-50':'')} onClick={()=>setSelected(p.id)}>{p.name} <span className="text-xs text-slate-400">{p.holes.length} rasgos</span></button>)}</div></div>}
     </div>
     <div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">3. Preparar o corte</h2><p className="mt-2 text-xs leading-relaxed text-slate-600">{draft.description}</p>{metricResult.error&&<p role="alert" className="mt-2 text-red-700">{metricResult.error}</p>}<label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={compensated} onChange={e=>setCompensated(e.target.checked)}/>Compensar kerf no SVG, DXF e nesting ({kit?.params.kerf??params.kerf} mm)</label><p className="mt-1 text-xs text-slate-500">Ao usar o arquivo compensado, desative outra compensação no software da máquina.</p><div className="mt-4 flex flex-wrap gap-2"><button disabled={!metrics||!!dirty||draftInvalid} className={button} onClick={()=>run(()=>download(exportSvg(),'svg','image/svg+xml'))}>Baixar SVG de corte</button><button disabled={!metrics||!!dirty||draftInvalid} className={button} onClick={()=>run(()=>download(draft.svg,'svg','image/svg+xml'))}>Baixar projeto editável</button><button disabled={!metrics||!!dirty||draftInvalid} className={button} onClick={()=>run(()=>download(convertSvgToDxf(exportSvg()),'dxf','application/dxf'))}>Baixar DXF</button><button disabled={!metrics||!!dirty||draftInvalid} className={button} onClick={()=>run(()=>{const m=createLaserMaterials('mdf-cru',false),model=buildGeometricAssembly(draft.svg,kit?.params.thickness||params.thickness,undefined,m);try{download(serializeSceneGroupToStl(model.group,10),'stl','model/stl');}finally{model.group.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});[m.faceMaterial,m.edgeMaterial,m.kerfMaterial].forEach(mat=>mat.dispose());}})}>Baixar montagem STL</button><button disabled={saving||!metrics||!!dirty||draftInvalid} className={button} onClick={save}>{saving?'Salvando…':'Salvar na nuvem'}</button>{onSendToNesting&&<button disabled={!metrics||!!dirty||draftInvalid} className={button} onClick={()=>run(sendNesting)}>Organizar peças no nesting</button>}{onSendTo3D&&<button disabled={!metrics||!!dirty||draftInvalid} className={button} onClick={()=>run(()=>onSendTo3D(artifact()))}>Abrir no Estúdio 3D CAD</button>}{previous.svg&&<button className={button} onClick={()=>run(()=>{const before=draft,restored=readAssemblyFromSvg(previous.svg);setDraft(previous);setPrevious(before);if(restored)setParams(restored.params);setSelected('');setExplode(0);})}>Desfazer geração</button>}</div><p className="mt-4 text-xs text-slate-500">{metrics&&`Percurso nominal: ${(metrics.totalCutLengthMm/1000).toFixed(2)} m. `}STL serve para conferir a montagem. Para a laser, use SVG ou DXF. Faça uma amostra de encaixe antes do lote.</p></div>
     {kit&&<details className="rounded-2xl border border-slate-200 bg-white p-5" open><summary className="cursor-pointer font-semibold">Sequência de montagem e conferência</summary><ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-600"><li>Corte uma amostra com a espessura e a folga escolhidas. Ajuste a folga se estiver apertada ou solta.</li><li>Encaixe as espigas inferiores do fundo e das laterais nos rasgos da base.</li><li>{kit.params.model==='shelf'?'Encaixe as prateleiras nas laterais e no fundo antes de fechar a segunda lateral.':'Encaixe a frente entre as laterais e confira os pares de espigas e rasgos.'}</li><li>{kit.params.model==='house'?'Encaixe as duas águas do telhado nos rasgos correspondentes das empenas. A cumeeira tem folga para evitar colisão.':kit.params.lid?'Finalize encaixando a tampa removível.':'Confira o esquadro e a estabilidade do conjunto.'}</li></ol><p className="mt-3 text-xs text-slate-500">A folga, a rigidez e a necessidade de cola dependem do material medido e da calibração da máquina.</p></details>}
    </>}
   </section>
  </div>
 </div>;
}
