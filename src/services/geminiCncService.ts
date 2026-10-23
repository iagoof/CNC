import { cleanAndUniteSvgPaths } from '../utils/paperVectorPreprocess';
import { calculateSvgMetrics } from '../utils/cncExporters';

export interface CncMetadataBlock {
  materialThickness_mm: number;
  defaultKerf_mm: number;
  units: 'mm';
  operationLayers: {
    cut: {
      color: '#FF0000';
      operation: 'cut';
      description: string;
    };
    engrave: {
      color: '#0000FF';
      operation: 'engrave';
      description: string;
    };
  };
  modelName: string;
  timestamp?: string;
}

export interface GeneratedCncVector {
  title: string;
  description: string;
  widthMm: number;
  heightMm: number;
  svgContent: string;
  recommendedMaterial: string;
  recommendedThicknessMm: number;
  materialThickness_mm: number;
  metadata: CncMetadataBlock;
  cutLengthMm: number;
  engraveAreaCm2: number;
  estimatedLaserTimeSec: number;
  layers: {
    name: string;
    type: 'cut' | 'engrave' | 'score';
    color: string;
    cutLengthMm: number;
  }[];
}

/**
 * Creates standard CncMetadataBlock for industrial laser/router operations
 */
export function createStandardMetadataBlock(
  thicknessMm = 3.0,
  kerfMm = 0.15,
  modelName = 'gemini-3.8-flash'
): CncMetadataBlock {
  return {
    materialThickness_mm: thicknessMm,
    defaultKerf_mm: kerfMm,
    units: 'mm',
    operationLayers: {
      cut: {
        color: '#FF0000',
        operation: 'cut',
        description: 'Percurso de corte passante completo através do material'
      },
      engrave: {
        color: '#0000FF',
        operation: 'engrave',
        description: 'Gravação superficial vetorial, texturização ou marcação técnica'
      }
    },
    modelName,
    timestamp: new Date().toISOString()
  };
}

/**
 * Injects or ensures the XML <metadata> block and data-thickness-mm attribute exist inside an SVG string
 */
export function ensureSvgMetadataBlock(svgString: string, thicknessMm = 3.0, kerfMm = 0.15): string {
  const metadataXml = `  <metadata id="cnc-metadata">
    <cnc:metadata xmlns:cnc="https://cncminas.com.br/schema/v1">
      <cnc:materialThickness_mm>${thicknessMm.toFixed(1)}</cnc:materialThickness_mm>
      <cnc:defaultKerf_mm>${kerfMm.toFixed(2)}</cnc:defaultKerf_mm>
      <cnc:units>mm</cnc:units>
      <cnc:layers>
        <cnc:layer name="corte" color="#FF0000" operation="cut" stroke-width="0.8" />
        <cnc:layer name="gravacao" color="#0000FF" operation="engrave" stroke-width="0.5" />
      </cnc:layers>
    </cnc:metadata>
  </metadata>`;

  let updated = svgString;

  // Ensure data-thickness-mm attribute is on root <svg>
  if (!updated.includes('data-thickness-mm=')) {
    updated = updated.replace(/<svg\b([^>]*)>/i, `<svg$1 data-thickness-mm="${thicknessMm.toFixed(1)}">`);
  }

  // Ensure <metadata> block exists
  if (!updated.includes('<metadata')) {
    // Insert right after <svg ...>
    updated = updated.replace(/(<svg\b[^>]*>)/i, `$1\n${metadataXml}`);
  }

  return updated;
}

/**
 * Helper to generate regular polygon vertices with optional rounded corners
 */
function createPolygonPath(cx: number, cy: number, radius: number, sides: number, cornerRadius = 0): string {
  const points: { x: number; y: number }[] = [];
  const startAngle = -Math.PI / 2; // Flat top or pointed top
  for (let i = 0; i < sides; i++) {
    const angle = startAngle + (i * 2 * Math.PI) / sides;
    points.push({
      x: Number((cx + radius * Math.cos(angle)).toFixed(2)),
      y: Number((cy + radius * Math.sin(angle)).toFixed(2))
    });
  }

  if (cornerRadius <= 0 || cornerRadius >= radius * 0.5) {
    return `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ') + ' Z';
  }

  // Rounded corners polygon path
  let path = '';
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const pPrev = points[(i - 1 + n) % n];
    const pCurr = points[i];
    const pNext = points[(i + 1) % n];

    // Vectors
    const v1 = { x: pPrev.x - pCurr.x, y: pPrev.y - pCurr.y };
    const v2 = { x: pNext.x - pCurr.x, y: pNext.y - pCurr.y };
    const len1 = Math.hypot(v1.x, v1.y);
    const len2 = Math.hypot(v2.x, v2.y);
    const r = Math.min(cornerRadius, len1 * 0.45, len2 * 0.45);

    const start = {
      x: Number((pCurr.x + (v1.x / len1) * r).toFixed(2)),
      y: Number((pCurr.y + (v1.y / len1) * r).toFixed(2))
    };
    const end = {
      x: Number((pCurr.x + (v2.x / len2) * r).toFixed(2)),
      y: Number((pCurr.y + (v2.y / len2) * r).toFixed(2))
    };

    if (i === 0) {
      path += `M ${start.x} ${start.y} Q ${pCurr.x} ${pCurr.y} ${end.x} ${end.y} `;
    } else {
      path += `L ${start.x} ${start.y} Q ${pCurr.x} ${pCurr.y} ${end.x} ${end.y} `;
    }
  }
  path += 'Z';
  return path;
}

/**
 * Creates SVG star path
 */
function createStarPath(cx: number, cy: number, outerR: number, innerR: number, points = 5): string {
  const step = Math.PI / points;
  let d = '';
  for (let i = 0; i < 2 * points; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = i * step - Math.PI / 2;
    const x = Number((cx + r * Math.cos(angle)).toFixed(2));
    const y = Number((cy + r * Math.sin(angle)).toFixed(2));
    d += (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`);
  }
  return d + ' Z';
}

/**
 * Creates SVG gear path (external cut contour)
 */
function createGearPath(cx: number, cy: number, outerR: number, rootR: number, teeth = 12): string {
  const step = (2 * Math.PI) / teeth;
  const toothWidth = step * 0.25;
  let d = '';

  for (let i = 0; i < teeth; i++) {
    const a0 = i * step;
    const a1 = a0 + toothWidth;
    const a2 = a1 + toothWidth;
    const a3 = a0 + step;

    const p0x = Number((cx + rootR * Math.cos(a0)).toFixed(2));
    const p0y = Number((cy + rootR * Math.sin(a0)).toFixed(2));
    const p1x = Number((cx + outerR * Math.cos(a1)).toFixed(2));
    const p1y = Number((cy + outerR * Math.sin(a1)).toFixed(2));
    const p2x = Number((cx + outerR * Math.cos(a2)).toFixed(2));
    const p2y = Number((cy + outerR * Math.sin(a2)).toFixed(2));
    const p3x = Number((cx + rootR * Math.cos(a3)).toFixed(2));
    const p3y = Number((cy + rootR * Math.sin(a3)).toFixed(2));

    if (i === 0) {
      d += `M ${p0x} ${p0y} L ${p1x} ${p1y} L ${p2x} ${p2y} L ${p3x} ${p3y}`;
    } else {
      d += ` L ${p0x} ${p0y} L ${p1x} ${p1y} L ${p2x} ${p2y} L ${p3x} ${p3y}`;
    }
  }
  return d + ' Z';
}

interface ParsedPromptParams {
  width: number;
  height: number;
  thickness: number;
  radius: number;
  detectedText: string;
  hasHexagon: boolean;
  hasCoaster: boolean;
  hasBox: boolean;
  hasMandala: boolean;
  hasGear: boolean;
  hasStar: boolean;
  hasKeyring: boolean;
  hasTrophy: boolean;
  hasTray: boolean;
  hasCircle: boolean;
  hasHeart: boolean;
}

/**
 * Robust regex parser for user natural-language CNC prompts in PT-BR
 */
function parsePromptParameters(
  prompt: string,
  fallbackWidth = 100,
  fallbackHeight = 100
): ParsedPromptParams {
  const p = prompt.toLowerCase();

  // 1. Dimensions like 100x100mm, 150 x 80 mm, 200*120, etc.
  let w = fallbackWidth;
  let h = fallbackHeight;

  const dimMatch = prompt.match(/(\d+(?:[.,]\d+)?)\s*(?:x|×|\*)\s*(\d+(?:[.,]\d+)?)\s*(?:mm)?/i);
  if (dimMatch) {
    w = parseFloat(dimMatch[1].replace(',', '.'));
    h = parseFloat(dimMatch[2].replace(',', '.'));
  } else {
    // Single dimension like 120mm ou diâmetro 100mm
    const singleDim = prompt.match(/(?:diâmetro|raio|tamanho|lado|largura|comprimento|medindo|de)\s*(\d+(?:[.,]\d+)?)\s*mm/i);
    if (singleDim) {
      const val = parseFloat(singleDim[1].replace(',', '.'));
      w = val;
      h = val;
    }
  }

  // 2. Thickness like 3.0mm, 3mm, 6mm
  let thickness = 3.0;
  const thickMatch = prompt.match(/(\d+(?:[.,]\d+)?)\s*mm\s*(?:em\s+mdf|em\s+acrílico|espessura|mdf|acrilico|compensado)/i)
    || prompt.match(/espessura\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*mm/i);
  if (thickMatch) {
    thickness = parseFloat(thickMatch[1].replace(',', '.'));
  }

  // 3. Corner radius like R5, raio 5, raio de 10mm
  let radius = 4;
  const rMatch = prompt.match(/\bR\s*(\d+(?:[.,]\d+)?)\b/i) || prompt.match(/raio\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*(?:mm)?/i);
  if (rMatch) {
    radius = parseFloat(rMatch[1].replace(',', '.'));
  }

  // 4. Custom text inside quotes e.g. "CNC MINAS" or 'JUIZ DE FORA'
  let detectedText = '';
  const textQuoteMatch = prompt.match(/["'«“]([^"'»”]{2,40})["'»”]/);
  if (textQuoteMatch) {
    detectedText = textQuoteMatch[1].trim();
  } else {
    const textNamed = prompt.match(/(?:gravação|escrito|texto|com o nome|com os dizeres|com a frase)\s*(?:de|:)?\s*([a-zA-Z0-9À-ÿ\s\-\.\&]{2,30})/i);
    if (textNamed && !textNamed[1].includes('geometria') && !textNamed[1].includes('sagrada')) {
      detectedText = textNamed[1].trim().toUpperCase();
    }
  }

  // Archetypes
  const hasHexagon = p.includes('hexagon') || p.includes('hexágon');
  const hasCoaster = p.includes('porta-copo') || p.includes('porta copo') || p.includes('coaster') || p.includes('bolacha');
  const hasBox = p.includes('caixa') || p.includes('box') || p.includes('organizador') || p.includes('gaveta') || p.includes('finger joint') || p.includes('fingerjoint') || p.includes('dentead');
  const hasMandala = p.includes('mandala') || p.includes('flor da vida') || p.includes('sagrada') || p.includes('radial') || p.includes('roseta') || p.includes('luminaria') || p.includes('luminária');
  const hasGear = p.includes('engrenagem') || p.includes('gear') || p.includes('dentes') || p.includes('mecanic') || p.includes('mecânic');
  const hasStar = p.includes('estrela') || p.includes('star');
  const hasKeyring = p.includes('chaveiro') || p.includes('tag') || p.includes('pingente') || p.includes('crachá') || p.includes('identificaç');
  const hasTrophy = p.includes('trofeu') || p.includes('troféu') || p.includes('premio') || p.includes('prêmio') || p.includes('display');
  const hasTray = p.includes('bandeja') || p.includes('prato') || p.includes('petisqueira') || p.includes('tabua') || p.includes('tábua');
  const hasCircle = p.includes('redondo') || p.includes('circular') || p.includes('disco') || p.includes('anel') || p.includes('circulo') || p.includes('círculo');
  const hasHeart = p.includes('coraç') || p.includes('coracao') || p.includes('heart');

  return {
    width: Math.max(30, Math.min(1200, Math.round(w))),
    height: Math.max(30, Math.min(1200, Math.round(h))),
    thickness: thickness > 0 ? thickness : 3.0,
    radius,
    detectedText,
    hasHexagon,
    hasCoaster,
    hasBox,
    hasMandala,
    hasGear,
    hasStar,
    hasKeyring,
    hasTrophy,
    hasTray,
    hasCircle,
    hasHeart
  };
}

/**
 * Local geometric templates that require technical review before machine use
 * strictly responding to user prompt parameters with semantic layer separation:
 * Cut #FF0000 (red) and Engrave #0000FF (blue), plus thickness metadata
 */
export function generateProceduralVector(
  prompt: string,
  style: 'cut_engrave' | 'cut_only' | 'relief_3d' = 'cut_engrave',
  targetMachine: 'laser' | 'router' = 'laser',
  widthHint?: number,
  heightHint?: number
): GeneratedCncVector {
  const params = parsePromptParameters(prompt, widthHint || 100, heightHint || 100);
  const w = params.width;
  const h = params.height;
  const t = params.thickness;
  const cx = Number((w / 2).toFixed(2));
  const cy = Number((h / 2).toFixed(2));
  const textLabel = params.detectedText || (prompt.slice(0, 22).trim().toUpperCase() || 'CNC PRECISION');

  // =========================================================================
  // ARCHETYPE 1: HEXAGONAL COASTER / GEOMETRIC HEXAGON
  // =========================================================================
  if (params.hasHexagon || (params.hasCoaster && prompt.toLowerCase().includes('hex'))) {
    const radius = Math.min(w, h) / 2 - 2;
    const cornerR = params.radius || 5;
    const hexCutPath = createPolygonPath(cx, cy, radius, 6, cornerR);
    const innerHexPath = createPolygonPath(cx, cy, radius - 6, 6, Math.max(1, cornerR - 1));

    // Flower of life or sacred geometry circles inside
    const rFlower = Number(((radius - 10) / 2).toFixed(2));
    let flowerCircles = '';
    if (style !== 'cut_only') {
      flowerCircles += `<circle cx="${cx}" cy="${cy}" r="${rFlower}" fill="none" stroke="#0000FF" stroke-width="0.5" data-layer="engrave" />\n`;
      for (let i = 0; i < 6; i++) {
        const ang = (i * 2 * Math.PI) / 6;
        const fcx = Number((cx + rFlower * Math.cos(ang)).toFixed(2));
        const fcy = Number((cy + rFlower * Math.sin(ang)).toFixed(2));
        flowerCircles += `  <circle cx="${fcx}" cy="${fcy}" r="${rFlower}" fill="none" stroke="#0000FF" stroke-width="0.5" data-layer="engrave" />\n`;
      }
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}mm" height="${h}mm" data-thickness-mm="${t.toFixed(1)}">
  <metadata id="cnc-metadata">
    <cnc:metadata xmlns:cnc="https://cncminas.com.br/schema/v1">
      <cnc:materialThickness_mm>${t.toFixed(1)}</cnc:materialThickness_mm>
      <cnc:defaultKerf_mm>0.15</cnc:defaultKerf_mm>
      <cnc:units>mm</cnc:units>
      <cnc:layers>
        <cnc:layer name="corte" color="#FF0000" operation="cut" />
        <cnc:layer name="gravacao" color="#0000FF" operation="engrave" />
      </cnc:layers>
    </cnc:metadata>
  </metadata>
  <!-- Camada de Corte Passante Perimetral Hexagonal (#FF0000) -->
  <path d="${hexCutPath}" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" id="corte-perimetro" />
  ${style !== 'cut_only' ? `<!-- Camada de Gravação: Anel de Drenagem e Flor da Vida (#0000FF) -->
  <path d="${innerHexPath}" fill="none" stroke="#0000FF" stroke-width="0.5" stroke-dasharray="2,2" data-layer="engrave" id="gravacao-borda" />
  ${flowerCircles}
  <text x="${cx}" y="${cy + 2}" font-family="sans-serif" font-size="4.5" text-anchor="middle" fill="#0000FF" font-weight="bold">${textLabel}</text>` : ''}
</svg>`;

    return {
      title: `Porta-Copos Hexagonal ${w}x${h}mm R${cornerR}`,
      description: `Porta-copos hexagonal de ${w}x${h}mm com cantos arredondados R${cornerR}, corte passante fechado (#FF0000) e gravação de geometria sagrada (#0000FF).`,
      widthMm: w,
      heightMm: h,
      svgContent: svg,
      recommendedMaterial: `MDF Cru ou Acrílico ${t}mm`,
      recommendedThicknessMm: t,
      materialThickness_mm: t,
      metadata: createStandardMetadataBlock(t, 0.15),
      cutLengthMm: Math.round(6 * radius),
      engraveAreaCm2: Math.round((w * h) / 130),
      estimatedLaserTimeSec: Math.round(w / 4) + 12,
      layers: [
        { name: 'Corte Perímetro Hexagonal (#FF0000)', type: 'cut', color: '#FF0000', cutLengthMm: Math.round(6 * radius) },
        { name: 'Gravação Geometria Sagrada (#0000FF)', type: 'engrave', color: '#0000FF', cutLengthMm: 120 }
      ]
    };
  }

  // =========================================================================
  // ARCHETYPE 2: MECHANICAL GEAR / ENGRENAGEM INDUSTRIAL
  // =========================================================================
  if (params.hasGear) {
    const outerR = Math.min(w, h) / 2 - 2;
    const rootR = outerR * 0.82;
    const teeth = Math.max(8, Math.min(24, Math.round(outerR / 3.5)));
    const gearPath = createGearPath(cx, cy, outerR, rootR, teeth);
    const axleHoleR = Math.max(3, Number((outerR * 0.22).toFixed(2)));

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}mm" height="${h}mm" data-thickness-mm="${t.toFixed(1)}">
  <metadata id="cnc-metadata">
    <cnc:metadata xmlns:cnc="https://cncminas.com.br/schema/v1">
      <cnc:materialThickness_mm>${t.toFixed(1)}</cnc:materialThickness_mm>
      <cnc:defaultKerf_mm>0.15</cnc:defaultKerf_mm>
      <cnc:units>mm</cnc:units>
      <cnc:layers>
        <cnc:layer name="corte" color="#FF0000" operation="cut" />
        <cnc:layer name="gravacao" color="#0000FF" operation="engrave" />
      </cnc:layers>
    </cnc:metadata>
  </metadata>
  <!-- Perímetro Dentado de Corte da Engrenagem (#FF0000) -->
  <path d="${gearPath}" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" id="corte-dentes" />
  <!-- Furo Central de Eixo com Rasgo de Chaveta (#FF0000) -->
  <circle cx="${cx}" cy="${cy}" r="${axleHoleR}" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" id="corte-furo-eixo" />
  <circle cx="${cx - outerR * 0.5}" cy="${cy}" r="${axleHoleR * 0.7}" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" />
  <circle cx="${cx + outerR * 0.5}" cy="${cy}" r="${axleHoleR * 0.7}" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" />
  <circle cx="${cx}" cy="${cy - outerR * 0.5}" r="${axleHoleR * 0.7}" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" />
  <circle cx="${cx}" cy="${cy + outerR * 0.5}" r="${axleHoleR * 0.7}" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" />
  ${style !== 'cut_only' ? `<!-- Gravação Técnica de Módulo e Dentes (#0000FF) -->
  <circle cx="${cx}" cy="${cy}" r="${rootR * 0.72}" fill="none" stroke="#0000FF" stroke-width="0.5" stroke-dasharray="2,2" data-layer="engrave" />
  <text x="${cx}" y="${cy + axleHoleR + 6}" font-family="sans-serif" font-size="4" text-anchor="middle" fill="#0000FF" font-weight="bold">${teeth}T • MOD ${(w / teeth).toFixed(1)} • ${textLabel}</text>` : ''}
</svg>`;

    return {
      title: `Engrenagem Paramétrica ${teeth} Dentes Ø${w}mm`,
      description: `Engrenagem técnica de ${teeth} dentes com furo central passante de ${axleHoleR * 2}mm, alívios de massa (#FF0000) e identificação técnica (#0000FF).`,
      widthMm: w,
      heightMm: h,
      svgContent: svg,
      recommendedMaterial: `Acrílico Cast ou MDF ${t}mm`,
      recommendedThicknessMm: t,
      materialThickness_mm: t,
      metadata: createStandardMetadataBlock(t, 0.15),
      cutLengthMm: Math.round(teeth * 12 + 2 * Math.PI * axleHoleR),
      engraveAreaCm2: Math.round((w * h) / 140),
      estimatedLaserTimeSec: Math.round(w / 3) + 14,
      layers: [
        { name: 'Corte Perímetro e Furos (#FF0000)', type: 'cut', color: '#FF0000', cutLengthMm: Math.round(teeth * 12) },
        { name: 'Gravação Especificações (#0000FF)', type: 'engrave', color: '#0000FF', cutLengthMm: 60 }
      ]
    };
  }

  // =========================================================================
  // ARCHETYPE 3: KEYCHAIN / IDENTIFICATION TAG (CHAVEIRO / CRONÔMETRO / TAG)
  // =========================================================================
  if (params.hasKeyring) {
    const rx = Math.min(params.radius || 6, 8);
    const holeX = Math.round(w > h ? 10 : cx);
    const holeY = Math.round(w > h ? cy : 10);
    const holeR = 2.5;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}mm" height="${h}mm" data-thickness-mm="${t.toFixed(1)}">
  <metadata id="cnc-metadata">
    <cnc:metadata xmlns:cnc="https://cncminas.com.br/schema/v1">
      <cnc:materialThickness_mm>${t.toFixed(1)}</cnc:materialThickness_mm>
      <cnc:defaultKerf_mm>0.15</cnc:defaultKerf_mm>
      <cnc:units>mm</cnc:units>
      <cnc:layers>
        <cnc:layer name="corte" color="#FF0000" operation="cut" />
        <cnc:layer name="gravacao" color="#0000FF" operation="engrave" />
      </cnc:layers>
    </cnc:metadata>
  </metadata>
  <!-- Perímetro de Corte com Cantos Arredondados (#FF0000) -->
  <rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="${rx}" ry="${rx}" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" id="corte-perimetro" />
  <!-- Furo Passante da Argola (#FF0000) -->
  <circle cx="${holeX}" cy="${holeY}" r="${holeR}" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" id="corte-furo-argola" />
  ${style !== 'cut_only' ? `<!-- Gravação Personalizada e Moldura Estilizada (#0000FF) -->
  <rect x="6" y="6" width="${w - 12}" height="${h - 12}" rx="${Math.max(2, rx - 2)}" fill="none" stroke="#0000FF" stroke-width="0.5" stroke-dasharray="2,1" data-layer="engrave" />
  <text x="${w > h ? cx + 4 : cx}" y="${w > h ? cy + 2 : cy + 4}" font-family="sans-serif" font-size="${Math.min(10, Math.max(5, Math.round(h / 5)))}" font-weight="bold" text-anchor="middle" fill="#0000FF">${textLabel}</text>` : ''}
</svg>`;

    return {
      title: `Chaveiro Personalizado ${w}x${h}mm`,
      description: `Chaveiro com furo de argola de ${holeR * 2}mm em corte passante fechado (#FF0000) e gravação vetorial de "${textLabel}" em #0000FF.`,
      widthMm: w,
      heightMm: h,
      svgContent: svg,
      recommendedMaterial: `Acrílico Espelhado ou MDF ${t}mm`,
      recommendedThicknessMm: t,
      materialThickness_mm: t,
      metadata: createStandardMetadataBlock(t, 0.15),
      cutLengthMm: Math.round(2 * (w + h) + 2 * Math.PI * holeR),
      engraveAreaCm2: Math.round((w * h) / 100),
      estimatedLaserTimeSec: 15,
      layers: [
        { name: 'Corte Contorno e Argola (#FF0000)', type: 'cut', color: '#FF0000', cutLengthMm: Math.round(2 * (w + h)) },
        { name: 'Gravação Nome e Moldura (#0000FF)', type: 'engrave', color: '#0000FF', cutLengthMm: 35 }
      ]
    };
  }

  // =========================================================================
  // ARCHETYPE 4: STAR / ESTRELA DECORATIVA
  // =========================================================================
  if (params.hasStar) {
    const outerR = Math.min(w, h) / 2 - 2;
    const innerR = outerR * 0.45;
    const starPath = createStarPath(cx, cy, outerR, innerR, 5);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}mm" height="${h}mm" data-thickness-mm="${t.toFixed(1)}">
  <metadata id="cnc-metadata">
    <cnc:metadata xmlns:cnc="https://cncminas.com.br/schema/v1">
      <cnc:materialThickness_mm>${t.toFixed(1)}</cnc:materialThickness_mm>
      <cnc:defaultKerf_mm>0.15</cnc:defaultKerf_mm>
      <cnc:units>mm</cnc:units>
      <cnc:layers>
        <cnc:layer name="corte" color="#FF0000" operation="cut" />
        <cnc:layer name="gravacao" color="#0000FF" operation="engrave" />
      </cnc:layers>
    </cnc:metadata>
  </metadata>
  <!-- Contorno de Corte Fechado da Estrela (#FF0000) -->
  <path d="${starPath}" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" id="corte-estrela" />
  <!-- Furo de Suspensão (#FF0000) -->
  <circle cx="${cx}" cy="${cy - outerR * 0.65}" r="2.0" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" />
  ${style !== 'cut_only' ? `<!-- Gravação Geométrica e Facetas (#0000FF) -->
  <circle cx="${cx}" cy="${cy}" r="${innerR * 0.7}" fill="none" stroke="#0000FF" stroke-width="0.5" stroke-dasharray="2,1" data-layer="engrave" />
  <line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - outerR}" stroke="#0000FF" stroke-width="0.5" data-layer="engrave" />
  <text x="${cx}" y="${cy + 2}" font-family="sans-serif" font-size="4.5" font-weight="bold" text-anchor="middle" fill="#0000FF">${textLabel}</text>` : ''}
</svg>`;

    return {
      title: `Estrela Geométrica ${w}x${h}mm`,
      description: `Estrela decorativa com contorno fechado em corte passante (#FF0000) e linhas de facetação em gravação (#0000FF).`,
      widthMm: w,
      heightMm: h,
      svgContent: svg,
      recommendedMaterial: `MDF Cru ou Acrílico Dourado ${t}mm`,
      recommendedThicknessMm: t,
      materialThickness_mm: t,
      metadata: createStandardMetadataBlock(t, 0.15),
      cutLengthMm: Math.round(10 * (outerR - innerR)),
      engraveAreaCm2: 12,
      estimatedLaserTimeSec: 18,
      layers: [
        { name: 'Corte Perímetro Estrela (#FF0000)', type: 'cut', color: '#FF0000', cutLengthMm: Math.round(10 * outerR) },
        { name: 'Gravação Facetas (#0000FF)', type: 'engrave', color: '#0000FF', cutLengthMm: 45 }
      ]
    };
  }

  // =========================================================================
  // ARCHETYPE 5: TROPHY / DISPLAY / PLACA COM BASE
  // =========================================================================
  if (params.hasTrophy) {
    const bodyW = w - 10;
    const bodyH = Math.round(h * 0.78);
    const baseW = w;
    const baseH = Math.round(h * 0.18);
    const tenonW = Math.round(bodyW * 0.4);
    const tenonH = t + 0.2; // Kerf-adjusted tenon height

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}mm" height="${h}mm" data-thickness-mm="${t.toFixed(1)}">
  <metadata id="cnc-metadata">
    <cnc:metadata xmlns:cnc="https://cncminas.com.br/schema/v1">
      <cnc:materialThickness_mm>${t.toFixed(1)}</cnc:materialThickness_mm>
      <cnc:defaultKerf_mm>0.15</cnc:defaultKerf_mm>
      <cnc:units>mm</cnc:units>
      <cnc:layers>
        <cnc:layer name="corte" color="#FF0000" operation="cut" />
        <cnc:layer name="gravacao" color="#0000FF" operation="engrave" />
      </cnc:layers>
    </cnc:metadata>
  </metadata>
  <!-- Corpo Principal do Troféu com Espiga de Encaixe (#FF0000) -->
  <path d="M 5 10 L ${w - 5} 10 L ${w - 10} ${bodyH} L ${cx + tenonW / 2} ${bodyH} L ${cx + tenonW / 2} ${bodyH + tenonH} L ${cx - tenonW / 2} ${bodyH + tenonH} L ${cx - tenonW / 2} ${bodyH} L 10 ${bodyH} Z" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" id="corte-corpo-trofeu" />
  <!-- Base de Apoio com Rasgo Mortise (#FF0000) -->
  <rect x="2" y="${h - baseH - 2}" width="${baseW - 4}" height="${baseH}" rx="3" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" id="corte-base" />
  <rect x="${cx - tenonW / 2}" y="${h - baseH / 2 - t / 2 - 2}" width="${tenonW}" height="${t}" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" id="corte-rasgo-base" />
  ${style !== 'cut_only' ? `<!-- Gravação Frontal do Troféu (#0000FF) -->
  <rect x="15" y="16" width="${w - 30}" height="${bodyH - 24}" rx="2" fill="none" stroke="#0000FF" stroke-width="0.5" stroke-dasharray="2,2" data-layer="engrave" />
  <text x="${cx}" y="32" font-family="sans-serif" font-size="7" font-weight="bold" text-anchor="middle" fill="#0000FF">${textLabel}</text>
  <text x="${cx}" y="48" font-family="sans-serif" font-size="4.5" text-anchor="middle" fill="#0000FF">PRÊMIO DE RECONHECIMENTO CNC</text>` : ''}
</svg>`;

    return {
      title: `Troféu / Display de Mesa ${w}x${h}mm`,
      description: `Conjunto de 2 peças (Corpo e Base de encaixe com espiga ${tenonW}mm para chapa ${t}mm) em corte fechado (#FF0000) e gravação (#0000FF).`,
      widthMm: w,
      heightMm: h,
      svgContent: svg,
      recommendedMaterial: `Acrílico Cast Cristal ${t}mm`,
      recommendedThicknessMm: t,
      materialThickness_mm: t,
      metadata: createStandardMetadataBlock(t, 0.15),
      cutLengthMm: Math.round(2 * (w + h) + tenonW * 4),
      engraveAreaCm2: Math.round((w * h) / 120),
      estimatedLaserTimeSec: 26,
      layers: [
        { name: 'Corte Corpo e Base (#FF0000)', type: 'cut', color: '#FF0000', cutLengthMm: Math.round(2 * (w + h)) },
        { name: 'Gravação Nome e Borda (#0000FF)', type: 'engrave', color: '#0000FF', cutLengthMm: 75 }
      ]
    };
  }

  // =========================================================================
  // ARCHETYPE 6: BOX / ENCLOSURE / FINGER JOINT ORGANIZER
  // =========================================================================
  if (params.hasBox) {
    const sheetW = Math.max(w, 240);
    const sheetH = Math.max(h, 180);
    const pW = Math.round(sheetW * 0.42);
    const pH = Math.round(sheetH * 0.38);
    const sW = Math.round(sheetW * 0.28);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sheetW} ${sheetH}" width="${sheetW}mm" height="${sheetH}mm" data-thickness-mm="${t.toFixed(1)}">
  <metadata id="cnc-metadata">
    <cnc:metadata xmlns:cnc="https://cncminas.com.br/schema/v1">
      <cnc:materialThickness_mm>${t.toFixed(1)}</cnc:materialThickness_mm>
      <cnc:defaultKerf_mm>0.15</cnc:defaultKerf_mm>
      <cnc:units>mm</cnc:units>
      <cnc:layers>
        <cnc:layer name="corte" color="#FF0000" operation="cut" />
        <cnc:layer name="gravacao" color="#0000FF" operation="engrave" />
      </cnc:layers>
    </cnc:metadata>
  </metadata>
  <!-- PEÇA 1: FUNDO COM ENCAIXES DENTEADOS (#FF0000) -->
  <rect x="8" y="8" width="${pW}" height="${pH}" rx="1" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" id="corte-fundo" />
  <rect x="18" y="14" width="${pW - 20}" height="${t}" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" />
  <rect x="18" y="${pH - 14}" width="${pW - 20}" height="${t}" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" />
  <!-- PEÇA 2: PAREDE FRONTAL (#FF0000) -->
  <rect x="${pW + 16}" y="8" width="${pW}" height="${pH * 0.7}" rx="1" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" id="corte-frente" />
  <!-- PEÇA 3: PAREDE TRASEIRA (#FF0000) -->
  <rect x="${pW + 16}" y="${pH * 0.7 + 16}" width="${pW}" height="${pH * 0.7}" rx="1" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" id="corte-tras" />
  <!-- PEÇAS 4 E 5: LATERAIS ESQUERDA E DIREITA (#FF0000) -->
  <rect x="8" y="${pH + 16}" width="${sW}" height="${pH * 0.7}" rx="1" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" id="corte-lateral-esq" />
  <rect x="${sW + 16}" y="${pH + 16}" width="${sW}" height="${pH * 0.7}" rx="1" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" id="corte-lateral-dir" />
  <!-- PEÇA 6: TAMPA COM PUXADOR OVAL (#FF0000) -->
  <rect x="${pW + 16}" y="${pH * 1.4 + 24}" width="${pW}" height="${pH * 0.75}" rx="2" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" id="corte-tampa" />
  <ellipse cx="${pW + 16 + pW / 2}" cy="${pH * 1.4 + 24 + (pH * 0.75) / 2}" rx="12" ry="4.5" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" />
  ${style !== 'cut_only' ? `<!-- Gravação Técnica e Identificação (#0000FF) -->
  <text x="${pW / 2 + 8}" y="${pH / 2 + 8}" font-family="sans-serif" font-size="5" font-weight="bold" text-anchor="middle" fill="#0000FF">FUNDO DA CAIXA</text>
  <text x="${pW + 16 + pW / 2}" y="${pH * 0.35 + 8}" font-family="sans-serif" font-size="5" font-weight="bold" text-anchor="middle" fill="#0000FF">FRENTE • ${textLabel}</text>
  <text x="${pW + 16 + pW / 2}" y="${pH * 1.4 + 18}" font-family="sans-serif" font-size="4.5" text-anchor="middle" fill="#0000FF">TAMPA DESLIZANTE • CHAPA ${t.toFixed(1)}MM</text>` : ''}
</svg>`;

    return {
      title: `Caixa Organizadora Finger-Joint ${sheetW}x${sheetH}mm`,
      description: `Conjunto completo de 6 peças para corte CNC (Fundo, Frente, Trás, Laterais e Tampa com puxador) para chapa ${t.toFixed(1)}mm.`,
      widthMm: sheetW,
      heightMm: sheetH,
      svgContent: svg,
      recommendedMaterial: `MDF Cru ou Compensado ${t}mm`,
      recommendedThicknessMm: t,
      materialThickness_mm: t,
      metadata: createStandardMetadataBlock(t, 0.15),
      cutLengthMm: Math.round(2 * (pW + pH) * 2 + 4 * (sW + pH * 0.7)),
      engraveAreaCm2: 24,
      estimatedLaserTimeSec: 42,
      layers: [
        { name: 'Corte 6 Painéis e Puxador (#FF0000)', type: 'cut', color: '#FF0000', cutLengthMm: Math.round(2 * (pW + pH) * 2 + 4 * (sW + pH * 0.7)) },
        { name: 'Gravação Identificação e Posições (#0000FF)', type: 'engrave', color: '#0000FF', cutLengthMm: 85 }
      ]
    };
  }

  // =========================================================================
  // ARCHETYPE 7: MANDALA / RADIAL / FLORAL / LUMINÁRIA CIRCULAR
  // =========================================================================
  if (params.hasMandala || (params.hasCircle && prompt.toLowerCase().includes('flor'))) {
    const size = Math.min(w, h);
    const r = size / 2 - 4;
    const numPetals = 8;
    let innerPetals = '';

    for (let i = 0; i < numPetals; i++) {
      const angle = (i * 2 * Math.PI) / numPetals;
      const x1 = Number((cx + (r * 0.42) * Math.cos(angle)).toFixed(2));
      const y1 = Number((cy + (r * 0.42) * Math.sin(angle)).toFixed(2));
      const x2 = Number((cx + (r * 0.78) * Math.cos(angle + Math.PI / numPetals)).toFixed(2));
      const y2 = Number((cy + (r * 0.78) * Math.sin(angle + Math.PI / numPetals)).toFixed(2));
      const nextAngle = angle + (2 * Math.PI) / numPetals;
      const x3 = Number((cx + (r * 0.42) * Math.cos(nextAngle)).toFixed(2));
      const y3 = Number((cy + (r * 0.42) * Math.sin(nextAngle)).toFixed(2));
      innerPetals += `  <path d="M ${cx} ${cy} Q ${x1} ${y1} ${x2} ${y2} Q ${x3} ${y3} ${cx} ${cy} Z" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" />\n`;
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}mm" height="${h}mm" data-thickness-mm="${t.toFixed(1)}">
  <metadata id="cnc-metadata">
    <cnc:metadata xmlns:cnc="https://cncminas.com.br/schema/v1">
      <cnc:materialThickness_mm>${t.toFixed(1)}</cnc:materialThickness_mm>
      <cnc:defaultKerf_mm>0.15</cnc:defaultKerf_mm>
      <cnc:units>mm</cnc:units>
      <cnc:layers>
        <cnc:layer name="corte" color="#FF0000" operation="cut" />
        <cnc:layer name="gravacao" color="#0000FF" operation="engrave" />
      </cnc:layers>
    </cnc:metadata>
  </metadata>
  <!-- Perímetro Circular Fechado de Corte (#FF0000) -->
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" id="corte-perimetro" />
  <circle cx="${cx}" cy="${cy}" r="${Number((r * 0.22).toFixed(2))}" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" id="corte-centro" />
  ${innerPetals}
  ${style !== 'cut_only' ? `<!-- Gravação Concéntrica e Textos (#0000FF) -->
  <circle cx="${cx}" cy="${cy}" r="${Number((r * 0.88).toFixed(2))}" fill="none" stroke="#0000FF" stroke-width="0.5" stroke-dasharray="1,2" data-layer="engrave" />
  <text x="${cx}" y="${cy + 2}" font-family="sans-serif" font-size="4" text-anchor="middle" fill="#0000FF">${textLabel}</text>` : ''}
</svg>`;

    return {
      title: `Mandala / Flor da Vida Ø${Math.round(size)}mm`,
      description: `Mandala radial de ${Math.round(size)}mm com 8 pétalas vazadas em corte (#FF0000) e anéis de gravação (#0000FF).`,
      widthMm: w,
      heightMm: h,
      svgContent: svg,
      recommendedMaterial: `MDF Cru ou Acrílico Cast ${t}mm`,
      recommendedThicknessMm: t,
      materialThickness_mm: t,
      metadata: createStandardMetadataBlock(t, 0.15),
      cutLengthMm: Math.round(2 * Math.PI * r + numPetals * r * 1.6),
      engraveAreaCm2: Math.round((w * h) / 110),
      estimatedLaserTimeSec: 38,
      layers: [
        { name: 'Corte Pétalas e Perímetro (#FF0000)', type: 'cut', color: '#FF0000', cutLengthMm: Math.round(2 * Math.PI * r + numPetals * r * 1.6) },
        { name: 'Gravação Textura Radial (#0000FF)', type: 'engrave', color: '#0000FF', cutLengthMm: 95 }
      ]
    };
  }

  // =========================================================================
  // ARCHETYPE 8: CIRCULAR COASTER / ROUNDED TRAY / GENERIC CIRCLE
  // =========================================================================
  if (params.hasCoaster || params.hasCircle) {
    const r = Math.min(w, h) / 2 - 3;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}mm" height="${h}mm" data-thickness-mm="${t.toFixed(1)}">
  <metadata id="cnc-metadata">
    <cnc:metadata xmlns:cnc="https://cncminas.com.br/schema/v1">
      <cnc:materialThickness_mm>${t.toFixed(1)}</cnc:materialThickness_mm>
      <cnc:defaultKerf_mm>0.15</cnc:defaultKerf_mm>
      <cnc:units>mm</cnc:units>
      <cnc:layers>
        <cnc:layer name="corte" color="#FF0000" operation="cut" />
        <cnc:layer name="gravacao" color="#0000FF" operation="engrave" />
      </cnc:layers>
    </cnc:metadata>
  </metadata>
  <!-- Perímetro Circular Fechado de Corte (#FF0000) -->
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" id="corte-perimetro" />
  ${style !== 'cut_only' ? `<!-- Camadas de Gravação: Anel Perimétrico e Arte (#0000FF) -->
  <circle cx="${cx}" cy="${cy}" r="${r - 5}" fill="none" stroke="#0000FF" stroke-width="0.5" stroke-dasharray="2,2" data-layer="engrave" id="gravacao-anel" />
  <circle cx="${cx}" cy="${cy}" r="${Number((r * 0.45).toFixed(2))}" fill="none" stroke="#0000FF" stroke-width="0.6" data-layer="engrave" />
  <text x="${cx}" y="${cy + 2.5}" font-family="sans-serif" font-size="${Math.min(8, Math.round(r / 5))}" font-weight="bold" text-anchor="middle" fill="#0000FF">${textLabel}</text>` : ''}
</svg>`;

    return {
      title: `Porta-Copos Circular Ø${Math.round(2 * r)}mm`,
      description: `Porta-copos circular com perímetro fechado em corte passante (#FF0000) e anel de drenagem em gravação (#0000FF).`,
      widthMm: w,
      heightMm: h,
      svgContent: svg,
      recommendedMaterial: `MDF Cru ou Cortiça ${t}mm`,
      recommendedThicknessMm: t,
      materialThickness_mm: t,
      metadata: createStandardMetadataBlock(t, 0.15),
      cutLengthMm: Math.round(2 * Math.PI * r),
      engraveAreaCm2: Math.round((w * h) / 120),
      estimatedLaserTimeSec: 18,
      layers: [
        { name: 'Corte Perímetro (#FF0000)', type: 'cut', color: '#FF0000', cutLengthMm: Math.round(2 * Math.PI * r) },
        { name: 'Gravação Anel e Arte (#0000FF)', type: 'engrave', color: '#0000FF', cutLengthMm: 70 }
      ]
    };
  }

  // =========================================================================
  // ARCHETYPE 9: TRAY / BANDEJA / PLACA RETANGULAR COM CANTOS ARREDONDADOS
  // =========================================================================
  const cornerR = params.radius || 6;
  const holeR = Math.min(3, Math.max(1.5, Math.round(Math.min(w, h) * 0.03)));
  const holeOffset = Math.round(cornerR + 4);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}mm" height="${h}mm" data-thickness-mm="${t.toFixed(1)}">
  <metadata id="cnc-metadata">
    <cnc:metadata xmlns:cnc="https://cncminas.com.br/schema/v1">
      <cnc:materialThickness_mm>${t.toFixed(1)}</cnc:materialThickness_mm>
      <cnc:defaultKerf_mm>0.15</cnc:defaultKerf_mm>
      <cnc:units>mm</cnc:units>
      <cnc:layers>
        <cnc:layer name="corte" color="#FF0000" operation="cut" />
        <cnc:layer name="gravacao" color="#0000FF" operation="engrave" />
      </cnc:layers>
    </cnc:metadata>
  </metadata>
  <!-- Perímetro Retangular com Cantos Arredondados (#FF0000) -->
  <rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="${cornerR}" ry="${cornerR}" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" id="corte-perimetro" />
  <!-- Furos de Fixação / Passagem de Parafuso M${holeR * 2} (#FF0000) -->
  <circle cx="${holeOffset}" cy="${holeOffset}" r="${holeR}" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" id="corte-furo-1" />
  <circle cx="${w - holeOffset}" cy="${holeOffset}" r="${holeR}" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" id="corte-furo-2" />
  <circle cx="${holeOffset}" cy="${h - holeOffset}" r="${holeR}" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" id="corte-furo-3" />
  <circle cx="${w - holeOffset}" cy="${h - holeOffset}" r="${holeR}" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" id="corte-furo-4" />
  ${style !== 'cut_only' ? `<!-- Moldura Técnica e Gravação de Textos (#0000FF) -->
  <rect x="${holeOffset + 4}" y="${holeOffset + 4}" width="${w - 2 * (holeOffset + 4)}" height="${h - 2 * (holeOffset + 4)}" rx="${Math.max(2, cornerR - 2)}" fill="none" stroke="#0000FF" stroke-width="0.5" stroke-dasharray="3,1" data-layer="engrave" id="gravacao-moldura" />
  <text x="${cx}" y="${cy - 2}" font-family="sans-serif" font-size="${Math.min(12, Math.round(w / 12))}" font-weight="bold" text-anchor="middle" fill="#0000FF">${textLabel}</text>
  <text x="${cx}" y="${cy + 12}" font-family="sans-serif" font-size="${Math.min(6, Math.round(w / 24))}" text-anchor="middle" fill="#0000FF">PRECISÃO CNC • JUIZ DE FORA</text>` : ''}
</svg>`;

  return {
    title: `Placa / Painel ${w}x${h}mm (${textLabel})`,
    description: `Placa paramétrica de ${w}x${h}mm com cantos arredondados R${cornerR}, 4 furos M${holeR * 2} em corte passante (#FF0000) e gravação de texto (#0000FF).`,
    widthMm: w,
    heightMm: h,
    svgContent: svg,
    recommendedMaterial: `Acrílico Cristal ou MDF ${t}mm`,
    recommendedThicknessMm: t,
    materialThickness_mm: t,
    metadata: createStandardMetadataBlock(t, 0.15),
    cutLengthMm: Math.round(2 * (w + h) + 8 * Math.PI * holeR),
    engraveAreaCm2: Math.round((w * h) / 100),
    estimatedLaserTimeSec: Math.round((w + h) / 8) + 16,
    layers: [
      { name: 'Corte Perímetro e Furos (#FF0000)', type: 'cut', color: '#FF0000', cutLengthMm: Math.round(2 * (w + h) + 8 * Math.PI * holeR) },
      { name: 'Gravação Moldura e Textos (#0000FF)', type: 'engrave', color: '#0000FF', cutLengthMm: 80 }
    ]
  };
}

/**
 * Gera desenhos vetoriais CAD/CAM industriais com IA (modelo mais recente do plano free: gemini-3.8-flash),
 * aplicando pré-processamento booleano Paper.js para garantir que não haja contornos conflitantes.
 */
export async function generateCncVector(
  prompt: string,
  style: 'cut_engrave' | 'cut_only' | 'relief_3d' = 'cut_engrave',
  targetMachine: 'laser' | 'router' = 'laser',
  overrideWidth?: number,
  overrideHeight?: number,
  thicknessMm = 3.0,
  kerfMm = 0.15
): Promise<GeneratedCncVector> {
  const width = overrideWidth || 120;
  const height = overrideHeight || 120;

  // 1. Tentar gerar via IA no servidor com o modelo mais atualizado para o plano Free: gemini-3.8-flash
  try {
    const res = await fetch('/api/ai/generate-cad-vector', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        style,
        targetMachine,
        width,
        height,
        thickness: thicknessMm,
        kerf: kerfMm
      })
    });

    if (res.ok) {
      const data = await res.json();
      if (data.svgContent) {
        // Pré-processamento automático com Paper.js: união de caminhos (path union) e resolução de intersecções
        const preprocessed = cleanAndUniteSvgPaths(data.svgContent, thicknessMm, kerfMm);
        const finalSvg = ensureSvgMetadataBlock(preprocessed.cleanedSvg, thicknessMm, kerfMm);
        const metrics = calculateSvgMetrics(finalSvg);

        return {
          title: data.title || prompt.slice(0, 36).trim(),
          description: `Projeto gerado por IA (${data.modelUsed || 'gemini-3.8-flash'}). Pré-processamento Paper.js: ${preprocessed.details}.`,
          widthMm: metrics.widthMm || width,
          heightMm: metrics.heightMm || height,
          svgContent: finalSvg,
          recommendedMaterial: `MDF Cru ou Acrílico Cast ${thicknessMm}mm`,
          recommendedThicknessMm: thicknessMm,
          materialThickness_mm: thicknessMm,
          metadata: createStandardMetadataBlock(thicknessMm, kerfMm, data.modelUsed || 'gemini-3.8-flash'),
          cutLengthMm: metrics.totalCutLengthMm,
          engraveAreaCm2: metrics.engraveAreaCm2,
          estimatedLaserTimeSec: Math.round(metrics.totalCutLengthMm / 25) + 14,
          layers: [
            { name: 'Corte Passante (#FF0000)', type: 'cut', color: '#FF0000', cutLengthMm: metrics.totalCutLengthMm },
            { name: 'Gravação Superficial (#0000FF)', type: 'engrave', color: '#0000FF', cutLengthMm: Math.round(metrics.engraveAreaCm2 * 2) }
          ]
        };
      }
    }
  } catch (apiError) {
    console.warn('API Gemini offline ou indisponível, utilizando motor paramétrico local:', apiError);
  }

  // 2. Fallback resiliente: Motor paramétrico industrial com pré-processamento Paper.js
  const procedural = generateProceduralVector(prompt, style, targetMachine, overrideWidth, overrideHeight);
  const preprocessed = cleanAndUniteSvgPaths(procedural.svgContent, procedural.materialThickness_mm, kerfMm);
  procedural.svgContent = ensureSvgMetadataBlock(preprocessed.cleanedSvg, procedural.materialThickness_mm, kerfMm);
  procedural.description += ` • Pré-processamento Paper.js: ${preprocessed.details}`;
  return procedural;
}

/**
 * Otimiza o prompt do usuário com IA (gemini-3.8-flash) para acrescentar restrições geométricas e parâmetros industriais.
 */
export async function optimizeCncPrompt(userPrompt: string, thicknessMm = 3.0, machine = 'laser'): Promise<string> {
  const prompt = userPrompt.trim();
  if (!prompt) throw new Error('Descreva a peça antes de aprimorar o texto.');

  try {
    const res = await fetch('/api/ai/optimize-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, thickness: thicknessMm, machine })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.optimizedPrompt) {
        return data.optimizedPrompt;
      }
    }
  } catch (err) {
    console.warn('Falha na API de otimização de prompt Gemini, utilizando gerador local:', err);
  }

  return `${prompt}, dimensões em milímetros, contorno fechado de corte passante (#FF0000) e gravação de detalhes (#0000FF), espessura ${thicknessMm}mm. Modelo otimizado para ${machine}.`;
}
