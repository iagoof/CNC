import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import type { Curve, Vector2 } from 'three';

export interface CncPoint { x: number; y: number }
export interface CncContour { points: CncPoint[]; closed: boolean; layer: 'cut' | 'engrave'; source: number; filled?: boolean }
export interface CncGeometry {
  widthMm: number; heightMm: number; thicknessMm: number; defaultKerfMm: number;
  contours: CncContour[]; elementCount: number;
}
const tolerance = 0.025;
export const engravingIntervalMm = 0.1;
const maxPoints = 250000;
const distance = (a: CncPoint, b: CncPoint) => Math.hypot(a.x - b.x, a.y - b.y);
export const contourLength = (c: CncContour) => c.points.slice(1).reduce((sum, p, i) => sum + distance(c.points[i], p), 0);

function physicalMm(value: string | null): number | undefined {
  if (!value) return undefined;
  const match = value.trim().match(/^([+]?(?:\d*\.)?\d+)\s*(mm|cm|in|pt|pc|px)?$/i);
  if (!match) throw new Error(`Dimensão SVG não suportada: ${value}. Use mm, cm, in ou px.`);
  const units: Record<string, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96 };
  // Unitless app documents explicitly use one user unit per millimetre.
  return Number(match[1]) * (units[(match[2] || 'mm').toLowerCase()]);
}

function inherited(el: Element, attr: string, fallback = ''): string {
  let node: Element | null = el;
  while (node) {
    const inline = (node as SVGElement).style?.getPropertyValue(attr);
    const value = inline || node.getAttribute(attr);
    if (value) return value;
    node = node.parentElement;
  }
  return fallback;
}
function isGuide(el: Element): boolean {
  for (let node: Element | null = el; node; node = node.parentElement) {
    if (/^(guide|annotation|guia)$/i.test(node.getAttribute('data-layer') || '')
      || node.getAttribute('display') === 'none' || node.getAttribute('visibility') === 'hidden') return true;
  }
  return inherited(el, 'display') === 'none' || inherited(el, 'visibility') === 'hidden';
}

/** Rasterize actual browser glyphs to engraving scanlines. No placeholder lettering. */
function textToScanlines(root: Element, unitScale: number): void {
  for (const text of Array.from(root.querySelectorAll('text'))) {
    if (isGuide(text)) { text.remove(); continue; }
    if (text.children.length) throw new Error('Texto com tspan deve ser convertido em caminhos antes da exportação CNC.');
    const size = Number.parseFloat(inherited(text, 'font-size', '16'));
    const x = Number(text.getAttribute('x') || 0), y = Number(text.getAttribute('y') || 0);
    if (![size, x, y].every(Number.isFinite) || size <= 0) throw new Error('Posição ou tamanho de texto inválido.');
    if (text.hasAttribute('rotate') || text.hasAttribute('textLength') || text.hasAttribute('dx') || text.hasAttribute('dy')) {
      throw new Error('Converta o texto posicionado por caracteres em caminhos antes de exportar.');
    }
    if (/^(cut|corte)$/i.test(inherited(text, 'data-layer'))) throw new Error('Texto de corte deve ser convertido em contornos fechados.');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Não foi possível preparar a gravação do texto.');
    const pixelsPerUnit = unitScale / engravingIntervalMm;
    const font = `${inherited(text, 'font-style', 'normal')} ${inherited(text, 'font-weight', 'normal')} ${size * pixelsPerUnit}px ${inherited(text, 'font-family', 'sans-serif')}`;
    ctx.font = font;
    const content = text.textContent || '';
    const measured = ctx.measureText(content);
    const left = Math.ceil(Math.max(0, measured.actualBoundingBoxLeft));
    const ascent = Math.ceil(measured.actualBoundingBoxAscent || size * pixelsPerUnit);
    const descent = Math.ceil(measured.actualBoundingBoxDescent || size * pixelsPerUnit * 0.3);
    canvas.width = Math.max(1, Math.ceil(measured.width + left + 4));
    canvas.height = Math.max(1, ascent + descent + 4);
    if (canvas.width * canvas.height > 16000000) throw new Error('Texto muito grande para gerar a gravação.');
    ctx.font = font; ctx.fillStyle = '#000'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(content, left + 2, ascent + 2);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const anchor = inherited(text, 'text-anchor', 'start');
    const anchorOffset = anchor === 'middle' ? measured.width / 2 : anchor === 'end' ? measured.width : 0;
    const baseline = inherited(text, 'dominant-baseline', 'auto');
    const baselineOffset = baseline === 'middle' || baseline === 'central' ? (ascent - descent) / 2
      : /^(hanging|text-before-edge)$/.test(baseline) ? ascent : 0;
    let d = '';
    for (let row = 0; row < canvas.height; row++) {
      let start = -1;
      for (let col = 0; col <= canvas.width; col++) {
        const filled = col < canvas.width && pixels[(row * canvas.width + col) * 4 + 3] >= 128;
        if (filled && start < 0) start = col;
        if (!filled && start >= 0) {
          const py = y + (row + 0.5 - ascent - 2 + baselineOffset) / pixelsPerUnit;
          d += `M${x + (start - left - 2 - anchorOffset) / pixelsPerUnit},${py}H${x + (col - left - 2 - anchorOffset) / pixelsPerUnit}`;
          start = -1;
        }
      }
    }
    const path = root.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d); path.setAttribute('fill', 'none'); path.setAttribute('stroke', '#0000ff');
    path.setAttribute('data-layer', 'engrave'); path.setAttribute('data-text-hatch', 'true');
    if (text.hasAttribute('transform')) path.setAttribute('transform', text.getAttribute('transform')!);
    text.replaceWith(path);
  }
}

function area(contour: CncContour): number {
  return Math.abs(contour.points.slice(1).reduce((sum, p, i) => sum + contour.points[i].x * p.y - p.x * contour.points[i].y, 0) / 2);
}
export const contourArea = area;

function dashContours(contours: CncContour[], dash: string, offset: string, scale: number): CncContour[] {
  if (!dash || dash === 'none') return contours;
  let lengths = dash.trim().split(/[\s,]+/).map(Number).map(n => n * scale);
  if (!lengths.every(n => Number.isFinite(n) && n >= 0) || !lengths.some(n => n > 0)) throw new Error('Padrão de tracejado inválido.');
  if (lengths.length % 2) lengths = [...lengths, ...lengths];
  // Zero-length dots cannot become finite cutting moves.
  if (lengths.some(n => n === 0)) throw new Error('Converta tracejados com pontos de comprimento zero em caminhos.');
  const period = lengths.reduce((a, b) => a + b, 0);
  const phase = Number(offset || 0) * scale;
  if (!Number.isFinite(phase)) throw new Error('Deslocamento de tracejado inválido.');
  const result: CncContour[] = [];
  for (const contour of contours) {
    let index = 0, skip = ((phase % period) + period) % period;
    while (skip >= lengths[index]) { skip -= lengths[index]; index = (index + 1) % lengths.length; }
    let remaining = lengths[index] - skip;
    let active: CncPoint[] = [];
    const flush = () => { if (active.length > 1) result.push({ ...contour, points: active, closed: false }); active = []; };
    for (let i = 1; i < contour.points.length; i++) {
      const a = contour.points[i - 1], b = contour.points[i], length = distance(a, b);
      let consumed = 0;
      while (consumed < length - 1e-9) {
        const step = Math.min(remaining, length - consumed);
        const at = (t: number) => ({ x: a.x + (b.x - a.x) * t / length, y: a.y + (b.y - a.y) * t / length });
        if (index % 2 === 0) { if (!active.length) active.push(at(consumed)); active.push(at(consumed + step)); }
        consumed += step; remaining -= step;
        if (remaining < 1e-9) { flush(); index = (index + 1) % lengths.length; remaining = lengths[index]; }
        if (result.length > maxPoints) throw new Error('Tracejado excede o limite de percursos.');
      }
    }
    flush();
  }
  return result;
}

/** Adaptive curve flattening, measured in physical millimetres after transforms. */
function flatten(curve: Curve<Vector2>, map: (p: Vector2) => CncPoint): CncPoint[] {
  const result: CncPoint[] = [map(curve.getPoint(0))];
  function segment(t0: number, t1: number, a: CncPoint, b: CncPoint, depth: number) {
    const flat = [0.25, 0.5, 0.75].every(f => {
      const p = map(curve.getPoint(t0 + (t1 - t0) * f));
      return distance(p, { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }) <= tolerance;
    });
    if (flat) { result.push(b); return; }
    if (depth >= 18 || result.length > maxPoints) throw new Error('Curva excede o limite de complexidade CNC.');
    const mid = (t0 + t1) / 2, p = map(curve.getPoint(mid));
    segment(t0, mid, a, p, depth + 1); segment(mid, t1, p, b, depth + 1);
  }
  segment(0, 1, result[0], map(curve.getPoint(1)), 0);
  return result;
}

function hatch(contours: CncContour[], evenOdd: boolean, source: number): CncContour[] {
  const points = contours.flatMap(c => c.points);
  const minY = points.reduce((min, p) => Math.min(min, p.y), Infinity);
  const maxY = points.reduce((max, p) => Math.max(max, p.y), -Infinity);
  if ((maxY - minY) / engravingIntervalMm > 50000) throw new Error('Área de gravação muito grande.');
  const output: CncContour[] = [];
  for (let y = minY + engravingIntervalMm / 2; y < maxY; y += engravingIntervalMm) {
    const crossings: { x: number; delta: number }[] = [];
    for (const c of contours) {
      const ring = c.closed ? c.points : [...c.points, c.points[0]];
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1], b = ring[i];
        if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
          crossings.push({ x: a.x + (y - a.y) / (b.y - a.y) * (b.x - a.x), delta: b.y > a.y ? 1 : -1 });
        }
      }
    }
    crossings.sort((a, b) => a.x - b.x);
    let winding = 0, start = 0;
    for (const cross of crossings) {
      const before = evenOdd ? Math.abs(winding) % 2 !== 0 : winding !== 0;
      winding += cross.delta;
      const after = evenOdd ? Math.abs(winding) % 2 !== 0 : winding !== 0;
      if (!before && after) start = cross.x;
      if (before && !after && cross.x - start > 0.001) {
        const pair = [{ x: start, y }, { x: cross.x, y }];
        if (Math.round((y - minY) / engravingIntervalMm) % 2) pair.reverse();
        output.push({ points: pair, closed: false, layer: 'engrave', filled: true, source });
      }
    }
  }
  return output;
}

export function readSvgGeometry(svgString: string): CncGeometry {
  if (!svgString || svgString.length > 5000000 || /<!DOCTYPE|<!ENTITY/i.test(svgString)) throw new Error('SVG vazio, muito grande ou com declaração XML não permitida.');
  const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.localName !== 'svg' || doc.querySelector('parsererror')) throw new Error('Arquivo SVG inválido.');
  for (const el of Array.from(root.querySelectorAll('*'))) {
    if (isGuide(el)) { el.remove(); continue; }
    if (['script', 'foreignObject', 'image', 'use', 'svg', 'clipPath', 'mask', 'filter'].includes(el.localName)
      || el.hasAttribute('clip-path') || el.hasAttribute('mask') || el.hasAttribute('filter')) {
      throw new Error(`Elemento ${el.localName} não pode ser convertido diretamente. Converta em caminhos antes de exportar.`);
    }
  }
  const vb = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (vb && (vb.length !== 4 || !vb.every(Number.isFinite) || vb[2] <= 0 || vb[3] <= 0)) throw new Error('viewBox inválido.');
  const widthMm = physicalMm(root.getAttribute('width')) ?? vb?.[2];
  const heightMm = physicalMm(root.getAttribute('height')) ?? vb?.[3];
  if (!widthMm || !heightMm || widthMm <= 0 || heightMm <= 0) throw new Error('Declare largura e altura positivas no SVG.');
  const hasPhysicalUnit = /(?:mm|cm|in|pt|pc|px)\s*$/i.test(root.getAttribute('width') || '');
  const view = vb || [0, 0, widthMm * (hasPhysicalUnit ? 96 / 25.4 : 1), heightMm * (hasPhysicalUnit ? 96 / 25.4 : 1)];
  let sx = widthMm / view[2], sy = heightMm / view[3], ox = 0, oy = 0;
  const aspect = root.getAttribute('preserveAspectRatio') || 'xMidYMid meet';
  if (aspect !== 'none') {
    const scale = aspect.includes('slice') ? Math.max(sx, sy) : Math.min(sx, sy);
    ox = (widthMm - view[2] * scale) * (aspect.includes('xMin') ? 0 : aspect.includes('xMax') ? 1 : 0.5);
    oy = (heightMm - view[3] * scale) * (aspect.includes('YMin') ? 0 : aspect.includes('YMax') ? 1 : 0.5);
    sx = sy = scale;
  }
  textToScanlines(root, Math.max(sx, sy));
  const loader = new SVGLoader(); loader.defaultDPI = 96;
  const parsed = loader.parse(new XMLSerializer().serializeToString(root));
  const contours: CncContour[] = [];
  let nodeCount = 0, elementCount = 0;
  const map = (p: Vector2): CncPoint => ({ x: (p.x - view[0]) * sx + ox, y: (p.y - view[1]) * sy + oy });
  for (const [source, shape] of parsed.paths.entries()) {
    const node = shape.userData?.node as Element;
    const style = shape.userData?.style as { opacity?: number; fill?: string; stroke?: string;
      fillOpacity?: number; strokeOpacity?: number; fillRule?: string; visibility?: string };
    if (!node || isGuide(node) || style?.opacity === 0) continue;
    const layerValue = inherited(node, 'data-layer').toLowerCase();
    const blue = /^(blue|#0000ff|#00f|#3b82f6)$/i;
    const layer = /^(engrave|gravacao|gravação)$/.test(layerValue) || (!/^(cut|corte)$/.test(layerValue) && (blue.test(style?.stroke || '') || blue.test(style?.fill || ''))) ? 'engrave' : 'cut';
    const local: CncContour[] = [];
    for (const path of shape.subPaths) {
      const points: CncPoint[] = [];
      for (const curve of path.curves) {
        const sampled = flatten(curve, map);
        points.push(...(points.length ? sampled.slice(1) : sampled));
      }
      if (points.length < 2) continue;
      if (!points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) < 1e6 && Math.abs(p.y) < 1e6)) throw new Error('Coordenadas CNC inválidas.');
      const closed = path.autoClose || distance(points[0], points.at(-1)!) < 1e-6;
      if (closed && distance(points[0], points.at(-1)!) > 1e-6) points.push({ ...points[0] });
      nodeCount += points.length;
      if (nodeCount > maxPoints) throw new Error('Projeto excede o limite de pontos CNC.');
      local.push({ points, closed, layer, source, filled: node.hasAttribute('data-text-hatch') });
    }
    if (!local.length) continue;
    elementCount++;
    const dash = inherited(node, 'stroke-dasharray');
    const transform = shape.userData?.transform as { elements: number[] } | undefined;
    const tsx = transform ? Math.hypot(transform.elements[0], transform.elements[1]) : 1;
    const tsy = transform ? Math.hypot(transform.elements[3], transform.elements[4]) : 1;
    if (dash && dash !== 'none' && (Math.abs(tsx * sx - tsy * sy) > 1e-6)) throw new Error('Converta o tracejado com escala não uniforme em caminhos.');
    const strokeContours = dashContours(local, dash, inherited(node, 'stroke-dashoffset'), tsx * sx);
    if (layer === 'engrave' && style?.fill && style.fill !== 'none' && style.fillOpacity !== 0) {
      contours.push(...hatch(local, style.fillRule === 'evenodd', source));
      if (style?.stroke && style.stroke !== 'none' && style.strokeOpacity !== 0) contours.push(...strokeContours);
    } else contours.push(...strokeContours);
    if (contours.length > maxPoints) throw new Error('Projeto excede o limite de percursos CNC.');
  }
  if (!contours.length) throw new Error('Nenhum contorno de corte ou gravação encontrado.');
  const readMeta = (attr: string, tag: string, fallback: number) => {
    const value = Number(root.getAttribute(attr) ?? root.querySelector(tag)?.textContent ?? fallback);
    if (!Number.isFinite(value) || value < 0) throw new Error('Metadados de espessura ou kerf inválidos.');
    return value;
  };
  return { widthMm, heightMm, contours, elementCount,
    thicknessMm: readMeta('data-thickness-mm', 'materialThickness_mm', 3),
    defaultKerfMm: readMeta('data-kerf', 'defaultKerf_mm', 0.15) };
}

export interface ContourBBox { minX: number; maxX: number; minY: number; maxY: number }

export function getContourBBox(contour: CncContour): ContourBBox {
  const pts = contour.points;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}

export function pointInContour(point: CncPoint, contour: CncContour): boolean {
  const pts = contour.points;
  if (pts.length < 3) return false;

  // Performance optimization (⚡ Bolt):
  // Fast axis-aligned bounding box (AABB) early pruning skips expensive
  // point-in-polygon ray casting loops when point is outside contour bounding box.
  let minX = pts[0].x, maxX = pts[0].x, minY = pts[0].y, maxY = pts[0].y;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (point.x < minX || point.x > maxX || point.y < minY || point.y > maxY) return false;

  let inside = false;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Engrave before cutting; release inner contours before their containing exterior. */
export function orderedContours(geometry: CncGeometry): CncContour[] {
  const cuts = geometry.contours.filter(c => c.layer === 'cut');
  const areas = new Map(cuts.map(c => [c, area(c)]));
  // Performance optimization (⚡ Bolt): Precalculate AABB bounding boxes once
  // to avoid O(N^2) repeated point-in-polygon calculations across non-overlapping contours.
  const bboxes = new Map(cuts.map(c => [c, getContourBBox(c)]));

  const depths = new Map(cuts.map(c => [c, cuts.filter(other => {
    if (other === c || !other.closed) return false;
    if (areas.get(other)! <= areas.get(c)!) return false;
    const box = bboxes.get(other)!;
    const p = c.points[0];
    if (p.x < box.minX || p.x > box.maxX || p.y < box.minY || p.y > box.maxY) return false;
    return pointInContour(p, other);
  }).length]));

  return [...geometry.contours].sort((a, b) => a.layer !== b.layer ? a.layer === 'engrave' ? -1 : 1
    : a.layer === 'cut' ? depths.get(b)! - depths.get(a)! || areas.get(a)! - areas.get(b)! : a.source - b.source);
}
