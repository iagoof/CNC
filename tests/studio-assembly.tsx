import {NestingView} from '../src/components/nesting/NestingView';
import type {NestingTransfer} from '../src/utils/nestingEngine';
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {FirebaseProvider} from '../src/services/firebase/FirebaseContext';
import {DesignStudioAiView,type GeneratedVectorArtifact} from '../src/components/studio3d/DesignStudioAiView';
import {DesignStudioView} from '../src/components/studio3d/DesignStudioView';
import type {Material,Machine} from '../src/types';
import '../src/index.css';
const machine:Machine={id:'assembly-test-machine',name:'Laser de teste',model:'',type:'CO2',laserPowerW:100,workAreaX_mm:600,workAreaY_mm:600,purchasePrice:0,depreciationYears:0,monthlyWorkHours:0,energyConsumptionKwh:0,monthlyMaintenanceCosts:0,tubeSpareCost:0};
const material:Material={id:'assembly-test-material',name:'MDF de teste',category:'MDF',thickness_mm:3,sheetWidth_mm:600,sheetLength_mm:600,unitCost:0,shippingCost:0,lossPercentage:0,density_kg_m3:750,speedsByMachine:[]};
function Harness(){
 const [mode,setMode]=useState('vector'),[transfer,setTransfer]=useState<GeneratedVectorArtifact|null>(null);
 const [nesting,setNesting]=useState<NestingTransfer|null>(null);
 const sendNesting=(part:NestingTransfer)=>{setNesting({...part,transferId:crypto.randomUUID(),accountId:'assembly-tests'});setMode('nesting');};
 return <div className="h-screen flex flex-col"><nav className="flex gap-4 border-b bg-slate-900 p-3 text-white"><button onClick={()=>setMode('vector')}>Estúdio vetorial (teste)</button><button onClick={()=>setMode('cad')}>Estúdio CAD (teste)</button></nav><div className="flex-1 min-h-0">{mode==='nesting'?<NestingView materials={[material]} machines={[machine]} initialPart={nesting} accountId="assembly-tests"/>:mode==='vector'?<DesignStudioAiView onSendToNesting={sendNesting} materials={[material]} machines={[machine]} onSendTo3D={a=>{setTransfer(a);setMode('cad');}}/>:<DesignStudioView onSendToNesting={sendNesting} materials={[material]} machines={[machine]} initialArtifact={transfer}/>}</div></div>;
}
createRoot(document.getElementById('root')!).render(<FirebaseProvider><Harness/></FirebaseProvider>);
