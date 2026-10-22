import type { NestingTransfer } from '../../utils/nestingEngine';
import { calcLaserCutTimeAndCost } from '../../utils/calculations';
import { sanitizeSvg } from '../../utils/sanitizeSvg';
import { binaryMaskFromRgba, traceBinaryMask } from '../../utils/rasterTrace';
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
  build3DFromSvg,
  buildGeometricAssembly
} from './LaserModel3D';
import {
  generateCncVector,
  optimizeCncPrompt,
  CncMetadataBlock,
  createStandardMetadataBlock,
  ensureSvgMetadataBlock
} from '../../services/geminiCncService';
import {
  applyKerfToSvg,
  calculateSvgMetrics,
  convertSvgToDxf,
  exportSceneGroupToStl,
  generateGcodeFromSvg
} from '../../utils/cncExporters';
import { useFirebase } from '../../services/firebase/FirebaseContext';
import { FirestoreProject } from '../../services/firebase/firebase';
import { DEFAULT_PROJECTS_SEED } from '../../services/firebase/seedData';
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
  onSendTo3D?: (artifact: GeneratedVectorArtifact) => void;
  onSendToNesting?: (part: NestingTransfer) => void;
  onSendToCam?: (gcode: string, machineType: 'laser' | 'router') => void;
  onSendToQuote?: (item: {
    description: string;
    materialId: string;
    cutLength_mm: number;
    engraveArea_cm2: number;
    machineId: string;
    quantity: number;
    unitPriceEstimated?: number;
    width_mm: number;
    height_mm: number;
  }) => void;
  onSendToProduction?: (order: Partial<ProductionOrder>) => Promise<void>;
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
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);

  const selectedMaterial = materials.find(m => m.id === selectedMaterialId) || materials[0];
  const selectedMachine = machines[0] || { id: 'mach-1', name: 'CNC Laser CO2 100W' };

  // ========================================================
  // READY-TO-CUT INDUSTRIAL EXAMPLES & INSPIRATION GALLERY
  // Strict Semantic Layers: Cut = #FF0000, Engrave = #0000FF
  // Material Thickness Metadata Standard: 3.0mm
  // ========================================================
  // Projetos dinâmicos vinculados à conta do usuário no Firestore
  const READY_EXAMPLES: GeneratedVectorArtifact[] = useMemo(() => {
    const hasCloudProjects = Boolean(projects && projects.length > 0);
    const sourceList = hasCloudProjects
      ? projects
      : DEFAULT_PROJECTS_SEED.map(p => ({ ...p, ownerId: user?.uid || 'local-user' }));

    return sourceList.map(item => {
      const thickness = item.recommendedThicknessMm || 3.0;
      const metrics = calculateSvgMetrics(item.svgContent);
      return {
        id: item.id,
        title: item.name,
        description: `${hasCloudProjects ? 'Projeto salvo na nuvem' : 'Exemplo de inspiração'} em ${item.materialCategory || 'MDF'} ${thickness}mm (${metrics.widthMm}x${metrics.heightMm}mm).`,
        width_mm: metrics.widthMm,
        height_mm: metrics.heightMm,
        thickness_mm: thickness,
        cutLength_mm: metrics.totalCutLengthMm,
        engraveArea_cm2: metrics.engraveAreaCm2,
        materialName: `${item.materialCategory || 'MDF'} Cru ${thickness},0 mm`,
        model3dType: (item.source === 'parametric_box' ? 'caixa-fingerjoint' : 'mandala-camadas') as any,
        partsCount: metrics.elementCount,
        aiPromptUsed: `Projeto vetorial CNC ${item.name}`,
        svgString: ensureSvgMetadataBlock(item.svgContent, thickness, 0.15),
        estimatedLaserSeconds: Math.max(15, Math.round((item.cutLengthMm || metrics.totalCutLengthMm || 1000) / 25)),
        metadata: createStandardMetadataBlock(thickness, 0.15)
      };
    });
  }, [projects, user, selectedMachine]);

  // Currently active generated artifact
  const [currentArtifact, setCurrentArtifact] = useState<GeneratedVectorArtifact>(READY_EXAMPLES[0]);
  const [hasSelectedArtifact, setHasSelectedArtifact] = useState(false);

  const currentSpeed = selectedMaterial.speedsByMachine.find(speed => speed.machineId === selectedMachine.id);
  const currentProcessSeconds = currentSpeed ? Math.ceil(calcLaserCutTimeAndCost(
    currentArtifact.cutLength_mm, currentSpeed.cutSpeed_mms, 0, currentArtifact.engraveArea_cm2,
    currentSpeed.engraveSpeed_mms, currentSpeed.lineInterval_mm).totalSeconds) : null;

  // Three.js interactive 3D assembly mount
  const mount3dRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const partsRef = useRef<{ name: string; mesh: THREE.Object3D; explodeVector: THREE.Vector3; basePos: THREE.Vector3 }[]>([]);
  const explodeSliderRef = useRef<number>(explodeSlider);
  useEffect(() => {
    explodeSliderRef.current = explodeSlider;
  }, [explodeSlider]);

  // Setup Three.js Scene for the 3D model
  useEffect(() => {
    if (!hasSelectedArtifact || activeViewMode !== '3d' || !mount3dRef.current) return;
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

    // Build the 3D model parts based on model3dType and SVG geometric assembly
    const mats = createLaserMaterials(selectedFinish, false);
    let modelResult;
    try {
      modelResult = buildGeometricAssembly(
        currentArtifact.svgString,
        currentArtifact.thickness_mm,
        currentArtifact.model3dType,
        mats,
        currentArtifact.title
      );
      setModelError(null);
    } catch (error) {
      setModelError(error instanceof Error ? error.message : 'Não foi possível construir o modelo 3D.');
      modelResult = { group: new THREE.Group(), parts: [] };
    }
    scene.add(modelResult.group);
    modelGroupRef.current = modelResult.parts.length ? modelResult.group : null;
    if (modelResult.parts.length) {
      const size = new THREE.Box3().setFromObject(modelResult.group).getSize(new THREE.Vector3());
      const radius = Math.max(size.x, size.y, size.z, 2);
      controls.target.set(0, 0, 0);
      camera.position.set(radius * 0.3, radius * 0.3, radius * 1.6);
      controls.minDistance = radius * 0.1; controls.maxDistance = radius * 6;
    }

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
      controls.dispose();
      scene.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach(material => material.dispose());
        }
      });
      modelGroupRef.current = null;
      renderer.dispose();
    };
  }, [hasSelectedArtifact, activeViewMode, currentArtifact, selectedFinish]);

  // Handle Photo Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFileName(file.name);
      const reader = new FileReader();
      reader.onload = ev => {
        setUploadedImage(ev.target?.result as string);
        triggerToast(`Imagem "${file.name}" carregada. Clique em "Traçar silhueta" para gerar o contorno.`);
      };
      reader.readAsDataURL(file);
    }
  };

  // AI Prompt Enhancer: transforms simple user ideas into rigorous CAD/CAM prompts
  const handleEnhancePrompt = async () => {
    setIsProcessing(true);
    setProcessingStep('Acrescentando parâmetros técnicos ao texto...');
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
        setProcessingStep('2/3 Traçando o contorno da imagem...');
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
          img.src = uploadedImage;
        });
        if (!img.naturalWidth || !img.naturalHeight || !Number.isFinite(targetWidth) || targetWidth <= 0) throw new Error('Informe uma largura válida para a imagem.');
        const scale = Math.min(1, 384 / Math.max(img.naturalWidth, img.naturalHeight));
        const pixelWidth = Math.max(2, Math.round(img.naturalWidth * scale));
        const pixelHeight = Math.max(2, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('O navegador não oferece leitura de pixels da imagem.');
        context.drawImage(img, 0, 0, pixelWidth, pixelHeight);
        const rgba = context.getImageData(0, 0, pixelWidth, pixelHeight).data;
        const traced = traceBinaryMask(binaryMaskFromRgba(rgba, pixelWidth, pixelHeight), pixelWidth, pixelHeight);
        calculatedWidth = targetWidth;
        calculatedHeight = Math.round((pixelHeight / pixelWidth) * calculatedWidth * 100) / 100;
        const thickness = selectedMaterial?.thickness_mm || 3.0;
        artifactThickness = thickness;
        artifactMetadata = createStandardMetadataBlock(thickness, kerfCompensation);
        const rawSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pixelWidth} ${pixelHeight}" width="${calculatedWidth}mm" height="${calculatedHeight}mm" data-thickness-mm="${thickness}">${traced.paths.map(path => `<path d="${path}" fill="none" stroke="#FF0000" stroke-width="0.5" data-layer="cut" />`).join('')}</svg>`;
        finalSvg = ensureSvgMetadataBlock(rawSvg, thickness, kerfCompensation);
        generatedTitle = `Vetorizado: ${uploadedFileName.replace(/\.[^/.]+$/, '')}`;
      } else {
        setProcessingStep('2/3 Construindo modelo geométrico local...');
        const result = await generateCncVector(
          promptText,
          includeEngraving ? 'cut_engrave' : 'cut_only',
          selectedMachine.type === 'Router' ? 'router' : 'laser',
          targetWidth,
          targetHeight
        );
        artifactThickness = result.materialThickness_mm || result.recommendedThicknessMm || selectedMaterial?.thickness_mm || 3.0;
        finalSvg = ensureSvgMetadataBlock(result.svgContent, artifactThickness, kerfCompensation);
        generatedTitle = result.title;
        calculatedWidth = result.widthMm;
        calculatedHeight = result.heightMm;
        setTargetWidth(result.widthMm);
        setTargetHeight(result.heightMm);
        artifactMetadata = result.metadata || createStandardMetadataBlock(artifactThickness, kerfCompensation);
      }

      setProcessingStep('3/3 Calculando métricas de corte, kerf e G-code...');
      const metrics = calculateSvgMetrics(finalSvg);
      const lowerPrompt = promptText.toLowerCase();
      const detectedModel3d = lowerPrompt.includes('luminaria')
        ? 'luminaria-geometrica'
        : lowerPrompt.includes('caixa') || lowerPrompt.includes('organizador')
        ? 'caixa-fingerjoint'
        : lowerPrompt.includes('mandala') || lowerPrompt.includes('flor') || lowerPrompt.includes('porta-copo') || lowerPrompt.includes('hexagon')
        ? 'mandala-camadas'
        : lowerPrompt.includes('trofeu') || lowerPrompt.includes('troféu')
        ? 'trofeu-acrilico'
        : 'padrao';

      const newArtifact: GeneratedVectorArtifact = {
        id: 'gen-' + Date.now(),
        title: generatedTitle,
        description: `Modelo geométrico para revisão técnica. Espessura do material: ${artifactThickness}mm. Confira dimensões, contornos e parâmetros antes de usar na máquina.`,
        width_mm: calculatedWidth,
        height_mm: calculatedHeight,
        thickness_mm: artifactThickness,
        cutLength_mm: metrics.totalCutLengthMm,
        engraveArea_cm2: metrics.engraveAreaCm2,
        materialName: selectedMaterial.name,
        model3dType: detectedModel3d,
        partsCount: metrics.elementCount,
        svgString: finalSvg,
        estimatedLaserSeconds: Math.round(metrics.totalCutLengthMm / 25) + 15,
        aiPromptUsed: promptText,
        metadata: artifactMetadata
      };

      setCurrentArtifact(newArtifact);
      setHasSelectedArtifact(true);
      setActiveViewMode('3d');
      setExplodeSlider(0);
      triggerToast('Modelo vetorial criado, extrudado e montado em 3D com sucesso!');
    } catch (e) {
      console.warn('Erro na geração:', e);
      triggerToast(e instanceof Error ? `Falha na geração: ${e.message}` : 'Não foi possível gerar o projeto.');
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
    if (!onSendTo3D) { triggerToast('Estúdio 3D indisponível.'); return; }
    onSendTo3D(currentArtifact);
  };

  const handleSendToNestingAction = () => {
    try {
      if (!onSendToNesting) throw new Error('Nesting indisponível.');
      const svgContent = buildFabricationSvg();
      const metrics = calculateSvgMetrics(svgContent);
      onSendToNesting({ name: currentArtifact.title, width: metrics.widthMm, height: metrics.heightMm,
        cutLength_mm: metrics.totalCutLengthMm, svgContent, quantity: 1 });
    } catch (error) { triggerToast(error instanceof Error ? error.message : 'Falha ao enviar o desenho para o nesting.'); }
  };

  const buildFabricationSvg = () => applyKerfToSvg(currentArtifact.svgString, kerfCompensation);

  const buildCurrentGcode = () => {
    const speeds = selectedMaterial.speedsByMachine.find(s => s.machineId === selectedMachine.id);
    if (!speeds) throw new Error('Cadastre os parâmetros deste material para a máquina selecionada.');
    return generateGcodeFromSvg(buildFabricationSvg(), {
      machineType: selectedMachine.type,
      feedRate_mms: speeds.cutSpeed_mms,
      powerOrRpm: selectedMachine.type === 'Router' ? 18000 : speeds.cutPower_pct * 10,
      engraveFeedRate_mms: speeds.engraveSpeed_mms,
      engravePower: speeds.engravePower_pct * 10,
      depthMm: currentArtifact.thickness_mm,
      stepDownMm: 1.5, safeZMm: 5,
      maxXmm: selectedMachine.workAreaX_mm, maxYmm: selectedMachine.workAreaY_mm
    });
  };

  const handleSendToCamAction = () => {
    try {
      if (!onSendToCam) throw new Error('Otimizador CAM indisponível.');
      onSendToCam(buildCurrentGcode(), selectedMachine.type === 'Router' ? 'router' : 'laser');
    } catch (error) { triggerToast(error instanceof Error ? error.message : 'Falha ao preparar o programa CNC.'); }
  };

  const handleSendToQuoteAction = () => {
    try {
      if (!onSendToQuote) throw new Error('Orçamentos indisponíveis.');
      const metrics = calculateSvgMetrics(currentArtifact.svgString);
      if (metrics.totalCutLengthMm <= 0) throw new Error('O desenho não contém contornos de corte válidos.');
      onSendToQuote({
        description: `${currentArtifact.title} (${metrics.widthMm}x${metrics.heightMm}mm em ${selectedMaterial.name})`,
        materialId: selectedMaterial.id,
        cutLength_mm: metrics.totalCutLengthMm,
        engraveArea_cm2: metrics.engraveAreaCm2,
        machineId: selectedMachine.id,
        width_mm: metrics.widthMm,
        height_mm: metrics.heightMm,
        quantity: 1
      });
      triggerToast('Item enviado ao rascunho de orçamento. Complete os dados do cliente.');
    } catch (error) {
      triggerToast(error instanceof Error ? error.message : 'Falha ao enviar o desenho para orçamento.');
    }
  };

  const customOpRequests = useRef(new Map<string, { id: string; sku: string }>());
  const [isCreatingOp, setIsCreatingOp] = useState(false);
  const handleSendToProductionAction = async () => {
    if (currentProcessSeconds === null) { triggerToast('Cadastre velocidades do material antes de criar a ordem.'); return; }
    if (!onSendToProduction || isCreatingOp) return;
    setIsCreatingOp(true);
    try {
      if (!customOpRequests.current.has(currentArtifact.id)) customOpRequests.current.set(currentArtifact.id, { id: `op-${crypto.randomUUID()}`, sku: `CUSTOM-${crypto.randomUUID()}` });
      const request = customOpRequests.current.get(currentArtifact.id)!;
      await onSendToProduction({
        id: request.id,
        sku: request.sku,
        productName: currentArtifact.title,
        quantityRequested: 1,
        materialName: selectedMaterial.name,
        laserTimeEstimatedMin: Math.ceil(currentProcessSeconds / 60),
        machineId: selectedMachine.id,
        priority: 'Alta'
      });
      customOpRequests.current.delete(currentArtifact.id);
      triggerToast('OP sob encomenda confirmada no Kanban. Ela não altera o estoque do catálogo.');
    } catch (error) { triggerToast(error instanceof Error ? error.message : 'Não foi possível criar a OP.'); }
    finally { setIsCreatingOp(false); }
  };

  const handleSaveToFirestore = async () => {
    if (!isAuthenticated || !user) {
      triggerToast('Conecte sua conta Google na barra lateral para salvar projetos na nuvem.');
      return;
    }
    try {
      const existingProject = projects.find(project => project.id === currentArtifact.id);
      const projId = existingProject ? existingProject.id : `proj-${crypto.randomUUID()}`;
      const metrics = calculateSvgMetrics(currentArtifact.svgString);
      if (metrics.totalCutLengthMm <= 0) throw new Error('O desenho não contém contornos de corte válidos.');
      await syncProjectMutation({
        id: projId,
        name: currentArtifact.title || 'Projeto CNC Vetorial',
        ownerId: user.uid,
        svgContent: currentArtifact.svgString,
        widthMm: metrics.widthMm,
        heightMm: metrics.heightMm,
        cutLengthMm: metrics.totalCutLengthMm,
        engraveAreaCm2: metrics.engraveAreaCm2,
        materialCategory: selectedMaterial?.category || 'MDF',
        recommendedThicknessMm: currentArtifact.thickness_mm || 3,
        source: existingProject?.source || (uploadedImage && currentArtifact.id.startsWith('gen-') ? 'image_trace' : 'local_vector')
      });
      triggerToast('Projeto salvo na nuvem Firestore com sucesso!');
    } catch (err) {
      console.error('Erro ao salvar projeto no Firestore:', err);
      triggerToast('Falha ao salvar projeto na nuvem.');
    }
  };

  const handleLoadCloudProject = (proj: FirestoreProject) => {
    try {
    const metrics = calculateSvgMetrics(proj.svgContent);
    const loaded: GeneratedVectorArtifact = {
      id: proj.id,
      title: proj.name,
      description: `Projeto recuperado do Firestore. Espessura recomendada: ${proj.recommendedThicknessMm || 3}mm.`,
      width_mm: metrics.widthMm,
      height_mm: metrics.heightMm,
      thickness_mm: proj.recommendedThicknessMm || 3,
      cutLength_mm: metrics.totalCutLengthMm,
      engraveArea_cm2: metrics.engraveAreaCm2,
      materialName: proj.materialCategory || selectedMaterial.name,
      model3dType: proj.name.toLowerCase().includes('luminaria')
        ? 'luminaria-geometrica'
        : proj.name.toLowerCase().includes('caixa')
        ? 'caixa-fingerjoint'
        : 'padrao',
      partsCount: metrics.elementCount,
      svgString: proj.svgContent,
      estimatedLaserSeconds: Math.round((proj.cutLengthMm || 1000) / 25) + 15,
      aiPromptUsed: proj.name
    };
    setCurrentArtifact(loaded);
    setHasSelectedArtifact(true);
    setActiveViewMode('3d');
    setExplodeSlider(0);
    triggerToast(`Projeto "${proj.name}" carregado no estúdio!`);
    } catch (error) { triggerToast(error instanceof Error ? error.message : 'Falha ao carregar o projeto.'); }
  };

  const handleDeleteCloudProject = async (proj: FirestoreProject) => {
    if (deletingProjectId || !window.confirm(`Excluir o projeto "${proj.name}" da nuvem?`)) return;
    setDeletingProjectId(proj.id);
    try {
      await deleteProjectMutation(proj.id);
      triggerToast(`Projeto "${proj.name}" excluído da nuvem.`);
    } catch (error) {
      triggerToast(error instanceof Error ? error.message : 'Falha ao excluir o projeto.');
    } finally {
      setDeletingProjectId(null);
    }
  };

  const handleDownloadSvg = () => {
    try {
    const blob = new Blob([buildFabricationSvg()], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cnc_vetor_${currentArtifact.width_mm}x${currentArtifact.height_mm}mm.svg`;
    a.click();
    URL.revokeObjectURL(url);
    triggerToast('SVG baixado com compensação geométrica de kerf.');
    } catch (error) { triggerToast(error instanceof Error ? error.message : 'Falha ao exportar SVG.'); }
  };

  const handleDownloadDxf = () => {
    try {
    const dxfString = convertSvgToDxf(buildFabricationSvg());
    const blob = new Blob([dxfString], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vetor_cnc_${currentArtifact.width_mm}x${currentArtifact.height_mm}mm.dxf`;
    a.click();
    URL.revokeObjectURL(url);
    triggerToast('Arquivo DXF (AutoCAD R12) baixado com camadas de corte/gravação!');
    } catch (error) { triggerToast(error instanceof Error ? error.message : 'Falha ao exportar DXF.'); }
  };

  const handleDownloadStl = () => {
    try {
      const model = build3DFromSvg(currentArtifact.svgString, currentArtifact.thickness_mm, createLaserMaterials(selectedFinish, false));
      if (!model.parts.length) throw new Error('O desenho não contém peças sólidas para exportar.');
      exportSceneGroupToStl(model.group, `modelo_3d_${currentArtifact.width_mm}x${currentArtifact.height_mm}mm.stl`, 10);
      triggerToast('Arquivo STL gerado dos contornos do SVG para revisão antes da fabricação.');
    } catch (error) {
      triggerToast(error instanceof Error ? error.message : 'Falha ao exportar STL.');
    }
  };

  const handleDownloadGcode = () => {
    try {
    const blob = new Blob([buildCurrentGcode()], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `programa_cnc_${currentArtifact.width_mm}x${currentArtifact.height_mm}mm.nc`;
    a.click();
    URL.revokeObjectURL(url);
    triggerToast('Programa G-code (.nc) baixado para revisão no CAM. Perfil laser: S máximo 1000.');
    } catch (error) { triggerToast(error instanceof Error ? error.message : 'Falha ao exportar G-code.'); }
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
              <h1 className="text-base font-bold text-slate-900">Estúdio Vetorial</h1>

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
                        setHasSelectedArtifact(true);
                        setActiveViewMode('3d');
                        setExplodeSlider(0);
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
                  1. Criar desenho
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
                      <Sparkles className="w-3 h-3 text-amber-600" /> Acrescentar parâmetros
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
                    Imagem para traçar silhueta:
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
                        Use desenho de alto contraste. Revise o contorno antes de fabricar.
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
                              onClick={() => { void handleDeleteCloudProject(proj); }}
                              disabled={deletingProjectId !== null}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer disabled:opacity-40"
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
                      <span>{inputMode === 'upload' ? 'Traçar silhueta' : 'Gerar modelo geométrico local'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive 3D Assembly + 2D Flat Pattern Viewport */}
          <div className="lg:col-span-7 space-y-5">
            {hasSelectedArtifact ? <>
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Box className="w-4 h-4 text-amber-600" />
                    {currentArtifact.title}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {currentArtifact.partsCount} elementos vetoriais • {currentArtifact.width_mm} × {currentArtifact.height_mm} mm • Espessura {currentArtifact.thickness_mm} mm ({currentArtifact.materialName})
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

              {modelError && <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{modelError}</div>}
              {/* Viewport Area */}
              {activeViewMode === '3d' ? (
                <div className="space-y-3">
                  <div
                    ref={mount3dRef}
                    className="w-full h-80 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden relative cursor-grab active:cursor-grabbing shadow-inner"
                  >
                    <div className="absolute top-2.5 left-2.5 bg-white/95 border border-slate-200/90 px-2.5 py-1 rounded-lg text-[10px] font-mono text-slate-700 shadow-xs flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span>{partsRef.current.length} peças extrudadas do SVG</span>
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
                      dangerouslySetInnerHTML={{ __html: sanitizeSvg(currentArtifact.svgString) }}
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
                    {currentProcessSeconds === null ? 'Configure velocidades' : `${Math.floor(currentProcessSeconds / 60)}m ${currentProcessSeconds % 60}s`}
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
                    {currentArtifact.engraveArea_cm2.toFixed(2)} cm²
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
                  Revise o projeto antes de fabricar
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
                    <span className="text-[10px] text-slate-500">Visualizar este SVG em 3D</span>
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
                    <span className="font-bold text-slate-900 block text-xs">Diagnóstico CAM</span>
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
                  disabled={isCreatingOp}
                  className="p-3 rounded-xl border border-slate-200 hover:border-amber-400 bg-slate-50 hover:bg-amber-50/50 text-left transition flex flex-col justify-between group cursor-pointer disabled:opacity-50"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <Clock className="w-4 h-4 text-purple-600" />
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-600 transition" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 block text-xs">{isCreatingOp ? 'Confirmando OP…' : 'Lançar OP de Fábrica'}</span>
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
            </> : (
              <div className="flex min-h-80 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Nenhum desenho aberto</h3>
                  <p className="mt-2 text-xs text-slate-500">Gere um vetor, abra um projeto salvo ou escolha um exemplo na Galeria de Inspiração.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
