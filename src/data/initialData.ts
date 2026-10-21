import { CompanyProfile, Machine, Material, FixedCost, TaxConfig, ProductInventory, ProductionOrder, SalesOrder, Quote, PlanConfig } from '../types';

export const INITIAL_COMPANY: CompanyProfile = {
  name: "CNC Minas Indústria & Usinagem Ltda",
  tradeName: "CNC Minas — Juiz de Fora",
  cnpj: "41.980.123/0001-85",
  ie: "003.892.144-0019",
  uf: "MG",
  city: "Juiz de Fora",
  address: "Av. Brasil, 4500 - Distrito Industrial",
  cep: "36080-000",
  phone: "(32) 99876-1234",
  email: "contato@cncminasjf.com.br",
  logoUrl: "",
  whatsappMessageTemplate: "Olá {cliente}! Seu orçamento #{numero} na CNC Minas (Juiz de Fora) para corte e usinagem CNC ficou em {valor}. Prazo estimado de produção: {prazo} dias úteis. Podemos confirmar o corte?"
};

export const INITIAL_MACHINES: Machine[] = [
  {
    id: "mach-1",
    name: "CNC Laser CO2 100W Ruida (Mesa 9060)",
    model: "Ruida RDC6442S / Tubo RECI W2",
    type: "CO2",
    laserPowerW: 100,
    workAreaX_mm: 900,
    workAreaY_mm: 600,
    purchasePrice: 38500,
    depreciationYears: 5,
    monthlyWorkHours: 160,
    energyConsumptionKwh: 2.4, // Tubo + Chiller CW-5200 + Exaustor
    monthlyMaintenanceCosts: 280,
    tubeSpareCost: 4200,
    notes: "Máquina primária para cortes finos em MDF, acrílico e compensado com alta velocidade."
  },
  {
    id: "mach-2",
    name: "CNC Router Industrial 3 Eixos (1325)",
    model: "Spindle 3.0kW HSD / Inversor Delta / DSP A11",
    type: "Router", // CNC Router usinagem
    laserPowerW: 3000,
    workAreaX_mm: 1300,
    workAreaY_mm: 2500,
    purchasePrice: 62000,
    depreciationYears: 5,
    monthlyWorkHours: 160,
    energyConsumptionKwh: 4.2, // Spindle 3kW + Bomba de vácuo + Coletor de pó 2.2kW
    monthlyMaintenanceCosts: 450,
    tubeSpareCost: 1500,
    notes: "Usinagem pesada de chapas inteiras de MDF 15mm/18mm, ACM, compensado naval e madeira maciça."
  },
  {
    id: "mach-3",
    name: "CNC Fibra Marcadora Raycus 30W",
    model: "Raycus Q-Switched / Galvo Sino-Galvo",
    type: "Fibra",
    laserPowerW: 30,
    workAreaX_mm: 200,
    workAreaY_mm: 200,
    purchasePrice: 26000,
    depreciationYears: 5,
    monthlyWorkHours: 160,
    energyConsumptionKwh: 0.8,
    monthlyMaintenanceCosts: 120,
    tubeSpareCost: 2000,
    notes: "Gravação profunda em metais, plaquetas de identificação industrial e brindes."
  }
];

export const INITIAL_MATERIALS: Material[] = [
  {
    id: "mat-1",
    name: "MDF Cru 3,0 mm (Eucalipto Naval)",
    category: "MDF",
    thickness_mm: 3.0,
    sheetWidth_mm: 1850,
    sheetLength_mm: 2750,
    unitCost: 84.00,
    shippingCost: 12.00,
    lossPercentage: 8.0,
    density_kg_m3: 750,
    speedsByMachine: [
      { machineId: "mach-1", cutSpeed_mms: 25, cutPower_pct: 65, engraveSpeed_mms: 300, engravePower_pct: 18, lineInterval_mm: 0.08 },
      { machineId: "mach-2", cutSpeed_mms: 45, cutPower_pct: 70, engraveSpeed_mms: 80, engravePower_pct: 40, lineInterval_mm: 0.20 }
    ]
  },
  {
    id: "mat-2",
    name: "MDF Branco Tx 1 Face 3,0 mm",
    category: "MDF",
    thickness_mm: 3.0,
    sheetWidth_mm: 1850,
    sheetLength_mm: 2750,
    unitCost: 98.00,
    shippingCost: 12.00,
    lossPercentage: 7.5,
    density_kg_m3: 760,
    speedsByMachine: [
      { machineId: "mach-1", cutSpeed_mms: 22, cutPower_pct: 70, engraveSpeed_mms: 280, engravePower_pct: 20, lineInterval_mm: 0.08 },
      { machineId: "mach-2", cutSpeed_mms: 40, cutPower_pct: 75, engraveSpeed_mms: 80, engravePower_pct: 40, lineInterval_mm: 0.20 }
    ]
  },
  {
    id: "mat-3",
    name: "Acrílico Cristal Cast 3,0 mm Puro",
    category: "Acrílico",
    thickness_mm: 3.0,
    sheetWidth_mm: 1000,
    sheetLength_mm: 2000,
    unitCost: 240.00,
    shippingCost: 25.00,
    lossPercentage: 5.0,
    density_kg_m3: 1190,
    speedsByMachine: [
      { machineId: "mach-1", cutSpeed_mms: 12, cutPower_pct: 80, engraveSpeed_mms: 350, engravePower_pct: 15, lineInterval_mm: 0.06 },
      { machineId: "mach-2", cutSpeed_mms: 20, cutPower_pct: 60, engraveSpeed_mms: 60, engravePower_pct: 50, lineInterval_mm: 0.15 }
    ]
  },
  {
    id: "mat-4",
    name: "MDF Cru 6,0 mm Estrutural",
    category: "MDF",
    thickness_mm: 6.0,
    sheetWidth_mm: 1850,
    sheetLength_mm: 2750,
    unitCost: 145.00,
    shippingCost: 16.00,
    lossPercentage: 8.0,
    density_kg_m3: 740,
    speedsByMachine: [
      { machineId: "mach-1", cutSpeed_mms: 10, cutPower_pct: 85, engraveSpeed_mms: 280, engravePower_pct: 24, lineInterval_mm: 0.10 },
      { machineId: "mach-2", cutSpeed_mms: 35, cutPower_pct: 85, engraveSpeed_mms: 80, engravePower_pct: 45, lineInterval_mm: 0.20 }
    ]
  },
  {
    id: "mat-5",
    name: "Compensado Naval Pinus 4,0 mm",
    category: "Compensado",
    thickness_mm: 4.0,
    sheetWidth_mm: 1220,
    sheetLength_mm: 2440,
    unitCost: 110.00,
    shippingCost: 15.00,
    lossPercentage: 10.0,
    density_kg_m3: 560,
    speedsByMachine: [
      { machineId: "mach-1", cutSpeed_mms: 18, cutPower_pct: 75, engraveSpeed_mms: 260, engravePower_pct: 20, lineInterval_mm: 0.08 },
      { machineId: "mach-2", cutSpeed_mms: 40, cutPower_pct: 80, engraveSpeed_mms: 80, engravePower_pct: 40, lineInterval_mm: 0.20 }
    ]
  }
];

export const INITIAL_FIXED_COSTS: FixedCost[] = [
  { id: "fc-1", name: "Aluguel Galpão Industrial JF", amount: 3400, category: "Aluguel", periodicity: "Mensal" },
  { id: "fc-2", name: "Energia Elétrica CEMIG (Adm. / Clima)", amount: 720, category: "Energia Geral", periodicity: "Mensal" },
  { id: "fc-3", name: "Internet Fibra Dedicada & Telefonia", amount: 240, category: "Internet/Telefonia", periodicity: "Mensal" },
  { id: "fc-4", name: "Sistemas & Licenças (CNC APP ERP)", amount: 167, category: "Sistemas/Software", periodicity: "Mensal" },
  { id: "fc-5", name: "Honorários Contabilidade Fiscal", amount: 900, category: "Contabilidade", periodicity: "Mensal" },
  { id: "fc-6", name: "Pró-Labore Sócio Operador", amount: 4800, category: "Pró-Labore", periodicity: "Mensal" },
  { id: "fc-7", name: "Fresas, Brocas, EPIs e Manutenção Predial", amount: 400, category: "Outros", periodicity: "Mensal" }
];

export const INITIAL_TAXES: TaxConfig[] = [
  { id: "tax-1", name: "Simples Nacional (Anexo II - Transformação Industrial)", percentage: 4.5, regime: "Simples Nacional", active: true },
  { id: "tax-2", name: "ICMS / Diferencial de Alíquota MG", percentage: 1.5, regime: "Simples Nacional", active: true }
];

export const INITIAL_PRODUCTS: ProductInventory[] = [
  {
    sku: "SKU-CX-001",
    name: "Caixa Organizadora CNC com Tampa e Encaixe Finger-Joint 20x15x10cm",
    category: "Organizadores & Utilidades",
    physicalStock: 22,
    committedStock: 12,
    minStock: 15,
    idealStock: 40,
    inProductionStock: 20,
    minBatchToProduce: 10,
    batchMultiple: 5,
    unitPrice: 42.90,
    costPrice: 16.40,
    materialId: "mat-1",
    estimatedLaserTimeSeconds: 210,
    dimensions_mm: { width: 200, height: 100, depth: 150 }
  },
  {
    sku: "SKU-PC-002",
    name: "Kit 6 Porta-Copos Hexagonais Geométricos com Suporte",
    category: "Mesa & Bar",
    physicalStock: 35,
    committedStock: 8,
    minStock: 20,
    idealStock: 60,
    inProductionStock: 0,
    minBatchToProduce: 12,
    batchMultiple: 6,
    unitPrice: 38.50,
    costPrice: 11.20,
    materialId: "mat-1",
    estimatedLaserTimeSeconds: 165,
    dimensions_mm: { width: 110, height: 70, depth: 110 }
  },
  {
    sku: "SKU-TR-003",
    name: "Troféu Premium Acrílico Cristal 3mm com Base Usinada em MDF 6mm",
    category: "Troféus & Homenagens",
    physicalStock: 6,
    committedStock: 14,
    minStock: 10,
    idealStock: 25,
    inProductionStock: 10,
    minBatchToProduce: 5,
    batchMultiple: 5,
    unitPrice: 89.00,
    costPrice: 31.80,
    materialId: "mat-3",
    estimatedLaserTimeSeconds: 340,
    dimensions_mm: { width: 140, height: 220, depth: 60 }
  },
  {
    sku: "SKU-LM-004",
    name: "Luminária Mandala 3D Encaixável para Soquete LED",
    category: "Decoração & Iluminação",
    physicalStock: 14,
    committedStock: 5,
    minStock: 12,
    idealStock: 30,
    inProductionStock: 15,
    minBatchToProduce: 6,
    batchMultiple: 3,
    unitPrice: 115.00,
    costPrice: 42.50,
    materialId: "mat-5",
    estimatedLaserTimeSeconds: 490,
    dimensions_mm: { width: 240, height: 280, depth: 240 }
  },
  {
    sku: "SKU-LT-005",
    name: "Letreiro Bicolor em Camadas 'Gratidão' 40cm Parede",
    category: "Letreiros & Frases",
    physicalStock: 9,
    committedStock: 7,
    minStock: 10,
    idealStock: 25,
    inProductionStock: 0,
    minBatchToProduce: 5,
    batchMultiple: 5,
    unitPrice: 49.90,
    costPrice: 15.30,
    materialId: "mat-2",
    estimatedLaserTimeSeconds: 195,
    dimensions_mm: { width: 400, height: 120, depth: 6 }
  }
];

export const INITIAL_PRODUCTION_ORDERS: ProductionOrder[] = [
  {
    id: "op-2026-001",
    orderNumber: "OP-0482",
    sku: "SKU-CX-001",
    productName: "Caixa Organizadora CNC com Tampa e Encaixe Finger-Joint 20x15x10cm",
    quantityRequested: 20,
    quantityIdealCalculated: 20,
    status: "Cortando na Laser",
    createdAt: "2026-10-18T08:30:00Z",
    dueDate: "2026-10-22T17:00:00Z",
    priority: "Alta",
    machineId: "mach-1",
    materialName: "MDF Cru 3,0 mm",
    laserTimeEstimatedMin: 70,
    scannedQuantity: 12,
    assignedTo: "Carlos Operador",
    notes: "Ajustar kerf de 0,15 mm para encaixe firme sem folga."
  },
  {
    id: "op-2026-002",
    orderNumber: "OP-0483",
    sku: "SKU-TR-003",
    productName: "Troféu Premium Acrílico Cristal 3mm com Base Usinada em MDF 6mm",
    quantityRequested: 25,
    quantityIdealCalculated: 25,
    status: "Aguardando Corte",
    createdAt: "2026-10-19T10:15:00Z",
    dueDate: "2026-10-23T18:00:00Z",
    priority: "Urgente",
    machineId: "mach-1",
    materialName: "Acrílico Cristal Cast 3,0 mm",
    laserTimeEstimatedMin: 142,
    scannedQuantity: 0,
    assignedTo: "Marcos Laser",
    notes: "Cortar acrílico com filme protetor para evitar névoa de vapor."
  },
  {
    id: "op-2026-003",
    orderNumber: "OP-0484",
    sku: "SKU-LM-004",
    productName: "Luminária Mandala 3D Encaixável para Soquete LED",
    quantityRequested: 15,
    quantityIdealCalculated: 15,
    status: "Acabamento/Pintura",
    createdAt: "2026-10-17T14:00:00Z",
    dueDate: "2026-10-21T16:00:00Z",
    priority: "Normal",
    machineId: "mach-2",
    materialName: "Compensado Naval Pinus 4,0 mm",
    laserTimeEstimatedMin: 122,
    scannedQuantity: 15,
    assignedTo: "Juliana Acabamento",
    notes: "Lixar bordas com lixa grão 320 antes do verniz protetor."
  },
  {
    id: "op-2026-004",
    orderNumber: "OP-0485",
    sku: "SKU-LT-005",
    productName: "Letreiro Bicolor em Camadas 'Gratidão' 40cm Parede",
    quantityRequested: 10,
    quantityIdealCalculated: 10,
    status: "Montagem",
    createdAt: "2026-10-19T11:20:00Z",
    dueDate: "2026-10-22T12:00:00Z",
    priority: "Normal",
    machineId: "mach-1",
    materialName: "MDF Branco Tx 1 Face 3,0 mm",
    laserTimeEstimatedMin: 32,
    scannedQuantity: 10,
    assignedTo: "Juliana Acabamento",
    notes: "Colagem com fita dupla face 3M no verso para fixação em parede."
  },
  {
    id: "op-2026-005",
    orderNumber: "OP-0486",
    sku: "SKU-PC-002",
    productName: "Kit 6 Porta-Copos Hexagonais Geométricos com Suporte",
    quantityRequested: 30,
    quantityIdealCalculated: 30,
    status: "Pronto/Embalado",
    createdAt: "2026-10-16T09:00:00Z",
    dueDate: "2026-10-20T18:00:00Z",
    priority: "Baixa",
    machineId: "mach-1",
    materialName: "MDF Cru 3,0 mm",
    laserTimeEstimatedMin: 82,
    scannedQuantity: 30,
    assignedTo: "Carlos Operador",
    notes: "Embalado e conferido por bipagem com cinta de papel kraft."
  }
];

export const INITIAL_SALES_ORDERS: SalesOrder[] = [
  {
    id: "ped-101",
    orderNumber: "PED-2026-0182",
    channel: "Mercado Livre",
    customerName: "Rodrigo Almeida Siqueira",
    customerDoc: "034.891.229-88",
    customerCity: "Belo Horizonte",
    customerUf: "MG",
    items: [
      { sku: "SKU-CX-001", productName: "Caixa Organizadora CNC com Tampa 20x15x10cm", quantity: 4, unitPrice: 42.90, totalPrice: 171.60, laserTimeSeconds: 840 },
      { sku: "SKU-PC-002", productName: "Kit 6 Porta-Copos Hexagonais", quantity: 2, unitPrice: 38.50, totalPrice: 77.00, laserTimeSeconds: 330 }
    ],
    subtotal: 248.60,
    shippingCost: 26.90,
    discount: 0,
    total: 275.50,
    paymentMethod: "Marketplace",
    paymentStatus: "Pago",
    paidAt: "2026-10-20T14:22:00Z",
    fulfillmentStatus: "Nota Emitida",
    invoiceKey: "31261041980123000185550010000004821008761234",
    trackingCode: "ML-MG-89218731-X",
    createdAt: "2026-10-20T14:15:00Z"
  },
  {
    id: "ped-102",
    orderNumber: "PED-2026-0183",
    channel: "Loja Própria",
    customerName: "Camila Fernandes Braga",
    customerDoc: "812.339.441-02",
    customerCity: "Juiz de Fora",
    customerUf: "MG",
    items: [
      { sku: "SKU-TR-003", productName: "Troféu Premium Acrílico Cristal 3mm", quantity: 5, unitPrice: 89.00, totalPrice: 445.00, laserTimeSeconds: 1700 }
    ],
    subtotal: 445.00,
    shippingCost: 0, // Retirada no balcão JF
    discount: 25.00,
    total: 420.00,
    paymentMethod: "Pix Asaas",
    paymentStatus: "Pago",
    paidAt: "2026-10-21T09:40:00Z",
    fulfillmentStatus: "Em Produção",
    invoiceKey: "31261041980123000185550010000004831008765432",
    createdAt: "2026-10-21T09:35:00Z"
  },
  {
    id: "ped-103",
    orderNumber: "PED-2026-0184",
    channel: "WhatsApp",
    customerName: "Agência Criativa Vertente ME",
    customerDoc: "32.441.988/0001-90",
    customerCity: "Juiz de Fora",
    customerUf: "MG",
    items: [
      { sku: "SKU-LM-004", productName: "Luminária Mandala 3D Encaixável", quantity: 3, unitPrice: 115.00, totalPrice: 345.00, laserTimeSeconds: 1470 },
      { sku: "SKU-LT-005", productName: "Letreiro Bicolor 'Gratidão' 40cm", quantity: 2, unitPrice: 49.90, totalPrice: 99.80, laserTimeSeconds: 390 }
    ],
    subtotal: 444.80,
    shippingCost: 20.00,
    discount: 15.00,
    total: 449.80,
    paymentMethod: "Pix Asaas",
    paymentStatus: "Pago",
    paidAt: "2026-10-20T16:10:00Z",
    fulfillmentStatus: "Separado",
    invoiceKey: "31261041980123000185550010000004841008769911",
    trackingCode: "ME-JF-99128312-BR",
    createdAt: "2026-10-20T15:50:00Z"
  },
  {
    id: "ped-104",
    orderNumber: "PED-2026-0185",
    channel: "Shopee",
    customerName: "Lucas Mendes Vieira",
    customerDoc: "049.221.789-54",
    customerCity: "Rio de Janeiro",
    customerUf: "RJ",
    items: [
      { sku: "SKU-PC-002", productName: "Kit 6 Porta-Copos Hexagonais", quantity: 3, unitPrice: 38.50, totalPrice: 115.50, laserTimeSeconds: 495 }
    ],
    subtotal: 115.50,
    shippingCost: 18.20,
    discount: 0,
    total: 133.70,
    paymentMethod: "Marketplace",
    paymentStatus: "Pago",
    paidAt: "2026-10-21T01:10:00Z",
    fulfillmentStatus: "Pendente",
    createdAt: "2026-10-21T01:05:00Z"
  }
];

export const INITIAL_QUOTES: Quote[] = [
  {
    id: "orc-1",
    quoteNumber: "ORC-2026-0084",
    customerName: "Studio Arquitetura & Decoração JF",
    customerPhone: "(32) 98765-1122",
    customerEmail: "projetos@studiojf.com.br",
    customerDoc: "19.822.455/0001-30",
    items: [
      {
        id: "qi-1",
        description: "Painel Cobogó CNC Geométrico 600x900 mm em MDF Cru 6mm",
        materialId: "mat-4",
        cutLength_mm: 38400,
        engraveArea_cm2: 0,
        machineId: "mach-1",
        quantity: 4,
        additionalCost: 35.00,
        customKerf_mm: 0.15
      },
      {
        id: "qi-2",
        description: "Suporte de Fixação Oculta em Acrílico Cast 3mm",
        materialId: "mat-3",
        cutLength_mm: 2200,
        engraveArea_cm2: 15,
        machineId: "mach-1",
        quantity: 8,
        additionalCost: 12.00,
        customKerf_mm: 0.15
      }
    ],
    validUntil: "2026-11-05",
    notes: "Retirada no galpão em Juiz de Fora / MG ou envio via transportadora. Prazo de produção: 4 dias úteis.",
    desiredProfitMarginPct: 35.0,
    extraTaxPct: 0,
    fixedExtraFee: 20.0,
    createdAt: "2026-10-20",
    status: "Enviado"
  }
];

export const PLANS: PlanConfig[] = [
  {
    id: "Criar",
    name: "Plano Criar",
    priceMonthly: 49.90,
    usersLimit: 1,
    catalogLimit: 0,
    productsLimit: 0,
    aiCreditsMonthly: 50,
    features: ["Estúdio 3D com IA", "Otimizador CAM Básico", "Nesting no navegador", "Compensação de Kerf", "Exportação SVG/DXF"],
    hasInvoices: false,
    hasMarketplaces: false,
    retentionMonths: 0
  },
  {
    id: "Iniciar",
    name: "Plano Iniciar",
    priceMonthly: 99.90,
    usersLimit: 1,
    catalogLimit: 1,
    productsLimit: 100,
    aiCreditsMonthly: 20,
    features: ["Tudo do Criar", "Precificação Mark-up Divisor", "Sacola WhatsApp", "+1000 transportadoras", "Orçamentos"],
    hasInvoices: false,
    hasMarketplaces: false,
    retentionMonths: 6
  },
  {
    id: "Avançar",
    name: "Plano Avançar",
    priceMonthly: 167.00,
    usersLimit: 1,
    catalogLimit: 2,
    productsLimit: 100,
    aiCreditsMonthly: 40,
    features: ["Tudo do Iniciar", "NF-e Ilimitada SEFAZ", "Mercado Livre Integrado", "Shopee Integrada", "Etiquetas 10x15cm"],
    hasInvoices: true,
    hasMarketplaces: true,
    retentionMonths: 6
  },
  {
    id: "Crescer",
    name: "Plano Crescer",
    priceMonthly: 320.00,
    usersLimit: 3,
    catalogLimit: 4,
    productsLimit: 500,
    aiCreditsMonthly: 80,
    features: ["Tudo do Avançar", "3 Usuários / Equipe", "Kanban Industrial", "Separação por Bipagem", "Controle de Estoque SKU", "Copiloto CAM IA"],
    hasInvoices: true,
    hasMarketplaces: true,
    retentionMonths: 12
  },
  {
    id: "Escalar",
    name: "Plano Escalar",
    priceMonthly: 690.90,
    usersLimit: 10,
    catalogLimit: 6,
    productsLimit: 3000,
    aiCreditsMonthly: 200,
    features: ["Tudo do Crescer", "10 Usuários", "Multi-máquinas Laser + Router", "Temu + Bling API", "Suporte prioritário WhatsApp"],
    hasInvoices: true,
    hasMarketplaces: true,
    retentionMonths: 12
  }
];
