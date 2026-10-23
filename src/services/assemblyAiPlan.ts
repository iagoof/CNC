import { generateLaserAssembly, type AssemblyParams, type LaserAssembly } from '../utils/laserAssembly';

export interface AssemblyAiPlan {
  status: 'ready'; title: string; explanation: string; assumptions: string[];
  params: AssemblyParams;
}
export interface AssemblyAiResult {
  success: true; source: 'ai'; provider: 'gemini'; modelUsed: string; generatedAt: string; plan: AssemblyAiPlan;
}

const number=(min:number,max:number)=>({type:'number',minimum:min,maximum:max});
export const ASSEMBLY_PLAN_SCHEMA = {
  type:'object',additionalProperties:false,
  required:['status','title','explanation','assumptions','params'],
  properties:{
    status:{type:'string',enum:['ready','unsupported']},title:{type:'string'},explanation:{type:'string'},
    assumptions:{type:'array',maxItems:8,items:{type:'string'}},
    params:{type:'object',additionalProperties:false,
      required:['model','width','depth','height','thickness','tabWidth','clearance','kerf','lid','shelves','openings'],
      properties:{
        model:{type:'string',enum:['box','house','shelf']},width:number(30,1200),depth:number(30,1200),height:number(30,1200),
        thickness:number(1,25),tabWidth:number(2,100),clearance:number(0,1),kerf:number(0,1),lid:{type:'boolean'},shelves:{type:'integer',minimum:1,maximum:8},
        openings:{type:'array',maxItems:16,items:{type:'object',additionalProperties:false,required:['part','shape','x','y','width','height'],properties:{
          part:{type:'string',enum:['front','back','left','right','base','top','roof-left','roof-right']},shape:{type:'string',enum:['rectangle','ellipse','circle']},
          x:number(0,1),y:number(0,1),width:number(0.02,0.8),height:number(0.02,0.8)
        }}}
      }
    }
  }
};

const isRecord=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);
export function validateAssemblyDefaults(value:unknown):AssemblyParams {
  if(!isRecord(value))throw new Error('Informe parâmetros válidos para a montagem.');
  const numeric=['width','depth','height','thickness','tabWidth','clearance','kerf','shelves'];
  if(!numeric.every(k=>typeof value[k]==='number'&&Number.isFinite(value[k]))||typeof value.lid!=='boolean')throw new Error('Informe medidas numéricas e parâmetros completos.');
  // Copy only the known properties. Untrusted extra keys never enter metadata or prompts.
  const params:AssemblyParams={model:value.model,width:value.width,depth:value.depth,height:value.height,thickness:value.thickness,tabWidth:value.tabWidth,clearance:value.clearance,kerf:value.kerf,lid:value.lid,shelves:value.shelves};
  if(value.openings!==undefined){
    if(!Array.isArray(value.openings)||value.openings.length>16)throw new Error('Informe até 16 aberturas.');
    params.openings=value.openings.map(o=>{
      if(!isRecord(o))throw new Error('Abertura inválida.');
      return {part:o.part,shape:o.shape,x:o.x,y:o.y,width:o.width,height:o.height};
    });
  }
  generateLaserAssembly(params);
  return params;
}

export function validateAssemblyPlan(value:unknown):{plan:AssemblyAiPlan;assembly:LaserAssembly} {
  if(!isRecord(value))throw new Error('A IA não retornou um plano de montagem válido.');
  if(value.status==='unsupported')throw new Error(typeof value.explanation==='string'?value.explanation.slice(0,1000):'Essa construção ainda não é suportada.');
  if(value.status!=='ready'||typeof value.title!=='string'||!value.title.trim()||value.title.length>160||typeof value.explanation!=='string'||value.explanation.length>2000||!Array.isArray(value.assumptions)||value.assumptions.length>8||!value.assumptions.every(v=>typeof v==='string'&&v.length<=500))throw new Error('A IA retornou um plano incompleto. Tente detalhar o pedido.');
  const params=validateAssemblyDefaults(value.params);
  const assembly=generateLaserAssembly(params);
  return {plan:{status:'ready',title:value.title.trim(),explanation:value.explanation,assumptions:[...value.assumptions],params:assembly.params},assembly};
}
