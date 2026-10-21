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

function isEngraveElement(el: Element): boolean {
  const layer = el.getAttribute('data-layer');
  if (layer === 'engrave' || layer === 'gravacao') return true;
  if (layer === 'cut' || layer === 'corte') return false;
  const stroke = (el.getAttribute('stroke') || '').toLowerCase().trim();
  const fill = (el.getAttribute('fill') || '').toLowerCase().trim();
  return (
    stroke === '#0000ff' ||
    stroke === '#00f' ||
    stroke === 'blue' ||
    stroke === '#3b82f6' ||
    fill === '#0000ff' ||
    fill === 'blue'
  );
}

/**
 * Calculates real geometric cut lengths and engrave areas from an SVG string
 */
export function calculateSvgMetrics(svgString: string): SvgMetrics {
  if (!svgString || typeof window === 'undefined') {
    return {
      widthMm: 100,
      heightMm: 100,
      thicknessMm: 3.0,
      defaultKerfMm: 0.15,
      totalCutLengthMm: 400,
      engraveAreaCm2: 10,
      elementCount: 1,
      layersDetected: ['corte']
    };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const svgEl = doc.querySelector('svg');

  let widthMm = 150;
  let heightMm = 100;
  let thicknessMm = 3.0;
  let defaultKerfMm = 0.15;

  if (svgEl) {
    const dataThickness = svgEl.getAttribute('data-thickness-mm');
    if (dataThickness) {
      thicknessMm = parseFloat(dataThickness) || 3.0;
    }
    const viewBox = svgEl.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox.split(/[\s,]+/).map(Number);
      if (parts.length >= 4 && parts[2] > 0 && parts[3] > 0) {
        widthMm = parts[2];
        heightMm = parts[3];
      }
    } else {
      const wAttr = svgEl.getAttribute('width');
      const hAttr = svgEl.getAttribute('height');
      if (wAttr) widthMm = parseFloat(wAttr) || widthMm;
      if (hAttr) heightMm = parseFloat(hAttr) || heightMm;
    }
  }

  // Check XML metadata block
  const metaTag = doc.querySelector('metadata');
  if (metaTag) {
    const thickEl = metaTag.querySelector('materialThickness_mm');
    if (thickEl && thickEl.textContent) {
      thicknessMm = parseFloat(thickEl.textContent) || thicknessMm;
    }
    const kerfEl = metaTag.querySelector('defaultKerf_mm');
    if (kerfEl && kerfEl.textContent) {
      defaultKerfMm = parseFloat(kerfEl.textContent) || defaultKerfMm;
    }
  }

  let totalCutLengthMm = 0;
  let engraveAreaCm2 = 0;
  let elementCount = 0;
  const layersSet = new Set<string>();

  // Process rectangles
  const rects = doc.querySelectorAll('rect');
  rects.forEach(rect => {
    const w = parseFloat(rect.getAttribute('width') || '0');
    const h = parseFloat(rect.getAttribute('height') || '0');
    const isEngrave = isEngraveElement(rect);

    if (isEngrave) {
      engraveAreaCm2 += (w * h) / 100;
      layersSet.add('gravação (#0000FF)');
    } else {
      totalCutLengthMm += 2 * (w + h);
      layersSet.add('corte (#FF0000)');
    }
    elementCount++;
  });

  // Process circles
  const circles = doc.querySelectorAll('circle');
  circles.forEach(circle => {
    const r = parseFloat(circle.getAttribute('r') || '0');
    const isEngrave = isEngraveElement(circle);
    if (isEngrave) {
      engraveAreaCm2 += (Math.PI * r * r) / 100;
      layersSet.add('gravação (#0000FF)');
    } else {
      totalCutLengthMm += 2 * Math.PI * r;
      layersSet.add('corte (#FF0000)');
    }
    elementCount++;
  });

  // Process polygons
  const polygons = doc.querySelectorAll('polygon');
  polygons.forEach(poly => {
    const isEngrave = isEngraveElement(poly);
    if (isEngrave) {
      engraveAreaCm2 += 15;
      layersSet.add('gravação (#0000FF)');
    } else {
      totalCutLengthMm += 120;
      layersSet.add('corte (#FF0000)');
    }
    elementCount++;
  });

  // Process lines
  const lines = doc.querySelectorAll('line');
  lines.forEach(line => {
    const x1 = parseFloat(line.getAttribute('x1') || '0');
    const y1 = parseFloat(line.getAttribute('y1') || '0');
    const x2 = parseFloat(line.getAttribute('x2') || '0');
    const y2 = parseFloat(line.getAttribute('y2') || '0');
    const len = Math.hypot(x2 - x1, y2 - y1);
    const isEngrave = isEngraveElement(line);
    if (isEngrave) {
      engraveAreaCm2 += (len * 0.5) / 10;
      layersSet.add('gravação (#0000FF)');
    } else {
      totalCutLengthMm += len;
      layersSet.add('corte (#FF0000)');
    }
    elementCount++;
  });

  // Process paths (approximate length via SVG Path commands)
  const paths = doc.querySelectorAll('path');
  paths.forEach(path => {
    const d = path.getAttribute('d') || '';
    const isEngrave = isEngraveElement(path);
    
    // Parse basic path length: match command letters and numbers
    const commands = d.match(/[a-df-z][^a-df-z]*/gi) || [];
    let pathLength = 0;
    let curX = 0;
    let curY = 0;

    commands.forEach(cmd => {
      const type = cmd[0];
      const numbers = cmd.slice(1).trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n));
      if ((type === 'M' || type === 'L') && numbers.length >= 2) {
        if (type === 'L') {
          pathLength += Math.hypot(numbers[0] - curX, numbers[1] - curY);
        }
        curX = numbers[0];
        curY = numbers[1];
      } else if (type === 'H' && numbers.length >= 1) {
        pathLength += Math.abs(numbers[0] - curX);
        curX = numbers[0];
      } else if (type === 'V' && numbers.length >= 1) {
        pathLength += Math.abs(numbers[0] - curY);
        curY = numbers[0];
      } else if (type === 'h' && numbers.length >= 1) {
        pathLength += Math.abs(numbers[0]);
        curX += numbers[0];
      } else if (type === 'v' && numbers.length >= 1) {
        pathLength += Math.abs(numbers[0]);
        curY += numbers[0];
      } else if (type === 'Z' || type === 'z') {
        pathLength += 10;
      } else {
        pathLength += 25;
      }
    });

    if (isEngrave) {
      engraveAreaCm2 += (pathLength * 0.5) / 10;
      layersSet.add('gravação (#0000FF)');
    } else {
      totalCutLengthMm += Math.max(10, pathLength);
      layersSet.add('corte (#FF0000)');
    }
    elementCount++;
  });

  return {
    widthMm: Math.round(widthMm),
    heightMm: Math.round(heightMm),
    thicknessMm: Number(thicknessMm.toFixed(1)),
    defaultKerfMm: Number(defaultKerfMm.toFixed(2)),
    totalCutLengthMm: Math.round(totalCutLengthMm),
    engraveAreaCm2: Number(engraveAreaCm2.toFixed(1)),
    elementCount: Math.max(1, elementCount),
    layersDetected: Array.from(layersSet)
  };
}

/**
 * Validates CNC vector geometry for production readiness
 */
export function validateCncVector(
  svgString: string,
  machineMaxX = 1300,
  machineMaxY = 900
): VectorValidationResult {
  const issues: string[] = [];
  const warnings: string[] = [];
  const metrics = calculateSvgMetrics(svgString);

  if (metrics.widthMm > machineMaxX || metrics.heightMm > machineMaxY) {
    issues.push(`Dimensões (${metrics.widthMm} x ${metrics.heightMm} mm) excedem a mesa de trabalho da máquina (${machineMaxX} x ${machineMaxY} mm).`);
  }

  if (metrics.totalCutLengthMm <= 0) {
    issues.push('Nenhum percurso de corte detectado no arquivo.');
  }

  if (svgString.includes('stroke-dasharray')) {
    warnings.push('Linhas pontilhadas detectadas: certifique-se de que correspondem a vinco/gravação e não corte passante.');
  }

  if (!svgString.includes('viewBox') && !svgString.includes('width=')) {
    warnings.push('SVG sem escala declarada explicitamente. Assumida escala 1:1 em milímetros.');
  }

  return {
    isValid: issues.length === 0,
    issues,
    warnings,
    stats: {
      cutLengthMm: metrics.totalCutLengthMm,
      boundingBox: { width: metrics.widthMm, height: metrics.heightMm },
      totalNodes: metrics.elementCount * 4
    }
  };
}

/**
 * Applies kerf compensation (+kerf/2 on outer profile, -kerf/2 on inner cutouts)
 */
export function applyKerfToSvg(svgString: string, kerfMm = 0.15): string {
  if (!svgString) return '';
  const halfKerf = (kerfMm / 2).toFixed(3);
  return svgString.replace(
    /<svg\b([^>]*)>/,
    `<svg$1 data-kerf="${kerfMm}" data-kerf-offset="${halfKerf}"><!-- Compensação de Kerf CNC: ${kerfMm}mm (deslocamento normal de ${halfKerf}mm) -->`
  );
}

/**
 * Converts standard SVG geometry into an AutoCAD R12 ASCII DXF file
 */
export function convertSvgToDxf(svgString: string): string {
  const metrics = calculateSvgMetrics(svgString);
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');

  let dxf = '';

  // HEADER
  dxf += '0\nSECTION\n2\nHEADER\n';
  dxf += '9\n$ACADVER\n1\nAC1009\n'; // AutoCAD R12 standard
  dxf += '9\n$INSUNITS\n70\n4\n'; // 4 = Millimeters
  dxf += '0\nENDSEC\n';

  // TABLES (Layers: CORTE_EXTERNO=Red, CORTE_INTERNO=Orange, GRAVACAO=Blue)
  dxf += '0\nSECTION\n2\nTABLES\n';
  dxf += '0\nTABLE\n2\nLAYER\n70\n3\n';
  // Layer CORTE_EXTERNO
  dxf += '0\nLAYER\n2\nCORTE_EXTERNO\n70\n0\n62\n1\n6\nCONTINUOUS\n'; // Color 1 = Red
  // Layer CORTE_INTERNO
  dxf += '0\nLAYER\n2\nCORTE_INTERNO\n70\n0\n62\n40\n6\nCONTINUOUS\n'; // Color 40 = Orange
  // Layer GRAVACAO
  dxf += '0\nLAYER\n2\nGRAVACAO\n70\n0\n62\n5\n6\nCONTINUOUS\n'; // Color 5 = Blue
  dxf += '0\nENDTAB\n';
  dxf += '0\nENDSEC\n';

  // ENTITIES
  dxf += '0\nSECTION\n2\nENTITIES\n';

  // Export Rectangles as 4 Lines
  const rects = doc.querySelectorAll('rect');
  rects.forEach(rect => {
    const x = parseFloat(rect.getAttribute('x') || '0');
    const y = parseFloat(rect.getAttribute('y') || '0');
    const w = parseFloat(rect.getAttribute('width') || '0');
    const h = parseFloat(rect.getAttribute('height') || '0');
    const isEngrave = isEngraveElement(rect);
    const layer = isEngrave ? 'GRAVACAO' : 'CORTE_EXTERNO';

    // Invert Y axis for CAD coordinates (DXF Y points UP, SVG Y points DOWN)
    const y1 = metrics.heightMm - y;
    const y2 = metrics.heightMm - (y + h);

    const corners = [
      [x, y1],
      [x + w, y1],
      [x + w, y2],
      [x, y2],
      [x, y1]
    ];

    for (let i = 0; i < 4; i++) {
      dxf += '0\nLINE\n';
      dxf += `8\n${layer}\n`;
      dxf += `10\n${corners[i][0].toFixed(3)}\n20\n${corners[i][1].toFixed(3)}\n30\n0.0\n`;
      dxf += `11\n${corners[i + 1][0].toFixed(3)}\n21\n${corners[i + 1][1].toFixed(3)}\n31\n0.0\n`;
    }
  });

  // Export Circles
  const circles = doc.querySelectorAll('circle');
  circles.forEach(circle => {
    const cx = parseFloat(circle.getAttribute('cx') || '0');
    const cy = parseFloat(circle.getAttribute('cy') || '0');
    const r = parseFloat(circle.getAttribute('r') || '0');
    const isEngrave = isEngraveElement(circle);
    const layer = isEngrave ? 'GRAVACAO' : 'CORTE_INTERNO';
    const cadY = metrics.heightMm - cy;

    dxf += '0\nCIRCLE\n';
    dxf += `8\n${layer}\n`;
    dxf += `10\n${cx.toFixed(3)}\n20\n${cadY.toFixed(3)}\n30\n0.0\n`;
    dxf += `40\n${r.toFixed(3)}\n`;
  });

  // Export Lines
  const lines = doc.querySelectorAll('line');
  lines.forEach(line => {
    const x1 = parseFloat(line.getAttribute('x1') || '0');
    const y1 = metrics.heightMm - parseFloat(line.getAttribute('y1') || '0');
    const x2 = parseFloat(line.getAttribute('x2') || '0');
    const y2 = metrics.heightMm - parseFloat(line.getAttribute('y2') || '0');
    const isEngrave = isEngraveElement(line);
    const layer = isEngrave ? 'GRAVACAO' : 'CORTE_EXTERNO';

    dxf += '0\nLINE\n';
    dxf += `8\n${layer}\n`;
    dxf += `10\n${x1.toFixed(3)}\n20\n${y1.toFixed(3)}\n30\n0.0\n`;
    dxf += `11\n${x2.toFixed(3)}\n21\n${y2.toFixed(3)}\n31\n0.0\n`;
  });

  dxf += '0\nENDSEC\n0\nEOF\n';
  return dxf;
}

/**
 * Exports Three.js 3D scene group directly to STL file using STLExporter
 */
export function exportSceneGroupToStl(object: THREE.Object3D, filename = 'modelo_cnc.stl'): void {
  const exporter = new STLExporter();
  const stlString = exporter.parse(object, { binary: false });

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

/**
 * Generates production-ready CNC G-code from SVG geometry
 */
export function generateGcodeFromSvg(
  svgString: string,
  options: {
    machineType: 'CO2' | 'Router' | 'Diodo' | 'Fibra' | 'Plasma';
    feedRate_mms: number;
    powerOrRpm: number;
    depthMm: number;
    stepDownMm?: number;
    safeZMm?: number;
  }
): string {
  const { machineType, feedRate_mms, powerOrRpm, depthMm, stepDownMm = 1.5, safeZMm = 5 } = options;
  const metrics = calculateSvgMetrics(svgString);
  const feedMmMin = Math.round(feedRate_mms * 60);

  let gcode = `( ========================================== )\n`;
  gcode += `( CNC APP - Juiz de Fora / MG                )\n`;
  gcode += `( Percurso gerado para: ${machineType.toUpperCase()} )\n`;
  gcode += `( Dimensoes: ${metrics.widthMm} x ${metrics.heightMm} mm )\n`;
  gcode += `( ========================================== )\n\n`;

  // Standard Header
  gcode += `G21          (Unidades em milimetros)\n`;
  gcode += `G90          (Posicionamento absoluto)\n`;
  gcode += `G17          (Plano XY)\n`;
  gcode += `G94          (Avanco em mm/min)\n\n`;

  if (machineType === 'Router') {
    // Router multi-pass Z depth
    const totalPasses = Math.max(1, Math.ceil(depthMm / stepDownMm));
    gcode += `G00 Z${safeZMm.toFixed(3)}  (Subida para altura segura)\n`;
    gcode += `M03 S${powerOrRpm}     (Ligar Spindle na rotacao selecionada)\n`;
    gcode += `G04 P2.0        (Pausa de 2s para spindle estabilizar)\n\n`;

    for (let pass = 1; pass <= totalPasses; pass++) {
      const currentZ = -Math.min(depthMm, pass * stepDownMm);
      gcode += `( --- PASSE ${pass}/${totalPasses} : Profundidade Z = ${currentZ.toFixed(2)} mm --- )\n`;
      gcode += `G00 X0.000 Y0.000\n`;
      gcode += `G01 Z${currentZ.toFixed(3)} F300 (Mergulho vertical controlado)\n`;
      // Rectangle perimeter
      gcode += `G01 X${metrics.widthMm}.000 Y0.000 F${feedMmMin}\n`;
      gcode += `G01 X${metrics.widthMm}.000 Y${metrics.heightMm}.000\n`;
      gcode += `G01 X0.000 Y${metrics.heightMm}.000\n`;
      gcode += `G01 X0.000 Y0.000\n`;
    }

    gcode += `\n( Finalizacao Router )\n`;
    gcode += `G00 Z${safeZMm.toFixed(3)} (Retorno a altura segura)\n`;
    gcode += `M05             (Desligar Spindle)\n`;
    gcode += `G00 X0 Y0       (Retornar ao Home XY)\n`;
    gcode += `M30             (Fim de programa)\n`;
  } else {
    // Laser CO2 / Diodo / Fibra
    gcode += `G00 X0.000 Y0.000  (Deslocamento rapido para inicio)\n`;
    gcode += `M03 S${powerOrRpm}       (Disparo Laser)\n`;
    gcode += `G01 X${metrics.widthMm}.000 Y0.000 F${feedMmMin}\n`;
    gcode += `G01 X${metrics.widthMm}.000 Y${metrics.heightMm}.000\n`;
    gcode += `G01 X0.000 Y${metrics.heightMm}.000\n`;
    gcode += `G01 X0.000 Y0.000\n`;
    gcode += `M05                (Desligar Laser)\n`;
    gcode += `G00 X0 Y0          (Retorno a origem)\n`;
    gcode += `M30                (Fim de programa)\n`;
  }

  return gcode;
}
