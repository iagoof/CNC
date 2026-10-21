import assert from 'node:assert/strict';
import test from 'node:test';
import { packNesting, nestingTransform, type NestingItem, type NestingResult } from './src/utils/nestingEngine.ts';
const part = (overrides: Partial<NestingItem> = {}): NestingItem => ({ id: 'p1', name: 'Peça', width: 40,
  height: 40, quantity: 1, color: '#f59e0b', cutLength_mm: 160, engraveArea_cm2: 2, ...overrides });
function validate(result: NestingResult, width: number, height: number, margin: number, gap: number) {
  const epsilon = 1e-6;
  assert.deepEqual(result.errors, []);
  for (const box of result.placed) {
    assert(box.x >= margin - epsilon && box.y >= margin - epsilon);
    assert(box.x + box.w <= width - margin + epsilon && box.y + box.h <= height - margin + epsilon);
  }
  for (let i = 0; i < result.placed.length; i++) for (let j = i + 1; j < result.placed.length; j++) {
    const a = result.placed[i], b = result.placed[j];
    assert(a.x + a.w + gap <= b.x + epsilon || b.x + b.w + gap <= a.x + epsilon
      || a.y + a.h + gap <= b.y + epsilon || b.y + b.h + gap <= a.y + epsilon, `Colisão ${a.id} / ${b.id}`);
  }
  assert(result.utilizationPct >= 0 && result.utilizationPct <= 100 + epsilon);
}
test('preenche chapa sem arredondar dimensões decimais', () => {
  const result = packNesting([part({ width: 40.25, height: 20.125, quantity: 4 })], 80.5, 40.25, 0, 0);
  validate(result, 80.5, 40.25, 0, 0);
  assert.equal(result.placed.length, 4); assert.equal(result.unplacedCount, 0);
  assert.equal(result.utilizationPct, 100);
});
test('rotaciona apenas quando necessário e informa transformação física', () => {
  const result = packNesting([part({ width: 70, height: 40 })], 40, 70, 0, 0);
  assert.equal(result.placed.length, 1); assert.equal(result.placed[0].rotated, true);
  assert.equal(nestingTransform(result.placed[0]), 'translate(40 0) rotate(90)');
});
test('mantém margem e espaçamento inclusive na última peça', () => {
  const result = packNesting([part({ width: 45, height: 45, quantity: 4 })], 105, 105, 5, 5);
  validate(result, 105, 105, 5, 5); assert.equal(result.placed.length, 4);
});
test('conta todas as peças não colocadas e somente seus percursos', () => {
  const result = packNesting([part({ quantity: 5 })], 80, 80, 0, 0);
  assert.equal(result.placed.length, 4); assert.equal(result.unplacedCount, 1);
  assert.equal(result.totalCutLength_mm, 640); assert.equal(result.totalEngraveArea_cm2, 8);
});
test('margem impossível não anuncia sucesso vazio', () => {
  const result = packNesting([part({ quantity: 3 })], 100, 100, 50, 2);
  assert(result.errors.length > 0); assert.equal(result.unplacedCount, 3);
});
test('bloqueia dados inválidos e lote excessivo antes da expansão', () => {
  for (const quantity of [0, -1, 1.5, Infinity, NaN, 1001]) assert(packNesting([part({ quantity })], 100, 100, 0, 0).errors.length > 0);
  assert(packNesting([part({ width: 0 })], 100, 100, 0, 0).errors.length > 0);
  assert(packNesting([part()], 100, Infinity, 0, 0).errors.length > 0);
  assert(packNesting([part()], 100, 100, 0, -1).errors.length > 0);
  assert(packNesting([part(), part()], 100, 100, 0, 0).errors.length > 0);
  assert(packNesting([part({ pathsMarkup: 'M'.repeat(4000001) })], 100, 100, 0, 0).errors.length > 0);
});
test('100 lotes variados não sobrepõem peças nem descartam contagens', () => {
  let seed = 295721;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let iteration = 0; iteration < 100; iteration++) {
    const items = Array.from({ length: 12 }, (_, index) => part({ id: `p${index}`, width: 10 + random() * 220,
      height: 10 + random() * 170, quantity: 1 + Math.floor(random() * 4) }));
    const result = packNesting(items, 800, 600, 5, 2.5);
    validate(result, 800, 600, 5, 2.5);
    assert.equal(result.placed.length + result.unplacedCount, items.reduce((sum, item) => sum + item.quantity, 0));
    assert.deepEqual(packNesting(items, 800, 600, 5, 2.5), result);
  }
});
