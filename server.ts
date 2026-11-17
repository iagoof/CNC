import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { registerAssemblyAiRoutes } from './server/assemblyAi';
import {
  callNvidiaNimChat,
  isAiConfigured,
  NVIDIA_KEY_ID,
  NVIDIA_PRIMARY_MODEL,
  type NimContentPart
} from './server/nvidiaNim';

dotenv.config({ path: ['.env.local', '.env'], quiet: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createCncApp() {
  const app = express();
  // Security hardening: hide server implementation details and enforce defensive HTTP headers
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('X-XSS-Protection', '0');
    next();
  });
  app.use(express.json({ limit: '20mb' }));
  registerAssemblyAiRoutes(app);

  /**
   * Endpoint de Geração de Desenhos Vetoriais CNC CAD/CAM com IA (NVIDIA NIM / moonshotai/kimi-k3.1-pro)
   */
  app.post('/api/ai/generate-cad-vector', async (req, res) => {
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    if (!prompt || prompt.length > 4000) {
      res.status(400).json({ error: 'Prompt de desenho não fornecido ou muito longo (máximo 4000 caracteres).' });
      return;
    }

    const numWidth = Number(req.body?.width);
    const width = Number.isFinite(numWidth) && numWidth > 0 && numWidth <= 5000 ? numWidth : 120;
    const numHeight = Number(req.body?.height);
    const height = Number.isFinite(numHeight) && numHeight > 0 && numHeight <= 5000 ? numHeight : 120;
    const numThickness = Number(req.body?.thickness);
    const thickness = Number.isFinite(numThickness) && numThickness > 0 && numThickness <= 100 ? numThickness : 3.0;
    const numKerf = Number(req.body?.kerf);
    const kerf = Number.isFinite(numKerf) && numKerf >= 0 && numKerf <= 10 ? numKerf : 0.15;

    const style = typeof req.body?.style === 'string' ? req.body.style.slice(0, 64).replace(/[^\w\s-]/g, '') : 'cut_engrave';
    const targetMachine = typeof req.body?.targetMachine === 'string' ? req.body.targetMachine.slice(0, 64).replace(/[^\w\s-]/g, '') : 'laser';
    const imageUrl = typeof req.body?.imageUrl === 'string' && req.body.imageUrl.startsWith('data:image/') && req.body.imageUrl.length <= 8_000_000
      ? req.body.imageUrl
      : undefined;

    try {
      const systemInstruction = `Você é o Engenheiro Chefe de CAD/CAM e Vetorização Industrial para máquinas de Corte Laser e Router CNC.
Sua missão é gerar APENAS um código SVG técnico estritamente dimensional para revisão antes do corte.

REGRAS DE CONSTRUÇÃO INDUSTRIAL CNC:
1. O SVG deve ter xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}mm" height="${height}mm" data-thickness-mm="${thickness}".
2. CAMADA DE CORTE PASSANTE (Perímetros e furos vazados):
   - DEVE usar SEMPRE: stroke="#FF0000" stroke-width="0.8" fill="none" data-layer="cut"
   - Todos os contornos de corte DEVEM ser FECHADOS (fecham com 'Z' ou são rect/circle/ellipse/polygon).
   - Deixe margem mínima de 2mm até as bordas do viewBox (coordenadas entre 2 e ${width - 2} no eixo X, e entre 2 e ${height - 2} no eixo Y).
   - NUNCA crie contornos de corte que se cruzem ou que tenham arestas duplicadas sobrepostas.
3. CAMADA DE GRAVAÇÃO VETORIAL (Detalhes técnicos, textos ou texturas):
   - ${style === 'cut_only' ? 'NÃO inclua camada de gravação (apenas corte #FF0000).' : 'DEVE usar SEMPRE: stroke="#0000FF" stroke-width="0.5" fill="none" data-layer="engrave"'}
4. METADADOS TÉCNICOS:
   - Inclua no início do SVG a tag <metadata id="cnc-metadata"> com materialThickness_mm="${thickness}" e defaultKerf_mm="${kerf}".
5. RESPOSTA:
   - Para kits e pedidos de montagem, forneça TODAS as peças separadas na chapa com folga entre elas, identificadas por data-part. Nunca substitua o conjunto por um único painel.
   - Responda EXCLUSIVAMENTE com o código SVG completo. Comece com <svg e termine com </svg>, sem explicações fora do SVG.`;

      const userText = `Gere o arquivo SVG paramétrico para fabricação CNC da seguinte peça:
Descrição: "${prompt}"
Estilo: ${style}
Máquina: ${targetMachine}
Dimensões externas desejadas: ${width}mm x ${height}mm
Espessura da chapa: ${thickness}mm
Compensação de Kerf: ${kerf}mm`;

      const userContent: string | NimContentPart[] = imageUrl
        ? [
            { type: 'text', text: userText },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]
        : userText;

      const response = await callNvidiaNimChat({
        model: NVIDIA_PRIMARY_MODEL,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: userContent }
        ],
        maxTokens: 6144,
        temperature: 0.15,
        reasoningEffort: 'low',
        timeoutMs: 55000
      });

      const responseText = response.text || '';
      const svgMatch = responseText.match(/<svg[\s\S]*?<\/svg>/i);
      if (!svgMatch) {
        throw new Error('Formato SVG não identificado na resposta da IA.');
      }

      res.json({
        success: true,
        provider: response.provider,
        modelUsed: response.model,
        svgContent: svgMatch[0],
        title: prompt.slice(0, 36).trim(),
        widthMm: width,
        heightMm: height,
        thicknessMm: thickness,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.warn('Falha na API NVIDIA NIM CAD Vector:', { status: error?.status, message: error?.message });
      res.status(503).json({
        error: 'Serviço da IA indisponível no momento. Tente novamente.',
        modelUsed: NVIDIA_PRIMARY_MODEL,
        useFallback: true
      });
    }
  });

  /**
   * Endpoint de Otimização e Enriquecimento Técnico de Prompts CAD com IA (NVIDIA NIM / moonshotai/kimi-k3.1-pro)
   */
  app.post('/api/ai/optimize-prompt', async (req, res) => {
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    if (!prompt || prompt.length > 4000) {
      res.status(400).json({ error: 'Prompt não fornecido ou muito longo (máximo 4000 caracteres).' });
      return;
    }

    const numThickness = Number(req.body?.thickness);
    const thickness = Number.isFinite(numThickness) && numThickness > 0 && numThickness <= 100 ? numThickness : 3.0;
    const machine = typeof req.body?.machine === 'string' ? req.body.machine.slice(0, 64).replace(/[^\w\s-]/g, '') : 'laser';

    try {
      const systemInstruction = `Você é um especialista em preparação de arquivos CAD para corte laser e fresadoras CNC.
Enriqueça a descrição informal do usuário transformando-a em um prompt técnico de engenharia de precisão em Português do Brasil.
Especifique:
- Tolerância geométrica e encaixes mecânicos quando aplicável (ex: dentes finger joint, espiga e rasgo mortise).
- Espessura do material (${thickness}mm) e compensação de kerf (0.15mm).
- Separação estrita de camadas: corte passante fechado em vermelho #FF0000 e gravação em azul #0000FF.
- Forneça APENAS o texto aprimorado final em Português do Brasil, claro e conciso (máximo 3 frases, sem aspas externas e sem markdown).`;

      const response = await callNvidiaNimChat({
        model: NVIDIA_PRIMARY_MODEL,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: `Melhore este prompt para fabricação CNC (${machine}, chapa ${thickness}mm): "${prompt}"` }
        ],
        maxTokens: 350,
        temperature: 0.2,
        reasoningEffort: 'low',
        timeoutMs: 25000
      });

      const optimized = (response.text || '').replace(/^["'«“]+|["'»”]+$/g, '').trim();
      res.json({
        success: true,
        optimizedPrompt: optimized || prompt,
        provider: response.provider,
        modelUsed: response.model
      });
    } catch (error: any) {
      console.warn('Fallback da otimização de prompt ativado:', { status: error?.status });
      res.json({
        success: true,
        optimizedPrompt: `${prompt}, contorno fechado em corte passante (#FF0000) e gravação de detalhes (#0000FF), espessura ${thickness}mm com encaixes tolerados para máquina ${machine}.`,
        modelUsed: `${NVIDIA_PRIMARY_MODEL} (modo local)`
      });
    }
  });

  /**
   * Endpoint de Diagnóstico Inteligente de G-code CAM com IA (NVIDIA NIM / moonshotai/kimi-k3.1-pro)
   */
  app.post('/api/ai/diagnose-gcode', async (req, res) => {
    const gcode = typeof req.body?.gcode === 'string' ? req.body.gcode.trim() : '';
    if (!gcode || gcode.length > 1000000) {
      res.status(400).json({ error: 'Código G-code não fornecido ou excede o limite máximo (1MB).' });
      return;
    }

    const machineType = typeof req.body?.machineType === 'string' ? req.body.machineType.slice(0, 64).replace(/[^\w\s-]/g, '') : 'laser';
    const sampleGcode = gcode.slice(0, 6000);

    try {
      const systemInstruction = `Você é um engenheiro de aplicação CAM industrial de CNC Laser e Router.
Analise a amostra de G-code fornecida e retorne um diagnóstico técnico estruturado em JSON válido em Português do Brasil com os seguintes campos:
{
  "status": "clear" | "warning",
  "motionCount": número aproximado de comandos de movimentação (G00/G01/G02/G03),
  "estimatedTimeFormatted": tempo estimado legível (ex: "3m 45s"),
  "riskLevel": "baixo" | "médio" | "alto",
  "insights": [ "array de pontos de atenção encontrados no código: coordenadas G21/G90, desligamento M05, avanços F, potência/rotação S e alturas Z" ],
  "recommendations": [ "recomendações técnicas diretas para o operador antes de iniciar a usinagem/corte" ]
}
Responda APENAS o JSON válido, sem markdown.`;

      const response = await callNvidiaNimChat({
        model: NVIDIA_PRIMARY_MODEL,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: `Analise este G-code para máquina ${machineType}:\n\n${sampleGcode}` }
        ],
        maxTokens: 1024,
        temperature: 0.1,
        reasoningEffort: 'low',
        timeoutMs: 30000,
        jsonMode: true
      });

      const parsedResult = JSON.parse(response.text || '{}');
      res.json({
        success: true,
        aiVerified: true,
        provider: response.provider,
        diagnostic: {
          status: parsedResult.status === 'warning' ? 'warning' : 'clear',
          motionCount: Number(parsedResult.motionCount) || (gcode.match(/\bG0?[0123]\b/gi) || []).length,
          estimatedTimeFormatted: parsedResult.estimatedTimeFormatted || 'Calculado pela IA',
          riskLevel: parsedResult.riskLevel || 'baixo',
          insights: Array.isArray(parsedResult.insights) ? parsedResult.insights : [],
          recommendations: Array.isArray(parsedResult.recommendations) ? parsedResult.recommendations : []
        },
        modelUsed: response.model
      });
    } catch (error: any) {
      console.warn('Diagnóstico de IA G-code indisponível:', error?.message);
      res.status(503).json({
        success: false,
        aiVerified: false,
        error: 'A análise remota de IA não pôde ser concluída neste momento. Consulte a verificação sintática local.',
        modelUsed: NVIDIA_PRIMARY_MODEL
      });
    }
  });

  return app;
}

// Setup Vite dev server or static dist
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  const port = Number(process.env.PORT) || 3000;
  const app = createCncApp();

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        hmr: false
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(
      `[Servidor CNC] Rodando na porta ${port}. IA NVIDIA NIM (${NVIDIA_PRIMARY_MODEL}, Key ID ${NVIDIA_KEY_ID}): ${
        isAiConfigured() ? 'configurada e ativa' : 'ausente'
      }.`
    );
  });
}

if (process.env.NODE_ENV !== 'test' && fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  startServer().catch(err => {
    console.error('Falha ao iniciar o servidor:', err);
  });
}
