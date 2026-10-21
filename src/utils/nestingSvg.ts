import { readSvgGeometry, contourLength, engravingIntervalMm } from './svgGeometry.ts';
import { nestingTransform, type NestingItem, type NestingResult, type NestingTransfer } from './nestingEngine.ts';
import { sanitizeSvg } from './sanitizeSvg.ts';

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]!));
export function prepareNestingItem(part: NestingTransfer, color: string): NestingItem {
  const id = `nest-${part.transferId || crypto.randomUUID()}`;
  const base = { id, name: part.name, quantity: part.quantity ?? 1, color };
  if (!part.svgContent) return { ...base, width: part.width, height: part.height,
    cutLength_mm: 2 * (part.width + part.height), engraveArea_cm2: 0 };
  const geometry = readSvgGeometry(part.svgContent);
  if (geometry.contours.some(c => c.points.some(p => p.x < -0.001 || p.y < -0.001 || p.x > geometry.widthMm + 0.001 || p.y > geometry.heightMm + 0.001))) {
    throw new Error('O desenho contém percursos fora dos limites declarados no SVG.');
  }
  const pathsMarkup = geometry.contours.map(c => `<path fill="none" stroke="${c.layer === 'cut' ? '#FF0000' : '#0000FF'}" stroke-width="0.3" data-layer="${c.layer}" d="M${c.points.map(p => `${p.x.toFixed(5)},${p.y.toFixed(5)}`).join('L')}${c.closed ? 'Z' : ''}"/>`).join('');
  return { ...base, width: geometry.widthMm, height: geometry.heightMm, pathsMarkup, thicknessMm: geometry.thicknessMm,
    cutLength_mm: geometry.contours.filter(c => c.layer === 'cut').reduce((sum, c) => sum + contourLength(c), 0),
    engraveArea_cm2: geometry.contours.filter(c => c.layer === 'engrave').reduce((sum, c) => sum + contourLength(c) * engravingIntervalMm / 100, 0),
    kerfApplied: /data-kerf-applied\s*=/.test(part.svgContent) };
}

/** Export only placed geometry. Sheet, margin and names are explicitly non-machining guides. */
export function buildNestingSvg(result: NestingResult, width: number, height: number, margin: number): string {
  if (result.errors.length || !result.placed.length) throw new Error(result.errors.join(' ') || 'Adicione peças que caibam na chapa antes de exportar.');
  const body = result.placed.map(part => {
    const safe = part.pathsMarkup
      ? sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg">${part.pathsMarkup}</svg>`).replace(/^<svg[^>]*>|<\/svg>$/g, '')
      : `<rect width="${part.sourceWidth}" height="${part.sourceHeight}" fill="none" stroke="#FF0000" stroke-width="0.3" data-layer="cut"/>`;
    return `<g transform="${nestingTransform(part)}">${safe}</g><text data-layer="guide" x="${part.x + 2}" y="${part.y + 8}" font-size="6">${escape(part.name)}</text>`;
  }).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}" data-unplaced-count="${result.unplacedCount}"${result.placed.some(p => p.kerfApplied) ? ' data-kerf-applied="per-part"' : ''}>
<g data-layer="guide"><rect width="${width}" height="${height}" fill="white" stroke="#94a3b8"/><rect x="${margin}" y="${margin}" width="${width - margin * 2}" height="${height - margin * 2}" fill="none" stroke="#cbd5e1" stroke-dasharray="2 2"/></g>
${body}</svg>`;
}
