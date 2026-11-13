import assert from 'node:assert/strict';
import test from 'node:test';
import { binaryMaskFromRgba, traceBinaryMask } from '../src/utils/rasterTrace.ts';

test('traça um bloco e mantém o furo como contorno separado', () => {
  const mask = new Uint8Array(7 * 7);
  for (let y = 1; y < 6; y++) for (let x = 1; x < 6; x++) mask[y * 7 + x] = 1;
  mask[3 * 7 + 3] = 0;
  const result = traceBinaryMask(mask, 7, 7);
  assert.equal(result.occupiedPixels, 24);
  assert.equal(result.paths.length, 2);
  assert.match(result.paths[0], /^M /);
});

test('rejeita peças que se tocam apenas na diagonal', () => {
  const mask = new Uint8Array(4 * 4);
  for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1], [2, 2], [3, 2], [2, 3]]) mask[y * 4 + x] = 1;
  assert.throws(() => traceBinaryMask(mask, 4, 4), /cruzam|tocam/);
});

test('usa transparência ou contraste com o fundo', () => {
  const transparent = new Uint8Array(4 * 4 * 4);
  for (const [x, y] of [[1, 1], [2, 1], [1, 2], [2, 2]]) transparent[(y * 4 + x) * 4 + 3] = 255;
  assert.equal(traceBinaryMask(binaryMaskFromRgba(transparent, 4, 4), 4, 4).occupiedPixels, 4);
  const opaque = new Uint8Array(transparent.length);
  for (let i = 0; i < 16; i++) { opaque[i * 4] = 255; opaque[i * 4 + 1] = 255; opaque[i * 4 + 2] = 255; opaque[i * 4 + 3] = 255; }
  for (const [x, y] of [[1, 1], [2, 1], [1, 2], [2, 2]]) { const i = (y * 4 + x) * 4; opaque[i] = opaque[i + 1] = opaque[i + 2] = 0; }
  assert.equal(traceBinaryMask(binaryMaskFromRgba(opaque, 4, 4), 4, 4).occupiedPixels, 4);
});

test('rejeita imagem sem silhueta', () => {
  assert.throws(() => traceBinaryMask(new Uint8Array(16), 4, 4), /silhueta/);
});

test('binaryMaskFromRgba detecta limiar exato de contraste euclidiano', () => {
  // Test image 4x4 with uniform black background (0, 0, 0)
  const rgba = new Uint8Array(4 * 4 * 4);
  for (let i = 0; i < 16; i++) {
    rgba[i * 4 + 3] = 255; // opaque
  }
  // Pixel at (1, 1): distance = sqrt(30^2 + 40^2 + 0^2) = 50. Not > 50, should remain 0.
  const idxBelow = (1 * 4 + 1) * 4;
  rgba[idxBelow] = 30;
  rgba[idxBelow + 1] = 40;
  rgba[idxBelow + 2] = 0;

  // Pixel at (2, 2): distance = sqrt(31^2 + 40^2 + 0^2) = sqrt(961 + 1600) = sqrt(2561) > 50, should be 1.
  const idxAbove = (2 * 4 + 2) * 4;
  rgba[idxAbove] = 31;
  rgba[idxAbove + 1] = 40;
  rgba[idxAbove + 2] = 0;

  const mask = binaryMaskFromRgba(rgba, 4, 4);
  assert.equal(mask[1 * 4 + 1], 0);
  assert.equal(mask[2 * 4 + 2], 1);
});
