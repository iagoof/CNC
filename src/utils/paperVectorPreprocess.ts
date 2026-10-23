import {readSvgGeometry} from './svgGeometry';
import {readAssemblyFromSvg} from './laserAssembly';
export interface PreprocessResult {
 cleanedSvg:string;unionsPerformed:number;selfIntersectionsFixed:number;
 openPathsClosed:number;totalCutPaths:number;details:string;
}
/** Inspect without changing manufacturing geometry. Contained rings are holes, not redundant solids.
 * Kept under the former API name so existing importers no longer fill slots or lose transforms.
 */
export function cleanAndUniteSvgPaths(svgString:string,thicknessMm=3,kerfMm=0.15):PreprocessResult {
 const result:PreprocessResult={cleanedSvg:svgString,unionsPerformed:0,selfIntersectionsFixed:0,openPathsClosed:0,totalCutPaths:0,details:''};
 if(!svgString){result.details='SVG vazio.';return result;}
 try {
  const assembly=readAssemblyFromSvg(svgString);
  const geometry=readSvgGeometry(svgString),cuts=geometry.contours.filter(c=>c.layer==='cut');
  result.totalCutPaths=cuts.length;
  const open=cuts.filter(c=>!c.closed).length;
  result.details=assembly?`${assembly.parts.length} peças e ${assembly.joints.length} pares de encaixes preservados; espigas, rasgos e posições mantidos.`:
   `${cuts.length} contornos de corte; furos e transformações preservados.${open?` Atenção: ${open} percursos abertos precisam de revisão.`:''} Nenhuma união destrutiva aplicada.`;
 }catch(error){result.details=`Falha na verificação: ${error instanceof Error?error.message:String(error)}`;}
 return result;
}
