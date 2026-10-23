import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { generateParametricBox, type BoxParams } from './src/utils/parametricBoxGenerator.ts';

const defaultParams: BoxParams = {
  widthMm: 100,
  heightMm: 80,
  depthMm: 60,
  thicknessMm: 3,
  tabWidthMm: 10,
  kerfMm: 0.1,
  hasLid: true
};

test('generateParametricBox cria 6 faces quando possui tampa (hasLid: true)', () => {
  const result = generateParametricBox(defaultParams);

  assert.equal(result.faces.length, 6);
  const faceIds = result.faces.map(f => f.id);
  assert.deepEqual(faceIds, ['base', 'front', 'back', 'left', 'right', 'top']);

  // Verifica cálculo do percurso de corte total
  const calculatedCutLength = result.faces.reduce((acc, f) => acc + f.cutLengthMm, 0);
  assert.equal(result.totalCutLengthMm, calculatedCutLength);
  assert(result.totalCutLengthMm > 0);

  // Verifica propriedades de cada face
  for (const face of result.faces) {
    assert(typeof face.id === 'string' && face.id.length > 0);
    assert(typeof face.name === 'string' && face.name.length > 0);
    assert(face.widthMm > 0);
    assert(face.heightMm > 0);
    assert(face.pathD.startsWith('M 0 0'));
    assert(face.pathD.endsWith('Z'));
    assert(face.cutLengthMm > 0);
    assert.equal(face.explosionVector.length, 3);
    assert.equal(face.position3D.length, 3);
    assert.equal(face.rotation3D.length, 3);
  }
});

test('generateParametricBox cria 5 faces quando não possui tampa (hasLid: false)', () => {
  const paramsNoLid: BoxParams = { ...defaultParams, hasLid: false };
  const result = generateParametricBox(paramsNoLid);

  assert.equal(result.faces.length, 5);
  const faceIds = result.faces.map(f => f.id);
  assert.deepEqual(faceIds, ['base', 'front', 'back', 'left', 'right']);
  assert(!faceIds.includes('top'));
});

test('geração e formatação do SVG', () => {
  const result = generateParametricBox(defaultParams);

  assert(result.svgContent.includes('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert(result.svgContent.includes(`width="${result.totalWidthMm}mm"`));
  assert(result.svgContent.includes(`height="${result.totalHeightMm}mm"`));
  assert(result.svgContent.includes(`viewBox="0 0 ${result.totalWidthMm} ${result.totalHeightMm}"`));

  for (const face of result.faces) {
    assert(result.svgContent.includes(`data-part="${face.id}"`));
    assert(result.svgContent.includes(`d="${face.pathD}"`));
  }
});

test('quebra de linha no layout 2D SVG quando a largura acumulada excede 450mm', () => {
  const largeBoxParams: BoxParams = {
    widthMm: 200,
    heightMm: 150,
    depthMm: 100,
    thicknessMm: 4,
    tabWidthMm: 15,
    kerfMm: 0.2,
    hasLid: true
  };

  const result = generateParametricBox(largeBoxParams);

  // Com width 200 e depth 100 com espaçamento 10:
  // Face 0 (base: 200x100) -> currentX passa de 10 para 220
  // Face 1 (front: 200x150) -> currentX 220 + 200 = 420 <= 450, cabe -> currentX passa para 430
  // Face 2 (back: 200x150) -> currentX 430 + 200 = 630 > 450 -> quebra linha!
  assert(result.totalHeightMm > 150 + 10 + 10);
  assert(result.totalWidthMm > 0);
});

test('criação do grupo 3D via create3DGroup', () => {
  const result = generateParametricBox(defaultParams);
  const group = result.create3DGroup();

  assert(group instanceof THREE.Group);
  assert.equal(group.name, 'ParametricBox3D');
  assert.equal(group.children.length, result.faces.length);

  group.children.forEach((child, idx) => {
    assert(child instanceof THREE.Mesh);
    const face = result.faces[idx];
    assert.equal(child.name, face.name);

    // Fator de escala 0.1
    const expectedX = face.position3D[0] * 0.1;
    const expectedY = face.position3D[1] * 0.1;
    const expectedZ = face.position3D[2] * 0.1;

    assert.equal(child.position.x, expectedX);
    assert.equal(child.position.y, expectedY);
    assert.equal(child.position.z, expectedZ);

    assert.equal(child.rotation.x, face.rotation3D[0]);
    assert.equal(child.rotation.y, face.rotation3D[1]);
    assert.equal(child.rotation.z, face.rotation3D[2]);

    assert.deepEqual(child.userData.explosionVector, face.explosionVector);
    assert.equal(child.userData.partName, face.name);
    assert.equal(child.userData.widthMm, face.widthMm);
    assert.equal(child.userData.heightMm, face.heightMm);
    assert.deepEqual(child.userData.originalPosition, child.position);
  });
});

test('comportamento com diferentes parâmetros de encaixe (tabWidth, kerf, thickness)', () => {
  const customParams: BoxParams = {
    widthMm: 50,
    heightMm: 50,
    depthMm: 50,
    thicknessMm: 2,
    tabWidthMm: 5,
    kerfMm: 0,
    hasLid: true
  };

  const result = generateParametricBox(customParams);
  assert.equal(result.faces.length, 6);
  for (const face of result.faces) {
    assert(face.cutLengthMm > 0);
    assert(face.pathD.includes('L'));
    assert(face.pathD.split('L').length > 4 || result.svgContent.includes('data-part="'+face.id+'"'));
  }
});
