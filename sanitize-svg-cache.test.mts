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
