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

test('servidor express remove x-powered-by e define cabecalhos de seguranca padrao', async () => {
  await withServer(async baseUrl => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);

    // X-Powered-By deve ser removido para evitar fingerprinting de versao e framework
    assert.equal(res.headers.get('x-powered-by'), null);

    // Cabecalhos defensivos essenciais
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.equal(res.headers.get('cross-origin-opener-policy'), 'same-origin');
    assert.equal(res.headers.get('x-xss-protection'), '0');
  });
});
