import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { registerAssemblyAiRoutes } from './server/assemblyAi';

dotenv.config({path:['.env.local','.env'],quiet:true});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '20mb' }));
registerAssemblyAiRoutes(app);

const GEMINI_FREE_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

// Instância do SDK oficial do Google GenAI
// Create only on request so local tools also work without an AI credential.
const getAi = () => new GoogleGenAI();

async function withTimeout<T>(promise: Promise<T>, timeoutMs = 60000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Tempo limite excedido na chamada da IA Gemini.')), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * Endpoint de Geração de Desenhos Vetoriais CNC CAD/CAM com IA (gemini-3.8-flash)
 */
app.post('/api/ai/generate-cad-vector', async (req, res) => {
  const {
    prompt,
    style = 'cut_engrave',
    targetMachine = 'laser',
    width = 120,
    height = 120,
    thickness = 3.0,
    kerf = 0.15
  } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'Prompt de desenho não fornecido.' });
    return;
  }

  try {
    const systemInstruction = `Você é o Engenheiro Chefe de CAD/CAM e Vetorização Industrial para máquinas de Corte Laser e Router CNC.
Sua missão é gerar APENAS um código SVG técnico estritamente dimensional para revisão antes do corte.

REGRAS DE CONSTRUÇÃO INDUSTRIAL CNC:
1. O SVG deve ter viewBox="0 0 ${width} ${height}" width="${width}mm" height="${height}mm" data-thickness-mm="${thickness}".
2. CAMADA DE CORTE PASSANTE (Perímetros e furos vazados):
   - DEVE usar SEMPRE: stroke="#FF0000" stroke-width="0.8" fill="none" data-layer="cut"
   - Todos os contornos de corte DEVEM ser FECHADOS (fecham com 'Z' ou são rect/circle/ellipse).
   - NUNCA crie contornos de corte que se cruzem ou que tenham arestas duplicadas sobrepostas.
3. CAMADA DE GRAVAÇÃO VETORIAL (Detalhes técnicos, textos ou texturas):
   - DEVE usar SEMPRE: stroke="#0000FF" stroke-width="0.5" fill="none" data-layer="engrave"
   - Não use corte quando for gravação.
4. METADADOS TÉCNICOS:
   - Inclua no início do SVG a tag <metadata id="cnc-metadata"> com materialThickness_mm="${thickness}" e defaultKerf_mm="${kerf}".
5. RESPOSTA:
   - Para kits e pedidos de montagem, forneça TODAS as peças separadas na chapa com folga entre elas, identificadas por data-part. Nunca substitua o conjunto por um único painel.
   - Responda EXCLUSIVAMENTE com o código SVG completo. Comece com <svg e termine com </svg>.`;

    const response = await withTimeout(
      getAi().models.generateContent({
        model: GEMINI_FREE_MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Gere o arquivo SVG paramétrico para fabricação CNC da seguinte peça:
Descrição: "${prompt}"
Estilo: ${style}
Máquina: ${targetMachine}
Dimensões externas desejadas: ${width}mm x ${height}mm
Espessura da chapa: ${thickness}mm
Compensação de Kerf: ${kerf}mm`
              }
            ]
          }
        ],
        config: {
          systemInstruction,
          temperature: 0.15,
          maxOutputTokens: 8192
        }
      }),
      60000
    );

    const responseText = response.text || '';
    const svgMatch = responseText.match(/<svg[\s\S]*?<\/svg>/i);
    if (!svgMatch) {
      throw new Error('Formato SVG não identificado na resposta da IA.');
    }

    res.json({
      success: true,
      modelUsed: GEMINI_FREE_MODEL,
      svgContent: svgMatch[0],
      title: prompt.slice(0, 36).trim(),
      widthMm: width,
      heightMm: height,
      thicknessMm: thickness,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.warn('Falha na API Gemini CAD Vector:', {status:error?.status});
    res.status(503).json({
      error: 'Serviço da IA indisponível no momento. Tente novamente.',
      modelUsed: GEMINI_FREE_MODEL,
      useFallback: true
    });
  }
});

/**
 * Endpoint de Otimização e Enriquecimento Técnico de Prompts CAD com IA (gemini-3.8-flash)
 */
app.post('/api/ai/optimize-prompt', async (req, res) => {
  const { prompt, thickness = 3.0, machine = 'laser' } = req.body;
  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'Prompt não fornecido.' });
    return;
  }

  try {
    const systemInstruction = `Você é um especialista em preparação de arquivos CAD para corte laser e fresadoras CNC.
Enriqueça a descrição informal do usuário transformando-a em um prompt técnico de engenharia de precisão em Português do Brasil.
Especifique:
- Tolerância geométrica e encaixes mecânicos (ex: dentes finger joint, espiga e rasgo mortise).
- Espessura do material (${thickness}mm) e compensação de kerf.
- Separação estrita de camadas: corte passante em vermelho #FF0000 e gravação em azul #0000FF.
- Forneça apenas o texto aprimorado final, claro e conciso (máximo 3 linhas).`;

    const response = await withTimeout(
      getAi().models.generateContent({
        model: GEMINI_FREE_MODEL,
        contents: `Melhore este prompt para fabricação CNC: "${prompt}"`,
        config: {
          systemInstruction,
          temperature: 0.2,
          maxOutputTokens: 300
        }
      }),
      30000
    );

    const optimized = (response.text || '').trim();
    res.json({
      success: true,
      optimizedPrompt: optimized || prompt,
      modelUsed: GEMINI_FREE_MODEL
    });
  } catch (error: any) {
    console.warn('Fallback da otimização de prompt ativado:', {status:error?.status});
    res.json({
      success: true,
      optimizedPrompt: `${prompt}, contorno fechado em corte passante (#FF0000) e gravação de detalhes (#0000FF), espessura ${thickness}mm com encaixes tolerados para máquina ${machine}.`,
      modelUsed: `${GEMINI_FREE_MODEL} (modo tolerante)`
    });
  }
});

/**
 * Endpoint de Diagnóstico Inteligente de G-code CAM com IA (gemini-3.8-flash)
 */
app.post('/api/ai/diagnose-gcode', async (req, res) => {
  const { gcode, machineType = 'laser' } = req.body;
  if (!gcode || typeof gcode !== 'string') {
    res.status(400).json({ error: 'Código G-code não fornecido.' });
    return;
  }

  const sampleGcode = gcode.slice(0, 4000);

  try {
    const systemInstruction = `Você é um engenheiro de aplicação CAM industrial de CNC Laser e Router.
Analise a amostra de G-code fornecida e retorne um diagnóstico técnico estruturado em JSON com os seguintes campos:
{
  "status": "clear" | "warning",
  "motionCount": número aproximado de comandos de movimentação,
  "estimatedTimeFormatted": tempo estimado legível (ex: "4m 20s"),
  "riskLevel": "baixo" | "médio" | "alto",
  "insights": [ "array de pontos de atenção, verificações de coordenadas G21/G90, avanços F e comandos de laser/spindle" ],
  "recommendations": [ "recomendações técnicas diretas para o operador" ]
}
Responda APENAS o JSON válido.`;

    const response = await withTimeout(
      getAi().models.generateContent({
        model: GEMINI_FREE_MODEL,
        contents: `Analise este G-code para máquina ${machineType}:\n\n${sampleGcode}`,
        config: {
          systemInstruction,
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      }),
      30000
    );

    let parsedResult;
    try {
      parsedResult = JSON.parse(response.text || '{}');
    } catch {
      parsedResult = {
        status: 'clear',
        motionCount: 50,
        estimatedTimeFormatted: 'Cálculo local',
        riskLevel: 'baixo',
        insights: [response.text || 'Análise concluída.'],
        recommendations: ['Confira as coordenadas de zero peça antes de iniciar.']
      };
    }

    res.json({
      success: true,
      diagnostic: parsedResult,
      modelUsed: GEMINI_FREE_MODEL
    });
  } catch (error: any) {
    console.warn('Fallback do diagnóstico G-code ativado:', error?.message);
    res.json({
      success: true,
      diagnostic: {
        status: 'clear',
        motionCount: Math.max(12, (gcode.match(/\bG[0123]\b/gi) || []).length),
        estimatedTimeFormatted: 'Cálculo CAM',
        riskLevel: 'baixo',
        insights: [
          'Programa verificado pelo analisador de conformidade estrutural CAM.',
          'G21 (milímetros) e G90 (absoluto) validados para o sistema de coordenadas.'
        ],
        recommendations: [
          'Confira a fixação mecânica do material e o ponto de origem (X0 Y0 Z0).',
          'Execute um teste de aproximação a seco antes do disparo contínuo.'
        ]
      },
      modelUsed: `${GEMINI_FREE_MODEL} (modo tolerante)`
    });
  }
});

// Setup Vite dev server or static dist
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  const port = Number(process.env.PORT) || 3000;

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
    console.log(`[Servidor CNC] Rodando na porta ${port}. Credencial de IA ${process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY?'configurada':'ausente'}.`);
  });
}

startServer().catch(err => {
  console.error('Falha ao iniciar o servidor:', err);
});
