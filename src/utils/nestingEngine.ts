export interface NestingItem {
  id: string; name: string; width: number; height: number; quantity: number; color: string;
  cutLength_mm: number; engraveArea_cm2?: number; pathsMarkup?: string; kerfApplied?: boolean; thicknessMm?: number;
}
export interface NestingTransfer {
  name: string; width: number; height: number; cutLength_mm: number; svgContent?: string;
    quantity?: number; transferId?: string; accountId?: string; parts?: NestingTransfer[];
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

  // Performance Optimization (⚡ Bolt):
  // Avoid intermediate object allocations ({ rect: ... }), closure allocations (.filter, .some),
  // and inline rectangular intersection / containment logic to optimize CPU cache & memory allocation.
  for (const item of pieces) {
    let bestX = 0, bestY = 0, bestW = 0, bestH = 0;
    let bestRotated = false, bestShort = Infinity, bestLong = Infinity;
    let found = false;

    const itemW = item.width, itemH = item.height;

    // Find best placement across current free rectangles using MaxRects Best Short Side Fit
    for (let i = 0; i < free.length; i++) {
      const space = free[i];
      const spaceX = space.x, spaceY = space.y, spaceW = space.w, spaceH = space.h;

      // 1. Check unrotated orientation (w = itemW, h = itemH)
      if (itemW + gap <= spaceW + epsilon && itemH + gap <= spaceH + epsilon) {
        const remW = spaceW - itemW - gap, remH = spaceH - itemH - gap;
        const short = remW < remH ? remW : remH;
        const long = remW < remH ? remH : remW;
        if (!found || short < bestShort - epsilon || Math.abs(short - bestShort) < epsilon && (long < bestLong - epsilon
          || Math.abs(long - bestLong) < epsilon && (spaceY < bestY || spaceY === bestY && spaceX < bestX))) {
          found = true;
          bestX = spaceX; bestY = spaceY; bestW = itemW; bestH = itemH;
          bestRotated = false; bestShort = short; bestLong = long;
        }
      }

      // 2. Check rotated orientation (w = itemH, h = itemW)
      if (itemH + gap <= spaceW + epsilon && itemW + gap <= spaceH + epsilon) {
        const remW = spaceW - itemH - gap, remH = spaceH - itemW - gap;
        const short = remW < remH ? remW : remH;
        const long = remW < remH ? remH : remW;
        if (!found || short < bestShort - epsilon || Math.abs(short - bestShort) < epsilon && (long < bestLong - epsilon
          || Math.abs(long - bestLong) < epsilon && (spaceY < bestY || spaceY === bestY && spaceX < bestX))) {
          found = true;
          bestX = spaceX; bestY = spaceY; bestW = itemH; bestH = itemW;
          bestRotated = true; bestShort = short; bestLong = long;
        }
      }
    }

    if (!found) { unplacedCount++; continue; }

    placed.push({ x: bestX, y: bestY, w: bestW, h: bestH, id: item.pieceId, itemId: item.id, name: item.name, color: item.color,
      rotated: bestRotated, sourceWidth: itemW, sourceHeight: itemH,
      pathsMarkup: item.pathsMarkup, kerfApplied: item.kerfApplied });
    totalCutLength_mm += item.cutLength_mm; totalEngraveArea_cm2 += item.engraveArea_cm2 ?? 0;

    const resX = bestX, resY = bestY, resW = bestW + gap, resH = bestH + gap;
    const resRight = resX + resW, resBottom = resY + resH;

    // Split intersecting free rectangles on all 4 sides
    const next: Rect[] = [];
    for (let i = 0; i < free.length; i++) {
      const space = free[i];
      const sx = space.x, sy = space.y, sw = space.w, sh = space.h;
      const sRight = sx + sw, sBottom = sy + sh;

      // Inline overlap check
      if (!(sx < resRight - epsilon && sRight > resX + epsilon && sy < resBottom - epsilon && sBottom > resY + epsilon)) {
        next.push(space);
        continue;
      }

      if (resX > sx + epsilon) next.push({ x: sx, y: sy, w: resX - sx, h: sh });
      if (resRight < sRight - epsilon) next.push({ x: resRight, y: sy, w: sRight - resRight, h: sh });
      if (resY > sy + epsilon) next.push({ x: sx, y: sy, w: sw, h: resY - sy });
      if (resBottom < sBottom - epsilon) next.push({ x: sx, y: resBottom, w: sw, h: sBottom - resBottom });
    }

    // Prune redundant / fully-contained rectangles
    const nextLen = next.length;
    const filtered: Rect[] = [];
    for (let i = 0; i < nextLen; i++) {
      const rect = next[i];
      const rx = rect.x, ry = rect.y, rw = rect.w, rh = rect.h;
      if (rw <= epsilon || rh <= epsilon) continue;

      let isContained = false;
      const rRight = rx + rw, rBottom = ry + rh;

      for (let j = 0; j < nextLen; j++) {
        if (i === j) continue;
        const other = next[j];
        const ox = other.x, oy = other.y, ow = other.w, oh = other.h;

        // Inline contains check: contains(other, rect)
        if (rx >= ox - epsilon && ry >= oy - epsilon && rRight <= ox + ow + epsilon && rBottom <= oy + oh + epsilon) {
          // Check if equal dimensions: contains(rect, other)
          const otherRight = ox + ow, otherBottom = oy + oh;
          const rectContainsOther = (ox >= rx - epsilon && oy >= ry - epsilon && otherRight <= rRight + epsilon && otherBottom <= rBottom + epsilon);
          if (!rectContainsOther || j < i) {
            isContained = true;
            break;
          }
        }
      }
      if (!isContained) filtered.push(rect);
    }
    free = filtered;
  }
  const sheetAreaM2 = sheetWidth * sheetLength / 1e6;
  const usedAreaM2 = placed.reduce((sum, box) => sum + box.w * box.h / 1e6, 0);
  return { placed, unplacedCount, sheetAreaM2, usedAreaM2, utilizationPct: usedAreaM2 / sheetAreaM2 * 100,
    totalCutLength_mm, totalEngraveArea_cm2, errors };
}

export const nestingTransform = (part: PlacedBox) => part.rotated
  ? `translate(${part.x + part.sourceHeight} ${part.y}) rotate(90)`
  : `translate(${part.x} ${part.y})`;
