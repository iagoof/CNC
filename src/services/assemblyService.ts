import { generateLaserAssembly, type AssemblyParams, type LaserAssembly } from '../utils/laserAssembly';

export const DEFAULT_ASSEMBLY_PARAMS:AssemblyParams={model:'box',width:140,depth:100,height:85,thickness:3,tabWidth:10,clearance:0.1,kerf:0.15,lid:true,shelves:2};
export const ASSEMBLY_PRESETS=[
 {id:'box-open',name:'Caixa aberta',prompt:'Crie uma caixa aberta com encaixes, 140 x 100 x 85 mm',model:'box',lid:false},
 {id:'box-lid',name:'Caixa com tampa',prompt:'Crie uma caixa com tampa removível e encaixes, 140 x 100 x 85 mm',model:'box',lid:true},
 {id:'house',name:'Casa com telhado',prompt:'Desenvolva um kit de montagem de uma casa com encaixes, 160 x 120 x 100 mm',model:'house',lid:false},
 {id:'shelf',name:'Organizador',prompt:'Crie um organizador com duas prateleiras e encaixes, 180 x 120 x 180 mm',model:'shelf',lid:false}
] as const;
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const numeric=(s:string)=>Number(s.replace(',','.'));
export function parseAssemblyPrompt(prompt:string,defaults=DEFAULT_ASSEMBLY_PARAMS):AssemblyParams {
 const text=normalize(prompt);
 if(!text.trim()) throw new Error('Descreva o objeto, as medidas e o tipo de montagem.');
 if(/\b(deslizante|correr|dobradica|articulad\w*|curv\w*|helicoidal|gavetas?|redond\w*|circular|hexagonal)\b|(?:dois|duas|tres|quatro|[2-9])\s*andares|sem telhado/.test(text)) throw new Error('Este pedido exige uma construção ainda não disponível. As famílias atuais usam espigas e rasgos retos, tampa removível e telhado fixado por encaixes.');
 let model:AssemblyParams['model'];
 if(/\b(casa|casinha|house|casinha de boneca)\b/.test(text)) model='house';
 else if(/prateleir|estante|organizador/.test(text)) model='shelf';
 else if(/\b(caixa|box|estojo|bau)\b/.test(text)) model='box';
 else throw new Error('Não há família de encaixes para esse objeto. Escolha caixa, casa ou organizador, ou use Vetor livre.');
 const {openings:previousOpenings,...baseDefaults}=defaults;
 const result:AssemblyParams={...baseDefaults,model};
 const number='(\\d+(?:[.,]\\d+)?)';
 const dims=text.match(new RegExp(number+'\\s*[x×*]\\s*'+number+'\\s*[x×*]\\s*'+number+'\\s*(mm|cm)?'));
 if(dims) {const scale=dims[4]==='cm'?10:1;result.width=numeric(dims[1])*scale;result.depth=numeric(dims[2])*scale;result.height=numeric(dims[3])*scale;}
 else if(new RegExp(number+'\\s*[x×*]\\s*'+number).test(text)) throw new Error('Informe três medidas: largura × profundidade × altura, em mm.');
 const fields:[keyof AssemblyParams,string][]=[['width','largura'],['depth','profundidade'],['height','altura'],['thickness','espessura'],['tabWidth','(?:espiga|encaixe)'],['clearance','folga'],['kerf','kerf']];
 for(const [field,label] of fields) {
  const match=text.match(new RegExp('\\b'+label+'\\s*(?:de|:|=)?\\s*'+number+'\\s*(mm|cm)?'));
  if(match) (result as any)[field]=numeric(match[1])*(match[2]==='cm'?10:1);
 }
 const materialThickness=text.match(new RegExp('(?:mdf|compensado|acrilico|chapa)\\s*(?:de\\s*)?'+number+'\\s*mm'));
 if(materialThickness) result.thickness=numeric(materialThickness[1]);
 const shelves=text.match(/\b(uma|duas|tres|quatro|cinco|seis|sete|oito|\d+)\s+prateleiras?\b/);
 if(shelves) result.shelves=({uma:1,duas:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8} as Record<string,number>)[shelves[1]]||Number(shelves[1]);
 if(model==='box') {
   if(/sem tampa|aberta|aberto/.test(text)) result.lid=false;
   else if(/com tampa|fechada|fechado/.test(text)) result.lid=true;
 } else result.lid=false;
 // Let the geometry engine reject impossible values rather than silently clamping them.
 generateLaserAssembly(result);
 return result;
}
export function generateAssemblyFromPrompt(prompt:string,defaults=DEFAULT_ASSEMBLY_PARAMS):LaserAssembly {
 return generateLaserAssembly(parseAssemblyPrompt(prompt,defaults));
}
export function describeAssembly(kit:LaserAssembly):string {
 const p=kit.params;
 return `${kit.parts.length} peças, ${kit.joints.length} pares de encaixes. Largura ${p.width} × profundidade ${p.depth} × altura das paredes ${p.height} mm; chapa ${p.thickness} mm, folga ${p.clearance} mm. Espigas e rasgos pareados; kerf ${p.kerf} mm aplicado somente na exportação compensada. ${p.model==='house'?'Telhado com duas águas; a altura total inclui a elevação do telhado. ':''}Faça um teste de encaixe no material real.`;
}
