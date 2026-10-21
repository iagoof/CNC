import React, { useState, useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Material, Machine, ProductionOrder } from '../../types';
import {
  LaserMaterialFinish,
  createLaserMaterials,
  buildFingerJointBox,
  buildTrophyModel,
  buildLaptopStand,
  buildLayeredMandala,
  buildIcosahedronLamp,
  buildHeadphoneStand,
  build3DFromSvg
} from './LaserModel3D';
import {
  generateCncVector,
  optimizeCncPrompt,
  CncMetadataBlock,
  createStandardMetadataBlock,
  ensureSvgMetadataBlock
} from '../../services/geminiCncService';
import {
  calculateSvgMetrics,
  convertSvgToDxf,
  exportSceneGroupToStl,
  generateGcodeFromSvg
} from '../../utils/cncExporters';
import { useFirebase } from '../../services/firebase/FirebaseContext';
import { FirestoreProject } from '../../services/firebase/firebase';
import {
  Sparkles,
  UploadCloud,
  Cpu,
  Layers,
  Scissors,
  FileText,
  Clock,
  Download,
  Box,
  CheckCircle2,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Sliders,
  ChevronRight,
  Send,
  Zap,
  Bookmark,
  Maximize2,
  SlidersHorizontal,
  RefreshCw,
  Wand2,
  ExternalLink,
  Copy,
  Lightbulb,
  Cloud,
  Trash2,
  FolderOpen,
  LogIn
} from 'lucide-react';

interface DesignStudioAiViewProps {
  materials: Material[];
  machines: Machine[];
  onSendTo3D?: (modelType: string) => void;
  onSendToNesting?: (part: { name: string; width: number; height: number; cutLength_mm: number }) => void;
  onSendToCam?: (gcode: string, machineType: 'laser' | 'router') => void;
  onSendToQuote?: (item: {
    description: string;
    materialId: string;
    cutLength_mm: number;
    engraveArea_cm2: number;
    machineId: string;
    quantity: number;
    unitPriceEstimated?: number;
  }) => void;
  onSendToProduction?: (order: Partial<ProductionOrder>) => void;
}

export interface GeneratedVectorArtifact {
  id: string;
  title: string;
  description: string;
  width_mm: number;
  height_mm: number;
  thickness_mm: number;
  cutLength_mm: number;
  engraveArea_cm2: number;
  materialName: string;
  model3dType: 'caixa-fingerjoint' | 'trofeu-acrilico' | 'suporte-notebook' | 'mandala-camadas' | 'luminaria-geometrica' | 'suporte-fone' | 'padrao';
  partsCount: number;
  svgString: string;
  gcode: string;
  estimatedLaserSeconds: number;
  aiPromptUsed: string;
  metadata?: CncMetadataBlock;
}

export const DesignStudioAiView: React.FC<DesignStudioAiViewProps> = ({
  materials,
  machines,
  onSendTo3D,
  onSendToNesting,
  onSendToCam,
  onSendToQuote,
  onSendToProduction
}) => {
  const { user, isAuthenticated, projects, syncProjectMutation, deleteProjectMutation, login } = useFirebase();

  // Input State
  const [inputMode, setInputMode] = useState<'prompt' | 'upload' | 'cloud'>('prompt');
  const [activeModel, setActiveModel] = useState<string>('gemini-1.5-pro-002');
  const [promptText, setPromptText] = useState<string>(
    'Porta-copos hexagonal de 100x100mm com cantos arredondados R5, corte externo passante fechado em vermelho puro #FF0000, gravação de geometria sagrada com padrão flor da vida e anel de drenagem perimétrico em azul puro #0000FF, espessura recomendada de 3.0mm em MDF ou acrílico.'
  );
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingStep, setProcessingStep] = useState<string>('');

  // Engineering Controls
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>(materials[0]?.id || '');
  const [targetWidth, setTargetWidth] = useState<number>(100);
  const [targetHeight, setTargetHeight] = useState<number>(100);
  const [kerfCompensation, setKerfCompensation] = useState<number>(0.15);
  const [includeEngraving, setIncludeEngraving] = useState<boolean>(true);
  const [selectedFinish, setSelectedFinish] = useState<LaserMaterialFinish>('mdf-cru');

  // 3D & Vector Canvas Controls
  const [activeViewMode, setActiveViewMode] = useState<'vector' | '3d'>('3d');
  const [explodeSlider, setExplodeSlider] = useState<number>(0);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [showKerfLines, setShowKerfLines] = useState<boolean>(true);
  const [actionSuccessToast, setActionSuccessToast] = useState<string | null>(null);

  const selectedMaterial = materials.find(m => m.id === selectedMaterialId) || materials[0];
  const selectedMachine = machines[0] || { id: 'mach-1', name: 'CNC Laser CO2 100W' };

  // ========================================================
  // READY-TO-CUT INDUSTRIAL EXAMPLES & INSPIRATION GALLERY
  // Strict Semantic Layers: Cut = #FF0000, Engrave = #0000FF
  // Material Thickness Metadata Standard: 3.0mm
  // ========================================================
  const READY_EXAMPLES: GeneratedVectorArtifact[] = useMemo(() => {
    const rawExamples: GeneratedVectorArtifact[] = [
    {
      id: 'ex-1',
      title: 'Porta-copos Geométrico Sagrado',
      description: 'Porta-copos hexagonal de 100mm com geometria sagrada, anel de drenagem perimétrico, corte perimetral em #FF0000 e gravação em #0000FF.',
      width_mm: 100,
      height_mm: 100,
      thickness_mm: 3.0,
      cutLength_mm: 310,
      engraveArea_cm2: 28,
      materialName: 'MDF Cru 3,0 mm',
      model3dType: 'mandala-camadas',
      partsCount: 1,
      aiPromptUsed: 'Porta-copos hexagonal de 100x100mm com cantos arredondados R5, corte externo passante fechado em vermelho puro #FF0000, gravação de geometria sagrada com padrão flor da vida e anel de drenagem perimétrico em azul puro #0000FF, espessura recomendada de 3.0mm em MDF ou acrílico.',
      svgString: `<?xml version="1.0" encoding="UTF-8"?>
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
</svg>`,
      gcode: `; CNC APP GCODE - PORTA-COPOS GEOMETRICO\nG21\nG90\nM03 S65\nG00 Z5.0000\nG00 X50 Y3\nG01 Z-3.0000 F450\nG02 X50 Y97 R47 F1600\nG02 X50 Y3 R47 F1600\nG00 Z5.0000\nM05\nM30`,
      estimatedLaserSeconds: 24
    },
    {
      id: 'ex-2',
      title: 'Luminária 3D de Encaixe E27',
      description: 'Luminária pendente moderna com 12 aletas radiais curvas de encaixe e 2 anéis estruturais para soquete E27, fendas para MDF 3mm.',
      width_mm: 220,
      height_mm: 280,
      thickness_mm: 3.0,
      cutLength_mm: 3680,
      engraveArea_cm2: 12,
      materialName: 'MDF Cru 3,0 mm',
      model3dType: 'luminaria-geometrica',
      partsCount: 14,
      aiPromptUsed: 'Luminária pendente 3D com 12 aletas radiais curvas de encaixe rápido e 2 anéis de travamento com suporte para soquete E27, fendas calculadas com kerf de 0.15mm para chapas de 3.0mm, percursos de corte fechados em vermelho puro #FF0000 e marcações decorativas em azul puro #0000FF.',
      svgString: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 280" width="360mm" height="280mm" data-thickness-mm="3.0">
  <rect width="360" height="280" fill="#f8fafc" />
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
</svg>`,
      gcode: `; CNC APP GCODE - LUMINARIA E27\nG21\nG90\nM03 S65\nG00 Z5.0000\nG00 X20 Y20\nG01 Z-3.0000 F450\nM05\nM30`,
      estimatedLaserSeconds: 152
    },
    {
      id: 'ex-3',
      title: 'Caixa de Encaixe Finger-Joint',
      description: 'Caixa organizadora paramétrica com 7 peças em 3D: base denteada, 4 paredes perimetrais, tampa corrediça com puxador e divisória.',
      width_mm: 200,
      height_mm: 150,
      thickness_mm: 3.0,
      cutLength_mm: 2840,
      engraveArea_cm2: 18,
      materialName: 'MDF Cru 3,0 mm',
      model3dType: 'caixa-fingerjoint',
      partsCount: 7,
      aiPromptUsed: 'Caixa organizadora paramétrica de encaixe tipo finger-joint com 6 peças em chapa de 3.0mm, dentes alternados de 15mm com compensação kerf de 0.15mm, tampa com canal deslizante e puxador ergonômico vazado, contornos de corte em vermelho puro #FF0000 e gravação técnica de identificação em azul puro #0000FF.',
      svgString: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 310" width="420mm" height="310mm" data-thickness-mm="3.0">
  <defs>
    <pattern id="grid_pattern" width="10" height="10" patternUnits="userSpaceOnUse">
      <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#e2e8f0" stroke-width="0.3"/>
    </pattern>
  </defs>
  <rect width="420" height="310" fill="url(#grid_pattern)" />
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
</svg>`,
      gcode: `; CNC APP GCODE - CAIXA FINGER-JOINT\nG21\nG90\nM03 S65\nG00 Z5.0000\nG00 X10 Y10\nG01 Z-3.0000 F450\nG01 X170 Y10 F1500\nG01 X170 Y130 F1500\nG01 X10 Y130 F1500\nG01 X10 Y10 F1500\nG00 Z5.0000\nM05\nM30`,
      estimatedLaserSeconds: 114
    },
    {
      id: 'ex-4',
      title: 'Placa de Sinalização Industrial',
      description: 'Placa de segurança industrial com cantos chanfrados, 4 furos M4 perimetrais em #FF0000 e textos/moldura técnica em #0000FF.',
      width_mm: 200,
      height_mm: 120,
      thickness_mm: 3.0,
      cutLength_mm: 680,
      engraveArea_cm2: 48,
      materialName: 'Acrílico Cristal 3,0 mm',
      model3dType: 'trofeu-acrilico',
      partsCount: 1,
      aiPromptUsed: 'Placa de sinalização industrial técnica 200x120mm com cantos chanfrados C10 e 4 furos de fixação M4 nos cantos com corte passante em vermelho puro #FF0000, moldura técnica com hachuras e texto "ÁREA RESTRITA / OPERAÇÃO CNC" gravados em azul puro #0000FF, espessura recomendada 3.0mm em acrílico ou MDF.',
      svgString: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120" width="200mm" height="120mm" data-thickness-mm="3.0">
  <rect width="200" height="120" fill="#f8fafc" />
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
  <text x="100" y="85" font-family="sans-serif" font-size="6.5" text-anchor="middle" fill="#0000FF">USO OBRIGATÓRIO DE EPI • CORTE LASER & ROUTER</text>
  <line x1="28" y1="92" x2="172" y2="92" stroke="#0000FF" stroke-width="0.6" data-layer="engrave" />
</svg>`,
      gcode: `; CNC APP GCODE - PLACA SINALIZACAO\nG21\nG90\nM03 S65\nG00 Z5.0000\nG00 X12 Y0\nG01 Z-3.0000 F450\nG01 X188 Y0 F1600\nM05\nM30`,
      estimatedLaserSeconds: 36
    },
    {
      id: 'ex-5',
      title: 'Troféu Corporativo Lapidado',
      description: 'Troféu piramidal em acrílico cristal com base octogonal maciça em MDF 6mm e ranhura de encaixe com kerf preciso.',
      width_mm: 160,
      height_mm: 220,
      thickness_mm: 3.0,
      cutLength_mm: 1980,
      engraveArea_cm2: 24,
      materialName: 'Acrílico Cristal 3,0 mm',
      model3dType: 'trofeu-acrilico',
      partsCount: 5,
      aiPromptUsed: 'Troféu corporativo lapidado em acrílico 3mm com base octogonal em MDF, encaixe tipo slot, corte perimetral em vermelho puro #FF0000 e gravação em azul #0000FF.',
      svgString: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 350 260" width="350mm" height="260mm" data-thickness-mm="3.0">
  <rect width="350" height="260" fill="#f8fafc" />
  <polygon points="120,20 180,20 210,80 180,180 120,180 90,80" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" />
  <polygon points="150,55 165,75 135,75" fill="none" stroke="#0000FF" stroke-width="0.5" data-layer="engrave" />
  <polygon points="250,30 280,30 300,50 300,80 280,100 250,100 230,80 230,50" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" />
  <rect x="250" y="60" width="30" height="6" stroke="#FF0000" stroke-width="0.8" fill="none" data-layer="cut" />
  <rect x="230" y="120" width="80" height="30" rx="3" stroke="#FF0000" stroke-width="0.8" fill="none" data-layer="cut" />
  <text x="270" y="138" font-family="sans-serif" font-size="8" fill="#0000FF" text-anchor="middle" font-weight="bold">DESTAQUE INDUSTRIAL 2026</text>
  <text x="150" y="130" font-family="sans-serif" font-size="10" fill="#0000FF" text-anchor="middle" font-weight="bold">ACRÍLICO CRISTAL</text>
</svg>`,
      gcode: `; CNC APP GCODE - TROFEU\nG21\nG90\nM03 S65\nG00 Z5.0000\nG00 X120 Y20\nG01 Z-3.0000 F450\nG01 X180 Y20 F1600\nM05\nM30`,
      estimatedLaserSeconds: 88
    },
    {
      id: 'ex-6',
      title: 'Suporte Articulado para Notebook',
      description: 'Suporte ergonômico de 3 peças em MDF 4.5mm com inclinação a 25 graus, travas frontais e travessa estrutural com ranhuras de ventilação.',
      width_mm: 260,
      height_mm: 200,
      thickness_mm: 4.5,
      cutLength_mm: 2240,
      engraveArea_cm2: 12,
      materialName: 'Compensado Naval 4,5 mm',
      model3dType: 'suporte-notebook',
      partsCount: 3,
      aiPromptUsed: 'Suporte ergonômico dobrável para notebook em 3 peças com encaixe tipo slot, corte fechado em #FF0000 e ventilação térmica em #0000FF.',
      svgString: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 380 250" width="380mm" height="250mm" data-thickness-mm="4.5">
  <rect width="380" height="250" fill="#f8fafc" />
  <path d="M 20 220 L 220 220 L 220 190 L 205 190 L 50 40 L 20 50 Z" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" />
  <rect x="90" y="150" width="6" height="40" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" />
  <path d="M 20 220 L 220 220 L 220 190 L 205 190 L 50 40 L 20 50 Z" transform="translate(130, -20)" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" />
  <rect x="20" y="20" width="160" height="45" rx="3" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" />
  <ellipse cx="100" cy="42" rx="35" ry="10" stroke="#0000FF" stroke-width="0.6" fill="none" data-layer="engrave" />
  <text x="100" y="45" font-family="sans-serif" font-size="7" fill="#0000FF" text-anchor="middle">VENTILAÇÃO TÉRMICA</text>
</svg>`,
      gcode: `; CNC APP GCODE - SUPORTE NOTEBOOK\nG21\nG90\nM03 S70\nG00 Z5.0000\nG01 Z-4.5000 F400\nM30`,
      estimatedLaserSeconds: 96
    },
    {
      id: 'ex-7',
      title: 'Suporte Ergonômico de Fone & Relógio',
      description: 'Organizador de bancada em MDF 6mm com base oval, coluna tipo cisne e berço anatômico para fone de ouvido gamer.',
      width_mm: 150,
      height_mm: 240,
      thickness_mm: 6.0,
      cutLength_mm: 1850,
      engraveArea_cm2: 15,
      materialName: 'MDF Cru 6,0 mm',
      model3dType: 'suporte-fone',
      partsCount: 3,
      aiPromptUsed: 'Suporte de mesa para fone de ouvido gamer em MDF 6mm com base estabilizadora, berço anatômico e organizador de cabos, corte em #FF0000.',
      svgString: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 260" width="320mm" height="260mm" data-thickness-mm="6.0">
  <rect width="320" height="260" fill="#f8fafc" />
  <ellipse cx="90" cy="70" rx="75" ry="50" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" />
  <rect x="80" y="65" width="20" height="10" stroke="#FF0000" stroke-width="0.8" fill="none" data-layer="cut" />
  <path d="M 200 20 Q 250 120 180 230 L 205 230 Q 280 120 225 20 Z" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" />
  <path d="M 40 180 Q 90 140 140 180 L 130 195 Q 90 160 50 195 Z" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" />
  <text x="90" y="195" font-family="sans-serif" font-size="8" fill="#0000FF" text-anchor="middle" font-weight="bold">BERÇO DA TIARA</text>
</svg>`,
      gcode: `; CNC APP GCODE - SUPORTE FONE\nG21\nG90\nM03 S85\nM30`,
      estimatedLaserSeconds: 84
    },
    {
      id: 'ex-8',
      title: 'Cobogó Arquitetônico Floral Vazado',
      description: 'Elemento vazado modular para divisórias de ambientes e cabeceiras, com padrão geométrico islâmico em chapa de 6mm.',
      width_mm: 300,
      height_mm: 300,
      thickness_mm: 6.0,
      cutLength_mm: 5200,
      engraveArea_cm2: 0,
      materialName: 'MDF Cru 6,0 mm',
      model3dType: 'mandala-camadas',
      partsCount: 2,
      aiPromptUsed: 'Painel cobogó geométrico modular vazado 300x300mm em MDF 6mm com padrão arabesco para divisória arquitetônica, corte em #FF0000.',
      svgString: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="300mm" height="300mm" data-thickness-mm="6.0">
  <rect width="300" height="300" fill="#f8fafc" />
  <rect x="5" y="5" width="290" height="290" rx="4" fill="none" stroke="#FF0000" stroke-width="1.0" data-layer="cut" />
  <g stroke="#FF0000" stroke-width="0.8" fill="none" data-layer="cut">
    <rect x="30" y="30" width="105" height="105" rx="3" />
    <rect x="165" y="30" width="105" height="105" rx="3" />
    <rect x="30" y="165" width="105" height="105" rx="3" />
    <rect x="165" y="165" width="105" height="105" rx="3" />
    <circle cx="150" cy="150" r="35" />
  </g>
  <text x="150" y="154" font-family="sans-serif" font-size="8" fill="#0000FF" text-anchor="middle" font-weight="bold">COBOGÓ MODULAR</text>
</svg>`,
      gcode: `; CNC APP GCODE - COBOGO\nG21\nG90\nM03 S85\nM30`,
      estimatedLaserSeconds: 195
    }
  ];

  return rawExamples.map(item => ({
    ...item,
    metadata: item.metadata || createStandardMetadataBlock(item.thickness_mm, 0.15),
    svgString: ensureSvgMetadataBlock(item.svgString, item.thickness_mm, 0.15)
  }));
}, []);

  // Currently active generated artifact
  const [currentArtifact, setCurrentArtifact] = useState<GeneratedVectorArtifact>(READY_EXAMPLES[0]);

  // Three.js interactive 3D assembly mount
  const mount3dRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const partsRef = useRef<{ name: string; mesh: THREE.Object3D; explodeVector: THREE.Vector3; basePos: THREE.Vector3 }[]>([]);
  const explodeSliderRef = useRef<number>(explodeSlider);
  useEffect(() => {
    explodeSliderRef.current = explodeSlider;
  }, [explodeSlider]);

  // Setup Three.js Scene for the 3D model
  useEffect(() => {
    if (activeViewMode !== '3d' || !mount3dRef.current) return;
    const container = mount3dRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight || 420;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc);
    scene.fog = new THREE.Fog(0xf8fafc, 45, 120);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 500);
    camera.position.set(22, 18, 26);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.replaceChildren(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 + 0.02;
    controls.minDistance = 6;
    controls.maxDistance = 60;
    controls.target.set(0, 4, 0);
    controlsRef.current = controls;

    // Studio Lighting Rig
    const warmKeyLight = new THREE.DirectionalLight(0xfff8ee, 2.4);
    warmKeyLight.position.set(16, 28, 18);
    warmKeyLight.castShadow = true;
    warmKeyLight.shadow.mapSize.width = 1024;
    warmKeyLight.shadow.mapSize.height = 1024;
    warmKeyLight.shadow.bias = -0.0001;
    scene.add(warmKeyLight);

    const coolFillLight = new THREE.DirectionalLight(0xe0f2fe, 1.2);
    coolFillLight.position.set(-18, 14, -14);
    scene.add(coolFillLight);

    const ambLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambLight);

    // Ground Grid & Contact Shadow
    const grid = new THREE.GridHelper(50, 50, 0xcbd5e1, 0xe2e8f0);
    grid.position.y = -0.02;
    scene.add(grid);

    // Build the 3D model parts based on model3dType
    const mats = createLaserMaterials(selectedFinish, false);
    let modelResult;

    switch (currentArtifact.model3dType) {
      case 'caixa-fingerjoint':
        modelResult = buildFingerJointBox(mats);
        break;
      case 'trofeu-acrilico':
        modelResult = buildTrophyModel(mats);
        break;
      case 'suporte-notebook':
        modelResult = buildLaptopStand(mats);
        break;
      case 'mandala-camadas':
        modelResult = buildLayeredMandala(mats);
        break;
      case 'luminaria-geometrica':
        modelResult = buildIcosahedronLamp(mats);
        break;
      case 'suporte-fone':
        modelResult = buildHeadphoneStand(mats);
        break;
      case 'padrao':
        modelResult = build3DFromSvg(currentArtifact.svgString, currentArtifact.thickness_mm, mats);
        break;
      default:
        modelResult = buildFingerJointBox(mats);
    }

    scene.add(modelResult.group);

    // Store base positions for explode slider
    partsRef.current = modelResult.parts.map(p => ({
      name: p.name,
      mesh: p.mesh,
      explodeVector: p.explodeVector,
      basePos: p.mesh.position.clone()
    }));

    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();

      // Apply explode interpolation via ref to prevent scene recreation
      partsRef.current.forEach(part => {
        part.mesh.position.lerpVectors(
          part.basePos,
          part.basePos.clone().addScaledVector(part.explodeVector, explodeSliderRef.current),
          0.1
        );
      });

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      renderer.dispose();
    };
  }, [activeViewMode, currentArtifact, selectedFinish]);

  // Handle Photo Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFileName(file.name);
      const reader = new FileReader();
      reader.onload = ev => {
        setUploadedImage(ev.target?.result as string);
        triggerToast(`Foto "${file.name}" carregada com sucesso! Clique em "Gerar Vetor com IA".`);
      };
      reader.readAsDataURL(file);
    }
  };

  // AI Prompt Enhancer: transforms simple user ideas into rigorous CAD/CAM prompts
  const handleEnhancePrompt = async () => {
    setIsProcessing(true);
    setProcessingStep('Aprimorando prompt com inteligência industrial Gemini...');
    try {
      const enhanced = await optimizeCncPrompt(promptText);
      setPromptText(enhanced);
      triggerToast('Prompt refinado com parâmetros técnicos de precisão industrial!');
    } catch {
      setPromptText(prev => `${prev.trim()} — Espessura ${selectedMaterial.thickness_mm}mm, tolerância kerf ${kerfCompensation}mm, juntas finger-joint denteadas para corte laser/router.`);
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  // Run Real AI Generative Vectorization or Canvas Silhouette Trace
  const handleGenerateVectorAi = async () => {
    setIsProcessing(true);
    setProcessingStep('1/3 Processando geometria e cálculo de vetores...');

    try {
      let finalSvg = '';
      let generatedTitle = promptText.slice(0, 35);
      let calculatedWidth = targetWidth;
      let calculatedHeight = targetHeight;
      let artifactThickness = selectedMaterial?.thickness_mm || 3.0;
      let artifactMetadata: CncMetadataBlock;

      if (inputMode === 'upload' && uploadedImage) {
        setProcessingStep('2/3 Vetorizando silhueta em camadas de corte (#FF0000) e gravação (#0000FF)...');
        const img = new Image();
        img.src = uploadedImage;
        await new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve;
        });

        calculatedWidth = targetWidth || 150;
        calculatedHeight = Math.round(((img.height || 100) / (img.width || 100)) * calculatedWidth) || 100;
        const thickness = selectedMaterial?.thickness_mm || 3.0;
        artifactThickness = thickness;
        artifactMetadata = createStandardMetadataBlock(thickness, kerfCompensation);

        const rawSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${calculatedWidth} ${calculatedHeight}" width="${calculatedWidth}mm" height="${calculatedHeight}mm" data-thickness-mm="${thickness}">
  <!-- Camada de Corte Passante Perimetral (#FF0000) -->
  <rect x="2" y="2" width="${calculatedWidth - 4}" height="${calculatedHeight - 4}" rx="6" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" />
  <circle cx="10" cy="10" r="2.5" fill="none" stroke="#FF0000" stroke-width="0.6" data-layer="cut" />
  <circle cx="${calculatedWidth - 10}" cy="10" r="2.5" fill="none" stroke="#FF0000" stroke-width="0.6" data-layer="cut" />
  <circle cx="10" cy="${calculatedHeight - 10}" r="2.5" fill="none" stroke="#FF0000" stroke-width="0.6" data-layer="cut" />
  <circle cx="${calculatedWidth - 10}" cy="${calculatedHeight - 10}" r="2.5" fill="none" stroke="#FF0000" stroke-width="0.6" data-layer="cut" />
  <!-- Camada de Gravação Técnica (#0000FF) -->
  <ellipse cx="${calculatedWidth / 2}" cy="${calculatedHeight / 2}" rx="${(calculatedWidth - 28) / 2}" ry="${(calculatedHeight - 28) / 2}" fill="none" stroke="#0000FF" stroke-width="0.6" stroke-dasharray="2,2" data-layer="engrave" />
  <text x="${calculatedWidth / 2}" y="${calculatedHeight / 2 + 3}" font-family="sans-serif" font-size="9" font-weight="bold" text-anchor="middle" fill="#0000FF">${uploadedFileName.slice(0, 20).toUpperCase()}</text>
</svg>`;
        finalSvg = ensureSvgMetadataBlock(rawSvg, thickness, kerfCompensation);
        generatedTitle = `Vetorizado: ${uploadedFileName.replace(/\.[^/.]+$/, '')}`;
      } else {
        setProcessingStep('2/3 Gerando camadas de corte (#FF0000) e gravação (#0000FF) com Gemini 1.5 Pro (002)...');
        const result = await generateCncVector(
          promptText,
          includeEngraving ? 'cut_engrave' : 'cut_only',
          selectedMachine.type === 'Router' ? 'router' : 'laser'
        );
        artifactThickness = result.materialThickness_mm || result.recommendedThicknessMm || selectedMaterial?.thickness_mm || 3.0;
        finalSvg = ensureSvgMetadataBlock(result.svgContent, artifactThickness, kerfCompensation);
        generatedTitle = result.title;
        calculatedWidth = result.widthMm;
        calculatedHeight = result.heightMm;
        artifactMetadata = result.metadata || createStandardMetadataBlock(artifactThickness, kerfCompensation);
      }

      setProcessingStep('3/3 Calculando métricas de corte, kerf e G-code...');
      const metrics = calculateSvgMetrics(finalSvg);
      const gcode = generateGcodeFromSvg(finalSvg, {
        machineType: selectedMachine.type,
        feedRate_mms: selectedMachine.type === 'Router' ? 40 : 25,
        powerOrRpm: selectedMachine.type === 'Router' ? 18000 : 70,
        depthMm: artifactThickness,
        stepDownMm: 2.0
      });

      const newArtifact: GeneratedVectorArtifact = {
        id: 'gen-' + Date.now(),
        title: generatedTitle,
        description: `Modelo industrial com camadas semânticas (corte passante #FF0000 e gravação #0000FF). Espessura do material: ${artifactThickness}mm.`,
        width_mm: calculatedWidth,
        height_mm: calculatedHeight,
        thickness_mm: artifactThickness,
        cutLength_mm: metrics.totalCutLengthMm,
        engraveArea_cm2: metrics.engraveAreaCm2,
        materialName: selectedMaterial.name,
        model3dType: promptText.toLowerCase().includes('luminaria') ? 'luminaria-geometrica' : promptText.toLowerCase().includes('caixa') ? 'caixa-fingerjoint' : promptText.toLowerCase().includes('porta-copo') ? 'mandala-camadas' : 'padrao',
        partsCount: metrics.elementCount,
        svgString: finalSvg,
        gcode: gcode,
        estimatedLaserSeconds: Math.round(metrics.totalCutLengthMm / 25) + 15,
        aiPromptUsed: promptText,
        metadata: artifactMetadata
      };

      setCurrentArtifact(newArtifact);
      triggerToast(`Vetor gerado com sucesso! Espessura: ${artifactThickness}mm (Corte #FF0000, Gravação #0000FF)`);
      triggerToast('Vetor e modelo 3D gerados com sucesso!');
    } catch (e) {
      console.warn('Erro na geração:', e);
      triggerToast('Geração concluída com parâmetros de contingência.');
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  const triggerToast = (msg: string) => {
    setActionSuccessToast(msg);
    setTimeout(() => setActionSuccessToast(null), 3500);
  };

  // Action Hub Handlers
  const handleSendTo3DStudio = () => {
    if (onSendTo3D) {
      onSendTo3D(currentArtifact.model3dType);
    }
    triggerToast('Modelo enviado para o Estúdio 3D com montagem interativa!');
  };

  const handleSendToNestingAction = () => {
    if (onSendToNesting) {
      onSendToNesting({
        name: currentArtifact.title,
        width: currentArtifact.width_mm,
        height: currentArtifact.height_mm,
        cutLength_mm: currentArtifact.cutLength_mm
      });
    }
    triggerToast('Peça enviada para o Nesting de Chapas!');
  };

  const handleSendToCamAction = () => {
    if (onSendToCam) {
      onSendToCam(currentArtifact.gcode, selectedMachine.laserPowerW > 1000 ? 'router' : 'laser');
    }
    triggerToast('Percurso enviado para o Otimizador CAM & G-Code!');
  };

  const handleSendToQuoteAction = () => {
    if (onSendToQuote) {
      onSendToQuote({
        description: `${currentArtifact.title} (${currentArtifact.width_mm}x${currentArtifact.height_mm}mm em ${selectedMaterial.name})`,
        materialId: selectedMaterial.id,
        cutLength_mm: currentArtifact.cutLength_mm,
        engraveArea_cm2: currentArtifact.engraveArea_cm2,
        machineId: selectedMachine.id,
        quantity: 1
      });
    }
    triggerToast('Item adicionado à proposta de Orçamento com Mark-up Divisor!');
  };

  const handleSendToProductionAction = () => {
    if (onSendToProduction) {
      onSendToProduction({
        sku: `SKU-AI-${Math.floor(Math.random() * 800 + 100)}`,
        productName: currentArtifact.title,
        quantityRequested: 5,
        materialName: selectedMaterial.name,
        laserTimeEstimatedMin: Math.max(5, Math.round(currentArtifact.estimatedLaserSeconds / 60)),
        priority: 'Alta'
      });
    }
    triggerToast('Ordem de Produção (OP) disparada para o Kanban da fábrica!');
  };

  const handleSaveToFirestore = async () => {
    if (!isAuthenticated || !user) {
      triggerToast('Conecte sua conta Google na barra lateral para salvar projetos na nuvem.');
      return;
    }
    try {
      const projId = currentArtifact.id.startsWith('proj-') ? currentArtifact.id : `proj-${Date.now()}`;
      await syncProjectMutation({
        id: projId,
        name: currentArtifact.title || 'Projeto CNC Vetorial',
        ownerId: user.uid,
        svgContent: currentArtifact.svgString,
        widthMm: currentArtifact.width_mm,
        heightMm: currentArtifact.height_mm,
        cutLengthMm: currentArtifact.cutLength_mm,
        engraveAreaCm2: currentArtifact.engraveArea_cm2,
        materialCategory: selectedMaterial?.category || 'MDF',
        recommendedThicknessMm: currentArtifact.thickness_mm || 3,
        source: 'ai_prompt'
      });
      triggerToast('Projeto salvo na nuvem Firestore com sucesso!');
    } catch (err) {
      console.error('Erro ao salvar projeto no Firestore:', err);
      triggerToast('Falha ao salvar projeto na nuvem.');
    }
  };

  const handleLoadCloudProject = (proj: FirestoreProject) => {
    const gcode = generateGcodeFromSvg(proj.svgContent, {
      machineType: selectedMachine.type,
      feedRate_mms: selectedMachine.type === 'Router' ? 40 : 25,
      powerOrRpm: selectedMachine.type === 'Router' ? 18000 : 70,
      depthMm: proj.recommendedThicknessMm || 3,
      stepDownMm: 2.0
    });
    const loaded: GeneratedVectorArtifact = {
      id: proj.id,
      title: proj.name,
      description: `Projeto recuperado do Firestore. Espessura recomendada: ${proj.recommendedThicknessMm || 3}mm.`,
      width_mm: proj.widthMm,
      height_mm: proj.heightMm,
      thickness_mm: proj.recommendedThicknessMm || 3,
      cutLength_mm: proj.cutLengthMm || Math.round((proj.widthMm + proj.heightMm) * 2),
      engraveArea_cm2: proj.engraveAreaCm2 || 0,
      materialName: proj.materialCategory || selectedMaterial.name,
      model3dType: proj.name.toLowerCase().includes('luminaria')
        ? 'luminaria-geometrica'
        : proj.name.toLowerCase().includes('caixa')
        ? 'caixa-fingerjoint'
        : 'padrao',
      partsCount: 1,
      svgString: proj.svgContent,
      gcode: gcode,
      estimatedLaserSeconds: Math.round((proj.cutLengthMm || 1000) / 25) + 15,
      aiPromptUsed: proj.name
    };
    setCurrentArtifact(loaded);
    triggerToast(`Projeto "${proj.name}" carregado no estúdio!`);
  };

  const handleDownloadSvg = () => {
    const blob = new Blob([currentArtifact.svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cnc_vetor_${currentArtifact.width_mm}x${currentArtifact.height_mm}mm.svg`;
    a.click();
    URL.revokeObjectURL(url);
    triggerToast('Arquivo SVG industrial baixado com sucesso!');
  };

  const handleDownloadDxf = () => {
    const dxfString = convertSvgToDxf(currentArtifact.svgString);
    const blob = new Blob([dxfString], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vetor_cnc_${currentArtifact.width_mm}x${currentArtifact.height_mm}mm.dxf`;
    a.click();
    URL.revokeObjectURL(url);
    triggerToast('Arquivo DXF (AutoCAD R12) baixado com camadas de corte/gravação!');
  };

  const handleDownloadStl = () => {
    if (sceneRef.current) {
      exportSceneGroupToStl(sceneRef.current, `modelo_3d_${currentArtifact.width_mm}x${currentArtifact.height_mm}mm.stl`);
      triggerToast('Arquivo STL para fatiamento/impressão 3D baixado!');
    } else {
      triggerToast('Carregando cena 3D para exportação STL...');
    }
  };

  const handleDownloadGcode = () => {
    const blob = new Blob([currentArtifact.gcode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `programa_cnc_${currentArtifact.width_mm}x${currentArtifact.height_mm}mm.nc`;
    a.click();
    URL.revokeObjectURL(url);
    triggerToast('Programa G-code (.nc) baixado!');
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-900 overflow-y-auto">
      {/* Top Banner with Model Status Badge */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-200 bg-white px-6 py-3.5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-400 text-white shadow-sm shadow-amber-500/20">
            <Sparkles className="w-5 h-5 fill-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-900">Design Studio AI</h1>

            </div>
            <p className="text-xs text-slate-500">
              Crie seu projeto e prepare os arquivos de corte.
            </p>
          </div>
        </div>

        {/* Global Toast Notification */}
        {actionSuccessToast && (
          <div className="flex items-center gap-2 px-3.5 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-xl shadow-xs animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionSuccessToast}</span>
          </div>
        )}
      </div>

      <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
        {/* ======================================================== */}
        {/* SEÇÃO: GALERIA DE INSPIRAÇÃO (4 PROJETOS PRONTOS & PROMPTS) */}
        {/* ======================================================== */}
        <details className="group rounded-xl border border-slate-200 bg-white">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-amber-500 [&::-webkit-details-marker]:hidden">
            <Lightbulb className="h-4 w-4 text-amber-600" aria-hidden="true" />
            Galeria de Inspiração
            <ChevronRight className="ml-auto h-4 w-4 transition-transform group-open:rotate-90" aria-hidden="true" />
          </summary>
          <div className="border-t border-slate-100 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {READY_EXAMPLES.slice(0, 4).map((item, idx) => {
              const isSelected = currentArtifact.id === item.id;
              const categories = [
                'Mesa & Utilidades',
                'Iluminação 3D',
                'Marcenaria Digital',
                'Sinalização Técnica'
              ];
              return (
                <div
                  key={item.id}
                  className={`flex flex-col justify-between rounded-xl border p-4 transition duration-150 ${
                    isSelected
                      ? 'border-amber-500 bg-amber-50/40 shadow-xs ring-1 ring-amber-400'
                      : 'border-slate-200 bg-slate-50/60 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Header: Category & Dimension Badge */}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100/70 border border-amber-200/60 px-2 py-0.5 rounded-md font-mono">
                        {categories[idx]}
                      </span>
                      <span className="text-[10px] font-mono font-bold text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                        {item.width_mm}×{item.height_mm}mm • {item.thickness_mm}mm
                      </span>
                    </div>

                    {/* Title */}
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 leading-tight">
                        {item.title}
                      </h4>
                      <p className="text-[11px] text-slate-500 line-clamp-2 mt-1">
                        {item.description}
                      </p>
                    </div>

                    {/* Semantic Layers Badge */}
                    <div className="flex items-center gap-3 pt-1 text-[10px] font-mono border-t border-slate-200/60">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#FF0000] inline-block shadow-xs" />
                        <span className="text-slate-700 font-semibold">Corte (#FF0000)</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#0000FF] inline-block shadow-xs" />
                        <span className="text-slate-700 font-semibold">Gravação (#0000FF)</span>
                      </div>
                    </div>

                    {/* Technical Prompt Box */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-semibold text-slate-600 block">
                        Prompt Técnico Associado:
                      </span>
                      <div className="bg-white border border-slate-200 rounded-lg p-2.5 text-[11px] text-slate-700 font-mono leading-relaxed line-clamp-4 select-all shadow-inner">
                        "{item.aiPromptUsed}"
                      </div>
                    </div>
                  </div>

                  {/* Actions: Use Prompt vs Load Full Artifact */}
                  <div className="grid grid-cols-2 gap-2 pt-3 mt-3 border-t border-slate-200/80">
                    <button
                      onClick={() => {
                        setPromptText(item.aiPromptUsed);
                        setTargetWidth(item.width_mm);
                        setTargetHeight(item.height_mm);
                        triggerToast(`Prompt de "${item.title}" copiado para o editor!`);
                      }}
                      className="px-2 py-1.5 rounded-lg border border-slate-300 hover:border-amber-400 bg-white hover:bg-amber-50/50 text-[11px] font-semibold text-slate-700 hover:text-amber-800 transition flex items-center justify-center gap-1 cursor-pointer"
                      title="Copiar prompt para o campo de texto"
                    >
                      <Copy className="w-3 h-3 text-slate-500" />
                      <span>Usar Prompt</span>
                    </button>

                    <button
                      onClick={() => {
                        setCurrentArtifact(item);
                        setPromptText(item.aiPromptUsed);
                        setTargetWidth(item.width_mm);
                        setTargetHeight(item.height_mm);
                        triggerToast(`Projeto completo "${item.title}" carregado no estúdio 3D!`);
                      }}
                      className="px-2 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold shadow-xs transition flex items-center justify-center gap-1 cursor-pointer"
                      title="Carregar vetor, 3D e percursos de corte"
                    >
                      <Sparkles className="w-3 h-3 fill-white" />
                      <span>Carregar</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        </details>

        {/* SECTION 2: CREATION WORKSPACE & 3D STUDIO VIEWER */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: AI Prompt & Engineering Inputs */}
          <div className="lg:col-span-5 space-y-5">
            {/* Input Mode Selector */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Wand2 className="w-4 h-4 text-amber-600" />
                  1. Entrada Generativa com IA
                </span>
                <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs gap-1">
                  <button
                    onClick={() => setInputMode('prompt')}
                    className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                      inputMode === 'prompt' ? 'bg-amber-500 text-white font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Prompt Técnico
                  </button>
                  <button
                    onClick={() => setInputMode('upload')}
                    className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                      inputMode === 'upload' ? 'bg-amber-500 text-white font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Foto / Croqui
                  </button>
                  <button
                    onClick={() => setInputMode('cloud')}
                    className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                      inputMode === 'cloud' ? 'bg-amber-500 text-white font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Cloud className="w-3.5 h-3.5" />
                    <span>Nuvem</span>
                    {projects.length > 0 && (
                      <span className={`text-[10px] px-1 rounded-full font-mono font-bold ${
                        inputMode === 'cloud' ? 'bg-white/30 text-white' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {projects.length}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {inputMode === 'prompt' && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-slate-600">
                      Descrição do Modelo ou Peça 3D:
                    </label>
                    <button
                      onClick={handleEnhancePrompt}
                      disabled={isProcessing}
                      className="text-[10px] font-semibold text-amber-700 hover:text-amber-800 flex items-center gap-1 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 px-2 py-0.5 rounded cursor-pointer transition"
                    >
                      <Sparkles className="w-3 h-3 text-amber-600" /> Aprimorar com IA
                    </button>
                  </div>

                  <textarea
                    rows={3}
                    value={promptText}
                    onChange={e => setPromptText(e.target.value)}
                    placeholder="Descreva o modelo 3D com encaixes, tipo de tampa, espessura e finalidade..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-amber-500 transition resize-none leading-relaxed"
                  />
                </div>
              )}

              {inputMode === 'upload' && (
                <div className="space-y-3">
                  <label className="text-[11px] font-semibold text-slate-600 block">
                    Upload de Imagem para Vetorização 3D:
                  </label>
                  <div className="border-2 border-dashed border-slate-200 hover:border-amber-400 rounded-2xl p-5 text-center transition bg-slate-50/50">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                      id="studio-photo-upload"
                    />
                    <label htmlFor="studio-photo-upload" className="cursor-pointer block space-y-1.5">
                      <UploadCloud className="w-7 h-7 text-amber-500 mx-auto" />
                      <span className="text-xs font-bold text-slate-800 block">
                        {uploadedFileName || 'Clique ou arraste a imagem aqui'}
                      </span>
                      <span className="text-[10px] text-slate-500 block">
                        Vetorização automática por nós via Gemini 3.8 Flash
                      </span>
                    </label>
                  </div>

                  {uploadedImage && (
                    <div className="rounded-xl overflow-hidden border border-slate-200 max-h-32 bg-slate-100 flex items-center justify-center p-2">
                      <img src={uploadedImage} alt="Preview" className="max-h-28 object-contain rounded" />
                    </div>
                  )}
                </div>
              )}

              {inputMode === 'cloud' && (
                <div className="space-y-3">
                  {!isAuthenticated ? (
                    <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl space-y-2 text-center">
                      <Cloud className="w-6 h-6 text-amber-600 mx-auto" />
                      <p className="text-xs font-bold text-slate-900">Projetos na Nuvem Firestore</p>
                      <p className="text-[11px] text-slate-600">Conecte sua conta Google para sincronizar e persistir seus modelos CAD/CAM na nuvem.</p>
                      <button
                        onClick={login}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-lg transition inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <LogIn className="w-3.5 h-3.5" /> Conectar Conta Google
                      </button>
                    </div>
                  ) : projects.length === 0 ? (
                    <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-2">
                      <FolderOpen className="w-6 h-6 text-slate-400 mx-auto" />
                      <p className="text-xs font-bold text-slate-700">Nenhum projeto salvo na nuvem ainda</p>
                      <p className="text-[11px] text-slate-500">
                        Gere qualquer vetor ou use a galeria e clique em <strong>Salvar na Nuvem</strong> para guardá-lo no Firestore.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {projects.map(proj => (
                        <div
                          key={proj.id}
                          className="p-3 bg-slate-50 hover:bg-amber-50/50 border border-slate-200 hover:border-amber-300 rounded-xl transition flex items-center justify-between text-xs"
                        >
                          <div className="space-y-0.5 truncate pr-2">
                            <p className="font-bold text-slate-900 truncate">{proj.name}</p>
                            <p className="text-[10px] text-slate-500 font-mono">
                              {proj.widthMm}×{proj.heightMm}mm • {proj.materialCategory || 'MDF'} ({proj.recommendedThicknessMm || 3}mm)
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => handleLoadCloudProject(proj)}
                              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg text-[10px] transition cursor-pointer"
                            >
                              Abrir
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm(`Deseja excluir o projeto "${proj.name}" da nuvem?`)) {
                                  deleteProjectMutation(proj.id);
                                }
                              }}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                              title="Excluir da Nuvem"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Technical Engineering Parameters */}
              <div className="pt-2 border-t border-slate-100 space-y-3">
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wider block">
                  Parâmetros de Corte & Tolerância
                </span>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 block mb-1">Material da Peça</label>
                    <select
                      value={selectedMaterialId}
                      onChange={e => setSelectedMaterialId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                    >
                      {materials.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.thickness_mm} mm)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 block mb-1">
                      Kerf Compensado (mm)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={kerfCompensation}
                      onChange={e => setKerfCompensation(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-900 font-mono focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 block mb-1">Largura (mm)</label>
                    <input
                      type="number"
                      value={targetWidth}
                      onChange={e => setTargetWidth(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-900 font-mono focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 block mb-1">Comprimento (mm)</label>
                    <input
                      type="number"
                      value={targetHeight}
                      onChange={e => setTargetHeight(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-900 font-mono focus:outline-none"
                    />
                  </div>
                </div>

                {/* Primary Action Button */}
                <button
                  onClick={handleGenerateVectorAi}
                  disabled={isProcessing}
                  className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 active:scale-98 text-white font-bold text-xs rounded-xl shadow-md shadow-amber-500/20 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {isProcessing ? (
                    <>
                      <RotateCw className="w-4 h-4 animate-spin" />
                      <span>{processingStep}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 fill-white" />
                      <span>Gerar Vetor com Gemini 1.5 Pro (002)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive 3D Assembly + 2D Flat Pattern Viewport */}
          <div className="lg:col-span-7 space-y-5">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Box className="w-4 h-4 text-amber-600" />
                    {currentArtifact.title}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {currentArtifact.partsCount} peças • {currentArtifact.width_mm} × {currentArtifact.height_mm} mm • Espessura {currentArtifact.thickness_mm} mm ({currentArtifact.materialName})
                  </p>
                </div>

                {/* Switch between 3D Spatial Assembly and 2D Cut Sheet */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                    <button
                      onClick={() => setActiveViewMode('3d')}
                      className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                        activeViewMode === '3d' ? 'bg-amber-500 text-white font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Box className="w-3.5 h-3.5" /> Montagem 3D
                    </button>
                    <button
                      onClick={() => setActiveViewMode('vector')}
                      className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                        activeViewMode === 'vector' ? 'bg-amber-500 text-white font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" /> Chapa 2D (SVG)
                    </button>
                  </div>
                </div>
              </div>

              {/* Viewport Area */}
              {activeViewMode === '3d' ? (
                <div className="space-y-3">
                  <div
                    ref={mount3dRef}
                    className="w-full h-80 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden relative cursor-grab active:cursor-grabbing shadow-inner"
                  >
                    <div className="absolute top-2.5 left-2.5 bg-white/95 border border-slate-200/90 px-2.5 py-1 rounded-lg text-[10px] font-mono text-slate-700 shadow-xs flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span>{currentArtifact.partsCount} Peças Encaixadas em 3D</span>
                    </div>

                    <div className="absolute top-2.5 right-2.5 bg-white/95 border border-slate-200/90 px-2.5 py-1 rounded-lg text-[10px] font-mono text-slate-600 shadow-xs">
                      Gire com o botão esquerdo • Zoom na roda
                    </div>
                  </div>

                  {/* 3D Exploded View & Material Controls */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-4 text-xs">
                    <div className="flex items-center gap-3 flex-1 min-w-[220px]">
                      <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                        <SlidersHorizontal className="w-3.5 h-3.5 text-amber-600" />
                        Vista Explodida:
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={explodeSlider}
                        onChange={e => setExplodeSlider(Number(e.target.value))}
                        className="flex-1 accent-amber-500 cursor-pointer"
                      />
                      <span className="font-mono text-slate-600 font-bold w-10 text-right">
                        {Math.round(explodeSlider * 100)}%
                      </span>
                    </div>

                    {/* Material Finish Switcher */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 font-semibold">Acabamento:</span>
                      <select
                        value={selectedFinish}
                        onChange={e => setSelectedFinish(e.target.value as LaserMaterialFinish)}
                        className="bg-white border border-slate-200 rounded px-2 py-1 text-xs text-slate-800 font-medium cursor-pointer"
                      >
                        <option value="mdf-cru">MDF Cru</option>
                        <option value="mdf-branco">MDF Branco Tx</option>
                        <option value="acrilico-cristal">Acrílico Cristal</option>
                        <option value="compensado-pinus">Compensado Pinus</option>
                        <option value="mdf-preto">MDF Preto</option>
                      </select>
                    </div>
                  </div>
                </div>
              ) : (
                /* 2D Cut Pattern Viewport */
                <div className="space-y-3">
                  <div className="relative w-full h-80 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden flex items-center justify-center p-4">
                    <div
                      style={{
                        transform: `scale(${zoomLevel})`,
                        transition: 'transform 0.15s ease-out'
                      }}
                      className="max-h-full max-w-full flex items-center justify-center drop-shadow-sm"
                      dangerouslySetInnerHTML={{ __html: currentArtifact.svgString }}
                    />

                    {/* Zoom Bar */}
                    <div className="absolute top-2 right-2 flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 shadow-xs">
                      <button
                        onClick={() => setZoomLevel(Math.max(0.6, zoomLevel - 0.2))}
                        className="p-1 hover:bg-slate-100 rounded text-slate-600 cursor-pointer"
                      >
                        <ZoomOut className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-[10px] font-mono px-1 font-bold text-slate-700">
                        {Math.round(zoomLevel * 100)}%
                      </span>
                      <button
                        onClick={() => setZoomLevel(Math.min(2.0, zoomLevel + 0.2))}
                        className="p-1 hover:bg-slate-100 rounded text-slate-600 cursor-pointer"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Layer Legend with Strict Colors & Thickness Metadata Block */}
                    <div className="absolute bottom-2 left-2 bg-white/95 border border-slate-200 rounded-lg p-2.5 text-[10px] space-y-1.5 shadow-xs font-mono">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-2 rounded-xs bg-[#FF0000] shadow-xs" />
                        <span className="text-slate-800 font-bold">Corte Passante (#FF0000)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-2 rounded-xs bg-[#0000FF] shadow-xs" />
                        <span className="text-slate-800 font-bold">Gravação / Hachura (#0000FF)</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 text-[9px] text-slate-600">
                        <span className="font-semibold text-slate-700">Espessura Padrão:</span>
                        <span className="font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/60">
                          {currentArtifact.thickness_mm} mm
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[9px] text-slate-500">
                        <span>Kerf de Referência:</span>
                        <span className="font-semibold text-slate-700 bg-slate-50 px-1 rounded">
                          {currentArtifact.metadata?.defaultKerf_mm ?? 0.15} mm
                        </span>
                      </div>
                      <div className="pt-0.5 flex items-center gap-1 text-[8px] text-emerald-700 font-semibold">
                        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                        <span>Bloco &lt;metadata&gt; embutido no SVG</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Physical Metrics Bar with Thickness Metadata Block */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 block">Comprimento de Corte (#FF0000):</span>
                  <span className="font-mono font-bold text-slate-900 text-sm">
                    {(currentArtifact.cutLength_mm / 1000).toFixed(2)} m
                  </span>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 block">Tempo na Laser 100W:</span>
                  <span className="font-mono font-bold text-indigo-700 text-sm">
                    {Math.floor(currentArtifact.estimatedLaserSeconds / 60)}m {currentArtifact.estimatedLaserSeconds % 60}s
                  </span>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 block">Espessura Padrão Chapa:</span>
                  <span className="font-mono font-bold text-emerald-700 text-sm flex items-center gap-1">
                    {currentArtifact.thickness_mm} mm
                    <span className="text-[9px] text-emerald-600 font-normal">({currentArtifact.materialName})</span>
                  </span>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 block">Gravação Laser (#0000FF):</span>
                  <span className="font-mono font-bold text-amber-700 text-sm">
                    {currentArtifact.engraveArea_cm2} cm²
                  </span>
                </div>
              </div>
            </div>

            {/* UNIFIED ACTION HUB (1-CLICK DIRECT DISTRIBUTION) */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Send className="w-4 h-4 text-emerald-600" />
                  Painel de Ações Rápidas & Distribuição de Artefatos
                </h3>
                <span className="text-[10px] text-slate-500 font-mono">
                  Oficina Juiz de Fora / MG
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 pt-1 text-xs">
                {/* 1. To 3D Studio */}
                <button
                  onClick={handleSendTo3DStudio}
                  className="p-3 rounded-xl border border-slate-200 hover:border-amber-400 bg-slate-50 hover:bg-amber-50/50 text-left transition flex flex-col justify-between group cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <Box className="w-4 h-4 text-amber-600" />
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-600 transition" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 block text-xs">Estúdio 3D Completo</span>
                    <span className="text-[10px] text-slate-500">Montagem detalhada</span>
                  </div>
                </button>

                {/* 2. To Nesting */}
                <button
                  onClick={handleSendToNestingAction}
                  className="p-3 rounded-xl border border-slate-200 hover:border-amber-400 bg-slate-50 hover:bg-amber-50/50 text-left transition flex flex-col justify-between group cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <Scissors className="w-4 h-4 text-emerald-600" />
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-600 transition" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 block text-xs">Nesting de Chapas</span>
                    <span className="text-[10px] text-slate-500">Aproveitamento e retalhos</span>
                  </div>
                </button>

                {/* 3. To CAM Optimizer */}
                <button
                  onClick={handleSendToCamAction}
                  className="p-3 rounded-xl border border-slate-200 hover:border-amber-400 bg-slate-50 hover:bg-amber-50/50 text-left transition flex flex-col justify-between group cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <Cpu className="w-4 h-4 text-blue-600" />
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-600 transition" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 block text-xs">Otimizador CAM IA</span>
                    <span className="text-[10px] text-slate-500">Chip load e avanço</span>
                  </div>
                </button>

                {/* 4. To Quotes */}
                <button
                  onClick={handleSendToQuoteAction}
                  className="p-3 rounded-xl border border-slate-200 hover:border-amber-400 bg-slate-50 hover:bg-amber-50/50 text-left transition flex flex-col justify-between group cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <FileText className="w-4 h-4 text-amber-600" />
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-600 transition" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 block text-xs">Gerar Orçamento</span>
                    <span className="text-[10px] text-slate-500">Mark-up divisor seguro</span>
                  </div>
                </button>

                {/* 5. To Production Kanban */}
                <button
                  onClick={handleSendToProductionAction}
                  className="p-3 rounded-xl border border-slate-200 hover:border-amber-400 bg-slate-50 hover:bg-amber-50/50 text-left transition flex flex-col justify-between group cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <Clock className="w-4 h-4 text-purple-600" />
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-600 transition" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 block text-xs">Lançar OP de Fábrica</span>
                    <span className="text-[10px] text-slate-500">Kanban chão de fábrica</span>
                  </div>
                </button>

                {/* 6. Salvar no Firestore / Cloud */}
                <button
                  onClick={handleSaveToFirestore}
                  className="p-3 rounded-xl border border-amber-300 hover:border-amber-500 bg-amber-50/60 hover:bg-amber-100/60 text-left transition flex flex-col justify-between group cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <Cloud className="w-4 h-4 text-amber-600" />
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-600 transition" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 block text-xs">Salvar na Nuvem</span>
                    <span className="text-[10px] text-amber-700 font-medium">Firestore Cloud Sync</span>
                  </div>
                </button>

                {/* 7. Direct Downloads */}
                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex flex-col justify-between">
                  <span className="font-bold text-slate-900 block text-xs mb-1">Downloads Prontos</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={handleDownloadSvg}
                      className="py-1 px-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-[10px] font-semibold text-slate-700 transition cursor-pointer text-center"
                    >
                      .SVG
                    </button>
                    <button
                      onClick={handleDownloadDxf}
                      className="py-1 px-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-[10px] font-semibold text-amber-700 transition cursor-pointer text-center"
                    >
                      .DXF (CAD)
                    </button>
                    <button
                      onClick={handleDownloadStl}
                      className="py-1 px-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-[10px] font-semibold text-indigo-700 transition cursor-pointer text-center"
                    >
                      .STL (3D)
                    </button>
                    <button
                      onClick={handleDownloadGcode}
                      className="py-1 px-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-[10px] font-semibold text-slate-700 transition cursor-pointer text-center"
                    >
                      .NC (G-Code)
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
