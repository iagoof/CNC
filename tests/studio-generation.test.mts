import assert from 'node:assert/strict';
import test from 'node:test';
import { generateProceduralVector } from '../src/services/geminiCncService.ts';
import { JSDOM } from 'jsdom';
import * as THREE from 'three';
import { build3DFromSvg } from '../src/components/studio3d/LaserModel3D.ts';

test('a prévia 3D preserva todas as sete peças da casa', () => {
  const dom = new JSDOM('');
  (globalThis as any).DOMParser = dom.window.DOMParser;
  (globalThis as any).XMLSerializer = dom.window.XMLSerializer;
  const material = new THREE.MeshStandardMaterial();
  const result = build3DFromSvg(generateProceduralVector('kit casa').svgContent, 3, {
    faceMaterial: material, edgeMaterial: material, kerfMaterial: material
  } as any);
  assert.equal(result.parts.length, 7);
});

test('montagem não é interpretada como tag ou chaveiro', () => {
  const result = generateProceduralVector('Desenvolva um kit de montagem para uma casa');
  assert.match(result.title, /casa/i);
  assert.doesNotMatch(result.title, /chaveiro/i);
  assert.equal((result.svgContent.match(/data-part=/g) || []).length, 7);
  assert.match(result.description, /pares de encaixes/i);
});
test('tag explícita continua sendo um chaveiro', () => {
  assert.match(generateProceduralVector('tag de identificação').title, /chaveiro/i);
});
test('pedido desconhecido não vira placa silenciosamente', () => {
  assert.throws(() => generateProceduralVector('um dragão articulado'), /não.*modelo local/i);
});
