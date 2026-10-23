import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {JSDOM} from 'jsdom';
import {generateLaserAssembly,createAssemblyGroup,generateFitCoupon} from '../src/utils/laserAssembly.ts';
import {DEFAULT_ASSEMBLY_PARAMS} from '../src/services/assemblyService.ts';
import {applyKerfToSvg,convertSvgToDxf,serializeSceneGroupToStl} from '../src/utils/cncExporters.ts';
const dom=new JSDOM('');Object.assign(globalThis,{DOMParser:dom.window.DOMParser,XMLSerializer:dom.window.XMLSerializer});
const output=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../artifacts/laser-kits');await mkdir(output,{recursive:true});
const manifest=[];
for(const [name,patch] of [
 ['caixa-aberta',{model:'box',lid:false}],['caixa-com-tampa',{model:'box',lid:true}],
 ['casa',{model:'house',width:160,depth:120,height:100}],['organizador',{model:'shelf',width:180,depth:120,height:180}]
] as const){
 const kit=generateLaserAssembly({...DEFAULT_ASSEMBLY_PARAMS,...patch});
 const cut=applyKerfToSvg(kit.svg,kit.params.kerf),group=createAssemblyGroup(kit);
 await writeFile(path.join(output,`${name}-projeto.svg`),kit.svg);
 await writeFile(path.join(output,`${name}-corte.svg`),cut);
 await writeFile(path.join(output,`${name}-corte.dxf`),convertSvgToDxf(cut));
 await writeFile(path.join(output,`${name}-montagem.stl`),serializeSceneGroupToStl(group,10));
 group.children.forEach(mesh=>(mesh as any).geometry.dispose());
 manifest.push({name,title:kit.title,parameters:kit.params,parts:kit.parts.length,joints:kit.joints.length,sheetMm:[kit.sheetWidth,kit.sheetHeight]});
}
await writeFile(path.join(output,'teste-encaixe-corte.svg'),applyKerfToSvg(generateFitCoupon(DEFAULT_ASSEMBLY_PARAMS),DEFAULT_ASSEMBLY_PARAMS.kerf));
await writeFile(path.join(output,'modelos.json'),JSON.stringify(manifest,null,2));
await writeFile(path.join(output,'LEIA-ME.txt'),'Modelos de exemplo em mm, chapa de 3 mm, folga 0,1 mm e kerf 0,15 mm.\n*-projeto.svg: geometria nominal e metadados editáveis; pode ser aberto nos dois estúdios.\n*-corte.svg e *.dxf: kerf JÁ compensado; não aplique outra compensação.\n*-montagem.stl: conferência da montagem, em mm; não é o arquivo de corte.\nComece pela amostra teste-encaixe-corte.svg: rasgos com folgas 0,05, 0,10 e 0,15 mm, da esquerda para a direita.\nAjuste espessura real, folga e kerf na plataforma conforme sua máquina/material. A montagem física ainda exige ensaio.\n');
console.log(JSON.stringify({output,models:manifest.map(m=>({name:m.name,parts:m.parts,joints:m.joints}))},null,2));
