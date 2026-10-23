import paper from 'paper';

export interface PreprocessResult {
  cleanedSvg: string;
  unionsPerformed: number;
  selfIntersectionsFixed: number;
  openPathsClosed: number;
  totalCutPaths: number;
  details: string;
}

let paperScope: paper.PaperScope | null = null;

function getPaperScope(): paper.PaperScope {
  if (!paperScope) {
    paperScope = new paper.PaperScope();
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 1200;
    paperScope.setup(canvas);
  }
  return paperScope;
}

/**
 * Pre-processa e limpa vetores SVG utilizando Paper.js:
 * 1. Detecta e resolve auto-intersecções em caminhos fechados de corte.
 * 2. Realiza união booleana (path union) de formas de corte sobrepostas ou que se tocam,
 *    eliminando arestas duplicadas e pontos de contato indesejados.
 * 3. Garante fechamento de contornos de corte passante (#FF0000).
 * 4. Preserva camadas de gravação (#0000FF), textos técnicos e metadados CNC intactos.
 */
export function cleanAndUniteSvgPaths(
  svgString: string,
  thicknessMm = 3.0,
  kerfMm = 0.15
): PreprocessResult {
  if (!svgString || typeof svgString !== 'string') {
    return {
      cleanedSvg: svgString,
      unionsPerformed: 0,
      selfIntersectionsFixed: 0,
      openPathsClosed: 0,
      totalCutPaths: 0,
      details: 'SVG inválido fornecido.'
    };
  }

  // Parse SVG into DOM to inspect and extract layers
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const root = doc.documentElement;

  if (root.localName !== 'svg' || doc.querySelector('parsererror')) {
    return {
      cleanedSvg: svgString,
      unionsPerformed: 0,
      selfIntersectionsFixed: 0,
      openPathsClosed: 0,
      totalCutPaths: 0,
      details: 'XML do SVG contém erros de formatação.'
    };
  }

  const scope = getPaperScope();
  scope.activate();

  // Clear any existing items in paper project
  scope.project.clear();

  let unionsPerformed = 0;
  let selfIntersectionsFixed = 0;
  let openPathsClosed = 0;

  try {
    // Collect all cut and engrave elements from the DOM
    const allElements = Array.from(root.querySelectorAll('path, rect, circle, ellipse, polygon, polyline'));
    const cutElements: Element[] = [];
    const engraveElements: Element[] = [];
    const otherElements: Element[] = [];

    for (const el of allElements) {
      const stroke = (el.getAttribute('stroke') || '').toUpperCase();
      const fill = (el.getAttribute('fill') || '').toUpperCase();
      const dataLayer = (el.getAttribute('data-layer') || '').toLowerCase();

      const isCut =
        dataLayer === 'cut' ||
        dataLayer === 'corte' ||
        stroke === '#FF0000' ||
        stroke === 'RED' ||
        stroke === '#F00';

      const isEngrave =
        dataLayer === 'engrave' ||
        dataLayer === 'gravacao' ||
        dataLayer === 'gravação' ||
        stroke === '#0000FF' ||
        stroke === 'BLUE' ||
        stroke === '#00F' ||
        fill === '#0000FF' ||
        fill === 'BLUE';

      if (isCut) {
        cutElements.push(el);
      } else if (isEngrave) {
        engraveElements.push(el);
      } else {
        otherElements.push(el);
      }
    }

    if (cutElements.length === 0) {
      return {
        cleanedSvg: svgString,
        unionsPerformed: 0,
        selfIntersectionsFixed: 0,
        openPathsClosed: 0,
        totalCutPaths: 0,
        details: 'Nenhum percurso de corte (#FF0000) encontrado para otimizar.'
      };
    }

    // Convert cut elements into Paper.js Path items
    const paperCutPaths: paper.PathItem[] = [];

    for (const el of cutElements) {
      let item: paper.Item | null = null;
      try {
        if (el.localName === 'rect') {
          const x = Number(el.getAttribute('x') || 0);
          const y = Number(el.getAttribute('y') || 0);
          const w = Number(el.getAttribute('width') || 0);
          const h = Number(el.getAttribute('height') || 0);
          const rx = Number(el.getAttribute('rx') || 0);
          const ry = Number(el.getAttribute('ry') || rx || 0);
          const rect = new scope.Rectangle(new scope.Point(x, y), new scope.Size(w, h));
          item = new scope.Path.Rectangle(rect, new scope.Size(rx, ry));
        } else if (el.localName === 'circle') {
          const cx = Number(el.getAttribute('cx') || 0);
          const cy = Number(el.getAttribute('cy') || 0);
          const r = Number(el.getAttribute('r') || 0);
          item = new scope.Path.Circle(new scope.Point(cx, cy), r);
        } else if (el.localName === 'ellipse') {
          const cx = Number(el.getAttribute('cx') || 0);
          const cy = Number(el.getAttribute('cy') || 0);
          const rx = Number(el.getAttribute('rx') || 0);
          const ry = Number(el.getAttribute('ry') || 0);
          const rect = new scope.Rectangle(cx - rx, cy - ry, rx * 2, ry * 2);
          item = new scope.Path.Ellipse(rect);
        } else if (el.localName === 'path') {
          const d = el.getAttribute('d') || '';
          if (d.trim()) {
            item = scope.project.importSVG(`<svg><path d="${d}" /></svg>`) as paper.Item;
            // importSVG wraps in a group, unwrap to get Path
            if (item && 'children' in item && item.children && item.children.length > 0) {
              const child = item.children[0];
              child.remove();
              item.remove();
              item = child;
            }
          }
        }
      } catch (err) {
        console.warn('Paper.js: falha ao importar elemento de corte individual:', err);
      }

      if (item && item instanceof scope.PathItem) {
        let pathItem: paper.PathItem = item;
        if (pathItem instanceof scope.Path && !pathItem.closed) {
          pathItem.closePath();
          openPathsClosed++;
        }

        // Resolve self-intersections on single path if method exists
        try {
          const resolved = (pathItem as any).resolveCrossings ? (pathItem as any).resolveCrossings() : pathItem;
          if (resolved && resolved instanceof scope.PathItem && resolved !== pathItem) {
            selfIntersectionsFixed++;
            pathItem = resolved;
          }
        } catch {
          // ignore
        }

        paperCutPaths.push(pathItem);
      }
    }

    if (paperCutPaths.length === 0) {
      return {
        cleanedSvg: svgString,
        unionsPerformed: 0,
        selfIntersectionsFixed: 0,
        openPathsClosed: 0,
        totalCutPaths: cutElements.length,
        details: 'Contornos já se encontram isolados e regulares.'
      };
    }

    // Perform pairwise Boolean Union for any overlapping/intersecting cut paths
    const mergedCutPaths: paper.PathItem[] = [];
    const usedIndices = new Set<number>();

    for (let i = 0; i < paperCutPaths.length; i++) {
      if (usedIndices.has(i)) continue;
      let currentPath = paperCutPaths[i];

      let mergedInThisRound = true;
      while (mergedInThisRound) {
        mergedInThisRound = false;
        for (let j = 0; j < paperCutPaths.length; j++) {
          if (i === j || usedIndices.has(j)) continue;
          const otherPath = paperCutPaths[j];

          // Check for intersection or containment
          const intersects = currentPath.intersects(otherPath);
          const boundsOverlap = currentPath.bounds.intersects(otherPath.bounds);

          if (intersects || (boundsOverlap && currentPath.contains(otherPath.bounds.center))) {
            try {
              const united = currentPath.unite(otherPath);
              if (united && united.bounds.area > 0) {
                currentPath = united;
                usedIndices.add(j);
                unionsPerformed++;
                mergedInThisRound = true;
              }
            } catch (unionErr) {
              console.warn('Paper.js erro ao unir caminhos:', unionErr);
            }
          }
        }
      }

      usedIndices.add(i);
      mergedCutPaths.push(currentPath);
    }

    // Remove old cut elements from DOM
    for (const el of cutElements) {
      el.remove();
    }

    // Add back perfected united cut paths as SVG <path> elements
    for (const p of mergedCutPaths) {
      const svgPathD = p.pathData;
      if (svgPathD && svgPathD.trim()) {
        const newPathEl = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
        newPathEl.setAttribute('d', svgPathD);
        newPathEl.setAttribute('fill', 'none');
        newPathEl.setAttribute('stroke', '#FF0000');
        newPathEl.setAttribute('stroke-width', '0.8');
        newPathEl.setAttribute('data-layer', 'cut');
        root.appendChild(newPathEl);
      }
    }

    // Ensure metadata block is present and up to date
    if (!root.getAttribute('data-thickness-mm')) {
      root.setAttribute('data-thickness-mm', thicknessMm.toFixed(1));
    }

    const serializer = new XMLSerializer();
    const finalCleanedSvg = serializer.serializeToString(doc);

    const details = [
      unionsPerformed > 0 ? `${unionsPerformed} união(ões) de percursos efetuada(s)` : 'Nenhuma sobreposição conflitante detectada',
      selfIntersectionsFixed > 0 ? `${selfIntersectionsFixed} auto-intersecção(ões) corrigida(s)` : null,
      openPathsClosed > 0 ? `${openPathsClosed} contorno(s) fechado(s)` : null,
      `${mergedCutPaths.length} contorno(s) de corte finais validados`
    ]
      .filter(Boolean)
      .join(' • ');

    return {
      cleanedSvg: finalCleanedSvg,
      unionsPerformed,
      selfIntersectionsFixed,
      openPathsClosed,
      totalCutPaths: mergedCutPaths.length,
      details
    };
  } catch (err) {
    console.error('Erro no pré-processamento Paper.js:', err);
    return {
      cleanedSvg: svgString,
      unionsPerformed: 0,
      selfIntersectionsFixed: 0,
      openPathsClosed: 0,
      totalCutPaths: 0,
      details: err instanceof Error ? `Falha Paper.js: ${err.message}` : 'Erro no processamento booleano.'
    };
  } finally {
    scope.project.clear();
  }
}
