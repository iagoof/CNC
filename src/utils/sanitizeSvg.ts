/** Keep previews inert, including projects loaded from another browser or AI. */
export function sanitizeSvg(source: string): string {
  if (!source || typeof DOMParser === 'undefined') return '';
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.localName !== 'svg' || doc.querySelector('parsererror')
    || (root.namespaceURI && root.namespaceURI !== 'http://www.w3.org/2000/svg')) return '';
  const allowed = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
    'text', 'tspan', 'title', 'desc', 'defs', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'stop']);
  const attributes = new Set(['id', 'viewBox', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
    'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'transform', 'fill', 'fill-rule', 'fill-opacity',
    'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray',
    'opacity', 'clip-path', 'clip-rule', 'mask', 'offset', 'stop-color', 'stop-opacity',
    'gradientUnits', 'gradientTransform', 'spreadMethod', 'font-size', 'font-family', 'font-weight',
    'text-anchor', 'dominant-baseline', 'dx', 'dy', 'preserveAspectRatio', 'vector-effect']);
  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    if (!allowed.has(el.localName) || (el.namespaceURI && el.namespaceURI !== 'http://www.w3.org/2000/svg')) {
      el.remove();
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      const value = attr.value.trim();
      const localReference = /^url\(\s*#[a-zA-Z_][\w:.-]*\s*\)$/.test(value);
      if ((!attributes.has(attr.name) && !/^data-[a-z0-9-]+$/.test(attr.name))
        || /[<>\\\u0000-\u001f]/.test(value)
        || (/url\s*\(/i.test(value) && !localReference)
        || /(?:javascript|data|https?|file):/i.test(value)) el.removeAttributeNode(attr);
    }
  }
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return new XMLSerializer().serializeToString(root);
}
