import type { FirestoreProject } from './firebase';

// Modelos de inspiração locais. Não são gravados automaticamente em contas.
export const DEFAULT_PROJECTS_SEED: Omit<FirestoreProject, 'ownerId'>[] = [
  {
    id: 'proj-porta-copos',
    name: 'Porta-copos Geométrico Sagrado',
    widthMm: 100,
    heightMm: 100,
    cutLengthMm: 310,
    engraveAreaCm2: 28,
    materialCategory: 'MDF',
    recommendedThicknessMm: 3.0,
    source: 'ai_prompt',
    svgContent: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100mm" height="100mm" data-thickness-mm="3.0">
  <!-- Camada de Corte Perimetral (Vermelho #FF0000) -->
  <circle cx="50" cy="50" r="47" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" id="corte-perimetro" />
  <!-- Camada de Gravação Geométrica e Textos (Azul #0000FF) -->
  <circle cx="50" cy="50" r="42" fill="none" stroke="#0000FF" stroke-width="0.5" stroke-dasharray="2,2" data-layer="engrave" id="gravacao-borda" />
  <circle cx="50" cy="50" r="28" fill="none" stroke="#0000FF" stroke-width="0.6" data-layer="engrave" />
  <polygon points="50,15 80,68 20,68" fill="none" stroke="#0000FF" stroke-width="0.6" data-layer="engrave" />
  <polygon points="50,85 80,32 20,32" fill="none" stroke="#0000FF" stroke-width="0.6" data-layer="engrave" />
  <circle cx="50" cy="50" r="14" fill="none" stroke="#0000FF" stroke-width="0.6" data-layer="engrave" />
  <text x="50" y="52" font-family="sans-serif" font-size="4.5" text-anchor="middle" fill="#0000FF" font-weight="bold">CNC MINAS JF • 3MM</text>
</svg>`
  },
  {
    id: 'proj-luminaria-e27',
    name: 'Luminária 3D de Encaixe E27',
    widthMm: 220,
    heightMm: 280,
    cutLengthMm: 3680,
    engraveAreaCm2: 12,
    materialCategory: 'MDF',
    recommendedThicknessMm: 3.0,
    source: 'ai_prompt',
    svgContent: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 280" width="360mm" height="280mm" data-thickness-mm="3.0">
  <rect data-layer="guide" width="360" height="280" fill="#f8fafc" />
  <!-- Camada de Corte: Aletas Radiais (Vermelho #FF0000) -->
  <path d="M 20 20 Q 80 80 20 180 L 35 180 Q 95 80 35 20 Z" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" />
  <path d="M 60 20 Q 120 80 60 180 L 75 180 Q 135 80 75 20 Z" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" />
  <path d="M 100 20 Q 160 80 100 180 L 115 180 Q 175 80 115 20 Z" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" />
  <!-- Camada de Corte: Anéis Bocal E27 e Trava (Vermelho #FF0000) -->
  <circle cx="260" cy="70" r="50" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" />
  <circle cx="260" cy="70" r="21" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" />
  <circle cx="260" cy="190" r="60" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" />
  <circle cx="260" cy="190" r="35" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" />
  <!-- Camada de Gravação: Marcações de Encaixe (Azul #0000FF) -->
  <circle cx="260" cy="70" r="32" fill="none" stroke="#0000FF" stroke-width="0.5" stroke-dasharray="2,2" data-layer="engrave" />
  <text x="260" y="74" font-family="sans-serif" font-size="7" fill="#0000FF" text-anchor="middle" font-weight="bold">BOCAL E27</text>
  <text x="260" y="194" font-family="sans-serif" font-size="7" fill="#0000FF" text-anchor="middle" font-weight="bold">TRAVA INFERIOR 3MM</text>
</svg>`
  },
  {
    id: 'proj-caixa-fingerjoint',
    name: 'Caixa de Encaixe Finger-Joint',
    widthMm: 200,
    heightMm: 150,
    cutLengthMm: 2840,
    engraveAreaCm2: 18,
    materialCategory: 'MDF',
    recommendedThicknessMm: 3.0,
    source: 'parametric_box',
    svgContent: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 310" width="420mm" height="310mm" data-thickness-mm="3.0">
  <defs>
    <pattern id="grid_pattern" width="10" height="10" patternUnits="userSpaceOnUse">
      <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#e2e8f0" stroke-width="0.3"/>
    </pattern>
  </defs>
  <rect data-layer="guide" width="420" height="310" fill="url(#grid_pattern)" />
  <!-- PEÇA 1: FUNDO COM ENCAIXES (Corte #FF0000) -->
  <g stroke="#FF0000" stroke-width="0.8" fill="none" data-layer="cut">
    <rect x="10" y="10" width="160" height="120" rx="1" />
    <path d="M 10 30 L 14 30 L 14 50 L 10 50 M 10 70 L 14 70 L 14 90 L 10 90 M 170 30 L 166 30 L 166 50 L 170 50" />
  </g>
  <text x="90" y="70" font-family="sans-serif" font-size="8" fill="#0000FF" text-anchor="middle" font-weight="bold">1. Fundo da Caixa (160x120mm)</text>
  <!-- PEÇA 2: PAREDE FRONTAL (Corte #FF0000) -->
  <g stroke="#FF0000" stroke-width="0.8" fill="none" data-layer="cut">
    <rect x="180" y="10" width="160" height="80" rx="1" />
  </g>
  <text x="260" y="50" font-family="sans-serif" font-size="8" fill="#0000FF" text-anchor="middle" font-weight="bold">2. Parede Frontal (160x80mm)</text>
  <!-- PEÇA 3: PAREDE TRASEIRA (Corte #FF0000) -->
  <g stroke="#FF0000" stroke-width="0.8" fill="none" data-layer="cut">
    <rect x="180" y="100" width="160" height="80" rx="1" />
  </g>
  <text x="260" y="140" font-family="sans-serif" font-size="8" fill="#0000FF" text-anchor="middle" font-weight="bold">3. Parede Traseira (160x80mm)</text>
  <!-- PEÇAS 4 e 5: LATERAIS (Corte #FF0000) -->
  <g stroke="#FF0000" stroke-width="0.8" fill="none" data-layer="cut">
    <rect x="10" y="140" width="120" height="80" rx="1" />
    <rect x="10" y="230" width="120" height="70" rx="1" />
  </g>
  <text x="70" y="180" font-family="sans-serif" font-size="7" fill="#0000FF" text-anchor="middle">4. Lateral Esquerda</text>
  <text x="70" y="265" font-family="sans-serif" font-size="7" fill="#0000FF" text-anchor="middle">5. Lateral Direita</text>
  <!-- PEÇA 6: TAMPA COM PUXADOR OVAL VAZADO (Corte #FF0000) -->
  <g stroke="#FF0000" stroke-width="0.8" fill="none" data-layer="cut">
    <rect x="140" y="190" width="165" height="110" rx="2" />
    <ellipse cx="222" cy="245" rx="18" ry="6" />
  </g>
  <text x="222" y="235" font-family="sans-serif" font-size="7" fill="#0000FF" text-anchor="middle" font-weight="bold">6. Tampa Corrediça</text>
  <!-- GRAVAÇÃO TÉCNICA LASER (Azul #0000FF) -->
  <text x="222" y="270" font-family="sans-serif" font-size="9" fill="#0000FF" font-weight="bold" text-anchor="middle">CNC APP • OFICINA JUIZ DE FORA</text>
</svg>`
  },
  {
    id: 'proj-placa-sinalizacao',
    name: 'Placa de Sinalização Industrial',
    widthMm: 200,
    heightMm: 120,
    cutLengthMm: 680,
    engraveAreaCm2: 48,
    materialCategory: 'Acrílico',
    recommendedThicknessMm: 3.0,
    source: 'ai_prompt',
    svgContent: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120" width="200mm" height="120mm" data-thickness-mm="3.0">
  <rect data-layer="guide" width="200" height="120" fill="#f8fafc" />
  <!-- Camada de Corte: Perímetro Chanfrado e 4 Furos M4 (Vermelho #FF0000) -->
  <path d="M 12 0 L 188 0 L 200 12 L 200 108 L 188 120 L 12 120 L 0 108 L 0 12 Z" fill="none" stroke="#FF0000" stroke-width="1.0" data-layer="cut" id="corte-perimetro" />
  <circle cx="10" cy="10" r="2.5" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" id="furo-m4-1" />
  <circle cx="190" cy="10" r="2.5" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" id="furo-m4-2" />
  <circle cx="10" cy="110" r="2.5" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" id="furo-m4-3" />
  <circle cx="190" cy="110" r="2.5" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" id="furo-m4-4" />
  <!-- Camada de Gravação: Textos Técnicos e Moldura (Azul #0000FF) -->
  <rect x="18" y="14" width="164" height="92" rx="4" fill="none" stroke="#0000FF" stroke-width="0.6" stroke-dasharray="3,1" data-layer="engrave" />
  <polygon points="100,24 116,52 84,52" fill="none" stroke="#0000FF" stroke-width="0.8" data-layer="engrave" />
  <text x="100" y="47" font-family="sans-serif" font-size="9" text-anchor="middle" fill="#0000FF" font-weight="bold">!</text>
  <text x="100" y="70" font-family="sans-serif" font-size="10" font-weight="bold" text-anchor="middle" fill="#0000FF">ÁREA RESTRITA / OPERAÇÃO CNC</text>
  <text x="100" y="85" font-family="sans-serif" font-size="6.5" text-anchor="middle" fill="#0000FF">USO OBRIGATÓRIO DE EPI • CORTE LASER &amp; ROUTER</text>
  <line x1="28" y1="92" x2="172" y2="92" stroke="#0000FF" stroke-width="0.6" data-layer="engrave" />
</svg>`
  },
  {
    id: 'proj-trofeu-lapidado',
    name: 'Troféu Corporativo Lapidado',
    widthMm: 160,
    heightMm: 220,
    cutLengthMm: 1980,
    engraveAreaCm2: 24,
    materialCategory: 'Acrílico',
    recommendedThicknessMm: 3.0,
    source: 'ai_prompt',
    svgContent: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 350 260" width="350mm" height="260mm" data-thickness-mm="3.0">
  <rect data-layer="guide" width="350" height="260" fill="#f8fafc" />
  <polygon points="120,20 180,20 210,80 180,180 120,180 90,80" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" />
  <polygon points="150,55 165,75 135,75" fill="none" stroke="#0000FF" stroke-width="0.5" data-layer="engrave" />
  <polygon points="250,30 280,30 300,50 300,80 280,100 250,100 230,80 230,50" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" />
  <rect x="250" y="60" width="30" height="6" stroke="#FF0000" stroke-width="0.8" fill="none" data-layer="cut" />
  <rect x="230" y="120" width="80" height="30" rx="3" stroke="#FF0000" stroke-width="0.8" fill="none" data-layer="cut" />
  <text x="270" y="138" font-family="sans-serif" font-size="8" fill="#0000FF" text-anchor="middle" font-weight="bold">DESTAQUE INDUSTRIAL 2026</text>
  <text x="150" y="130" font-family="sans-serif" font-size="10" fill="#0000FF" text-anchor="middle" font-weight="bold">ACRÍLICO CRISTAL</text>
</svg>`
  },
  {
    id: 'proj-suporte-notebook',
    name: 'Suporte Articulado para Notebook',
    widthMm: 260,
    heightMm: 200,
    cutLengthMm: 2240,
    engraveAreaCm2: 12,
    materialCategory: 'MDF',
    recommendedThicknessMm: 4.5,
    source: 'ai_prompt',
    svgContent: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 380 250" width="380mm" height="250mm" data-thickness-mm="4.5">
  <rect data-layer="guide" width="380" height="250" fill="#f8fafc" />
  <path d="M 20 220 L 220 220 L 220 190 L 205 190 L 50 40 L 20 50 Z" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" />
  <rect x="90" y="150" width="6" height="40" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" />
  <path d="M 20 220 L 220 220 L 220 190 L 205 190 L 50 40 L 20 50 Z" transform="translate(130, -20)" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" />
  <rect x="20" y="20" width="160" height="45" rx="3" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" />
  <ellipse cx="100" cy="42" rx="35" ry="10" stroke="#0000FF" stroke-width="0.6" fill="none" data-layer="engrave" />
  <text x="100" y="45" font-family="sans-serif" font-size="7" fill="#0000FF" text-anchor="middle">VENTILAÇÃO TÉRMICA</text>
</svg>`
  },
  {
    id: 'proj-suporte-fone',
    name: 'Suporte Ergonômico de Fone & Relógio',
    widthMm: 150,
    heightMm: 240,
    cutLengthMm: 1850,
    engraveAreaCm2: 15,
    materialCategory: 'MDF',
    recommendedThicknessMm: 6.0,
    source: 'ai_prompt',
    svgContent: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 260" width="320mm" height="260mm" data-thickness-mm="6.0">
  <rect data-layer="guide" width="320" height="260" fill="#f8fafc" />
  <ellipse cx="90" cy="70" rx="75" ry="50" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" />
  <rect x="80" y="65" width="20" height="10" stroke="#FF0000" stroke-width="0.8" fill="none" data-layer="cut" />
  <path d="M 200 20 Q 250 120 180 230 L 205 230 Q 280 120 225 20 Z" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" />
  <path d="M 40 180 Q 90 140 140 180 L 130 195 Q 90 160 50 195 Z" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" />
  <text x="90" y="195" font-family="sans-serif" font-size="8" fill="#0000FF" text-anchor="middle" font-weight="bold">BERÇO DA TIARA</text>
</svg>`
  },
  {
    id: 'proj-cobogo-arquitetonico',
    name: 'Cobogó Arquitetônico Floral Vazado',
    widthMm: 300,
    heightMm: 300,
    cutLengthMm: 5200,
    engraveAreaCm2: 0,
    materialCategory: 'MDF',
    recommendedThicknessMm: 6.0,
    source: 'ai_prompt',
    svgContent: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="300mm" height="300mm" data-thickness-mm="6.0">
  <rect data-layer="guide" width="300" height="300" fill="#f8fafc" />
  <rect x="5" y="5" width="290" height="290" rx="4" fill="none" stroke="#FF0000" stroke-width="1.0" data-layer="cut" />
  <g stroke="#FF0000" stroke-width="0.8" fill="none" data-layer="cut">
    <rect x="30" y="30" width="105" height="105" rx="3" />
    <rect x="165" y="30" width="105" height="105" rx="3" />
    <rect x="30" y="165" width="105" height="105" rx="3" />
    <rect x="165" y="165" width="105" height="105" rx="3" />
    <circle cx="150" cy="150" r="35" />
  </g>
  <text x="150" y="154" font-family="sans-serif" font-size="8" fill="#0000FF" text-anchor="middle" font-weight="bold">COBOGÓ MODULAR</text>
</svg>`
  }
];

import { collection, query, where, getDocs, writeBatch, doc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { INITIAL_MATERIALS } from '../../data/initialData';

export async function seedInitialMaterials(userId: string): Promise<{ materialsCount: number }> {
  const result = { materialsCount: 0 };
  const matSnap = await getDocs(query(collection(db, 'materials'), where('ownerId', '==', userId)));
  if (matSnap.empty) {
    const batch = writeBatch(db);
    for (const mat of INITIAL_MATERIALS) {
      const docRef = doc(db, 'materials', mat.id);
      batch.set(docRef, {
        id: mat.id,
        ownerId: userId,
        name: mat.name,
        category: mat.category,
        thickness_mm: mat.thickness_mm,
        sheetWidth_mm: mat.sheetWidth_mm,
        sheetLength_mm: mat.sheetLength_mm,
        unitCost: mat.unitCost,
        shippingCost: mat.shippingCost,
        lossPercentage: mat.lossPercentage,
        density_kg_m3: mat.density_kg_m3,
        speedsByMachine: mat.speedsByMachine,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      result.materialsCount++;
    }
    await batch.commit();
  }
  return result;
}
