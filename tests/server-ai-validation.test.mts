import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { createCncApp } from '../server.ts';

async function withServer(run: (baseUrl: string) => Promise<void>) {
  const app = createCncApp();
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const port = (server.address() as any).port;
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
}

test('generate-cad-vector recusa prompts vazios, com apenas espaços ou maiores que 4000 caracteres', async () => {
  await withServer(async baseUrl => {
    const invalidInputs = [
      {},
      { prompt: '' },
      { prompt: '    ' },
      { prompt: 'a'.repeat(4001) }
    ];

    for (const body of invalidInputs) {
      const res = await fetch(`${baseUrl}/api/ai/generate-cad-vector`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /Prompt de desenho não fornecido/i);
    }
  });
});

test('optimize-prompt recusa entrada inválida e limita tamanho', async () => {
  await withServer(async baseUrl => {
    const badRes = await fetch(`${baseUrl}/api/ai/optimize-prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '   ' })
    });
    assert.equal(badRes.status, 400);

    const overlongRes = await fetch(`${baseUrl}/api/ai/optimize-prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'a'.repeat(4001) })
    });
    assert.equal(overlongRes.status, 400);
  });
});

test('diagnose-gcode recusa gcode ausente ou gigante', async () => {
  await withServer(async baseUrl => {
    const emptyRes = await fetch(`${baseUrl}/api/ai/diagnose-gcode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gcode: '' })
    });
    assert.equal(emptyRes.status, 400);

    const hugeRes = await fetch(`${baseUrl}/api/ai/diagnose-gcode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gcode: 'a'.repeat(1000001) })
    });
    assert.equal(hugeRes.status, 400);
  });
});

test('servidor aplica cabeçalhos de segurança HTTP e desativa x-powered-by', async () => {
  await withServer(async baseUrl => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.equal(res.headers.get('x-xss-protection'), '0');
    assert.equal(res.headers.get('x-powered-by'), null);
  });
});
