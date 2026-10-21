import { calculateSvgMetrics, convertSvgToDxf, generateGcodeFromSvg, validateCncVector, applyKerfToSvg, serializeSceneGroupToStl } from '../src/utils/cncExporters';
import { readSvgGeometry, contourLength, contourArea } from '../src/utils/svgGeometry';
import { sanitizeSvg } from '../src/utils/sanitizeSvg';
import studioSource from '../src/services/firebase/seedData.ts?raw';
import { build3DFromSvg, createLaserMaterials } from '../src/components/studio3d/LaserModel3D';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import * as THREE from 'three';
import { packNesting } from '../src/utils/nestingEngine';
import { prepareNestingItem, buildNestingSvg } from '../src/utils/nestingSvg';

const results: { name: string; pass: boolean; detail?: string }[] = [];
function assert(condition: unknown, message = 'Asserção falhou'): asserts condition { if (!condition) throw new Error(message); }
const near = (a: number, b: number, tolerance = 0.05) => assert(Math.abs(a - b) < tolerance, `${a} ≠ ${b}`);
const svg = (body: string, attrs = 'viewBox="0 0 100 100" width="100mm" height="100mm"') => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;
function test(name: string, check: () => void) {
  try { check(); results.push({ name, pass: true }); } catch (e) { results.push({ name, pass: false, detail: String(e) }); }
}
test('Triângulo real: perímetro 120 mm, sem retângulo fictício', () => {
  const input = svg('<path fill="none" stroke="red" d="M10 10L40 10L40 50Z"/>');
  near(calculateSvgMetrics(input).totalCutLengthMm, 120);
  const code = generateGcodeFromSvg(input, { machineType: 'CO2', feedRate_mms: 20, powerOrRpm: 700, depthMm: 3 });
  assert(code.includes('X10.0000 Y90.0000') && code.includes('X40.0000 Y50.0000'));
  assert(!code.includes('X100.0000'));
});
test('Subcaminhos separados sem linha de ligação', () => {
  const input = svg('<path fill="none" d="M10 10h10 M50 50v10"/>');
  const geometry = readSvgGeometry(input);
  assert(geometry.contours.length === 2); near(calculateSvgMetrics(input).totalCutLengthMm, 20);
});
test('Curvas cúbicas e arcos preservados no DXF', () => {
  const input = svg('<path fill="none" d="M10 50C10 10 90 10 90 50 A40 40 0 0 1 10 50Z"/>');
  const geometry = readSvgGeometry(input);
  assert(geometry.contours[0].points.length > 50);
  const dxf = convertSvgToDxf(input);
  assert((dxf.match(/\nLINE\n/g) || []).length > 50);
  assert(calculateSvgMetrics(input).totalCutLengthMm > 200);
});
test('Escala física e origem do viewBox', () => {
  const input = svg('<rect x="10" y="20" width="20" height="10" fill="none"/>', 'viewBox="10 20 100 50" width="200mm" height="100mm"');
  const geometry = readSvgGeometry(input); near(geometry.contours[0].points[0].x, 0);
  near(geometry.contours[0].points[0].y, 0); near(calculateSvgMetrics(input).totalCutLengthMm, 120);
});
test('Transformações aninhadas e elipse', () => {
  const input = svg('<g transform="translate(10 20)"><g transform="scale(2)"><rect width="10" height="5" fill="none"/></g></g><ellipse cx="70" cy="70" rx="10" ry="5" fill="none"/>');
  const geometry = readSvgGeometry(input); near(geometry.contours[0].points[0].x, 10); near(geometry.contours[0].points[0].y, 20);
  near(contourLength(geometry.contours[0]), 60); assert(geometry.contours.length === 2);
});
test('Furo cortado antes do contorno externo e laser desligado nos rápidos', () => {
  const code = generateGcodeFromSvg(svg('<rect x="5" y="5" width="90" height="90" fill="none"/><circle cx="50" cy="50" r="10" fill="none"/>'),
    { machineType: 'CO2', feedRate_mms: 20, powerOrRpm: 700, depthMm: 3 });
  assert(code.indexOf('X60.0000 Y50.0000') < code.indexOf('X5.0000 Y95.0000'));
  let enabled = false;
  for (const line of code.split('\n')) { if (line.startsWith('M03')) enabled = true; if (line === 'M05') enabled = false; if (line.startsWith('G00')) assert(!enabled); }
});
test('Router retrai em todos os rápidos XY e respeita passes', () => {
  const code = generateGcodeFromSvg(svg('<rect x="10.25" y="20.5" width="20.5" height="10.25" fill="none"/>'),
    { machineType: 'Router', feedRate_mms: 10, powerOrRpm: 18000, depthMm: 3, stepDownMm: 2, safeZMm: 6 });
  assert(code.includes('Z-2.0000') && code.includes('Z-3.0000'));
  assert(!/\d+\.\d+\.\d+/.test(code));
  let z = 0;
  for (const line of code.split('\n')) { const match = line.match(/Z(-?[\d.]+)/); if (match) z = Number(match[1]); if (line.startsWith('G00 X')) assert(z === 6); }
});
test('Guias e limites da chapa não viram cortes', () => {
  const input = svg('<g data-layer="guide"><rect width="100" height="100"/><text x="1" y="5">Guia</text></g><line x1="10" y1="10" x2="20" y2="10"/>');
  assert(readSvgGeometry(input).contours.length === 1); near(calculateSvgMetrics(input).totalCutLengthMm, 10);
});
test('Gravação preenchida respeita furo em evenodd', () => {
  const input = svg('<path data-layer="engrave" fill="blue" fill-rule="evenodd" d="M10 10h20v20h-20z M15 15h10v10h-10z"/>');
  const geometry = readSvgGeometry(input);
  const middle = geometry.contours.filter(c => c.points[0].y > 15 && c.points[0].y < 25);
  assert(middle.length > 100);
  assert(middle.every(c => c.points.every(p => p.x <= 15.001 || p.x >= 24.999)));
  near(calculateSvgMetrics(input).engraveAreaCm2, 3, 0.05);
});
test('Texto gera os glifos reais e grava antes de cortar', () => {
  const input = svg('<text x="50" y="50" font-size="8" text-anchor="middle" fill="blue">ABC 123</text><rect x="2" y="2" width="96" height="96" fill="none"/>');
  const geometry = readSvgGeometry(input);
  assert(geometry.contours.filter(c => c.layer === 'engrave').length > 50);
  assert(calculateSvgMetrics(input).engraveAreaCm2 > 0);
  const code = generateGcodeFromSvg(input, { machineType: 'CO2', feedRate_mms: 20, powerOrRpm: 700, depthMm: 3 });
  assert(code.indexOf('GRAVACAO') < code.indexOf('CORTE'));
});
test('Tracejado mantém interrupções reais', () => {
  const geometry = readSvgGeometry(svg('<line x1="0" y1="10" x2="20" y2="10" stroke="blue" stroke-dasharray="2 2"/>'));
  assert(geometry.contours.length === 5); near(geometry.contours.reduce((sum, c) => sum + contourLength(c), 0), 10);
});
test('Entradas malformadas e geometria fora da mesa bloqueadas', () => {
  assert(!validateCncVector('<svg><path').isValid);
  assert(!validateCncVector(svg('<rect x="95" y="95" width="10" height="10"/>'), 100, 100).isValid);
  for (const stepDownMm of [0, -1, NaN]) {
    let failed = false;
    try { generateGcodeFromSvg(svg('<rect width="10" height="10"/>'), { machineType: 'Router', feedRate_mms: 10, powerOrRpm: 10000, depthMm: 3, stepDownMm }); }
    catch { failed = true; }
    assert(failed);
  }
});
test('SVG ativo é removido da prévia', () => {
  const clean = sanitizeSvg(svg('<script>alert(1)</script><foreignObject><div>HTML</div></foreignObject><rect width="10" height="10" onload="alert(1)" fill="url(https://example.org/a)"/>'));
  assert(!/script|foreignObject|onload|example\.org/.test(clean)); assert(clean.includes('rect'));
  assert(sanitizeSvg('<svg onload="alert(1)"><rect width="10" height="10"/></svg>').includes('rect'));
});
test('Kerf expande exterior e reduz furo de verdade', () => {
  const input = svg('<rect x="10" y="10" width="80" height="80" fill="none"/><rect x="40" y="40" width="20" height="20" fill="none"/>');
  const compensated = readSvgGeometry(applyKerfToSvg(input, 0.2));
  near(contourArea(compensated.contours[0]), 80.2 ** 2, 0.01);
  near(contourArea(compensated.contours[1]), 19.8 ** 2, 0.01);
});
test('Kerf funciona em curva, expande canvas e não aplica duas vezes', () => {
  const input = svg('<circle cx="50" cy="50" r="50" fill="none"/>');
  const output = applyKerfToSvg(input, 0.2);
  const geometry = readSvgGeometry(output);
  near(geometry.widthMm, 100.2, 0.02); near(geometry.heightMm, 100.2, 0.02);
  near(contourLength(geometry.contours[0]), Math.PI * 100.2, 0.2);
  assert(applyKerfToSvg(output, 0.2) === output);
});
test('Kerf rejeita contorno aberto e colisão entre peças', () => {
  for (const body of ['<line x1="10" y1="10" x2="30" y2="10"/>', '<rect x="10" y="10" width="10" height="10"/><rect x="20.1" y="10" width="10" height="10"/>']) {
    let failed = false; try { applyKerfToSvg(svg(body), 0.2); } catch { failed = true; } assert(failed);
  }
});
const gallerySvgs = [...studioSource.matchAll(/svgContent: `([\s\S]*?)`/g)].map(m => m[1]);
test('Todos os exemplos da galeria preservam geometria e exportam DXF', () => {
  assert(gallerySvgs.length >= 4, `Encontrados ${gallerySvgs.length} exemplos`);
  for (const [index, input] of gallerySvgs.entries()) {
    let geometry;
    try { geometry = readSvgGeometry(input); } catch (error) { throw new Error(`Exemplo ${index + 1}: ${error}`); }
    assert(geometry.contours.some(c => c.layer === 'cut'), `Sem cortes no exemplo ${index + 1}`);
    assert(convertSvgToDxf(input).endsWith('EOF\n'));
  }
});
test('STL usa milímetros, espessura real e preserva volume do furo', () => {
  const input = svg('<rect x="0" y="0" width="100" height="80" fill="none"/><rect x="40" y="30" width="20" height="10" fill="none"/>');
  const model = build3DFromSvg(input, 3, createLaserMaterials('mdf-cru', false));
  assert(model.parts.length === 1);
  const stl = serializeSceneGroupToStl(model.group, 10);
  const geometry = new STLLoader().parse(stl);
  geometry.computeBoundingBox();
  const size = geometry.boundingBox!.getSize(new THREE.Vector3());
  near(size.x, 100); near(size.y, 80); near(size.z, 3);
  const vertices = geometry.getAttribute('position');
  let volume = 0;
  for (let i = 0; i < vertices.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(vertices, i);
    const b = new THREE.Vector3().fromBufferAttribute(vertices, i + 1);
    const c = new THREE.Vector3().fromBufferAttribute(vertices, i + 2);
    volume += a.dot(b.cross(c)) / 6;
  }
  near(Math.abs(volume), (100 * 80 - 20 * 10) * 3, 0.1);
  geometry.dispose();
  model.group.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
});
test('Transferência e nesting rotacionado preservam triângulo, furo e gravação', () => {
  const input = svg('<path data-layer="cut" fill="none" d="M0 0H70L35 40Z"/><circle data-layer="cut" cx="35" cy="10" r="2" fill="none"/><line data-layer="engrave" x1="25" y1="10" x2="30" y2="10" stroke="blue"/>',
    'viewBox="0 0 70 40" width="70mm" height="40mm"');
  const prepared = prepareNestingItem({ name: 'Peça & <rótulo>', width: 1, height: 1, cutLength_mm: 1, svgContent: input, quantity: 2, transferId: 'test' }, '#f59e0b');
  near(prepared.width, 70); near(prepared.height, 40);
  const plan = packNesting([prepared], 50, 150, 5, 0);
  assert(plan.placed.length === 2 && plan.placed.every(p => p.rotated), `Rotação/quantidade: ${JSON.stringify(plan)}`);
  const exported = buildNestingSvg(plan, 50, 150, 5);
  const original = calculateSvgMetrics(input), metrics = calculateSvgMetrics(exported);
  near(metrics.totalCutLengthMm, original.totalCutLengthMm * 2, 0.05);
  near(metrics.engraveAreaCm2, original.engraveAreaCm2 * 2, 0.001);
  const geometry = readSvgGeometry(exported);
  assert(geometry.contours.filter(c => c.layer === 'cut').length === 4, 'Quantidade de contornos de corte mudou');
  near(geometry.contours[0].points[0].x, 45); near(geometry.contours[0].points[0].y, 5);
  assert(geometry.contours.every(c => c.points.every(p => p.x >= 4.99999 && p.x <= 45.00001 && p.y >= 4.99999 && p.y <= 145.00001)), 'Percurso fora da margem após rotação');
  assert(exported.includes('Peça &amp; &lt;rótulo&gt;'), 'Rótulo XML não escapado');
  assert(convertSvgToDxf(exported).endsWith('EOF\n'));
});
test('Exportação do nesting inclui somente colocadas e nenhuma borda ou etiqueta', () => {
  const item = prepareNestingItem({ name: 'Retângulo', width: 20, height: 10, cutLength_mm: 99999, quantity: 3 }, '#fff');
  const plan = packNesting([item], 20, 20, 0, 0);
  assert(plan.placed.length === 2 && plan.unplacedCount === 1);
  const output = buildNestingSvg(plan, 20, 20, 0);
  const metrics = calculateSvgMetrics(output);
  near(metrics.totalCutLengthMm, 120); assert(metrics.elementCount === 2);
  assert(output.includes('data-unplaced-count="1"'));
  let failed = false;
  try { buildNestingSvg(packNesting([], 20, 20, 0, 0), 20, 20, 0); } catch { failed = true; }
  assert(failed);
});
test('Nesting mantém sinalização de kerf já aplicado', () => {
  const input = applyKerfToSvg(svg('<rect x="10" y="10" width="80" height="80" fill="none"/>'), 0.15);
  const item = prepareNestingItem({ name: 'Compensado', width: 100, height: 100, cutLength_mm: 0, svgContent: input }, '#fff');
  const output = buildNestingSvg(packNesting([item], 110, 110, 5, 0), 110, 110, 5);
  near(calculateSvgMetrics(output).totalCutLengthMm, 80.15 * 4, 0.01);
  let failed = false; try { applyKerfToSvg(output, 0.15); } catch { failed = true; }
  assert(failed, 'Plano compensado não pode receber kerf novamente');
});
for (const result of results) {
  const li = document.createElement('li'); li.textContent = `${result.pass ? 'PASS' : 'FAIL'}: ${result.name}${result.detail ? ` — ${result.detail}` : ''}`;
  li.style.color = result.pass ? '#166534' : '#b91c1c'; document.getElementById('results')!.append(li);
}
document.getElementById('summary')!.textContent = `${results.filter(r => r.pass).length}/${results.length} verificações aprovadas`;
