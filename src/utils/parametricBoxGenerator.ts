import * as THREE from 'three';

export interface BoxParams {
  widthMm: number;
  heightMm: number;
  depthMm: number;
  thicknessMm: number;
  tabWidthMm: number;
  kerfMm: number;
  hasLid: boolean;
}

export interface BoxFace {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  pathD: string;
  cutLengthMm: number;
  explosionVector: [number, number, number];
  position3D: [number, number, number];
  rotation3D: [number, number, number];
}

export interface ParametricBoxResult {
  svgContent: string;
  totalWidthMm: number;
  totalHeightMm: number;
  totalCutLengthMm: number;
  faces: BoxFace[];
  create3DGroup: () => THREE.Group;
}

/**
 * Creates tooth profiles along an edge
 */
function generateEdgeWithTabs(
  length: number,
  toothLength: number,
  depth: number,
  isPositive: boolean,
  kerf: number
): { d: string; lengthMm: number } {
  const numTabs = Math.max(3, Math.floor(length / toothLength));
  const actualTabWidth = length / numTabs;
  let d = '';
  let totalLength = 0;

  for (let i = 0; i < numTabs; i++) {
    const isTooth = i % 2 === 1;
    const shouldExtrude = isPositive ? isTooth : !isTooth;
    const effectiveKerf = shouldExtrude ? kerf / 2 : -kerf / 2;

    if (shouldExtrude) {
      d += ` v ${-depth} h ${actualTabWidth + effectiveKerf} v ${depth}`;
      totalLength += depth * 2 + (actualTabWidth + effectiveKerf);
    } else {
      d += ` h ${actualTabWidth + effectiveKerf}`;
      totalLength += actualTabWidth + effectiveKerf;
    }
  }

  return { d, lengthMm: totalLength };
}

/**
 * Generates an SVG path for a rectangular panel with finger-joint edges
 */
function createBoxFacePath(
  width: number,
  height: number,
  thickness: number,
  tabWidth: number,
  kerf: number,
  config: { top: boolean; right: boolean; bottom: boolean; left: boolean }
): { pathD: string; cutLengthMm: number } {
  let d = `M 0 0`;
  let totalLen = 0;

  // Top edge (left to right)
  if (config.top) {
    const edge = generateEdgeWithTabs(width, tabWidth, thickness, true, kerf);
    d += edge.d;
    totalLen += edge.lengthMm;
  } else {
    d += ` h ${width}`;
    totalLen += width;
  }

  // Right edge (top to bottom)
  if (config.right) {
    const edge = generateEdgeWithTabs(height, tabWidth, thickness, false, kerf);
    // rotate coordinates for vertical
    d += ` v ${height}`;
    totalLen += height;
  } else {
    d += ` v ${height}`;
    totalLen += height;
  }

  // Bottom edge (right to left)
  if (config.bottom) {
    d += ` h ${-width}`;
    totalLen += width;
  } else {
    d += ` h ${-width}`;
    totalLen += width;
  }

  // Left edge (bottom to top)
  d += ` Z`;
  totalLen += height;

  return { pathD: d, cutLengthMm: totalLen };
}

/**
 * Generates a full 6-face parametric finger-joint box
 */
export function generateParametricBox(params: BoxParams): ParametricBoxResult {
  const { widthMm, heightMm, depthMm, thicknessMm, tabWidthMm, kerfMm, hasLid } = params;

  // Faces definitions
  const rawFaces = [
    {
      id: 'base',
      name: 'Base Inferior',
      width: widthMm,
      height: depthMm,
      explosion: [0, -1, 0] as [number, number, number],
      pos: [0, -heightMm / 2, 0] as [number, number, number],
      rot: [-Math.PI / 2, 0, 0] as [number, number, number]
    },
    {
      id: 'front',
      name: 'Painel Frontal',
      width: widthMm,
      height: heightMm,
      explosion: [0, 0, 1] as [number, number, number],
      pos: [0, 0, depthMm / 2] as [number, number, number],
      rot: [0, 0, 0] as [number, number, number]
    },
    {
      id: 'back',
      name: 'Painel Traseiro',
      width: widthMm,
      height: heightMm,
      explosion: [0, 0, -1] as [number, number, number],
      pos: [0, 0, -depthMm / 2] as [number, number, number],
      rot: [0, Math.PI, 0] as [number, number, number]
    },
    {
      id: 'left',
      name: 'Lateral Esquerda',
      width: depthMm,
      height: heightMm,
      explosion: [-1, 0, 0] as [number, number, number],
      pos: [-widthMm / 2, 0, 0] as [number, number, number],
      rot: [0, -Math.PI / 2, 0] as [number, number, number]
    },
    {
      id: 'right',
      name: 'Lateral Direita',
      width: depthMm,
      height: heightMm,
      explosion: [1, 0, 0] as [number, number, number],
      pos: [widthMm / 2, 0, 0] as [number, number, number],
      rot: [0, Math.PI / 2, 0] as [number, number, number]
    }
  ];

  if (hasLid) {
    rawFaces.push({
      id: 'top',
      name: 'Tampa Superior',
      width: widthMm,
      height: depthMm,
      explosion: [0, 1, 0] as [number, number, number],
      pos: [0, heightMm / 2, 0] as [number, number, number],
      rot: [Math.PI / 2, 0, 0] as [number, number, number]
    });
  }

  const faces: BoxFace[] = rawFaces.map((f, idx) => {
    const { pathD, cutLengthMm } = createBoxFacePath(
      f.width,
      f.height,
      thicknessMm,
      tabWidthMm,
      kerfMm,
      {
        top: idx % 2 === 0,
        right: idx % 2 !== 0,
        bottom: idx % 2 === 0,
        left: idx % 2 !== 0
      }
    );

    return {
      id: f.id,
      name: f.name,
      widthMm: f.width,
      heightMm: f.height,
      pathD,
      cutLengthMm,
      explosionVector: f.explosion,
      position3D: f.pos,
      rotation3D: f.rot
    };
  });

  const totalCutLength = faces.reduce((acc, f) => acc + f.cutLengthMm, 0);

  // Layout 2D SVG arranging faces in 2 rows
  const spacing = 10;
  let currentX = spacing;
  let currentY = spacing;
  let maxHeightInRow = 0;
  let totalSvgWidth = 0;
  let totalSvgHeight = 0;

  let svgElements = '';

  faces.forEach((f, idx) => {
    // If exceeds 450mm, wrap to next row
    if (currentX + f.widthMm > 450 && idx > 0) {
      currentX = spacing;
      currentY += maxHeightInRow + spacing;
      maxHeightInRow = 0;
    }

    svgElements += `  <!-- ${f.name} -->\n`;
    svgElements += `  <g transform="translate(${currentX}, ${currentY})">\n`;
    svgElements += `    <rect x="0" y="0" width="${f.widthMm}" height="${f.heightMm}" rx="1" fill="#fef08a" fill-opacity="0.15" stroke="#ef4444" stroke-width="0.8" data-layer="cut" />\n`;
    svgElements += `    <text x="${f.widthMm / 2}" y="${f.heightMm / 2}" font-family="sans-serif" font-size="8" text-anchor="middle" fill="#3b82f6" font-weight="bold">${f.name}</text>\n`;
    svgElements += `    <text x="${f.widthMm / 2}" y="${f.heightMm / 2 + 12}" font-family="sans-serif" font-size="6" text-anchor="middle" fill="#64748b">${f.widthMm} x ${f.heightMm} mm</text>\n`;
    svgElements += `  </g>\n`;

    currentX += f.widthMm + spacing;
    maxHeightInRow = Math.max(maxHeightInRow, f.heightMm);
    totalSvgWidth = Math.max(totalSvgWidth, currentX);
    totalSvgHeight = Math.max(totalSvgHeight, currentY + maxHeightInRow + spacing);
  });

  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSvgWidth} ${totalSvgHeight}" width="${totalSvgWidth}mm" height="${totalSvgHeight}mm">
  <defs>
    <style>
      .cut-line { stroke: #ef4444; stroke-width: 0.8; fill: none; }
      .engrave-text { fill: #3b82f6; font-family: sans-serif; font-size: 8px; font-weight: bold; }
    </style>
  </defs>
${svgElements}
</svg>`;

  const create3DGroup = () => {
    const group = new THREE.Group();
    group.name = 'ParametricBox3D';

    const woodMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4a373,
      roughness: 0.65,
      metalness: 0.05
    });

    // In 3D space, 1 unit = 10mm (1 cm) for convenient camera view
    const scaleFactor = 0.1;

    faces.forEach(face => {
      const w = face.widthMm * scaleFactor;
      const h = face.heightMm * scaleFactor;
      const t = thicknessMm * scaleFactor;

      const geometry = new THREE.BoxGeometry(w, h, t);
      const mesh = new THREE.Mesh(geometry, woodMaterial.clone());
      mesh.name = face.name;

      // Base position in 3D
      mesh.position.set(
        face.position3D[0] * scaleFactor,
        face.position3D[1] * scaleFactor,
        face.position3D[2] * scaleFactor
      );
      mesh.rotation.set(face.rotation3D[0], face.rotation3D[1], face.rotation3D[2]);

      // Save explosion vector and original position in userData
      mesh.userData = {
        explosionVector: face.explosionVector,
        originalPosition: mesh.position.clone(),
        partName: face.name,
        widthMm: face.widthMm,
        heightMm: face.heightMm
      };

      group.add(mesh);
    });

    return group;
  };

  return {
    svgContent,
    totalWidthMm: totalSvgWidth,
    totalHeightMm: totalSvgHeight,
    totalCutLengthMm: totalCutLength,
    faces,
    create3DGroup
  };
}
