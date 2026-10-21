import type { NestingTransfer } from '../../utils/nestingEngine';
import { sanitizeSvg } from '../../utils/sanitizeSvg';
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  LaserMaterialFinish,
  createLaserMaterials,
  buildFingerJointBox,
  buildTrophyModel,
  buildLaptopStand,
  buildLayeredMandala,
  buildIcosahedronLamp,
  buildHeadphoneStand
} from './LaserModel3D';
import { generateCncVector } from '../../services/geminiCncService';
import { convertSvgToDxf, calculateSvgMetrics, exportSceneGroupToStl } from '../../utils/cncExporters';
import { buildRouterHeightmapRelief } from './LaserModel3D';
import { useFirebase } from '../../services/firebase/FirebaseContext';
import { FirestoreProject } from '../../services/firebase/firebase';
import {
  Box,
  Layers,
  Sparkles,
  Download,
  Eye,
  RotateCcw,
  Sliders,
  ChevronDown,
  ChevronUp,
  Cpu,
  Scissors,
  CheckCircle2,
  FileCode,
  UploadCloud,
  Trash2,
  Cloud,
  FolderOpen
} from 'lucide-react';

interface DesignStudioProps {
  initialModel?: string;
  onSendToNesting?: (part: NestingTransfer) => void;
  onSendToQuote?: (part: { description: string; cutLength_mm: number; materialCategory: string }) => void;
}

export const DesignStudioView: React.FC<DesignStudioProps> = ({ onSendToNesting, initialModel }) => {
  const mountRef = useRef<HTMLDivElement>(null);

  // Studio UI State
  const [activeTab, setActiveTab] = useState<'3d-assembly' | 'ai-vectorizer' | 'my-designs'>('3d-assembly');
  const [selectedModel, setSelectedModel] = useState<
    'caixa-fingerjoint' | 'trofeu-acrilico' | 'suporte-notebook' | 'mandala-camadas' | 'luminaria-geometrica' | 'suporte-fone'
  >('caixa-fingerjoint');
  useEffect(() => {
    const models = ['caixa-fingerjoint', 'trofeu-acrilico', 'suporte-notebook', 'mandala-camadas', 'luminaria-geometrica', 'suporte-fone'] as const;
    const model = models.find(m => m === initialModel);
    if (model) setSelectedModel(model);
  }, [initialModel]);
  const [finish, setFinish] = useState<LaserMaterialFinish>('mdf-cru');
  const [explodeSlider, setExplodeSlider] = useState<number>(0);
  const [showKerf, setShowKerf] = useState<boolean>(true);
  const [isDockCollapsed, setIsDockCollapsed] = useState<boolean>(false);
  const [activeCameraView, setActiveCameraView] = useState<'iso' | 'top' | 'front' | 'side'>('iso');
  const [isAutoRotating, setIsAutoRotating] = useState(false);
  const [wireframeMode, setWireframeMode] = useState(false);
  const [showGridFloor, setShowGridFloor] = useState(true);
  const [lightIntensity, setLightIntensity] = useState(2.5);

  // AI Vectorizer State
  const [aiPrompt, setAiPrompt] = useState<string>('Caixa decorativa com encaixes finger joint e tampa de correr vazada');
  const [aiThickness, setAiThickness] = useState<number>(3.0);
  const [aiKerf, setAiKerf] = useState<number>(0.15);
  const [isGeneratingAi, setIsGeneratingAi] = useState<boolean>(false);
  const [generationSuccess, setGenerationSuccess] = useState<boolean>(false);
  const [currentDesignTitle, setCurrentDesignTitle] = useState<string>('Caixa Organizadora CNC com Encaixes Finger-Joint (MDF 3mm)');
  const [generatedSvgContent, setGeneratedSvgContent] = useState<string>('');
  
  // Firebase Cloud Integration
  const { user, isAuthenticated, projects, syncProjectMutation, deleteProjectMutation } = useFirebase();
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Three.js refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const partsRef = useRef<{ name: string; mesh: THREE.Object3D; explodeVector: THREE.Vector3; basePos: THREE.Vector3 }[]>([]);
  const targetExplodeRef = useRef<number>(0);
  const currentExplodeRef = useRef<number>(0);

  // Initialize Three.js scene with bright clean industrial studio environment
  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight || 550;

    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.replaceChildren(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    // Modern Light Studio Background
    scene.background = new THREE.Color(0xf1f5f9);
    scene.fog = new THREE.Fog(0xf1f5f9, 35, 75);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(22, 18, 26);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 + 0.02;
    controls.minDistance = 6;
    controls.maxDistance = 60;
    controls.target.set(0, 4, 0);
    controlsRef.current = controls;

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // Studio Lighting Rig
    const warmKeyLight = new THREE.DirectionalLight(0xfff8ee, 2.5);
    warmKeyLight.name = "studio-key-light";
    warmKeyLight.position.set(16, 28, 18);
    warmKeyLight.castShadow = !isSoftwareGl;
    warmKeyLight.shadow.mapSize.width = 1024;
    warmKeyLight.shadow.mapSize.height = 1024;
    warmKeyLight.shadow.bias = -0.0005;
    warmKeyLight.shadow.normalBias = 0.02;
    scene.add(warmKeyLight);

    const coolFillLight = new THREE.HemisphereLight(0xffffff, 0xe2e8f0, 1.4);
    scene.add(coolFillLight);

    const rimLight = new THREE.DirectionalLight(0xbae6fd, 1.2);
    rimLight.position.set(-18, 12, -20);
    scene.add(rimLight);

    // Light Floor Grid
    const gridHelper = new THREE.GridHelper(40, 40, 0x94a3b8, 0xe2e8f0);
    gridHelper.name = "studio-grid-helper";
    gridHelper.position.y = -0.01;
    scene.add(gridHelper);

    // Soft radial contact shadow
    const shadowGeo = new THREE.PlaneGeometry(30, 30);
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 256;
    shadowCanvas.height = 256;
    const sCtx = shadowCanvas.getContext('2d')!;
    const grad = sCtx.createRadialGradient(128, 128, 10, 128, 128, 128);
    grad.addColorStop(0, 'rgba(15, 23, 42, 0.45)');
    grad.addColorStop(0.5, 'rgba(15, 23, 42, 0.15)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    sCtx.fillStyle = grad;
    sCtx.fillRect(0, 0, 256, 256);

    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.5
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.01;
    scene.add(shadowMesh);

    let animationFrameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();

      currentExplodeRef.current = THREE.MathUtils.damp(
        currentExplodeRef.current,
        targetExplodeRef.current,
        8,
        delta
      );

      const explodeVal = currentExplodeRef.current;
      partsRef.current.forEach(p => {
        p.mesh.position.set(
          p.basePos.x + p.explodeVector.x * explodeVal,
          p.basePos.y + p.explodeVector.y * explodeVal,
          p.basePos.z + p.explodeVector.z * explodeVal
        );
      });

      controls.update();
      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight || 550;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      scene.clear();
    };
  }, []);

  // Update 3D Model
  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;

    const existingGroup = scene.getObjectByName('laser-model-root');
    if (existingGroup) {
      scene.remove(existingGroup);
    }

    const materials = createLaserMaterials(finish, false);

    let modelResult;
    if (selectedModel === 'caixa-fingerjoint') {
      modelResult = buildFingerJointBox(materials);
      setCurrentDesignTitle('Caixa Organizadora CNC com Encaixes Finger-Joint (MDF 3mm)');
    } else if (selectedModel === 'trofeu-acrilico') {
      modelResult = buildTrophyModel(materials);
      setCurrentDesignTitle('Troféu Lapidado CNC com Base em MDF e Acrílico Cristal');
    } else if (selectedModel === 'suporte-notebook') {
      modelResult = buildLaptopStand(materials);
      setCurrentDesignTitle('Suporte Ergonômico de Notebook 25° (Compensado/MDF 6mm)');
    } else if (selectedModel === 'mandala-camadas') {
      modelResult = buildLayeredMandala(materials);
      setCurrentDesignTitle('Mandala Floral Multicamadas 3D (MDF/Acrílico 3mm)');
    } else if (selectedModel === 'luminaria-geometrica') {
      modelResult = buildIcosahedronLamp(materials);
      setCurrentDesignTitle('Luminária Pendente Nervurada E27 (MDF 3mm)');
    } else if (selectedModel === 'suporte-fone') {
      modelResult = buildHeadphoneStand(materials);
      setCurrentDesignTitle('Suporte para Headphone com Base e Trava (MDF 6mm)');
    } else {
      modelResult = buildFingerJointBox(materials);
      setCurrentDesignTitle('Caixa Organizadora CNC com Encaixes Finger-Joint (MDF 3mm)');
    }

    modelResult.group.name = 'laser-model-root';
    scene.add(modelResult.group);

    partsRef.current = modelResult.parts.map(p => ({
      name: p.name,
      mesh: p.mesh,
      explodeVector: p.explodeVector,
      basePos: p.mesh.position.clone()
    }));

    targetExplodeRef.current = explodeSlider;
  }, [selectedModel, finish]);

  useEffect(() => {
    targetExplodeRef.current = explodeSlider;
  }, [explodeSlider]);

  useEffect(() => {
    if (!sceneRef.current) return;
    const kerfObj = sceneRef.current.getObjectByName('kerf-indicator');
    if (kerfObj) {
      kerfObj.visible = showKerf;
    }
  }, [showKerf]);

  const setCameraPreset = (view: 'iso' | 'top' | 'front' | 'side') => {
    if (!cameraRef.current || !controlsRef.current) return;
    setActiveCameraView(view);
    const camera = cameraRef.current;
    const controls = controlsRef.current;

    switch (view) {
      case 'iso':
        camera.position.set(22, 18, 26);
        controls.target.set(0, 4, 0);
        break;
      case 'top':
        camera.position.set(0, 36, 0.1);
        controls.target.set(0, 0, 0);
        break;
      case 'front':
        camera.position.set(0, 5, 34);
        controls.target.set(0, 4, 0);
        break;
      case 'side':
        camera.position.set(34, 5, 0);
        controls.target.set(0, 4, 0);
        break;
    }
    controls.update();
  };

  const handleGenerateAiVector = async () => {
    setIsGeneratingAi(true);
    setGenerationSuccess(false);
    try {
      const result = await generateCncVector(aiPrompt, 'cut_engrave', 'laser');
      setGeneratedSvgContent(result.svgContent);
      setCurrentDesignTitle(result.title);
      setGenerationSuccess(true);
    } catch {
      // Fallback SVG with strict semantic layers (#FF0000 cut, #0000FF engrave) and metadata
      const fallback = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150" width="200mm" height="150mm" data-thickness-mm="3.0">
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
  <rect x="5" y="5" width="190" height="140" rx="4" fill="none" stroke="#FF0000" stroke-width="0.8" data-layer="cut" />
  <circle cx="100" cy="75" r="25" fill="none" stroke="#0000FF" stroke-width="0.5" stroke-dasharray="2,2" data-layer="engrave" />
  <text x="100" y="80" font-family="sans-serif" font-size="9" font-weight="bold" text-anchor="middle" fill="#0000FF">CNC APP JF</text>
</svg>`;
      setGeneratedSvgContent(fallback);
      setGenerationSuccess(true);
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const getActiveSvgString = () => {
    return generatedSvgContent || `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400mm" height="300mm">
  <rect x="10" y="10" width="180" height="120" rx="2" fill="none" stroke="#dc2626" stroke-width="0.8" data-layer="cut" />
  <circle cx="100" cy="70" r="15" fill="none" stroke="#dc2626" stroke-width="0.8" data-layer="cut" />
  <rect x="210" y="10" width="180" height="120" rx="2" fill="none" stroke="#dc2626" stroke-width="0.8" data-layer="cut" />
  <text x="100" y="115" font-family="sans-serif" font-size="8" fill="#2563eb" text-anchor="middle">KERF ${aiKerf}mm</text>
</svg>`;
  };

  const handleDownloadSvg = () => {
    const svgContent = getActiveSvgString();
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `corte_cnc_${selectedModel}_kerf_${aiKerf}mm.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadStl = () => {
    if (!sceneRef.current) return;
    const modelRoot = sceneRef.current.getObjectByName('laser-model-root');
    if (!modelRoot) {
      triggerToast('Nenhum modelo 3D carregado para exportar.');
      return;
    }
    exportSceneGroupToStl(modelRoot, `modelo_3d_${selectedModel}.stl`);
    triggerToast('Modelo 3D exportado em formato STL binário com sucesso!');
  };

  const handleCaptureScreenshot = () => {
    if (!rendererRef.current) return;
    const dataUrl = rendererRef.current.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `render_3d_${selectedModel}_${finish}.png`;
    a.click();
    triggerToast('Screenshot HD do modelo 3D baixada com sucesso!');
  };

  const toggleAutoRotate = () => {
    setIsAutoRotating(prev => !prev);
    if (controlsRef.current) {
      controlsRef.current.autoRotate = !isAutoRotating;
      controlsRef.current.autoRotateSpeed = 2.0;
    }
  };

  const toggleWireframe = () => {
    const nextWireframe = !wireframeMode;
    setWireframeMode(nextWireframe);
    if (sceneRef.current) {
      sceneRef.current.traverse(child => {
        if (child instanceof THREE.Mesh && child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => { m.wireframe = nextWireframe; });
          } else {
            child.material.wireframe = nextWireframe;
          }
        }
      });
    }
  };

  const toggleGridFloor = () => {
    const nextGrid = !showGridFloor;
    setShowGridFloor(nextGrid);
    if (sceneRef.current) {
      const grid = sceneRef.current.getObjectByName('studio-grid-helper');
      if (grid) grid.visible = nextGrid;
    }
  };

  const handleUpdateLightIntensity = (val: number) => {
    setLightIntensity(val);
    if (sceneRef.current) {
      const light = sceneRef.current.getObjectByName('studio-key-light') as THREE.DirectionalLight;
      if (light) light.intensity = val;
    }
  };

  const handleDownloadDxf = () => {
    const svgContent = getActiveSvgString();
    const dxfString = convertSvgToDxf(svgContent);
    const blob = new Blob([dxfString], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `corte_cnc_${selectedModel}.dxf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveDesign = async () => {
    const svgContent = getActiveSvgString();
    const projId = 'proj-' + Date.now();
    const title = currentDesignTitle || `Projeto CNC ${selectedModel}`;

    if (isAuthenticated && user) {
      try {
        await syncProjectMutation({
          id: projId,
          name: title,
          ownerId: user.uid,
          svgContent,
          widthMm: 400,
          heightMm: 300,
          cutLengthMm: 2450,
          materialCategory: finish.includes('acrilico') ? 'Acrílico' : 'MDF',
          recommendedThicknessMm: aiThickness,
          source: 'parametric_box'
        });
        triggerToast(`Projeto "${title}" salvo na nuvem Firestore!`);
      } catch (err) {
        console.error('Erro ao salvar projeto no Firestore:', err);
        triggerToast('Falha ao salvar projeto na nuvem.');
      }
    } else {
      triggerToast('Conecte sua conta Google na barra lateral para salvar projetos na nuvem.');
    }
  };

  const handleLoadCloudProject = (proj: FirestoreProject) => {
    setGeneratedSvgContent(proj.svgContent);
    setCurrentDesignTitle(proj.name);
    if (proj.recommendedThicknessMm) {
      setAiThickness(proj.recommendedThicknessMm);
    }
    setActiveTab('ai-vectorizer');
    triggerToast(`Projeto "${proj.name}" carregado com sucesso!`);
  };

  const handleDownloadProjectSvg = (proj: FirestoreProject) => {
    const blob = new Blob([proj.svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${proj.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-900 overflow-hidden">
      {/* Top Header Navigation */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-200 bg-white px-6 py-3.5 z-20">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-50 text-amber-700 border border-amber-200/60">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-900">Estúdio 3D & Vetorizador IA</h1>
              <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
                Kerf 0,15 mm Ativo
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Conferência tridimensional de encaixes finger-joint e geração vetorial paramétrica
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setActiveTab('3d-assembly')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === '3d-assembly'
                ? 'bg-white text-slate-900 shadow-sm font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Box className="w-3.5 h-3.5" />
            Conferência 3D
          </button>
          <button
            onClick={() => setActiveTab('ai-vectorizer')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'ai-vectorizer'
                ? 'bg-white text-slate-900 shadow-sm font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            Vetorizador IA
          </button>
          <button
            onClick={() => setActiveTab('my-designs')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'my-designs'
                ? 'bg-white text-slate-900 shadow-sm font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Meus Projetos
          </button>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadSvg}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg border border-slate-200 transition shadow-sm cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            .SVG
          </button>
          <button
            onClick={handleDownloadDxf}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg border border-slate-200 transition shadow-sm cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-amber-600" />
            .DXF R12
          </button>
          <button
            onClick={handleSaveDesign}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 transition cursor-pointer"
          >
            Salvar
          </button>
          {onSendToNesting && (
            <button
              onClick={() => {
                try {
                  const svgContent = getActiveSvgString();
                  const metrics = calculateSvgMetrics(svgContent);
                  onSendToNesting({ name: currentDesignTitle, width: metrics.widthMm, height: metrics.heightMm,
                    cutLength_mm: metrics.totalCutLengthMm, svgContent, quantity: 1 });
                } catch (error) { triggerToast(error instanceof Error ? error.message : 'Falha ao transferir o desenho.'); }
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg shadow-sm transition cursor-pointer"
            >
              <Scissors className="w-3.5 h-3.5" />
              Nesting de Chapa
            </button>
          )}
        </div>
      </div>

      {/* Main Tab View */}
      {activeTab === '3d-assembly' && (
        <div className="relative flex-1 w-full h-full overflow-hidden bg-slate-100">
          {/* Top-Left Model Badge */}
          <div className="absolute top-4 left-4 z-10 pointer-events-auto flex flex-col gap-2">
            <div className="bg-white/95 border border-slate-200 rounded-2xl p-4 shadow-lg backdrop-blur-md min-w-[260px]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">
                  Modelo 3D Ativo
                </span>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono font-bold">
                  {selectedModel === 'caixa-fingerjoint' && '7 Partes CNC'}
                  {selectedModel === 'trofeu-acrilico' && '5 Partes Mistas'}
                  {selectedModel === 'suporte-notebook' && '3 Partes Encaixáveis'}
                  {selectedModel === 'mandala-camadas' && '4 Camadas 3D'}
                  {selectedModel === 'luminaria-geometrica' && '14 Aletas CNC'}
                  {selectedModel === 'suporte-fone' && '3 Componentes'}
                </span>
              </div>
              <select
                value={selectedModel}
                onChange={e => setSelectedModel(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none focus:border-amber-500"
              >
                <option value="caixa-fingerjoint">Caixa Finger-Joint com Tampa (MDF 3mm)</option>
                <option value="trofeu-acrilico">Troféu Cristal Lapidado & Base MDF</option>
                <option value="suporte-notebook">Suporte Ergonômico de Notebook 25° (MDF 6mm)</option>
                <option value="mandala-camadas">Mandala Floral Multicamadas 3D (MDF 3mm)</option>
                <option value="luminaria-geometrica">Luminária Pendente Nervurada E27 (MDF 3mm)</option>
                <option value="suporte-fone">Suporte para Headphone com Trava (MDF 6mm)</option>
              </select>

              <div className="mt-2.5 pt-2.5 border-t border-slate-100 text-[11px] text-slate-500 space-y-1">
                <div className="flex justify-between">
                  <span>Compensação Kerf:</span>
                  <span className="text-amber-700 font-mono font-bold">+0,075 mm / lado</span>
                </div>
                <div className="flex justify-between">
                  <span>Encaixe:</span>
                  <span className="text-emerald-700 font-semibold">Interferência Justa</span>
                </div>
              </div>
            </div>
          </div>

          {/* Top-Right Camera Controls */}
          <div className="absolute top-4 right-4 z-10 pointer-events-auto flex items-center gap-1 bg-white/95 border border-slate-200 p-1 rounded-xl shadow-lg backdrop-blur-md">
            <span className="text-[11px] font-semibold text-slate-500 px-2">Câmera:</span>
            {(['iso', 'top', 'front', 'side'] as const).map(view => (
              <button
                key={view}
                onClick={() => setCameraPreset(view)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                  activeCameraView === view
                    ? 'bg-amber-500 text-white font-bold'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {view === 'iso' ? 'Isométrica' : view === 'top' ? 'Topo' : view === 'front' ? 'Frontal' : 'Lateral'}
              </button>
            ))}
          </div>

          {/* Three.js Canvas */}
          <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

          {/* Unified Collapsible Bottom Dock (Clean Light Theme) */}
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 w-full max-w-[940px] px-4 pointer-events-auto">
            <div className="flex justify-center -mb-2">
              <button
                onClick={() => setIsDockCollapsed(!isDockCollapsed)}
                className="flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 text-slate-600 hover:text-slate-900 rounded-t-lg text-xs font-semibold shadow-md transition"
              >
                {isDockCollapsed ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5 text-amber-600" />
                    Expandir Controles 3D
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5 text-amber-600" />
                    Minimizar Controles
                  </>
                )}
              </button>
            </div>

            {!isDockCollapsed && (
              <div className="bg-white/95 border border-slate-200 rounded-2xl p-4 shadow-xl backdrop-blur-md">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-center">
                  {/* Exploded View Slider */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-800 flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-amber-600" />
                        Vista Explodida (Desmonte 3D)
                      </span>
                      <span className="font-mono text-amber-700 font-bold">{Math.round(explodeSlider * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={explodeSlider}
                      onChange={e => setExplodeSlider(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500">
                      <span>Montada (0%)</span>
                      <span>Separada (100%)</span>
                    </div>
                  </div>

                  {/* Material Finishes */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold text-slate-800 block">Acabamento do Material:</span>
                    <div className="flex items-center gap-1.5">
                      {[
                        { id: 'mdf-cru', label: 'MDF Cru' },
                        { id: 'mdf-branco', label: 'MDF Branco' },
                        { id: 'acrilico-cristal', label: 'Acrílico' },
                        { id: 'compensado-pinus', label: 'Pinus' }
                      ].map(item => (
                        <button
                          key={item.id}
                          onClick={() => setFinish(item.id as any)}
                          className={`flex-1 py-1 px-1.5 rounded-lg text-[10px] font-semibold border transition ${
                            finish === item.id
                              ? 'bg-amber-500 text-white border-amber-600 shadow-sm'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-3 pt-1">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 select-none">
                      <input
                        type="checkbox"
                        checked={showKerf}
                        onChange={e => setShowKerf(e.target.checked)}
                        className="rounded border-slate-300 text-amber-500 focus:ring-0"
                      />
                      <span>Linha de Kerf</span>
                    </label>

                    <button
                      onClick={() => setExplodeSlider(explodeSlider === 0 ? 0.75 : 0)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-800 rounded-lg border border-slate-200 transition"
                    >
                      {explodeSlider > 0.1 ? 'Montar 3D' : 'Explodir 3D'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI Vectorizer Tab */}
      {activeTab === 'ai-vectorizer' && (
        <div className="flex-1 p-6 overflow-y-auto max-w-6xl mx-auto w-full">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-amber-600" />
                  Gerador Vetorial & Encaixes com IA
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Descreva o modelo CNC ou envie uma foto para gerar contornos de corte com compensação de folga paramétrica.
                </p>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Descrição do Produto:</label>
                  <textarea
                    rows={3}
                    value={aiPrompt}
                    onChange={e => setAiPrompt(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="border-2 border-dashed border-slate-200 hover:border-slate-300 rounded-xl p-4 text-center cursor-pointer transition">
                  <UploadCloud className="w-6 h-6 text-slate-400 mx-auto mb-1.5" />
                  <p className="text-xs font-medium text-slate-700">Envie foto da peça pronta ou rascunho</p>
                  <p className="text-[10px] text-slate-400">PNG, JPG ou WebP até 10MB</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 block mb-1">Espessura (mm)</label>
                    <select
                      value={aiThickness}
                      onChange={e => setAiThickness(parseFloat(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                    >
                      <option value={2.0}>2,0 mm</option>
                      <option value={3.0}>3,0 mm (Padrão)</option>
                      <option value={6.0}>6,0 mm</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 block mb-1">Kerf do Laser / Fresa</label>
                    <select
                      value={aiKerf}
                      onChange={e => setAiKerf(parseFloat(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-mono"
                    >
                      <option value={0.15}>0,15 mm (Laser)</option>
                      <option value={0.20}>0,20 mm</option>
                    </select>
                  </div>
                </div>

                <button
                  onClick={handleGenerateAiVector}
                  disabled={isGeneratingAi}
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isGeneratingAi ? (
                    <>
                      <RotateCcw className="w-4 h-4 animate-spin" />
                      Calculando Encaixes...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Gerar Vetor & Modelo 3D
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* 2D Vector Canvas */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <FileCode className="w-4 h-4 text-emerald-600" />
                    Prévia Vetorial 2D Gerada
                  </h3>
                  <p className="text-xs text-slate-500">
                    Linhas de corte em <span className="text-red-600 font-semibold">Vermelho</span> e gravação em{' '}
                    <span className="text-blue-600 font-semibold">Azul</span>
                  </p>
                </div>

                <button
                  onClick={handleDownloadSvg}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg border border-slate-200"
                >
                  <Download className="w-3.5 h-3.5 text-slate-600" /> Baixar SVG
                </button>
              </div>

              {/* Clean SVG Canvas */}
              <div className="w-full h-80 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center p-4 overflow-hidden">
                {generatedSvgContent ? (
                  <div
                    className="w-full h-full flex items-center justify-center"
                    dangerouslySetInnerHTML={{ __html: sanitizeSvg(generatedSvgContent) }}
                  />
                ) : (
                  <svg className="w-full h-full max-h-72" viewBox="0 0 500 300">
                    <rect width="500" height="300" fill="#f8fafc" />
                    <defs>
                      <pattern id="light-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" strokeWidth="0.8" />
                      </pattern>
                    </defs>
                    <rect width="500" height="300" fill="url(#light-grid)" />

                    <g transform="translate(30, 30)">
                      <rect x="0" y="0" width="160" height="110" rx="2" fill="none" stroke="#dc2626" strokeWidth="1.5" />
                      <circle cx="80" cy="55" r="12" fill="none" stroke="#dc2626" strokeWidth="1.5" />
                      <text x="8" y="100" fill="#64748b" fontSize="8" fontFamily="monospace">BASE_01 (160x110 mm)</text>
                    </g>

                    <g transform="translate(210, 30)">
                      <path
                        d="M 0 0 L 40 0 L 40 -6 L 60 -6 L 60 0 L 100 0 L 100 80 L 80 80 L 80 86 L 60 86 L 60 80 L 0 80 Z"
                        fill="none"
                        stroke="#dc2626"
                        strokeWidth="1.5"
                      />
                      <text x="10" y="45" fill="#64748b" fontSize="8" fontFamily="monospace">LATERAL_ESQ</text>
                    </g>

                    <g transform="translate(100, 160)">
                      <rect x="0" y="0" width="165" height="115" rx="3" fill="none" stroke="#dc2626" strokeWidth="1.5" />
                      <circle cx="82" cy="57" r="28" fill="none" stroke="#2563eb" strokeWidth="1" strokeDasharray="3 3" />
                      <text x="8" y="105" fill="#64748b" fontSize="8" fontFamily="monospace">TAMPA_SLIDE</text>
                    </g>
                  </svg>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* My Designs Tab - Conectada à Nuvem Firestore */}
      {activeTab === 'my-designs' && (
        <div className="flex-1 p-6 overflow-y-auto max-w-6xl mx-auto w-full space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Cloud className="w-5 h-5 text-amber-500" />
                Projetos Salvos na Nuvem Firestore
              </h2>
              <p className="text-xs text-slate-500">
                Sincronização em tempo real vinculada à sua conta de usuário
              </p>
            </div>
            <span className="text-xs text-slate-500 font-mono bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">
              {projects.length} {projects.length === 1 ? 'Projeto' : 'Projetos'} na Nuvem
            </span>
          </div>

          {projects.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm space-y-4">
              <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto border border-amber-200/80">
                <FolderOpen className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Nenhum projeto salvo na nuvem ainda</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                  {isAuthenticated
                    ? 'Crie geometrias no Vetorizador IA ou Estúdio 3D e clique no botão "Salvar" acima para sincronizar no Firestore.'
                    : 'Conecte sua conta Google na barra lateral para salvar e sincronizar seus projetos em tempo real com segurança.'}
                </p>
              </div>
              <button
                onClick={() => setActiveTab('ai-vectorizer')}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow-sm transition inline-flex items-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" /> Criar Primeiro Projeto
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {projects.map(proj => (
                <div key={proj.id} className="bg-white border border-slate-200 hover:border-amber-400 rounded-2xl p-5 shadow-sm transition space-y-3 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-bold text-slate-900 text-sm truncate" title={proj.name}>
                        {proj.name}
                      </h3>
                      <button
                        onClick={() => deleteProjectMutation(proj.id)}
                        className="text-slate-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition shrink-0 cursor-pointer"
                        title="Excluir projeto da nuvem"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {proj.materialCategory || 'MDF'} {proj.recommendedThicknessMm ? `• ${proj.recommendedThicknessMm}mm` : ''} • {proj.widthMm}x{proj.heightMm} mm
                    </p>
                  </div>

                  {/* SVG Thumbnail Preview */}
                  <div className="h-32 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-center p-2 overflow-hidden">
                    <div
                      className="w-full h-full flex items-center justify-center pointer-events-none"
                      dangerouslySetInnerHTML={{ __html: sanitizeSvg(proj.svgContent) }}
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                    <button
                      onClick={() => handleLoadCloudProject(proj)}
                      className="font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" /> Abrir no Vetorizador
                    </button>
                    <button
                      onClick={() => handleDownloadProjectSvg(proj)}
                      className="font-medium text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3 h-3" /> Baixar SVG
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xl border border-slate-800 text-xs font-semibold flex items-center gap-2 animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
