import * as THREE from 'three';

export type AssemblyModel = 'box' | 'house' | 'shelf';
export type V2 = [number, number];
export type V3 = [number, number, number];
export interface AssemblyParams {
  model: AssemblyModel; width: number; depth: number; height: number;
  thickness: number; tabWidth: number; clearance: number; kerf: number; lid: boolean;
  shelves?: number;
}
export interface AssemblyPart {
  id: string; name: string; outline: V2[]; holes: V2[][];
  origin: V3; u: V3; v: V3; explode: V3;
}
export interface AssemblyJoint {
  id: string; tabPart: string; socketPart: string; tabCenter: V3; socketCenter: V3;
  tabWidth: number; slotWidth: number; slotThickness: number;
}
export interface LaserAssembly {
  version: 1; params: AssemblyParams; title: string; parts: AssemblyPart[];
  joints: AssemblyJoint[]; sheetWidth: number; sheetHeight: number; svg: string;
}
const add = (a: V3, b: V3): V3 => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
const mul = (a: V3, k: number): V3 => [a[0]*k,a[1]*k,a[2]*k];
const cross = (a: V3,b: V3): V3 => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const world = (p: AssemblyPart, a: V2): V3 => add(p.origin,add(mul(p.u,a[0]),mul(p.v,a[1])));
const rect = (w:number,h:number): V2[] => [[0,0],[w,0],[w,h],[0,h]];
const fmt = (n:number) => String(Math.round(n*1e6)/1e6);
export const polygonPath = (points: V2[]) => points.map((p,i)=>`${i ? 'L' : 'M'} ${fmt(p[0])} ${fmt(p[1])}`).join(' ')+' Z';
const bounds = (p: AssemblyPart) => ({ minX:Math.min(...p.outline.map(a=>a[0])), maxX:Math.max(...p.outline.map(a=>a[0])), minY:Math.min(...p.outline.map(a=>a[1])), maxY:Math.max(...p.outline.map(a=>a[1])) });
const positions = (length: number, width: number, t: number): number[] => {
  const margin = Math.max(2*t,width);
  if(length < 2*margin+width) throw new Error('A peça é pequena para a largura dos encaixes. Reduza a espiga ou aumente o modelo.');
  const count = Math.max(1,Math.min(5,Math.floor((length-2*margin)/(2*width))));
  return Array.from({length:count},(_,i)=>margin+width/2+(length-2*margin-width)*(count===1 ? 0.5 : i/(count-1)));
};

/** All contours use mm. Slots include clearance, while kerf is a separate export operation. */
export function generateLaserAssembly(input: AssemblyParams): LaserAssembly {
  const p = {shelves:2,...input};
  if(!['box','house','shelf'].includes(p.model)) throw new Error('Família de montagem não suportada.');
  if(!Object.entries(p).filter(([k])=>!['model','lid'].includes(k)).every(([,v])=>typeof v==='number' && Number.isFinite(v))) throw new Error('Informe medidas finitas.');
  const {width:W,depth:D,height:H,thickness:t,tabWidth:tw,clearance:c} = p;
  if(typeof p.lid!=='boolean' || !Number.isInteger(p.shelves) || p.shelves<1 || p.shelves>8) throw new Error('Informe de 1 a 8 prateleiras e uma opção de tampa válida.');
  if(t<1 || t>25 || Math.min(W,D,H)<Math.max(30,12*t) || Math.max(W,D,H)>1200) throw new Error('Dimensões entre 30 e 1200 mm, no mínimo 12 vezes a espessura (1–25 mm).');
  if(tw<2*t || tw>Math.min(W-5*t,D-5*t,H)/4) throw new Error('Largura de espiga: mínimo 2 vezes a espessura e máximo ¼ do menor painel útil.');
  if(c<0 || c>Math.min(1,t/4) || p.kerf<0 || p.kerf>Math.min(1,t/3)) throw new Error('Folga ou kerf incompatíveis com a espessura.');
  if(p.model==='shelf' && H/(p.shelves+1)<3*t+c) throw new Error('Aumente a altura ou reduza a quantidade de prateleiras para preservar o espaço entre os rasgos.');
  const parts: AssemblyPart[] = [], joints: AssemblyJoint[] = [];
  const tabs = new Map<AssemblyPart,Map<number,number[]>>();
  const addPart = (id:string,name:string,outline:V2[],origin:V3,u:V3,v:V3,explode:V3):AssemblyPart => {
    const part = {id,name,outline,holes:[],origin,u,v,explode}; parts.push(part); return part;
  };
  const base = addPart('base','Base',rect(W,D),[-W/2,0,-D/2],[1,0,0],[0,0,1],[0,-1,0]);
  const A=W/2-2*t, B=D/2-2*t, F=W-5*t, S=D-2*t;
  const rise = W*0.32;
  const sideH = p.model==='house' ? H-3*t : H;
  const frontOutline:V2[] = p.model==='house' ? [[0,0],[F,0],[F,H],[F/2,H+rise],[0,H]] : rect(F,H);
  const front = p.model==='shelf' ? null : addPart('front','Frente',frontOutline,[-F/2,t/2,B],[1,0,0],[0,1,0],[0,0,1]);
  const back = addPart('back','Fundo',frontOutline.map(a=>[...a] as V2),[-F/2,t/2,-B],[1,0,0],[0,1,0],[0,0,-1]);
  const left = addPart('left','Lateral esquerda',rect(S,sideH),[-A,t/2,-S/2],[0,0,1],[0,1,0],[-1,0,0]);
  const right = addPart('right','Lateral direita',rect(S,sideH),[A,t/2,-S/2],[0,0,1],[0,1,0],[1,0,0]);
  // A tab is cut on an edge, and its mating socket is located in the other panel's plane.
  const connect = (tab:AssemblyPart,edge:number,at:number,socket:AssemblyPart,sx:number,sy:number,horizontal:boolean) => {
    const a=tab.outline[edge], b=tab.outline[(edge+1)%tab.outline.length];
    const len=Math.hypot(b[0]-a[0],b[1]-a[1]), ux=(b[0]-a[0])/len, uy=(b[1]-a[1])/len;
    const map=tabs.get(tab)||new Map<number,number[]>(); map.set(edge,[...(map.get(edge)||[]),at]); tabs.set(tab,map);
    const center:V2=[a[0]+ux*at+uy*t/2,a[1]+uy*at-ux*t/2];
    const sw=horizontal ? tw+c : t+c, sh=horizontal ? t+c : tw+c;
    socket.holes.push([[sx-sw/2,sy-sh/2],[sx+sw/2,sy-sh/2],[sx+sw/2,sy+sh/2],[sx-sw/2,sy+sh/2]]);
    joints.push({id:`J${joints.length+1}`,tabPart:tab.id,socketPart:socket.id,tabCenter:world(tab,center),socketCenter:world(socket,[sx,sy]),tabWidth:tw,slotWidth:tw+c,slotThickness:t+c});
  };
  for(const wall of [front,back,left,right].filter(Boolean) as AssemblyPart[]) {
    const width=wall.outline[1][0];
    for(const at of positions(width,tw,t)) {
      const pt=world(wall,[at,-t/2]);
      connect(wall,0,at,base,pt[0]+W/2,pt[2]+D/2,wall===front||wall===back);
    }
  }
  for(const wall of [front,back].filter(Boolean) as AssemblyPart[]) {
    for(const at of positions(sideH,tw,t)) {
      connect(wall,1,at,right,wall.origin[2]+S/2,at,false);
      const edge=wall.outline.length-1;
      connect(wall,edge,H-at,left,wall.origin[2]+S/2,at,false);
    }
  }
  if(p.model==='box' && p.lid) {
    const lid=addPart('top','Tampa com encaixes',rect(W,D),[-W/2,H+t,-D/2],[1,0,0],[0,0,1],[0,1,0]);
    for(const wall of [front!,back,left,right]) {
      const width=wall.outline[1][0];
      for(const at of positions(width,tw,t)) {
        const pt=world(wall,[width-at,H+t/2]);
        connect(wall,2,at,lid,pt[0]+W/2,pt[2]+D/2,wall===front||wall===back);
      }
    }
  }
  if(p.model==='house') {
    // Internal openings keep a continuous frame and stay clear of the joint rows.
    const windowW=F*0.19, windowH=H*0.22, sill=H*0.48;
    for(const gable of [front!,back]) {
      for(const cx of [F*0.28,F*0.72]) gable.holes.push(rect(windowW,windowH).map(([x,y])=>[x+cx-windowW/2,y+sill]));
    }
    const L=Math.hypot(F/2,rise), co=F/2/L, si=rise/L, over=2*t, seam=t;
    const roofD=D+2*over;
    const rU:V3=[-co,si,0], lU:V3=[-co,-si,0], v:V3=[0,0,1];
    const rOrigin=add(add([F/2,H+t/2,-roofD/2],mul(rU,-over)),mul(cross(rU,v),t/2));
    const lOrigin=add(add([0,H+rise+t/2,-roofD/2],mul(lU,seam)),mul(cross(lU,v),t/2));
    const roofR=addPart('roof-right','Telhado direito',rect(L+over-seam,roofD),rOrigin,rU,v,[si,co,0]);
    const roofL=addPart('roof-left','Telhado esquerdo',rect(L+over-seam,roofD),lOrigin,lU,v,[-si,co,0]);
    for(const gable of [front!,back]) for(const at of positions(L,tw,t)) {
      connect(gable,2,at,roofR,at+over,gable.origin[2]+roofD/2,true);
      connect(gable,3,at,roofL,at-seam,gable.origin[2]+roofD/2,true);
    }
  }
  if(p.model==='shelf') {
    const shelfD=2*B-t;
    for(let index=1;index<=p.shelves;index++) {
      const y=H*index/(p.shelves+1);
      const shelf=addPart(`shelf-${index}`,`Prateleira ${index}`,rect(F,shelfD),[-F/2,y,-shelfD/2],[1,0,0],[0,0,1],[0,1,0]);
      for(const at of positions(shelfD,tw,t)) {
        connect(shelf,1,at,right,-shelfD/2+at+S/2,y-t/2,true);
        connect(shelf,3,at,left,shelfD/2-at+S/2,y-t/2,true);
      }
      for(const at of positions(F,tw,t)) connect(shelf,0,at,back,at,y-t/2,true);
    }
  }
  // Resolve edge profiles only after all joints have been assigned.
  for(const part of parts) {
    const original=part.outline, outline:V2[]=[];
    original.forEach((a,edge)=>{
      const b=original[(edge+1)%original.length], len=Math.hypot(b[0]-a[0],b[1]-a[1]);
      const ux=(b[0]-a[0])/len, uy=(b[1]-a[1])/len;
      outline.push(a);
      for(const at of (tabs.get(part)?.get(edge)||[]).sort((x,y)=>x-y)) {
        const point=(d:number,out:number):V2=>[a[0]+ux*d+uy*out,a[1]+uy*d-ux*out];
        outline.push(point(at-tw/2,0),point(at-tw/2,t),point(at+tw/2,t),point(at+tw/2,0));
      }
    });
    part.outline=outline;
  }
  const title=p.model==='house' ? 'Casa com encaixes' : p.model==='shelf' ? 'Organizador com prateleiras' : p.lid ? 'Caixa com tampa e encaixes' : 'Caixa aberta com encaixes';
  const kit:LaserAssembly={version:1,params:p,title,parts,joints,sheetWidth:0,sheetHeight:0,svg:''};
  const issues=validateAssembly(kit);
  if(issues.length) throw new Error(issues.join(' '));
  const gap=Math.max(8,3*t), rowWidth=Math.max(450,W+2*gap,D+2*gap);
  let x=gap,y=gap,rowH=0,maxX=0;
  let content='';
  for(const part of parts) {
    const b=bounds(part), w=b.maxX-b.minX,h=b.maxY-b.minY;
    if(x+w+gap>rowWidth && x>gap) { x=gap;y+=rowH+gap;rowH=0; }
    content+=`<g data-part="${part.id}" transform="translate(${fmt(x-b.minX)} ${fmt(y+b.maxY)}) scale(1 -1)"><path data-layer="cut" d="${polygonPath(part.outline)}"/>${part.holes.map(hole=>`<path data-layer="cut" d="${polygonPath(hole)}"/>`).join('')}</g>`;
    maxX=Math.max(maxX,x+w+gap);x+=w+gap;rowH=Math.max(rowH,h);
  }
  kit.sheetWidth=Math.ceil(maxX*100)/100;kit.sheetHeight=Math.ceil((y+rowH+gap)*100)/100;
  const metadata=JSON.stringify({...kit,svg:''}).replace(/</g,'\\u003c');
  kit.svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${kit.sheetWidth}mm" height="${kit.sheetHeight}mm" viewBox="0 0 ${kit.sheetWidth} ${kit.sheetHeight}" data-thickness-mm="${t}" data-kerf="${p.kerf}"><metadata id="laser-assembly">${metadata}</metadata><g fill="none" stroke="#FF0000" stroke-width="0.15">${content}</g></svg>`;
  return kit;
}

export function validateAssembly(kit:LaserAssembly):string[] {
  const issues:string[]=[];
  const ids=new Set(kit.parts.map(p=>p.id));
  for(const j of kit.joints) {
    if(!ids.has(j.tabPart)||!ids.has(j.socketPart)) issues.push(`Encaixe ${j.id} sem peça correspondente.`);
    if(Math.hypot(...j.tabCenter.map((v,i)=>v-j.socketCenter[i]))>1e-5) issues.push(`Encaixe ${j.id} desalinhado.`);
    if(j.slotWidth<j.tabWidth || j.slotThickness<kit.params.thickness) issues.push(`Rasgo ${j.id} menor que a espiga.`);
  }
  for(const part of kit.parts) {
    const b=bounds(part);
    for(const h of part.holes) if(h.some(([x,y])=>x<=b.minX || x>=b.maxX || y<=b.minY || y>=b.maxY)) issues.push(`Rasgo fora da peça ${part.name}.`);
  }
  return [...new Set(issues)];
}

export function createAssemblyGroup(kit:LaserAssembly,material?:THREE.Material):THREE.Group {
  const group=new THREE.Group();group.name=kit.title;
  const mat=material||new THREE.MeshStandardMaterial({color:0xc59760,roughness:0.8});
  for(const part of kit.parts) {
    const shape=new THREE.Shape(part.outline.map(p=>new THREE.Vector2(...p)));
    for(const hole of part.holes) shape.holes.push(new THREE.Path([...hole].reverse().map(p=>new THREE.Vector2(...p))));
    const geo=new THREE.ExtrudeGeometry(shape,{depth:kit.params.thickness,bevelEnabled:false,steps:1});
    geo.translate(0,0,-kit.params.thickness/2);geo.scale(0.1,0.1,0.1);
    const mesh=new THREE.Mesh(geo,mat);mesh.name=part.name;
    const n=cross(part.u,part.v);
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...part.u),new THREE.Vector3(...part.v),new THREE.Vector3(...n)));
    mesh.position.set(...part.origin.map(v=>v*0.1) as V3);
    mesh.userData={partId:part.id,explosionVector:part.explode,originalPosition:mesh.position.clone()};
    group.add(mesh);
  }
  return group;
}

/** One nominal piece, including all sockets, for independent nesting. */
export function assemblyPartSvg(kit:LaserAssembly,part:AssemblyPart):string {
 const b=bounds(part),margin=Math.max(1,kit.params.kerf),width=b.maxX-b.minX+2*margin,height=b.maxY-b.minY+2*margin;
 const paths=[part.outline,...part.holes].map(ring=>`<path data-layer="cut" d="${polygonPath(ring)}"/>`).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(width)}mm" height="${fmt(height)}mm" viewBox="0 0 ${fmt(width)} ${fmt(height)}" data-thickness-mm="${kit.params.thickness}"><g fill="none" stroke="#FF0000" stroke-width="0.15" transform="translate(${fmt(margin-b.minX)} ${fmt(margin+b.maxY)}) scale(1 -1)">${paths}</g></svg>`;
}

export function generateFitCoupon(params:AssemblyParams):string {
 const {thickness:t,tabWidth:tw,clearance:c}=params;
 const deltas=[Math.max(0,c-0.05),c,c+0.05],width=Math.max(100,tw*9),height=60+3*t;
 const path=(points:V2[])=>`<path data-layer="cut" d="${polygonPath(points)}"/>`;
 let shapes=path([[1,1],[width-1,1],[width-1,35],[1,35]]);
 deltas.forEach((gap,i)=>{const x=width*(i+1)/4,w=tw+gap,h=t+gap;shapes+=path([[x-w/2,18-h/2],[x+w/2,18-h/2],[x+w/2,18+h/2],[x-w/2,18+h/2]]);});
 const x=width/2,top=42+t;
 shapes+=path([[x-1.5*tw,top],[x-tw/2,top],[x-tw/2,top-t],[x+tw/2,top-t],[x+tw/2,top],[x+1.5*tw,top],[x+1.5*tw,height-1],[x-1.5*tw,height-1]]);
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}" data-thickness-mm="${t}"><desc>Da esquerda para a direita: folgas ${deltas.map(n=>fmt(n)).join(', ')} mm. Teste a espiga solta nos três rasgos.</desc><g fill="none" stroke="#FF0000" stroke-width="0.15">${shapes}</g></svg>`;
}

export function readAssemblyFromSvg(svg:string):LaserAssembly|null {
  if(!svg.includes('id="laser-assembly"')) return null;
  const doc=new DOMParser().parseFromString(svg,'image/svg+xml');
  const raw=doc.querySelector('metadata[id="laser-assembly"]')?.textContent;
  if(!raw) return null;
  try {
    const stored=JSON.parse(raw);
    if(stored.version!==1) throw new Error('Versão de montagem não suportada.');
    const kit=generateLaserAssembly(stored.params);
    const canonical=new DOMParser().parseFromString(kit.svg,'image/svg+xml');
    if(doc.querySelector('parsererror') || ['viewBox','width','height'].some(attr=>doc.documentElement.getAttribute(attr)!==canonical.documentElement.getAttribute(attr))) throw new Error('As dimensões da chapa foram alteradas.');
    const groups=Array.from(doc.querySelectorAll('g[data-part]'));
    if(groups.length!==kit.parts.length) throw new Error('O SVG não contém todas as peças da montagem.');
    for(const part of kit.parts) {
      const group=groups.find(g=>g.getAttribute('data-part')===part.id);
      const expectedGroup=canonical.querySelector(`g[data-part="${part.id}"]`);
      if(group?.getAttribute('transform')!==expectedGroup?.getAttribute('transform') || group?.parentElement?.hasAttribute('transform')) throw new Error('A posição de uma peça na chapa foi alterada.');
      const paths=group?.querySelectorAll('path');
      const expected=[part.outline,...part.holes].map(polygonPath);
      if(!paths || paths.length!==expected.length || Array.from(paths).some((path,i)=>path.getAttribute('d')!==expected[i])) throw new Error('Os contornos foram alterados; gere novamente a montagem.');
    }
    if(doc.querySelectorAll('path').length!==kit.parts.reduce((sum,part)=>sum+1+part.holes.length,0)) throw new Error('O SVG contém contornos adicionais fora da montagem.');
    return kit;
  } catch(error) { throw new Error(`Montagem inválida: ${error instanceof Error ? error.message : String(error)}`); }
}
