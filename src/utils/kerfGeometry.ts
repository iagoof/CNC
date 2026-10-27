import { pointInContour, contourArea, getContourBBox, type CncContour, type CncGeometry, type CncPoint } from './svgGeometry.ts';

const cross = (a: CncPoint, b: CncPoint) => a.x * b.y - a.y * b.x;
const subtract = (a: CncPoint, b: CncPoint): CncPoint => ({ x: a.x - b.x, y: a.y - b.y });
const same = (a: CncPoint, b: CncPoint) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-7;

// Performance optimization (⚡ Bolt):
// Imperative for-loop avoids closure allocation per vertex pair when calculating signed area.
function signedArea(points: CncPoint[]): number {
  let sum = 0;
  const len = points.length;
  for (let i = 0; i < len; i++) {
    const a = points[i];
    const b = points[(i + 1) % len];
    sum += a.x * b.y - a.y * b.x;
  }
  return sum / 2;
}

function intersects(a: CncPoint, b: CncPoint, c: CncPoint, d: CncPoint): boolean {
  if (Math.max(a.x, b.x) < Math.min(c.x, d.x) - 1e-7 || Math.max(c.x, d.x) < Math.min(a.x, b.x) - 1e-7
    || Math.max(a.y, b.y) < Math.min(c.y, d.y) - 1e-7 || Math.max(c.y, d.y) < Math.min(a.y, b.y) - 1e-7) return false;
  const ab = subtract(b, a), cd = subtract(d, c), ac = subtract(c, a);
  const divisor = cross(ab, cd);
  if (Math.abs(divisor) < 1e-10) return Math.abs(cross(ac, ab)) < 1e-8;
  const t = cross(ac, cd) / divisor, u = cross(ac, ab) / divisor;
  return t >= -1e-8 && t <= 1 + 1e-8 && u >= -1e-8 && u <= 1 + 1e-8;
}
function assertSimple(points: CncPoint[]) {
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 2; j < points.length; j++) {
      if (i === 0 && j === points.length - 1) continue;
      if (intersects(points[i], points[(i + 1) % points.length], points[j], points[(j + 1) % points.length])) {
        throw new Error('A compensação encontra um cruzamento ou elimina um detalhe. Reduza o kerf ou revise o contorno.');
      }
    }
  }
}
function offsetRing(contour: CncContour, offset: number): CncContour {
  let points = contour.points.filter((p, i, all) => i === 0 || !same(p, all[i - 1]));
  if (same(points[0], points.at(-1)!)) points = points.slice(0, -1);
  if (points.length < 3 || points.length > 5000) throw new Error('Contorno inválido ou muito complexo para compensação de kerf.');
  assertSimple(points);
  const orientation = Math.sign(signedArea(points));
  if (!orientation) throw new Error('Contorno sem área não pode receber kerf.');
  const shifted: CncPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const before = points[(i + points.length - 1) % points.length], vertex = points[i], after = points[(i + 1) % points.length];
    const prev = subtract(vertex, before), next = subtract(after, vertex);
    const aLength = Math.hypot(prev.x, prev.y), bLength = Math.hypot(next.x, next.y);
    const n1 = { x: prev.y / aLength * orientation, y: -prev.x / aLength * orientation };
    const n2 = { x: next.y / bLength * orientation, y: -next.x / bLength * orientation };
    const a = { x: vertex.x + n1.x * offset, y: vertex.y + n1.y * offset };
    const b = { x: vertex.x + n2.x * offset, y: vertex.y + n2.y * offset };
    const divisor = cross(prev, next);
    if (Math.abs(divisor) < 1e-10) {
      if (prev.x * next.x + prev.y * next.y < 0) throw new Error('Contorno com retorno sobre a mesma linha.');
      shifted.push(a); continue;
    }
    const t = cross(subtract(b, a), next) / divisor;
    const miter = { x: a.x + prev.x * t, y: a.y + prev.y * t };
    if (Math.hypot(miter.x - vertex.x, miter.y - vertex.y) > Math.abs(offset) * 10) shifted.push(a, b);
    else shifted.push(miter);
  }
  assertSimple(shifted);
  if (Math.sign(signedArea(shifted)) !== orientation) throw new Error('Kerf maior que o detalhe da peça.');
  const closed = [...shifted, { ...shifted[0] }];
  const result = { ...contour, points: closed };
  const originalArea = contourArea(contour), newArea = contourArea(result);
  if (offset < 0 && newArea >= originalArea || offset > 0 && newArea <= originalArea) throw new Error('O kerf elimina ou inverte o contorno.');
  if (shifted.some(p => pointInContour(p, contour) !== (offset < 0))) throw new Error('Kerf incompatível com os detalhes do contorno.');
  return result;
}

export function compensateGeometry(geometry: CncGeometry, kerfMm: number): CncGeometry {
  if (!Number.isFinite(kerfMm) || kerfMm < 0 || kerfMm > 10) throw new Error('Informe kerf entre 0 e 10 mm.');
  if (kerfMm === 0) return geometry;
  const cuts = geometry.contours.filter(c => c.layer === 'cut');
  if (cuts.some(c => !c.closed)) throw new Error('Compensação automática requer contornos de corte fechados.');
  if (cuts.reduce((sum, c) => sum + c.points.length, 0) > 10000) throw new Error('Projeto muito complexo para compensação automática.');
  // Performance optimization (⚡ Bolt): Precalculate AABB bounding boxes and areas
  // to avoid repeated point-in-polygon checks and O(N^2) area recalculations across cut contours.
  const bboxes = new Map(cuts.map(c => [c, getContourBBox(c)]));
  const areas = new Map(cuts.map(c => [c, contourArea(c)]));

  const contours = geometry.contours.map(c => {
    if (c.layer !== 'cut') return c;
    const p = c.points[0];
    const areaC = areas.get(c)!;
    const nesting = cuts.filter(other => {
      if (other === c) return false;
      if (areas.get(other)! <= areaC) return false;
      const box = bboxes.get(other)!;
      if (p.x < box.minX || p.x > box.maxX || p.y < box.minY || p.y > box.maxY) return false;
      return pointInContour(p, other);
    }).length;
    return offsetRing(c, (nesting % 2 === 0 ? 1 : -1) * kerfMm / 2);
  });
  // Do not allow compensation to merge previously separate parts or close a gap.
  const compensatedCuts = contours.filter(c => c.layer === 'cut');
  for (let i = 0; i < compensatedCuts.length; i++) {
    for (let j = i + 1; j < compensatedCuts.length; j++) {
      const a = compensatedCuts[i].points, b = compensatedCuts[j].points;
      for (let ai = 1; ai < a.length; ai++) for (let bi = 1; bi < b.length; bi++) {
        if (intersects(a[ai - 1], a[ai], b[bi - 1], b[bi])) throw new Error('O kerf faz contornos se cruzarem. Aumente a distância entre peças ou reduza o kerf.');
      }
    }
  }
  const all = contours.flatMap(c => c.points);
  const minX = all.reduce((min, p) => Math.min(min, p.x), 0), minY = all.reduce((min, p) => Math.min(min, p.y), 0);
  const maxX = all.reduce((max, p) => Math.max(max, p.x), geometry.widthMm), maxY = all.reduce((max, p) => Math.max(max, p.y), geometry.heightMm);
  return { ...geometry, widthMm: maxX - minX, heightMm: maxY - minY, defaultKerfMm: kerfMm,
    contours: contours.map(c => ({ ...c, points: c.points.map(p => ({ x: p.x - minX, y: p.y - minY })) })) };
}

export function geometryToSvg(geometry: CncGeometry, kerfMm: number): string {
  const paths = geometry.contours.map(c => `<path data-layer="${c.layer}" fill="none" stroke="${c.layer === 'cut' ? '#FF0000' : '#0000FF'}" stroke-width="0.1"${c.filled ? ' data-text-hatch="true"' : ''} d="M${c.points.map(p => `${p.x.toFixed(5)},${p.y.toFixed(5)}`).join('L')}${c.closed ? 'Z' : ''}"/>`).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${geometry.widthMm}mm" height="${geometry.heightMm}mm" viewBox="0 0 ${geometry.widthMm} ${geometry.heightMm}" data-thickness-mm="${geometry.thicknessMm}" data-kerf="${kerfMm}" data-kerf-applied="${kerfMm}">${paths}</svg>`;
}
