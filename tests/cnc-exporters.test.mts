import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { exportSceneGroupToStl, serializeSceneGroupToStl } from '../src/utils/cncExporters.ts';

function setupMockDom() {
  const elementsCreated: { tagName: string; element: any }[] = [];
  const bodyAppended: any[] = [];
  const bodyRemoved: any[] = [];
  const urlsCreated: { blob: Blob; url: string }[] = [];
  const urlsRevoked: string[] = [];

  let urlCounter = 0;

  const mockAnchor = {
    tagName: 'A',
    href: '',
    download: '',
    clickCount: 0,
    click() {
      this.clickCount++;
    }
  };

  const mockDocument = {
    body: {
      appendChild(child: any) {
        bodyAppended.push(child);
      },
      removeChild(child: any) {
        bodyRemoved.push(child);
      }
    },
    createElement(tagName: string) {
      if (tagName.toLowerCase() === 'a') {
        const anchorInstance = { ...mockAnchor };
        elementsCreated.push({ tagName, element: anchorInstance });
        return anchorInstance;
      }
      const dummy = { tagName };
      elementsCreated.push({ tagName, element: dummy });
      return dummy;
    }
  };

  const origDocument = (globalThis as any).document;
  const origCreateObjectUrl = URL.createObjectURL;
  const origRevokeObjectUrl = URL.revokeObjectURL;

  (globalThis as any).document = mockDocument;

  URL.createObjectURL = (blob: Blob) => {
    const fakeUrl = `blob:mock-url-${++urlCounter}`;
    urlsCreated.push({ blob, url: fakeUrl });
    return fakeUrl;
  };

  URL.revokeObjectURL = (url: string) => {
    urlsRevoked.push(url);
  };

  return {
    elementsCreated,
    bodyAppended,
    bodyRemoved,
    urlsCreated,
    urlsRevoked,
    cleanup() {
      (globalThis as any).document = origDocument;
      URL.createObjectURL = origCreateObjectUrl;
      URL.revokeObjectURL = origRevokeObjectUrl;
    }
  };
}

test('exportSceneGroupToStl exporta objeto 3D para STL e dispara download no navegador com parâmetros padrão', async () => {
  const dom = setupMockDom();
  try {
    const geometry = new THREE.BoxGeometry(10, 20, 30);
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geometry, material);

    exportSceneGroupToStl(mesh);

    assert.equal(dom.elementsCreated.length, 1);
    assert.equal(dom.elementsCreated[0].tagName, 'a');

    const anchor = dom.elementsCreated[0].element;
    assert.equal(anchor.download, 'modelo_cnc.stl');
    assert.equal(anchor.clickCount, 1);

    assert.equal(dom.bodyAppended.length, 1);
    assert.equal(dom.bodyAppended[0], anchor);

    assert.equal(dom.bodyRemoved.length, 1);
    assert.equal(dom.bodyRemoved[0], anchor);

    assert.equal(dom.urlsCreated.length, 1);
    assert.equal(dom.urlsRevoked.length, 1);
    assert.equal(dom.urlsCreated[0].url, dom.urlsRevoked[0]);
    assert.equal(anchor.href, dom.urlsCreated[0].url);

    const blobText = await dom.urlsCreated[0].blob.text();
    assert.ok(/solid exported/i.test(blobText));
    assert.ok(/endsolid exported/i.test(blobText));
  } finally {
    dom.cleanup();
  }
});

test('exportSceneGroupToStl aceita nome de arquivo e fator de escala (unitsToMm) personalizados', async () => {
  const dom = setupMockDom();
  try {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geometry, material);

    exportSceneGroupToStl(mesh, 'peca_customizada.stl', 10);

    const anchor = dom.elementsCreated[0].element;
    assert.equal(anchor.download, 'peca_customizada.stl');
    assert.equal(anchor.clickCount, 1);

    const blobText = await dom.urlsCreated[0].blob.text();
    assert.ok(/solid exported/i.test(blobText));
    assert.ok(blobText.includes('vertex 5 5 5'));
  } finally {
    dom.cleanup();
  }
});

test('exportSceneGroupToStl suporta hierarquias complexas de grupos com múltiplas malhas', async () => {
  const dom = setupMockDom();
  try {
    const group = new THREE.Group();
    const mesh1 = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10));
    mesh1.position.set(0, 0, 0);
    const mesh2 = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 20));
    mesh2.position.set(20, 0, 0);
    group.add(mesh1);
    group.add(mesh2);

    exportSceneGroupToStl(group, 'grupo_complexo.stl', 1);

    const anchor = dom.elementsCreated[0].element;
    assert.equal(anchor.download, 'grupo_complexo.stl');
    assert.equal(anchor.clickCount, 1);

    const blobText = await dom.urlsCreated[0].blob.text();
    assert.ok(/solid exported/i.test(blobText));
    assert.ok(blobText.includes('facet normal'));
  } finally {
    dom.cleanup();
  }
});

test('exportSceneGroupToStl lança erro em escala unitsToMm inválida e aborta download no DOM', () => {
  const dom = setupMockDom();
  try {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));

    for (const invalidScale of [0, -1, NaN, Infinity, -Infinity]) {
      assert.throws(
        () => exportSceneGroupToStl(mesh, 'test.stl', invalidScale),
        /Escala STL inválida/
      );
    }

    assert.equal(dom.elementsCreated.length, 0);
    assert.equal(dom.bodyAppended.length, 0);
    assert.equal(dom.bodyRemoved.length, 0);
    assert.equal(dom.urlsCreated.length, 0);
  } finally {
    dom.cleanup();
  }
});

test('serializeSceneGroupToStl gera diretamente a string STL válida', () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10));
  const stlString = serializeSceneGroupToStl(mesh, 1);
  assert.equal(typeof stlString, 'string');
  assert.ok(/solid exported/i.test(stlString));
  assert.ok(/endsolid exported/i.test(stlString));
});

test('serializeSceneGroupToStl aplica multiplicador de escala corretamente', () => {
  const mesh1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  const stlScale1 = serializeSceneGroupToStl(mesh1, 1);

  const mesh2 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  const stlScale10 = serializeSceneGroupToStl(mesh2, 10);

  assert.notEqual(stlScale1, stlScale10);
  assert.ok(stlScale1.includes('vertex 0.5 0.5 0.5'));
  assert.ok(stlScale10.includes('vertex 5 5 5'));
});

test('serializeSceneGroupToStl rejeita escalas não numéricas, zero ou negativas', () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  for (const invalidScale of [0, -10, NaN, Infinity, -Infinity]) {
    assert.throws(
      () => serializeSceneGroupToStl(mesh, invalidScale),
      /Escala STL inválida/
    );
  }
});
