import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeSvg } from './src/utils/sanitizeSvg.ts';

test('sanitizeSvg handles empty input safely', () => {
  assert.equal(sanitizeSvg(''), '');
});

test('sanitizeSvg returns consistent result for identical inputs in non-DOM environment', () => {
  const input = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" fill="red"/></svg>';
  const first = sanitizeSvg(input);
  const second = sanitizeSvg(input);
  assert.equal(first, second);
});

test('sanitizeSvg memoization cache stores and returns cached results when DOMParser exists', () => {
  if (typeof globalThis.DOMParser === 'undefined') {
    (globalThis as any).DOMParser = class {
      parseFromString() {
        const root = {
          localName: 'svg',
          namespaceURI: 'http://www.w3.org/2000/svg',
          attributes: [],
          querySelectorAll: () => [],
          setAttribute: () => {}
        };
        return {
          documentElement: root,
          querySelector: () => null
        };
      }
    };
    (globalThis as any).XMLSerializer = class {
      serializeToString() {
        return '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" fill="red"/></svg>';
      }
    };
  }

  const input = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" fill="red"/></svg>';
  const first = sanitizeSvg(input);
  const second = sanitizeSvg(input);
  assert.equal(first, second);
  assert(first.includes('<rect'));
});

test('sanitizeSvg strips dangerous case-varied attributes and unallowed tags with JSDOM', async () => {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  (globalThis as any).DOMParser = dom.window.DOMParser;
  (globalThis as any).XMLSerializer = dom.window.XMLSerializer;

  const maliciousInput = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" ONLOAD="alert(1)" ONERROR="alert(2)" HREF="javascript:alert(3)" /><script>alert(4)</script><SCRIPT>alert(5)</SCRIPT></svg>';
  const sanitized = sanitizeSvg(maliciousInput);

  assert(!sanitized.includes('ONLOAD'), 'ONLOAD should be stripped');
  assert(!sanitized.includes('ONERROR'), 'ONERROR should be stripped');
  assert(!sanitized.includes('HREF'), 'HREF should be stripped');
  assert(!sanitized.includes('script'), 'script element should be removed');
  assert(!sanitized.includes('SCRIPT'), 'SCRIPT element should be removed');
  assert(sanitized.includes('<rect'), 'valid rect element should remain');
  assert(sanitized.includes('width="100"'), 'valid width attribute should remain');
});
