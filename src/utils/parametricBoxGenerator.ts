import * as THREE from 'three';
import { generateLaserAssembly, createAssemblyGroup, polygonPath } from './laserAssembly';

export interface BoxParams {
  widthMm: number; heightMm: number; depthMm: number; thicknessMm: number;
  tabWidthMm: number; kerfMm: number; hasLid: boolean;
}
export interface BoxFace {
  id: string; name: string; widthMm: number; heightMm: number; pathD: string;
  cutLengthMm: number; explosionVector: [number,number,number];
  position3D: [number,number,number]; rotation3D: [number,number,number];
}
export interface ParametricBoxResult {
  svgContent: string; totalWidthMm: number; totalHeightMm: number;
  totalCutLengthMm: number; faces: BoxFace[]; create3DGroup: () => THREE.Group;
}
/** Compatibility API: both the cut contours and the meshes now come from the assembly engine. */
export function generateParametricBox(params:BoxParams):ParametricBoxResult {
  const kit=generateLaserAssembly({model:'box',width:params.widthMm,depth:params.depthMm,height:params.heightMm,
    thickness:params.thicknessMm,tabWidth:params.tabWidthMm,kerf:params.kerfMm,clearance:0.1,lid:params.hasLid});
  const group=createAssemblyGroup(kit);
  const faces:BoxFace[]=kit.parts.map((part,i)=>{
    const ringLength=(ring:[number,number][])=>ring.reduce((sum,p,j)=>sum+Math.hypot(p[0]-ring[(j+1)%ring.length][0],p[1]-ring[(j+1)%ring.length][1]),0);
    const mesh=group.children[i];
    return {id:part.id,name:part.name,widthMm:Math.max(...part.outline.map(p=>p[0]))-Math.min(...part.outline.map(p=>p[0])),
      heightMm:Math.max(...part.outline.map(p=>p[1]))-Math.min(...part.outline.map(p=>p[1])),pathD:polygonPath(part.outline),
      cutLengthMm:[part.outline,...part.holes].reduce((sum,ring)=>sum+ringLength(ring),0),
      explosionVector:part.explode,position3D:part.origin,rotation3D:[mesh.rotation.x,mesh.rotation.y,mesh.rotation.z]};
  });
  group.children.forEach(child=>(child as THREE.Mesh).geometry.dispose());
  return {svgContent:kit.svg,totalWidthMm:kit.sheetWidth,totalHeightMm:kit.sheetHeight,
    totalCutLengthMm:faces.reduce((sum,face)=>sum+face.cutLengthMm,0),faces,create3DGroup:()=>{
      const result=createAssemblyGroup(kit);result.name='ParametricBox3D';
      result.children.forEach((mesh,i)=>Object.assign(mesh.userData,{partName:faces[i].name,widthMm:faces[i].widthMm,heightMm:faces[i].heightMm}));
      return result;
    }};
}
