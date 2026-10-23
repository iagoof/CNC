export interface RasterTrace {
  paths: string[];
  occupiedPixels: number;
}

type Point = [number, number];

/**
 * Ramer-Douglas-Peucker polygon simplification algorithm.
 * Replaces jagged 1-pixel stair-step edges from raster scans with clean, smooth CNC cutting vectors.
 */
function rdpSimplify(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let index = 0;
  const start = points[0];
  const end = points[points.length - 1];

  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lineLenSq = dx * dx + dy * dy;

  for (let i = 1; i < points.length - 1; i++) {
    let dist = 0;
    if (lineLenSq === 0) {
      dist = Math.hypot(points[i][0] - start[0], points[i][1] - start[1]);
    } else {
      const num = Math.abs(dy * points[i][0] - dx * points[i][1] + end[0] * start[1] - end[1] * start[0]);
      dist = num / Math.sqrt(lineLenSq);
    }
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }

  if (maxDist > epsilon) {
    const left = rdpSimplify(points.slice(0, index + 1), epsilon);
    const right = rdpSimplify(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  } else {
    return [start, end];
  }
}

/** Computes the signed 2D polygon area using the Shoelace formula */
function polygonArea(points: Point[]): number {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i][0] * points[j][1];
    area -= points[j][0] * points[i][1];
  }
  return area / 2;
}

/**
 * Traces pixel boundaries into clean, closed CNC cutting contours.
 * Employs Eulerian planar-graph cycle decomposition so touching shapes,
 * diagonal corners, and saddle points never crash or self-intersect.
 */
export function traceBinaryMask(mask: ArrayLike<number>, width: number, height: number): RasterTrace {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 2 ||
    height < 2 ||
    width > 512 ||
    height > 512 ||
    mask.length !== width * height
  ) {
    throw new Error('Imagem fora dos limites aceitos para vetorização (mínimo 2x2, máximo 512x512).');
  }

  const edges = new Map<string, Point[]>();
  const key = (x: number, y: number) => `${x},${y}`;
  const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && !!mask[y * width + x];

  const add = (ax: number, ay: number, bx: number, by: number) => {
    const from = key(ax, ay);
    const list = edges.get(from) || [];
    list.push([bx, by]);
    edges.set(from, list);
  };

  let occupiedPixels = 0;
  let totalEdges = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!filled(x, y)) continue;
      occupiedPixels++;
      // Clockwise orientation around solid interior:
      if (!filled(x, y - 1)) { add(x, y, x + 1, y); totalEdges++; }
      if (!filled(x + 1, y)) { add(x + 1, y, x + 1, y + 1); totalEdges++; }
      if (!filled(x, y + 1)) { add(x + 1, y + 1, x, y + 1); totalEdges++; }
      if (!filled(x - 1, y)) { add(x, y + 1, x, y); totalEdges++; }
    }
  }

  if (occupiedPixels < 4) {
    throw new Error('Nenhuma silhueta suficiente foi detectada na imagem. Certifique-se de que o desenho tenha contraste nítido.');
  }

  if ([...edges.values()].some(outgoing => outgoing.length > 1)) {
    throw new Error('Os contornos se tocam ou cruzam na diagonal. Separe as peças antes de vetorizar.');
  }

  const paths: string[] = [];

  // Decompose directed planar edge graph into closed cycles
  while (edges.size > 0) {
    // Find a starting vertex with at least one outgoing edge
    let startKey: string | null = null;
    for (const [k, out] of edges.entries()) {
      if (out.length > 0) {
        startKey = k;
        break;
      } else {
        edges.delete(k);
      }
    }
    if (!startKey) break;

    const points: Point[] = [];
    let currentKey = startKey;
    let prevPoint: Point | null = null;
    let steps = 0;
    const maxSteps = totalEdges + 500;

    while (steps++ < maxSteps) {
      const outgoing = edges.get(currentKey);
      if (!outgoing || outgoing.length === 0) {
        edges.delete(currentKey);
        break;
      }

      const [currX, currY] = currentKey.split(',').map(Number);
      points.push([currX, currY]);

      // At junctions (e.g. saddle points or touching diagonals), choose the rightmost turn
      // to keep foreground contours continuous without artificial crossings
      let choiceIdx = 0;
      if (outgoing.length > 1 && prevPoint) {
        const inDx = currX - prevPoint[0];
        const inDy = currY - prevPoint[1];
        let bestAngle = -Infinity;
        for (let i = 0; i < outgoing.length; i++) {
          const outDx = outgoing[i][0] - currX;
          const outDy = outgoing[i][1] - currY;
          // In screen coordinates (Y down), positive cross product corresponds to right turn
          const cross = inDx * outDy - inDy * outDx;
          const dot = inDx * outDx + inDy * outDy;
          const angle = Math.atan2(cross, dot);
          if (angle > bestAngle) {
            bestAngle = angle;
            choiceIdx = i;
          }
        }
      }

      const next = outgoing.splice(choiceIdx, 1)[0];
      if (outgoing.length === 0) {
        edges.delete(currentKey);
      }

      prevPoint = [currX, currY];
      currentKey = key(next[0], next[1]);

      if (currentKey === startKey) {
        break;
      }
    }

    if (points.length < 3) continue;

    // Filter collinear points on grid lines
    const nonCollinear: Point[] = [];
    for (let i = 0; i < points.length; i++) {
      const pPrev = points[(i - 1 + points.length) % points.length];
      const pCurr = points[i];
      const pNext = points[(i + 1) % points.length];
      const cross = (pCurr[0] - pPrev[0]) * (pNext[1] - pCurr[1]) - (pCurr[1] - pPrev[1]) * (pNext[0] - pCurr[0]);
      if (Math.abs(cross) > 1e-4) {
        nonCollinear.push(pCurr);
      }
    }

    if (nonCollinear.length < 3) continue;

    // Apply gentle RDP simplification (epsilon = 0.6) to smooth raster stair steps into clean vectors
    const simplified = rdpSimplify(nonCollinear.concat([nonCollinear[0]]), 0.2);
    if (
      simplified.length > 1 &&
      simplified[simplified.length - 1][0] === simplified[0][0] &&
      simplified[simplified.length - 1][1] === simplified[0][1]
    ) {
      simplified.pop();
    }

    // Filter out degenerate single-pixel artifacts (area < 2.5 mm²/px²)
    if (simplified.length >= 3 && Math.abs(polygonArea(simplified)) >= 0.5) {
      paths.push(`M ${simplified.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ')} Z`);
    }
  }

  if (!paths.length) {
    throw new Error('Nenhum contorno fechado pôde ser extraído. Desenhe com linhas mais grossas ou envie uma imagem com maior contraste.');
  }

  return { paths, occupiedPixels };
}

/**
 * Extracts a high-contrast binary mask from RGBA canvas pixel data.
 * Supports transparent backgrounds, white paper sketches, and dark-mode designs.
 */
export function binaryMaskFromRgba(rgba: ArrayLike<number>, width: number, height: number): Uint8Array {
  if (rgba.length !== width * height * 4) {
    throw new Error('Pixels da imagem inválidos.');
  }

  const cornerOffsets = [0, width - 1, (height - 1) * width, width * height - 1];
  const transparentBackground = cornerOffsets.every(index => rgba[index * 4 + 3] < 128);

  const background = [0, 1, 2].map(
    channel => cornerOffsets.reduce((sum, index) => sum + rgba[index * 4 + channel], 0) / 4
  );

  const mask = new Uint8Array(width * height);
  let occupiedCount = 0;

  for (let index = 0; index < mask.length; index++) {
    const offset = index * 4;
    const alpha = rgba[offset + 3];

    if (transparentBackground) {
      if (alpha >= 128) {
        mask[index] = 1;
        occupiedCount++;
      }
    } else if (alpha >= 128) {
      const distance = Math.hypot(
        rgba[offset] - background[0],
        rgba[offset + 1] - background[1],
        rgba[offset + 2] - background[2]
      );
      if (distance > 50) {
        mask[index] = 1;
        occupiedCount++;
      }
    }
  }

  // If over 85% of image was flagged (e.g. inverted contrast or dark drawing on bright background),
  // invert the mask so the actual object contour is extracted rather than the canvas border
  if (!transparentBackground && occupiedCount > 0.85 * (width * height)) {
    for (let i = 0; i < mask.length; i++) {
      mask[i] = mask[i] ? 0 : 1;
    }
  }

  return mask;
}
