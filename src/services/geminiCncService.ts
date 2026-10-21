import { GoogleGenAI } from '@google/genai';

export interface CncMetadataBlock {
  materialThickness_mm: number;
  defaultKerf_mm: number;
  units: 'mm';
  operationLayers: {
    cut: {
      color: '#FF0000';
      operation: 'cut';
      description: string;
    };
    engrave: {
      color: '#0000FF';
      operation: 'engrave';
      description: string;
    };
  };
  modelName: 'gemini-1.5-pro-002';
  timestamp?: string;
}

export interface GeneratedCncVector {
  title: string;
  description: string;
  widthMm: number;
  heightMm: number;
  svgContent: string;
  recommendedMaterial: string;
  recommendedThicknessMm: number;
  materialThickness_mm: number;
  metadata: CncMetadataBlock;
  cutLengthMm: number;
  engraveAreaCm2: number;
  estimatedLaserTimeSec: number;
  layers: {
    name: string;
    type: 'cut' | 'engrave' | 'score';
    color: string;
    cutLengthMm: number;
  }[];
}

function getApiKey(): string | undefined {
  if (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }
  try {
    const metaEnv = (import.meta as unknown as { env?: { VITE_GEMINI_API_KEY?: string } })?.env;
    if (metaEnv?.VITE_GEMINI_API_KEY) {
      return metaEnv.VITE_GEMINI_API_KEY;
    }
  } catch {
    // Ignore meta env errors
  }
  return undefined;
}

/**
 * Creates standard CncMetadataBlock for industrial laser/router operations
 */
export function createStandardMetadataBlock(thicknessMm = 3.0, kerfMm = 0.15): CncMetadataBlock {
  return {
    materialThickness_mm: thicknessMm,
    defaultKerf_mm: kerfMm,
    units: 'mm',
    operationLayers: {
      cut: {
        color: '#FF0000',
        operation: 'cut',
        description: 'Percurso de corte passante completo através do material'
      },
      engrave: {
        color: '#0000FF',
        operation: 'engrave',
        description: 'Gravação superficial vetorial, texturização ou marcação técnica'
      }
    },
    modelName: 'gemini-1.5-pro-002',
    timestamp: new Date().toISOString()
  };
}

/**
 * Injects or ensures the XML <metadata> block and data-thickness-mm attribute exist inside an SVG string
 */
export function ensureSvgMetadataBlock(svgString: string, thicknessMm = 3.0, kerfMm = 0.15): string {
  const metadataXml = `  <metadata id="cnc-metadata">
    <cnc:metadata xmlns:cnc="https://cncminas.com.br/schema/v1">
      <cnc:materialThickness_mm>${thicknessMm.toFixed(1)}</cnc:materialThickness_mm>
      <cnc:defaultKerf_mm>${kerfMm.toFixed(2)}</cnc:defaultKerf_mm>
      <cnc:units>mm</cnc:units>
      <cnc:layers>
        <cnc:layer name="corte" color="#FF0000" operation="cut" stroke-width="0.8" />
        <cnc:layer name="gravacao" color="#0000FF" operation="engrave" stroke-width="0.5" />
      </cnc:layers>
    </cnc:metadata>
  </metadata>`;

  let updated = svgString;

  // Ensure data-thickness-mm attribute is on root <svg>
  if (!updated.includes('data-thickness-mm=')) {
    updated = updated.replace(/<svg\b([^>]*)>/i, `<svg$1 data-thickness-mm="${thicknessMm.toFixed(1)}">`);
  }

  // Ensure <metadata> block exists
  if (!updated.includes('<metadata')) {
    // Insert right after <svg ...>
    updated = updated.replace(/(<svg\b[^>]*>)/i, `$1\n${metadataXml}`);
  }

  return updated;
}

/**
 * Procedural fallback vector generators that produce 100% valid, closed, production-ready SVGs
 * with semantic layer separation: Cut #FF0000 (red) and Engrave #0000FF (blue), plus thickness metadata
 */
function generateProceduralVector(prompt: string, style: 'cut_engrave' | 'cut_only' | 'relief_3d'): GeneratedCncVector {
  const p = prompt.toLowerCase();
  
  if (p.includes('porta-copo') || p.includes('coaster') || p.includes('porta copo')) {
    const w = 100;
    const h = 100;
    const r = 46;
    const cx = 50;
    const cy = 50;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}mm" height="${h}mm" data-thickness-mm="3.0">
  <metadata id="cnc-metadata">
    <cnc:metadata xmlns:cnc="https://cncminas.com.br/schema/v1">
      <cnc:materialThickness_mm>3.0</cnc:materialThickness_mm>
      <cnc:defaultKerf_mm>0.15</cnc:defaultKerf_mm>
      <cnc:units>mm</cnc:units>
      <cnc:layers>
        <cnc:layer name="corte" color="#FF0000" operation="cut" />
        <cnc:layer name="gravacao" color="#0000FF" operation="engrave" />
      </cnc:layers>
    </cnc:metadata>
  </metadata>
  <!-- Camada de Corte Perimetral (Vermelho #FF0000) -->
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" id="corte-perimetro" />
  <!-- Camada de Gravação Geométrica (Azul #0000FF) -->
  <circle cx="${cx}" cy="${cy}" r="${r - 5}" fill="none" stroke="#0000FF" stroke-width="0.5" stroke-dasharray="2,2" data-layer="engrave" id="gravacao-borda" />
  <circle cx="${cx}" cy="${cy}" r="18" fill="none" stroke="#0000FF" stroke-width="0.6" data-layer="engrave" />
  <polygon points="50,15 78,65 22,65" fill="none" stroke="#0000FF" stroke-width="0.6" data-layer="engrave" />
  <polygon points="50,85 78,35 22,35" fill="none" stroke="#0000FF" stroke-width="0.6" data-layer="engrave" />
  <text x="50" y="53" font-family="sans-serif" font-size="5" text-anchor="middle" fill="#0000FF" font-weight="bold">CNC PRECISION</text>
</svg>`;

    return {
      title: 'Porta-copos Geométrico Sagrado 100mm',
      description: 'Porta-copos com corte perimetral fechado (#FF0000) e gravação de geometria sagrada hexagonal (#0000FF).',
      widthMm: w,
      heightMm: h,
      svgContent: svg,
      recommendedMaterial: 'MDF Cru ou Acrílico 3mm',
      recommendedThicknessMm: 3.0,
      materialThickness_mm: 3.0,
      metadata: createStandardMetadataBlock(3.0, 0.15),
      cutLengthMm: 290,
      engraveAreaCm2: 28,
      estimatedLaserTimeSec: 22,
      layers: [
        { name: 'Corte Perímetro (#FF0000)', type: 'cut', color: '#FF0000', cutLengthMm: 290 },
        { name: 'Gravação Geometria Sagrada (#0000FF)', type: 'engrave', color: '#0000FF', cutLengthMm: 90 }
      ]
    };
  }

  if (p.includes('caixa') || p.includes('box') || p.includes('organizador') || p.includes('encaixe')) {
    const w = 150;
    const h = 100;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}mm" height="${h}mm" data-thickness-mm="3.0">
  <metadata id="cnc-metadata">
    <cnc:metadata xmlns:cnc="https://cncminas.com.br/schema/v1">
      <cnc:materialThickness_mm>3.0</cnc:materialThickness_mm>
      <cnc:defaultKerf_mm>0.15</cnc:defaultKerf_mm>
      <cnc:units>mm</cnc:units>
      <cnc:layers>
        <cnc:layer name="corte" color="#FF0000" operation="cut" />
        <cnc:layer name="gravacao" color="#0000FF" operation="engrave" />
      </cnc:layers>
    </cnc:metadata>
  </metadata>
  <!-- Camada de Corte Externo (Vermelho #FF0000) -->
  <rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="4" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" id="corte-chapa" />
  <circle cx="25" cy="${h / 2}" r="6" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" id="corte-furo-esq" />
  <circle cx="${w - 25}" cy="${h / 2}" r="6" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" id="corte-furo-dir" />
  <!-- Camada de Gravação Técnica (Azul #0000FF) -->
  <rect x="15" y="15" width="${w - 30}" height="${h - 30}" rx="2" fill="none" stroke="#0000FF" stroke-width="0.5" stroke-dasharray="2,2" data-layer="engrave" id="gravacao-moldura" />
  <text x="${w / 2}" y="${h / 2 + 3}" font-family="sans-serif" font-size="9" text-anchor="middle" fill="#0000FF" font-weight="bold">CNC MINAS JF • ENCAIXE 3.0MM</text>
</svg>`;

    return {
      title: 'Caixa de Encaixe com Furos e Gravação',
      description: 'Chapa paramétrica de caixa de encaixe com furos de montagem em #FF0000 e gravação central em #0000FF.',
      widthMm: w,
      heightMm: h,
      svgContent: svg,
      recommendedMaterial: 'MDF Cru 3mm',
      recommendedThicknessMm: 3.0,
      materialThickness_mm: 3.0,
      metadata: createStandardMetadataBlock(3.0, 0.15),
      cutLengthMm: 520,
      engraveAreaCm2: 42,
      estimatedLaserTimeSec: 28,
      layers: [
        { name: 'Corte Externo e Furos (#FF0000)', type: 'cut', color: '#FF0000', cutLengthMm: 520 },
        { name: 'Gravação Logotipo e Moldura (#0000FF)', type: 'engrave', color: '#0000FF', cutLengthMm: 60 }
      ]
    };
  }

  if (p.includes('mandala') || p.includes('luminaria') || p.includes('redondo') || p.includes('floral')) {
    const size = 180;
    const r = size / 2 - 5;
    const cx = size / 2;
    const cy = size / 2;
    
    // Generate intricate geometric petals
    let innerPaths = '';
    const numPetals = 12;
    for (let i = 0; i < numPetals; i++) {
      const angle = (i * 2 * Math.PI) / numPetals;
      const x1 = cx + (r * 0.45) * Math.cos(angle);
      const y1 = cy + (r * 0.45) * Math.sin(angle);
      const x2 = cx + (r * 0.82) * Math.cos(angle + Math.PI / numPetals);
      const y2 = cy + (r * 0.82) * Math.sin(angle + Math.PI / numPetals);
      innerPaths += `<path d="M ${cx} ${cy} Q ${x1} ${y1} ${x2} ${y2} Q ${cx + (r * 0.45) * Math.cos(angle + (2 * Math.PI) / numPetals)} ${cy + (r * 0.45) * Math.sin(angle + (2 * Math.PI) / numPetals)} ${cx} ${cy}" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut"/>\n`;
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}mm" height="${size}mm" data-thickness-mm="3.0">
  <metadata id="cnc-metadata">
    <cnc:metadata xmlns:cnc="https://cncminas.com.br/schema/v1">
      <cnc:materialThickness_mm>3.0</cnc:materialThickness_mm>
      <cnc:defaultKerf_mm>0.15</cnc:defaultKerf_mm>
      <cnc:units>mm</cnc:units>
      <cnc:layers>
        <cnc:layer name="corte" color="#FF0000" operation="cut" />
        <cnc:layer name="gravacao" color="#0000FF" operation="engrave" />
      </cnc:layers>
    </cnc:metadata>
  </metadata>
  <!-- Camada de Corte Perimetral (Vermelho #FF0000) -->
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#FF0000" stroke-width="1.0" data-layer="cut"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 0.25}" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut"/>
  ${innerPaths}
  <!-- Camada de Gravação Decorativa (Azul #0000FF) -->
  <circle cx="${cx}" cy="${cy}" r="${r * 0.9}" fill="none" stroke="#0000FF" stroke-width="0.5" stroke-dasharray="1,2" data-layer="engrave"/>
  <text x="${cx}" y="${cy + 2}" font-family="sans-serif" font-size="6" text-anchor="middle" fill="#0000FF">LUMINÁRIA / MANDALA 3D</text>
</svg>`;

    return {
      title: 'Luminária 3D / Mandala Geométrica 180mm',
      description: 'Design radial simétrico com pétalas vazadas para corte (#FF0000) e anéis de gravação (#0000FF).',
      widthMm: size,
      heightMm: size,
      svgContent: svg,
      recommendedMaterial: 'MDF Cru ou Acrílico Cast',
      recommendedThicknessMm: 3.0,
      materialThickness_mm: 3.0,
      metadata: createStandardMetadataBlock(3.0, 0.15),
      cutLengthMm: 1480,
      engraveAreaCm2: 65,
      estimatedLaserTimeSec: 68,
      layers: [
        { name: 'Corte de Pétalas e Contorno (#FF0000)', type: 'cut', color: '#FF0000', cutLengthMm: 1480 },
        { name: 'Gravação Decorativa (#0000FF)', type: 'engrave', color: '#0000FF', cutLengthMm: 120 }
      ]
    };
  }

  // Default: Placa de Sinalização Industrial
  const w = 200;
  const h = 120;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}mm" height="${h}mm" data-thickness-mm="3.0">
  <metadata id="cnc-metadata">
    <cnc:metadata xmlns:cnc="https://cncminas.com.br/schema/v1">
      <cnc:materialThickness_mm>3.0</cnc:materialThickness_mm>
      <cnc:defaultKerf_mm>0.15</cnc:defaultKerf_mm>
      <cnc:units>mm</cnc:units>
      <cnc:layers>
        <cnc:layer name="corte" color="#FF0000" operation="cut" />
        <cnc:layer name="gravacao" color="#0000FF" operation="engrave" />
      </cnc:layers>
    </cnc:metadata>
  </metadata>
  <!-- Camada de Corte: Perímetro Chanfrado e 4 Furos M4 (Vermelho #FF0000) -->
  <path d="M 12 0 L ${w - 12} 0 L ${w} 12 L ${w} ${h - 12} L ${w - 12} ${h} L 12 ${h} L 0 ${h - 12} L 0 12 Z" fill="none" stroke="#FF0000" stroke-width="1.0" data-layer="cut" id="corte-perimetro" />
  <circle cx="10" cy="10" r="2.5" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" id="corte-furo-1"/>
  <circle cx="${w - 10}" cy="10" r="2.5" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" id="corte-furo-2"/>
  <circle cx="10" cy="${h - 10}" r="2.5" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" id="corte-furo-3"/>
  <circle cx="${w - 10}" cy="${h - 10}" r="2.5" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" id="corte-furo-4"/>
  <!-- Camada de Gravação: Textos Técnicos e Moldura (Azul #0000FF) -->
  <rect x="20" y="16" width="${w - 40}" height="${h - 32}" rx="4" fill="none" stroke="#0000FF" stroke-width="0.6" stroke-dasharray="3,1" data-layer="engrave" id="gravacao-moldura" />
  <text x="${w / 2}" y="48" font-family="sans-serif" font-size="13" font-weight="bold" text-anchor="middle" fill="#0000FF">${prompt.slice(0, 24).toUpperCase() || 'SINALIZAÇÃO INDUSTRIAL'}</text>
  <text x="${w / 2}" y="70" font-family="sans-serif" font-size="8" text-anchor="middle" fill="#0000FF">ÁREA OPERACIONAL • CNC LASER & ROUTER</text>
  <line x1="30" y1="80" x2="${w - 30}" y2="80" stroke="#0000FF" stroke-width="0.8" data-layer="engrave" />
</svg>`;

  return {
    title: prompt ? `Projeto: ${prompt.slice(0, 32)}` : 'Placa de Sinalização Industrial',
    description: 'Vetor industrial com camadas semânticas: corte perimétrico e furos em #FF0000 e textos/moldura em #0000FF com bloco de metadados de 3.0mm.',
    widthMm: w,
    heightMm: h,
    svgContent: svg,
    recommendedMaterial: 'Acrílico Cristal 3mm ou MDF 3mm/6mm',
    recommendedThicknessMm: 3.0,
    materialThickness_mm: 3.0,
    metadata: createStandardMetadataBlock(3.0, 0.15),
    cutLengthMm: 680,
    engraveAreaCm2: 48,
    estimatedLaserTimeSec: 36,
    layers: [
      { name: 'Corte Perímetro e Furos (#FF0000)', type: 'cut', color: '#FF0000', cutLengthMm: 680 },
      { name: 'Gravação Textos e Moldura (#0000FF)', type: 'engrave', color: '#0000FF', cutLengthMm: 110 }
    ]
  };
}

/**
 * Generate vector using Gemini API model 'gemini-1.5-pro-002' or rich deterministic fallback
 * Forces semantic layers: red (#FF0000) for cut, blue (#0000FF) for engrave, and default material thickness metadata
 */
export async function generateCncVector(
  prompt: string,
  style: 'cut_engrave' | 'cut_only' | 'relief_3d' = 'cut_engrave',
  targetMachine: 'laser' | 'router' = 'laser'
): Promise<GeneratedCncVector> {
  const apiKey = getApiKey();

  if (!apiKey) {
    // Return high fidelity geometric procedural vector
    return generateProceduralVector(prompt, style);
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const systemInstruction = `Você é um engenheiro sênior especialista em CAD/CAM para corte a Laser CO2 e CNC Router industrial.
O usuário fornecerá uma descrição em Português do Brasil para um vetor/projeto CNC.
Você deve responder ESTRITAMENTE em formato JSON (sem blocos markdown soltos fora do json) com a seguinte estrutura completa:
{
  "title": "Nome do Projeto em Português",
  "description": "Explicação técnica detalhada do design industrial",
  "widthMm": 150,
  "heightMm": 100,
  "recommendedMaterial": "MDF Cru 3mm ou Acrílico Cast",
  "recommendedThicknessMm": 3.0,
  "materialThickness_mm": 3.0,
  "metadata": {
    "materialThickness_mm": 3.0,
    "defaultKerf_mm": 0.15,
    "units": "mm",
    "operationLayers": {
      "cut": { "color": "#FF0000", "operation": "cut", "description": "Contorno de corte passante" },
      "engrave": { "color": "#0000FF", "operation": "engrave", "description": "Gravação ou marcação técnica" }
    },
    "modelName": "gemini-1.5-pro-002"
  },
  "cutLengthMm": 450,
  "engraveAreaCm2": 25,
  "estimatedLaserTimeSec": 26,
  "svgContent": "<svg xmlns=\\"http://www.w3.org/2000/svg\\" viewBox=\\"0 0 150 100\\" width=\\"150mm\\" height=\\"100mm\\" data-thickness-mm=\\"3.0\\"><metadata id=\\"cnc-metadata\\"><cnc:metadata xmlns:cnc=\\"https://cncminas.com.br/schema/v1\\"><cnc:materialThickness_mm>3.0</cnc:materialThickness_mm><cnc:defaultKerf_mm>0.15</cnc:defaultKerf_mm><cnc:units>mm</cnc:units><cnc:layers><cnc:layer name=\\"corte\\" color=\\"#FF0000\\" operation=\\"cut\\"/><cnc:layer name=\\"gravacao\\" color=\\"#0000FF\\" operation=\\"engrave\\"/></cnc:layers></cnc:metadata></metadata><!-- Camadas de corte e gravacao --></svg>",
  "layers": [
    {"name": "Corte Perimetral (#FF0000)", "type": "cut", "color": "#FF0000", "cutLengthMm": 450},
    {"name": "Gravação Vetorial (#0000FF)", "type": "engrave", "color": "#0000FF", "cutLengthMm": 30}
  ]
}

REGRAS TÉCNICAS MANDATÓRIAS:
1. SEPARAÇÃO SEMÂNTICA RIGOROSA DE CAMADAS:
   - CAMADA DE CORTE: TODAS as linhas e contornos vazados que devem ser cortados passantes através do material DEVEM usar estritamente stroke="#FF0000" (vermelho puro #FF0000), fill="none", stroke-width entre 0.4 e 0.8, e atributo data-layer="cut" ou id="corte-...".
   - CAMADA DE GRAVAÇÃO: TODOS os elementos decorativos, marcações, hachuras, logos ou textos que devem ser apenas gravados superficialmente DEVEM usar estritamente stroke="#0000FF" (azul puro #0000FF) ou fill="#0000FF", stroke-width entre 0.3 e 0.6, e atributo data-layer="engrave" ou id="gravacao-...".
2. BLOCO DE METADADOS DE ESPESSURA DE MATERIAL:
   - Forneça por padrão "materialThickness_mm": 3.0 e "recommendedThicknessMm": 3.0.
   - Forneça o objeto "metadata" com "materialThickness_mm": 3.0, "defaultKerf_mm": 0.15, "units": "mm" e camadas de operação.
   - No SVG gerado, inclua a tag <metadata id="cnc-metadata"> definindo a espessura de 3.0mm e inclua o atributo data-thickness-mm="3.0" na tag raiz <svg>.
3. ESCALA E DIMENSÕES REAIS EM MILÍMETROS:
   - O SVG DEVE possuir viewBox="0 0 W H" width="Wmm" height="Hmm".
4. GEOMETRIA DE QUALIDADE CNC INDUSTRIAL:
   - O SVG gerado DEVE ser limpo, válido e perfeitamente fechado para corte CNC sem auto-interseções.
5. MÁQUINA ALVO: ${targetMachine === 'router' ? 'CNC Router (compensação de fresa e percursos mecânicos)' : 'Laser CO2 (foco óptico kerf 0.15mm)'}.
6. ESTILO SOLICITADO: ${style}.`;

    const response = await ai.models.generateContent({
      model: 'gemini-1.5-pro-002',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Gere um vetor completo para CNC industrial baseado neste prompt: "${prompt}". Priorize camadas semanticamente separadas (corte passante estritamente em vermelho #FF0000, gravação em azul #0000FF) e metadados de espessura de material (padrão 3.0mm) tanto no objeto JSON quanto no bloco <metadata> do SVG. Estilo: ${style}. Máquina: ${targetMachine}.`
            }
          ]
        }
      ],
      config: {
        systemInstruction,
        responseMimeType: 'application/json'
      }
    });

    const text = response.text?.trim() || '';
    if (text) {
      const parsed = JSON.parse(text);
      if (parsed.svgContent && parsed.widthMm && parsed.heightMm) {
        const thickness = parsed.materialThickness_mm || parsed.recommendedThicknessMm || 3.0;
        parsed.materialThickness_mm = thickness;
        parsed.recommendedThicknessMm = thickness;

        // Ensure metadata block is present on object
        if (!parsed.metadata) {
          parsed.metadata = createStandardMetadataBlock(thickness, 0.15);
        } else {
          parsed.metadata.materialThickness_mm = thickness;
          parsed.metadata.modelName = 'gemini-1.5-pro-002';
        }

        // Ensure SVG markup contains <metadata> block and data-thickness-mm attribute
        parsed.svgContent = ensureSvgMetadataBlock(parsed.svgContent, thickness, 0.15);

        return parsed as GeneratedCncVector;
      }
    }
  } catch (error) {
    console.warn('Falha na chamada Gemini API (usando motor geométrico determinístico):', error);
  }

  return generateProceduralVector(prompt, style);
}

/**
 * Enhance user prompt with industrial CNC CAD/CAM details using gemini-1.5-pro-002
 */
export async function optimizeCncPrompt(userPrompt: string): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return `${userPrompt.trim()}, vetor 2D 1:1 em milímetros, espessura recomendada 3.0mm, camadas semanticamente separadas: contorno de corte fechado em vermelho #FF0000 (data-layer="cut") e detalhes gravados em azul #0000FF (data-layer="engrave"), tolerância de kerf 0.15mm, bloco de metadados embutido.`;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-pro-002',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Otimize o seguinte prompt de usuário para gerar um vetor CAD/CAM CNC de alta precisão (em Português do Brasil). Seja direto, adicione especificações de escala em mm, espessura padrão de material 3.0mm, camadas de corte em vermelho #FF0000, gravação em azul #0000FF, tolerâncias de kerf 0.15mm e simetria mecânica:\n"${userPrompt}"`
            }
          ]
        }
      ]
    });
    const enhanced = response.text?.trim();
    if (enhanced) return enhanced;
  } catch (e) {
    console.warn('Erro ao otimizar prompt com Gemini 1.5 Pro (gemini-1.5-pro-002):', e);
  }

  return `${userPrompt.trim()}, vetor 2D 1:1 em milímetros, espessura padrão de material 3.0mm, camada de corte fechado em #FF0000 e gravação em #0000FF, tolerância kerf 0.15mm.`;
}
