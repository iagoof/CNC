export interface NestingItem {
  id: string; name: string; width: number; height: number; quantity: number; color: string;
  cutLength_mm: number; engraveArea_cm2?: number; pathsMarkup?: string; kerfApplied?: boolean; thicknessMm?: number;
}
export interface NestingTransfer {
  name: string; width: number; height: number; cutLength_mm: number; svgContent?: string;
  quantity?: number; transferId?: string; accountId?: string;
}
export interface PlacedBox {
  id: string; itemId: string; name: string; x: number; y: number; w: number; h: number;
  color: string; rotated: boolean; sourceWidth: number; sourceHeight: number;
  pathsMarkup?: string; kerfApplied?: boolean;
}
interface Rect { x: number; y: number; w: number; h: number }
export interface NestingResult {
  placed: PlacedBox[]; unplacedCount: number; sheetAreaM2: number; usedAreaM2: number;
  utilizationPct: number; totalCutLength_mm: number; totalEngraveArea_cm2: number; errors: string[];
}
const epsilon = 1e-7;
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w - epsilon && a.x + a.w > b.x + epsilon
  && a.y < b.y + b.h - epsilon && a.y + a.h > b.y + epsilon;
const contains = (a: Rect, b: Rect) => b.x >= a.x - epsilon && b.y >= a.y - epsilon
  && b.x + b.w <= a.x + a.w + epsilon && b.y + b.h <= a.y + a.h + epsilon;

/** MaxRects Best Short Side Fit. All intersecting free rectangles are split on four sides. */
export function packNesting(items: NestingItem[], sheetWidth: number, sheetLength: number, margin: number, gap: number): NestingResult {
  const errors: string[] = [];
  const count = items.reduce((sum, item) => sum + (Number.isSafeInteger(item.quantity) && item.quantity > 0 ? item.quantity : 0), 0);
  const empty = (): NestingResult => ({ placed: [], unplacedCount: count, sheetAreaM2: 0, usedAreaM2: 0,
    utilizationPct: 0, totalCutLength_mm: 0, totalEngraveArea_cm2: 0, errors });
  if (![sheetWidth, sheetLength].every(n => Number.isFinite(n) && n > 0 && n <= 100000)
    || ![margin, gap].every(n => Number.isFinite(n) && n >= 0)) errors.push('Dimensões, margem e distância entre peças devem ser números válidos.');
  if (sheetWidth <= 2 * margin || sheetLength <= 2 * margin) errors.push('A margem elimina a área útil da chapa.');
  if (count > 1000) errors.push('Limite de 1.000 unidades por plano. Divida o lote em mais chapas.');
  if (items.reduce((sum, item) => sum + (item.pathsMarkup?.length ?? 120) * item.quantity, 0) > 4000000) {
    errors.push('O plano excede o limite de complexidade dos vetores. Divida o lote em mais chapas.');
  }
  const seen = new Set<string>();
  for (const item of items) {
    if (!item.id || seen.has(item.id)) errors.push('Identificadores de peças inválidos ou repetidos.');
    seen.add(item.id);
    if (!item.name?.trim() || ![item.width, item.height].every(n => Number.isFinite(n) && n > 0 && n <= 100000)
      || !Number.isSafeInteger(item.quantity) || item.quantity < 1
      || !Number.isFinite(item.cutLength_mm) || item.cutLength_mm < 0
      || !Number.isFinite(item.engraveArea_cm2 ?? 0) || (item.engraveArea_cm2 ?? 0) < 0) errors.push(`Revise dimensões, quantidade e percursos de ${item.name || 'peça sem nome'}.`);
  }
  if (errors.length) return empty();
  const pieces = items.flatMap(item => Array.from({ length: item.quantity }, (_, index) => ({ ...item, pieceId: `${item.id}:${index}` })))
    .sort((a, b) => b.width * b.height - a.width * a.height || b.width + b.height - a.width - a.height || a.pieceId.localeCompare(b.pieceId));
  // Reserve the gap as part of each box; the final row/column may use the sheet edge.
  let free: Rect[] = [{ x: margin, y: margin, w: sheetWidth - 2 * margin + gap, h: sheetLength - 2 * margin + gap }];
  const placed: PlacedBox[] = [];
  let unplacedCount = 0, totalCutLength_mm = 0, totalEngraveArea_cm2 = 0;
  for (const item of pieces) {
    let best: { rect: Rect; rotated: boolean; short: number; long: number } | undefined;
    for (const space of free) {
      for (const rotated of [false, true]) {
        const w = rotated ? item.height : item.width, h = rotated ? item.width : item.height;
        if (w + gap > space.w + epsilon || h + gap > space.h + epsilon) continue;
        const short = Math.min(space.w - w - gap, space.h - h - gap), long = Math.max(space.w - w - gap, space.h - h - gap);
        if (!best || short < best.short - epsilon || Math.abs(short - best.short) < epsilon && (long < best.long - epsilon
          || Math.abs(long - best.long) < epsilon && (space.y < best.rect.y || space.y === best.rect.y && space.x < best.rect.x))) {
          best = { rect: { x: space.x, y: space.y, w, h }, rotated, short, long };
        }
      }
    }
    if (!best) { unplacedCount++; continue; }
    const box = best.rect;
    placed.push({ ...box, id: item.pieceId, itemId: item.id, name: item.name, color: item.color,
      rotated: best.rotated, sourceWidth: item.width, sourceHeight: item.height,
      pathsMarkup: item.pathsMarkup, kerfApplied: item.kerfApplied });
    totalCutLength_mm += item.cutLength_mm; totalEngraveArea_cm2 += item.engraveArea_cm2 ?? 0;
    const reserved = { ...box, w: box.w + gap, h: box.h + gap };
    const next: Rect[] = [];
    for (const space of free) {
      if (!overlaps(space, reserved)) { next.push(space); continue; }
      if (reserved.x > space.x + epsilon) next.push({ ...space, w: reserved.x - space.x });
      if (reserved.x + reserved.w < space.x + space.w - epsilon) next.push({ ...space, x: reserved.x + reserved.w, w: space.x + space.w - reserved.x - reserved.w });
      if (reserved.y > space.y + epsilon) next.push({ ...space, h: reserved.y - space.y });
      if (reserved.y + reserved.h < space.y + space.h - epsilon) next.push({ ...space, y: reserved.y + reserved.h, h: space.y + space.h - reserved.y - reserved.h });
    }
    free = next.filter((rect, index) => rect.w > epsilon && rect.h > epsilon
      && !next.some((other, otherIndex) => index !== otherIndex && contains(other, rect)
        && (!contains(rect, other) || otherIndex < index)));
  }
  const sheetAreaM2 = sheetWidth * sheetLength / 1e6;
  const usedAreaM2 = placed.reduce((sum, box) => sum + box.w * box.h / 1e6, 0);
  return { placed, unplacedCount, sheetAreaM2, usedAreaM2, utilizationPct: usedAreaM2 / sheetAreaM2 * 100,
    totalCutLength_mm, totalEngraveArea_cm2, errors };
}

export const nestingTransform = (part: PlacedBox) => part.rotated
  ? `translate(${part.x + part.sourceHeight} ${part.y}) rotate(90)`
  : `translate(${part.x} ${part.y})`;
