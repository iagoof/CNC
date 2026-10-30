import { readSvgGeometry, orderedContours, contourLength, engravingIntervalMm, type CncGeometry } from './svgGeometry.ts';
import { compensateGeometry, geometryToSvg } from './kerfGeometry.ts';
import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';

export interface SvgMetrics {
  widthMm: number;
  heightMm: number;
  thicknessMm?: number;
  defaultKerfMm?: number;
  totalCutLengthMm: number;
  engraveAreaCm2: number;
  elementCount: number;
  layersDetected: string[];
}

export interface VectorValidationResult {
  isValid: boolean;
  issues: string[];
  warnings: string[];
  stats: {
    cutLengthMm: number;
    boundingBox: { width: number; height: number };
    totalNodes: number;
  };
}

/** Metrics and exports share the same physical geometry. */
export function calculateSvgMetrics(svgString: string): SvgMetrics {
  const geometry = readSvgGeometry(svgString);
  return {
    widthMm: geometry.widthMm, heightMm: geometry.heightMm,
    thicknessMm: geometry.thicknessMm, defaultKerfMm: geometry.defaultKerfMm,
    totalCutLengthMm: geometry.contours.filter(c => c.layer === 'cut').reduce((sum, c) => sum + contourLength(c), 0),
    engraveAreaCm2: geometry.contours.filter(c => c.layer === 'engrave').reduce((sum, c) => sum + contourLength(c) * engravingIntervalMm / 100, 0),
    elementCount: geometry.elementCount,
    layersDetected: [...new Set(geometry.contours.map(c => c.layer === 'cut' ? 'corte (#FF0000)' : 'gravação (#0000FF)'))]
  };
}

export function validateCncVector(svgString: string, machineMaxX = 1300, machineMaxY = 900): VectorValidationResult {
  const issues: string[] = [], warnings: string[] = [];
  let geometry: CncGeometry;
  try { geometry = readSvgGeometry(svgString); }
  catch (error) {
    return { isValid: false, issues: [error instanceof Error ? error.message : 'SVG inválido.'], warnings,
      stats: { cutLengthMm: 0, boundingBox: { width: 0, height: 0 }, totalNodes: 0 } };
  }
  if (![machineMaxX, machineMaxY].every(n => Number.isFinite(n) && n > 0)) issues.push('Mesa de trabalho inválida.');
  if (geometry.widthMm > machineMaxX || geometry.heightMm > machineMaxY) issues.push('Dimensões do SVG excedem a mesa de trabalho.');
  if (geometry.contours.some(c => c.points.some(p => p.x < -0.001 || p.y < -0.001 || p.x > machineMaxX + 0.001 || p.y > machineMaxY + 0.001))) {
    issues.push('Há contornos fora da mesa de trabalho.');
  }
  if (geometry.contours.some(c => c.layer === 'cut' && !c.closed)) warnings.push('Há percursos de corte abertos. Revise os pontos de início e fim.');
  return { isValid: !issues.length, issues, warnings, stats: {
    cutLengthMm: geometry.contours.filter(c => c.layer === 'cut').reduce((sum, c) => sum + contourLength(c), 0),
    boundingBox: { width: geometry.widthMm, height: geometry.heightMm },
    totalNodes: geometry.contours.reduce((sum, c) => sum + c.points.length, 0)
  } };
}

/**
 * Applies kerf compensation (+kerf/2 on outer profile, -kerf/2 on inner cutouts)
 */
export function applyKerfToSvg(svgString: string, kerfMm = 0.15): string {
  const root = new DOMParser().parseFromString(svgString, 'image/svg+xml').documentElement;
  if (root.hasAttribute('data-kerf-applied')) {
    if (Number(root.getAttribute('data-kerf-applied')) === kerfMm) return svgString;
    throw new Error('O arquivo já recebeu compensação. Use o SVG original para alterar o kerf.');
  }
  return geometryToSvg(compensateGeometry(readSvgGeometry(svgString), kerfMm), kerfMm);
}

/**
 * Converts standard SVG geometry into an AutoCAD R12 ASCII DXF file
 */
export function convertSvgToDxf(svgString: string): string {
  const geometry = readSvgGeometry(svgString);
  let dxf = '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n';
  dxf += '0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n2\n';
  dxf += '0\nLAYER\n2\nCORTE\n70\n0\n62\n1\n6\nCONTINUOUS\n';
  dxf += '0\nLAYER\n2\nGRAVACAO\n70\n0\n62\n5\n6\nCONTINUOUS\n0\nENDTAB\n0\nENDSEC\n';
  dxf += '0\nSECTION\n2\nENTITIES\n';
  for (const contour of orderedContours(geometry)) {
    const layer = contour.layer === 'cut' ? 'CORTE' : 'GRAVACAO';
    for (let i = 1; i < contour.points.length; i++) {
      const a = contour.points[i - 1], b = contour.points[i];
      dxf += `0\nLINE\n8\n${layer}\n10\n${a.x.toFixed(4)}\n20\n${(geometry.heightMm - a.y).toFixed(4)}\n30\n0\n`;
      dxf += `11\n${b.x.toFixed(4)}\n21\n${(geometry.heightMm - b.y).toFixed(4)}\n31\n0\n`;
    }
  }
  return dxf + '0\nENDSEC\n0\nEOF\n';
}

/**
 * Exports Three.js 3D scene group directly to STL file using STLExporter
 */
export function serializeSceneGroupToStl(object: THREE.Object3D, unitsToMm = 1): string {
  if (!Number.isFinite(unitsToMm) || unitsToMm <= 0) throw new Error('Escala STL inválida.');
  const exported = object.clone(true);
  exported.scale.multiplyScalar(unitsToMm);
  exported.updateMatrixWorld(true);
  const exporter = new STLExporter();
  return exporter.parse(exported, { binary: false });
}

export function exportSceneGroupToStl(object: THREE.Object3D, filename = 'modelo_cnc.stl', unitsToMm = 1): void {
  const stlString = serializeSceneGroupToStl(object, unitsToMm);

  const blob = new Blob([stlString], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface GcodeOptions {
  machineType: 'CO2' | 'Router' | 'Diodo' | 'Fibra' | 'Plasma';
  feedRate_mms: number;
  powerOrRpm: number;
  depthMm: number;
  stepDownMm?: number;
  safeZMm?: number;
  engraveFeedRate_mms?: number;
  engravePower?: number;
  engraveDepthMm?: number;
  maxXmm?: number;
  maxYmm?: number;
}

export function generateGcodeFromSvg(svgString: string, options: GcodeOptions): string {
  return generateGcodeFromGeometry(readSvgGeometry(svgString), options);
}

/** GRBL-compatible millimetre program; every rapid occurs with laser off or tool retracted. */
export function generateGcodeFromGeometry(geometry: CncGeometry, options: GcodeOptions): string {
  const { machineType, feedRate_mms, powerOrRpm, depthMm, stepDownMm = 1.5, safeZMm = 5,
    engraveFeedRate_mms = feedRate_mms, engravePower = powerOrRpm, engraveDepthMm = 0.2 } = options;
  if (![feedRate_mms, powerOrRpm, engraveFeedRate_mms, engravePower].every(v => Number.isFinite(v) && v > 0)) throw new Error('Avanço e potência/rotação devem ser positivos e finitos.');
  if (!['CO2', 'Router', 'Diodo', 'Fibra', 'Plasma'].includes(machineType)) throw new Error('Tipo de máquina inválido.');
  if (machineType === 'Plasma') throw new Error('Plasma exige perfil de perfuração, atraso e controle de altura configurados.');
  if (machineType === 'Router' && ![depthMm, stepDownMm, safeZMm, engraveDepthMm].every(v => Number.isFinite(v) && v > 0)) throw new Error('Profundidades, passo e altura segura devem ser positivos e finitos.');
  const passes = machineType === 'Router' ? Math.ceil(depthMm / stepDownMm) : 1;
  if (passes > 1000) throw new Error('Número excessivo de passes. Revise a profundidade e o passo.');
  const contours = orderedContours(geometry);
  if (!contours.length) throw new Error('Nenhum percurso para exportar.');
  if (options.maxXmm !== undefined && !(Number.isFinite(options.maxXmm) && options.maxXmm > 0)
    || options.maxYmm !== undefined && !(Number.isFinite(options.maxYmm) && options.maxYmm > 0)) throw new Error('Dimensões da mesa inválidas.');
  for (const contour of contours) {
    if (contour.points.length < 2 || contour.points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y)
      || p.x < -0.001 || p.y < -0.001 || p.x > Math.min(options.maxXmm ?? geometry.widthMm, geometry.widthMm) + 0.001
      || p.y > geometry.heightMm + 0.001 || geometry.heightMm - p.y > (options.maxYmm ?? geometry.heightMm) + 0.001)) throw new Error('Percurso fora da área útil. Revise dimensões, origem e transformações.');
  }
  const code = ['(CNC APP - contornos SVG em mm)', 'G21', 'G90', 'G17', 'G94', 'M05'];
  const xy = (p: { x: number; y: number }) => `X${p.x.toFixed(4)} Y${(geometry.heightMm - p.y).toFixed(4)}`;
  if (machineType === 'Router') code.push(`G00 Z${safeZMm.toFixed(4)}`, `M03 S${Math.round(powerOrRpm)}`, 'G04 P2');
  for (const contour of contours) {
    const engraving = contour.layer === 'engrave';
    const feed = (engraving ? engraveFeedRate_mms : feedRate_mms) * 60;
    const count = machineType === 'Router' && !engraving ? passes : 1;
    for (let pass = 1; pass <= count; pass++) {
      code.push(`(${engraving ? 'GRAVACAO' : 'CORTE'} - passe ${pass}/${count})`);
      if (machineType === 'Router') code.push(`G00 Z${safeZMm.toFixed(4)}`);
      else code.push('M05');
      code.push(`G00 ${xy(contour.points[0])}`);
      if (machineType === 'Router') {
        const depth = engraving ? Math.min(engraveDepthMm, depthMm) : Math.min(depthMm, pass * stepDownMm);
        code.push(`G01 Z${(-depth).toFixed(4)} F${Math.min(feed, 300).toFixed(2)}`);
      } else code.push(`M03 S${Math.round(engraving ? engravePower : powerOrRpm)}`);
      // Performance Optimization (⚡ Bolt):
      // Indexed loop avoids contour.points.slice(1) array allocation per contour pass.
      for (let i = 1; i < contour.points.length; i++) code.push(`G01 ${xy(contour.points[i])} F${feed.toFixed(2)}`);
      if (machineType === 'Router') code.push(`G00 Z${safeZMm.toFixed(4)}`);
      else code.push('M05');
    }
  }
  code.push('M05', 'G00 X0 Y0', 'M30');
  return code.join('\n') + '\n';
}
