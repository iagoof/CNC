import { calculateSvgMetrics, convertSvgToDxf, generateGcodeFromSvg, validateCncVector } from '../src/utils/cncExporters';
import { readSvgGeometry, contourLength } from '../src/utils/svgGeometry';
import { sanitizeSvg } from '../src/utils/sanitizeSvg';

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
for (const result of results) {
  const li = document.createElement('li'); li.textContent = `${result.pass ? 'PASS' : 'FAIL'}: ${result.name}${result.detail ? ` — ${result.detail}` : ''}`;
  li.style.color = result.pass ? '#166534' : '#b91c1c'; document.getElementById('results')!.append(li);
}
document.getElementById('summary')!.textContent = `${results.filter(r => r.pass).length}/${results.length} verificações aprovadas`;
