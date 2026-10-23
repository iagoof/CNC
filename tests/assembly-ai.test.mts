import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { once } from 'node:events';
import { DEFAULT_ASSEMBLY_PARAMS } from '../src/services/assemblyService.ts';
import { validateAssemblyPlan } from '../src/services/assemblyAiPlan.ts';
import { registerAssemblyAiRoutes } from '../server/assemblyAi.ts';
import { JSDOM } from 'jsdom';
import { readAssemblyFromSvg } from '../src/utils/laserAssembly.ts';

const readyPlan = () => ({
  status: 'ready', title: 'Casinha com janelas redondas',
  explanation: 'Casa de uma água dupla com duas janelas na frente.',
  assumptions: ['Medidas externas em milímetros.'],
  params: { ...DEFAULT_ASSEMBLY_PARAMS, model: 'house', width: 180, depth: 120, height: 110, lid: false,
    openings: [
      { part: 'front', shape: 'ellipse', x: 0.28, y: 0.62, width: 0.18, height: 0.22 },
      { part: 'front', shape: 'ellipse', x: 0.72, y: 0.62, width: 0.18, height: 0.22 }
    ] }
});

test('o plano de IA altera os cortes e preserva pares de encaixes', () => {
  const { assembly, plan } = validateAssemblyPlan(readyPlan());
  assert.equal(assembly.parts.length, 7);
  assert.equal(assembly.params.width, 180);
  assert.equal(plan.params.openings?.length, 2);
  const front = assembly.parts.find(p => p.id === 'front')!;
  assert.equal(front.holes.filter(h => h.length === 48).length, 2);
  assert.ok(assembly.joints.every(j => Math.hypot(...j.tabCenter.map((n, i) => n - j.socketCenter[i])) < 1e-5));
});

test('o plano é rejeitado se o modelo devolver dimensões inválidas ou aberturas sobre encaixes', () => {
  const impossible = readyPlan(); impossible.params.width = -20;
  assert.throws(() => validateAssemblyPlan(impossible), /dimensões/i);
  const conflicting = readyPlan(); conflicting.params.openings[0].y = 0.04;
  assert.throws(() => validateAssemblyPlan(conflicting), /abertura/i);
  assert.throws(() => validateAssemblyPlan({ ...readyPlan(), params: { ...readyPlan().params, width: '180' } }), /medidas|parâmetros/i);
});

test('janelas circulares mantêm diâmetro e contornos ao reabrir o SVG',()=>{
  const value=readyPlan();value.params.openings.forEach(o=>o.shape='circle');
  const {assembly}=validateAssemblyPlan(value);
  const rings=assembly.parts.find(p=>p.id==='front')!.holes.filter(h=>h.length===48);
  for(const ring of rings){
    const w=Math.max(...ring.map(p=>p[0]))-Math.min(...ring.map(p=>p[0]));
    const h=Math.max(...ring.map(p=>p[1]))-Math.min(...ring.map(p=>p[1]));
    assert.ok(Math.abs(w-h)<1e-8);
  }
  globalThis.DOMParser=new JSDOM('').window.DOMParser;
  const restored=readAssemblyFromSvg(assembly.svg)!;
  assert.deepEqual(restored.params.openings,assembly.params.openings);
  assert.deepEqual(restored.parts.map(p=>p.holes),assembly.parts.map(p=>p.holes));
});

test('uma construção não suportada não é substituída silenciosamente por outra família', () => {
  assert.throws(() => validateAssemblyPlan({ ...readyPlan(), status: 'unsupported', explanation: 'Gavetas articuladas ainda não são suportadas.' }), /Gavetas/);
  assert.throws(() => validateAssemblyPlan({ ...readyPlan(), status: 'ready', params: { ...readyPlan().params, model: 'dragon' } }), /família/i);
});

async function withServer(options: Parameters<typeof registerAssemblyAiRoutes>[1], run: (url: string) => Promise<void>) {
  const app = express(); app.use(express.json()); registerAssemblyAiRoutes(app, options);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await run(`http://127.0.0.1:${(server.address() as any).port}`); }
  finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
}

test('o endpoint chama o provedor e retorna somente um plano geometricamente válido', async () => {
  let calls = 0;
  await withServer({ configured: () => true, model: 'modelo-de-teste', generate: async request => {
    calls++; assert.match(request.prompt, /janelas redondas/); return { text: JSON.stringify(readyPlan()), model: 'modelo-de-teste' };
  } }, async url => {
    const response = await fetch(url + '/api/ai/generate-assembly', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'Uma casa com janelas redondas', defaults: DEFAULT_ASSEMBLY_PARAMS }) });
    const result = await response.json();
    assert.equal(response.status, 200); assert.equal(calls, 1); assert.equal(result.modelUsed, 'modelo-de-teste');
    assert.equal(result.plan.params.openings[0].shape, 'ellipse'); assert.equal(result.source, 'ai');
  });
});

test('chave ausente e resposta inválida nunca geram sucesso fictício nem vazam erro do provedor', async () => {
  await withServer({ configured: () => false, model: 'teste', generate: async () => { throw new Error('não deve chamar'); } }, async url => {
    const response = await fetch(url + '/api/ai/generate-assembly', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'uma casa', defaults: DEFAULT_ASSEMBLY_PARAMS }) });
    assert.equal(response.status, 503); assert.match((await response.json()).error, /configurada/i);
  });
  await withServer({ configured: () => true, model: 'teste', generate: async () => { throw new Error('secret-api-key-in-provider-error'); } }, async url => {
    const response = await fetch(url + '/api/ai/generate-assembly', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'uma casa', defaults: DEFAULT_ASSEMBLY_PARAMS }) });
    assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /secret-api-key/);
  });
  await withServer({ configured: () => true, model: 'teste', generate: async () => ({ text: '{"status":"ready"}', model: 'teste' }) }, async url => {
    const response = await fetch(url + '/api/ai/generate-assembly', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'uma casa', defaults: DEFAULT_ASSEMBLY_PARAMS }) });
    assert.equal(response.status, 422);
  });
});

test('entrada inválida é recusada antes de consumir o provedor', async () => {
  await withServer({ configured: () => true, model: 'teste', generate: async () => { throw new Error('não deve chamar'); } }, async url => {
    for (const body of [{ prompt: ' ' }, { prompt: 'x'.repeat(4001) }, { prompt: 'uma casa', defaults: { ...DEFAULT_ASSEMBLY_PARAMS, width: '180' } }]) {
      const response = await fetch(url + '/api/ai/generate-assembly', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      assert.equal(response.status, 400);
    }
  });
});
