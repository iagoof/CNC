export interface RasterTrace {
  paths: string[];
  occupiedPixels: number;
}

/** Trace pixel boundaries. Adjacent filled pixels share no internal cut edge. */
export function traceBinaryMask(mask: ArrayLike<number>, width: number, height: number): RasterTrace {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 2 || height < 2 || width > 384 || height > 384 || mask.length !== width * height) throw new Error('Imagem fora dos limites de vetorização.');
  type Point = [number, number];
  const edges = new Map<string, Point[]>();
  const key = (x: number, y: number) => `${x},${y}`;
  const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && !!mask[y * width + x];
  const add = (ax: number, ay: number, bx: number, by: number) => {
    const from = key(ax, ay), list = edges.get(from) || [];
    list.push([bx, by]); edges.set(from, list);
  };
  let occupiedPixels = 0, edgeCount = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!filled(x, y)) continue;
    occupiedPixels++;
    if (!filled(x, y - 1)) { add(x, y, x + 1, y); edgeCount++; }
    if (!filled(x + 1, y)) { add(x + 1, y, x + 1, y + 1); edgeCount++; }
    if (!filled(x, y + 1)) { add(x + 1, y + 1, x, y + 1); edgeCount++; }
    if (!filled(x - 1, y)) { add(x, y + 1, x, y); edgeCount++; }
  }
  if (occupiedPixels < 4) throw new Error('Nenhuma silhueta suficiente foi detectada. Use uma imagem de alto contraste.');
  if (edgeCount > 30000) throw new Error('Imagem complexa demais para um contorno seguro. Use um desenho simples de alto contraste.');
  const paths: string[] = [];
  while (edges.size) {
    const [start] = edges.keys();
    const points: Point[] = [];
    let current = start;
    for (let step = 0; step <= edgeCount; step++) {
      const outgoing = edges.get(current);
      if (!outgoing?.length || outgoing.length > 1) throw new Error('Contornos se cruzam ou tocam em um ponto. Separe as formas na imagem.');
      const [next] = outgoing;
      edges.delete(current);
      const [x, y] = current.split(',').map(Number);
      points.push([x, y]);
      current = key(next[0], next[1]);
      if (current === start) break;
    }
    if (current !== start) throw new Error('O contorno da imagem não pôde ser fechado.');
    const simplified = points.filter((point, index) => {
      const before = points[(index - 1 + points.length) % points.length];
      const after = points[(index + 1) % points.length];
      return (point[0] - before[0]) * (after[1] - point[1]) !== (point[1] - before[1]) * (after[0] - point[0]);
    });
    if (simplified.length >= 4) paths.push(`M ${simplified.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`);
  }
  if (!paths.length) throw new Error('Nenhum contorno fechado foi encontrado.');
  if (paths.length > 150) throw new Error('A imagem contém muitos contornos. Simplifique o desenho antes de vetorizar.');
  return { paths, occupiedPixels };
}

export function binaryMaskFromRgba(rgba: ArrayLike<number>, width: number, height: number): Uint8Array {
  if (rgba.length !== width * height * 4) throw new Error('Pixels da imagem inválidos.');
  const cornerOffsets = [0, width - 1, (height - 1) * width, width * height - 1];
  const transparentBackground = cornerOffsets.every(index => rgba[index * 4 + 3] < 128);
  const background = [0, 1, 2].map(channel => cornerOffsets.reduce((sum, index) => sum + rgba[index * 4 + channel], 0) / 4);
  const mask = new Uint8Array(width * height);
  for (let index = 0; index < mask.length; index++) {
    const offset = index * 4, alpha = rgba[offset + 3];
    if (transparentBackground) mask[index] = alpha >= 128 ? 1 : 0;
    else if (alpha >= 128) {
      const distance = Math.hypot(rgba[offset] - background[0], rgba[offset + 1] - background[1], rgba[offset + 2] - background[2]);
      mask[index] = distance > 80 ? 1 : 0;
    }
  }
  return mask;
}
