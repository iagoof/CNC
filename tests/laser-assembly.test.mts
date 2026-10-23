import {prepareNestingItem} from '../src/utils/nestingSvg.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLaserAssembly, validateAssembly } from '../src/utils/laserAssembly.ts';
const params = { model: 'box' as const, width: 140, depth: 100, height: 85, thickness: 3, tabWidth: 10, clearance: 0.1, kerf: 0.15, lid: true };
test('caixa tem seis peças com espigas e rasgos pareados', () => {
 const kit = generateLaserAssembly(params);
 assert.equal(kit.parts.length, 6);
 assert.ok(kit.joints.length >= 12);
 assert.deepEqual(validateAssembly(kit), []);
 assert.ok(kit.parts.every(p => p.outline.length > 4 || p.holes.length > 0));
 assert.ok(kit.parts.find(p => p.id === 'base')!.holes.length >= 4);
 assert.ok(kit.svg.includes('id="laser-assembly"'));
 assert.ok(kit.svg.includes('data-part="front"'));
});
test('casa tem paredes, base e duas águas com encaixes no telhado', () => {
 const kit = generateLaserAssembly({...params, model:'house'});
 assert.equal(kit.parts.length, 7);
 assert.deepEqual(validateAssembly(kit), []);
 assert.ok(kit.joints.some(j => j.socketPart === 'roof-right'));
 assert.ok(kit.joints.some(j => j.socketPart === 'roof-left'));
});
test('dimensões impossíveis e valores não finitos são recusados', () => {
 for(const patch of [{thickness:0}, {width:NaN}, {height:10}, {clearance:-1}, {kerf:3}]) {
  assert.throws(()=>generateLaserAssembly({...params,...patch}));
 }
});
import {JSDOM} from 'jsdom';
import {readSvgGeometry,pointInContour,contourArea} from '../src/utils/svgGeometry.ts';
import {applyKerfToSvg,convertSvgToDxf,calculateSvgMetrics} from '../src/utils/cncExporters.ts';
import {createAssemblyGroup,readAssemblyFromSvg} from '../src/utils/laserAssembly.ts';
import {parseAssemblyPrompt,DEFAULT_ASSEMBLY_PARAMS} from '../src/services/assemblyService.ts';
const dom=new JSDOM('');
Object.assign(globalThis,{DOMParser:dom.window.DOMParser,XMLSerializer:dom.window.XMLSerializer});

test('organizador mantém duas prateleiras e todos os encaixes alinhados',()=>{
 const kit=generateLaserAssembly({...params,model:'shelf'});
 assert.equal(kit.parts.length,6);
 assert.equal(kit.parts.filter(p=>p.id.startsWith('shelf-')).length,2);
 assert.deepEqual(validateAssembly(kit),[]);
});
test('pedido interpreta três dimensões, espessura, folga e unidades',()=>{
 const p=parseAssemblyPrompt('casa 16 x 12 x 10 cm, espessura 3 mm, folga 0,12 mm, kerf 0,16 mm');
 assert.equal(p.model,'house');assert.equal(p.width,160);assert.equal(p.depth,120);assert.equal(p.height,100);assert.equal(p.clearance,0.12);assert.equal(p.kerf,0.16);
 assert.throws(()=>parseAssemblyPrompt('casa 100x100 mm'),/três medidas/);
 assert.throws(()=>parseAssemblyPrompt('caixa com tampa de correr'),/ainda não disponível/);
 assert.throws(()=>parseAssemblyPrompt('dragão articulado'),/disponível/);
});
test('SVG contém todos os contornos de peça e rasgos, em medidas físicas',()=>{
 for(const model of ['box','house','shelf'] as const){
  const kit=generateLaserAssembly({...params,model});
  const geometry=readSvgGeometry(kit.svg);
  assert.equal(geometry.contours.length,kit.parts.reduce((sum,p)=>sum+1+p.holes.length,0));
  assert.equal(geometry.widthMm,kit.sheetWidth);assert.equal(geometry.thicknessMm,3);
  assert.ok(geometry.contours.every(c=>c.closed));
  const compensated=applyKerfToSvg(kit.svg,params.kerf);
  assert.equal(readSvgGeometry(compensated).contours.length,geometry.contours.length);
  assert.equal(applyKerfToSvg(compensated,params.kerf),compensated);
  assert.throws(()=>applyKerfToSvg(compensated,0.2),/já recebeu/);
  assert.ok(convertSvgToDxf(compensated).includes('0\nLINE\n8\nCORTE\n'));
 }
});
test('metadados reconstroem a montagem, mas não permitem contornos alterados',()=>{
 const kit=generateLaserAssembly(params);
 assert.equal(readAssemblyFromSvg(kit.svg)!.parts.length,6);
 assert.throws(()=>readAssemblyFromSvg(kit.svg.replace('M 0 0 L','M 1 0 L')),/alterados/);
});
test('prévia é extrudada com furos e dentes, sem substituir peças por blocos',()=>{
 const kit=generateLaserAssembly(params),group=createAssemblyGroup(kit);
 assert.equal(group.children.length,6);
 for(const child of group.children){
  assert.equal((child as any).geometry.type,'ExtrudeGeometry');
  assert.ok(child.userData.partId);
 }
});
test('parâmetros variados mantêm pares coincidentes e rasgos internos separados',()=>{
 for(const t of [2,3,4,6])for(const model of ['box','house','shelf'] as const)for(const lid of [false,true]){
  const kit=generateLaserAssembly({...params,model,lid,thickness:t,width:180,depth:150,height:140,tabWidth:Math.max(12,2*t)});
  assert.deepEqual(validateAssembly(kit),[]);
  const geo=readSvgGeometry(kit.svg),cuts=geo.contours;
  const outer=cuts.filter(c=>!cuts.some(other=>other!==c&&contourArea(other)>contourArea(c)&&pointInContour(c.points[0],other)));
  assert.equal(outer.length,kit.parts.length,'nenhum rasgo pode sair de sua peça ou unir peças distintas');
 }
});
import {cleanAndUniteSvgPaths} from '../src/utils/paperVectorPreprocess.ts';
test('pré-processamento preserva furos e transformações do arquivo de corte',()=>{
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="80mm" height="80mm" viewBox="0 0 80 80"><g transform="translate(20 20)" stroke="#FF0000" fill="none"><rect data-layer="cut" width="40" height="40"/><circle data-layer="cut" cx="20" cy="20" r="5"/></g></svg>';
 const result=cleanAndUniteSvgPaths(svg);
 assert.equal(result.cleanedSvg,svg);
 assert.equal(result.totalCutPaths,2);
});
import {assemblyPartSvg,generateFitCoupon} from '../src/utils/laserAssembly.ts';
test('cada peça enviada ao nesting preserva os rasgos e a espessura',()=>{
 const kit=generateLaserAssembly({...params,model:'house'});
 for(const part of kit.parts){
  const geometry=readSvgGeometry(assemblyPartSvg(kit,part));
  assert.equal(geometry.contours.length,part.holes.length+1);
  assert.equal(geometry.thicknessMm,params.thickness);
  const compensated=applyKerfToSvg(assemblyPartSvg(kit,part),params.kerf);
  const item=prepareNestingItem({name:part.name,width:geometry.widthMm,height:geometry.heightMm,cutLength_mm:0,svgContent:compensated},'#ff0000');
  assert.equal(item.kerfApplied,true);
  assert.equal(readSvgGeometry(compensated).contours.length,part.holes.length+1);
  assert.ok(geometry.contours.every(c=>c.points.every(p=>p.x>=0&&p.y>=0&&p.x<=geometry.widthMm+1e-5&&p.y<=geometry.heightMm+1e-5)));
 }
});
test('amostra de encaixe mantém três rasgos e uma espiga, com kerf válido',()=>{
 const svg=generateFitCoupon(params),geometry=readSvgGeometry(svg);
 assert.equal(geometry.contours.length,5);
 assert.equal(readSvgGeometry(applyKerfToSvg(svg,params.kerf)).contours.length,5);
});
test('metadados não permitem alterar a posição nem adicionar cortes à montagem',()=>{
 const svg=generateLaserAssembly(params).svg;
 assert.throws(()=>readAssemblyFromSvg(svg.replace('translate(9 109)','translate(10 109)')),/posição/);
 assert.throws(()=>readAssemblyFromSvg(svg.replace('</svg>','<path d="M 0 0 L 1 0 L 1 1 Z"/></svg>')),/adicionais/);
});
test('volume dos sólidos corresponde à área de corte menos todos os furos',()=>{
 const area=(ring:[number,number][])=>Math.abs(ring.reduce((sum,p,i)=>sum+p[0]*ring[(i+1)%ring.length][1]-p[1]*ring[(i+1)%ring.length][0],0)/2);
 for(const model of ['box','house','shelf'] as const){
  const kit=generateLaserAssembly({...params,model}),group=createAssemblyGroup(kit);
  kit.parts.forEach((part,i)=>{
   const geometry=(group.children[i] as any).geometry,position=geometry.attributes.position;
   let volume=0;
   for(let v=0;v<position.count;v+=3){
    const a=[position.getX(v),position.getY(v),position.getZ(v)],b=[position.getX(v+1),position.getY(v+1),position.getZ(v+1)],c=[position.getX(v+2),position.getY(v+2),position.getZ(v+2)];
    volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
   }
   const expected=(area(part.outline)-part.holes.reduce((sum,h)=>sum+area(h),0))*params.thickness*0.001;
   assert.ok(Math.abs(Math.abs(volume)-expected)<expected*1e-5,`volume diverge na peça ${part.id}`);
  });
 }
});
test('painéis montados não penetram outros painéis fora dos rasgos',()=>{
 const signed=(point:[number,number],ring:[number,number][])=>{
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
   const a=ring[j],b=ring[i],dx=b[0]-a[0],dy=b[1]-a[1],len=dx*dx+dy*dy;
   const f=Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/len));
   if(Math.hypot(point[0]-a[0]-f*dx,point[1]-a[1]-f*dy)<1e-5)return false;
   if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
 };
 for(const model of ['box','house','shelf'] as const){
  const kit=generateLaserAssembly({...params,model});
  for(const part of kit.parts){
   const normal=[part.u[1]*part.v[2]-part.u[2]*part.v[1],part.u[2]*part.v[0]-part.u[0]*part.v[2],part.u[0]*part.v[1]-part.u[1]*part.v[0]];
   const sample=part.outline.flatMap((p,i)=>[p,[(p[0]+part.outline[(i+1)%part.outline.length][0])/2,(p[1]+part.outline[(i+1)%part.outline.length][1])/2] as [number,number]]);
   for(const xy of sample)for(const z of [-params.thickness/2,0,params.thickness/2]){
    const world=part.origin.map((v,i)=>v+part.u[i]*xy[0]+part.v[i]*xy[1]+normal[i]*z);
    for(const other of kit.parts.filter(p=>p!==part)){
     const d=world.map((v,i)=>v-other.origin[i]);
     const n=[other.u[1]*other.v[2]-other.u[2]*other.v[1],other.u[2]*other.v[0]-other.u[0]*other.v[2],other.u[0]*other.v[1]-other.u[1]*other.v[0]];
     const dot=(a:number[],b:number[])=>a.reduce((s,v,i)=>s+v*b[i],0);
     if(Math.abs(dot(d,n))>=params.thickness/2-1e-5)continue;
     const q:[number,number]=[dot(d,other.u),dot(d,other.v)];
     if(signed(q,other.outline)&&!other.holes.some(h=>signed(q,h)))assert.fail(`${model}: ${part.id} penetra ${other.id}`);
    }
   }
  }
 }
});
test('quantidade de prateleiras do pedido altera peças e encaixes',()=>{
 const p=parseAssemblyPrompt('organizador 180 x 120 x 180 mm com quatro prateleiras',DEFAULT_ASSEMBLY_PARAMS);
 const kit=generateLaserAssembly(p);
 assert.equal(kit.parts.filter(p=>p.id.startsWith('shelf-')).length,4);
 assert.equal(kit.parts.length,8);
 assert.deepEqual(validateAssembly(kit),[]);
 assert.throws(()=>parseAssemblyPrompt('caixa redonda com encaixes'),/ainda não disponível/);
 assert.throws(()=>parseAssemblyPrompt('casa de dois andares'),/ainda não disponível/);
});
