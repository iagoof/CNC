export type UF = 
  | 'AC' | 'AL' | 'AP' | 'AM' | 'BA' | 'CE' | 'DF' | 'ES' | 'GO' | 'MA' 
  | 'MT' | 'MS' | 'MG' | 'PA' | 'PB' | 'PR' | 'PE' | 'PI' | 'RJ' | 'RN' 
  | 'RS' | 'RO' | 'RR' | 'SC' | 'SP' | 'SE' | 'TO';

export interface CompanyProfile {
  name: string;
  tradeName: string;
  cnpj: string;
  ie: string;
  uf: UF;
  city: string;
  address: string;
  cep: string;
  phone: string;
  email: string;
  logoUrl?: string;
  whatsappMessageTemplate?: string;
}

export interface Machine {
  id: string;
  name: string;
  model: string;
  type: 'CO2' | 'Diodo' | 'Fibra' | 'Router' | 'Plasma';
  laserPowerW: number;
  workAreaX_mm: number;
  workAreaY_mm: number;
  purchasePrice: number;
  depreciationYears: number; // default 5
  monthlyWorkHours: number; // default 160
  energyConsumptionKwh: number; // ex: 2.2 kWh for tube + chiller + exhaust
  monthlyMaintenanceCosts: number; // ex: periodic tube, optics, mirrors, filters
  tubeSpareCost: number; // Pagamento único / reserva de tubo
  notes?: string;
}

export interface MaterialMachineSpeed {
  machineId: string;
  cutSpeed_mms: number; // mm/s
  cutPower_pct: number; // %
  engraveSpeed_mms: number; // mm/s
  engravePower_pct: number; // %
  lineInterval_mm: number; // ex: 0.08 mm or 0.10 mm
}

export interface Material {
  id: string;
  name: string;
  category: 'MDF' | 'Acrílico' | 'Compensado' | 'Madeira Maciça' | 'EVA' | 'Papelão' | 'Couro';
  thickness_mm: number;
  sheetWidth_mm: number;
  sheetLength_mm: number;
  unitCost: number; // R$ preço da chapa
  shippingCost: number; // Frete por unidade da chapa
  lossPercentage: number; // % perda esperada
  density_kg_m3: number; // ex: 750 for MDF
  speedsByMachine: MaterialMachineSpeed[];
}

export interface FixedCost {
  id: string;
  name: string;
  amount: number;
  category: 'Aluguel' | 'Energia Geral' | 'Internet/Telefonia' | 'Sistemas/Software' | 'Contabilidade' | 'Pró-Labore' | 'Outros';
  periodicity: 'Mensal' | 'Diário' | 'Semanal' | 'Trimestral' | 'Semestral' | 'Anual';
}

export interface TaxConfig {
  id: string;
  name: string;
  percentage: number;
  regime: 'Simples Nacional' | 'MEI' | 'Lucro Presumido' | 'Lucro Real';
  active: boolean;
}

export interface ProductInventory {
  sku: string;
  name: string;
  category: string;
  physicalStock: number;
  committedStock: number;
  minStock: number;
  idealStock: number;
  inProductionStock: number;
  minBatchToProduce: number;
  batchMultiple: number; // "Produzir em grupos de"
  unitPrice: number;
  costPrice: number;
  materialId: string;
  estimatedLaserTimeSeconds: number;
  dimensions_mm: { width: number; height: number; depth: number };
}

export interface ProductionOrder {
  id: string;
  orderNumber: string;
  sku: string;
  productName: string;
  quantityRequested: number;
  quantityIdealCalculated: number;
  status: 'Aguardando Corte' | 'Cortando na Laser' | 'Acabamento/Pintura' | 'Montagem' | 'Pronto/Embalado';
  createdAt: string;
  dueDate: string;
  priority: 'Baixa' | 'Normal' | 'Alta' | 'Urgente';
  machineId: string;
  materialName: string;
  laserTimeEstimatedMin: number;
  scannedQuantity: number;
  assignedTo?: string;
  notes?: string;
}

export interface OrderItem {
  sku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  laserTimeSeconds: number;
}

export interface SalesOrder {
  sourceQuoteId?: string;
  id: string;
  orderNumber: string;
  channel: 'Loja Própria' | 'WhatsApp' | 'Mercado Livre' | 'Shopee' | 'Temu' | 'Balcão/Direto';
  customerName: string;
  customerDoc: string;
  customerCity: string;
  customerUf: UF;
  items: OrderItem[];
  subtotal: number;
  shippingCost: number;
  discount: number;
  total: number;
  paymentMethod: 'Pix Asaas' | 'Cartão Asaas' | 'Boleto' | 'Dinheiro' | 'Marketplace';
  paymentStatus: 'Pago' | 'Pendente' | 'Cancelado';
  paidAt?: string;
  fulfillmentStatus: 'Pendente' | 'Em Produção' | 'Separado' | 'Nota Emitida' | 'Enviado' | 'Entregue';
  invoiceKey?: string;
  trackingCode?: string;
  createdAt: string;
}

export interface QuoteItem {
  id: string;
  description: string;
  materialId: string;
  cutLength_mm: number;
  engraveArea_cm2: number;
  machineId: string;
  quantity: number;
  additionalCost: number; // ferragens, cola, embalagem
  customKerf_mm?: number;
  width_mm?: number;
  height_mm?: number;
}

export interface Quote {
  id: string;
  quoteNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerDoc: string;
  items: QuoteItem[];
  validUntil: string;
  notes: string;
  desiredProfitMarginPct: number;
  extraTaxPct: number;
  fixedExtraFee: number;
  createdAt: string;
  status: 'Rascunho' | 'Enviado' | 'Aprovado' | 'Recusado' | 'Convertido em Pedido';
}

export interface NestingPart {
  id: string;
  name: string;
  width: number; // mm
  height: number; // mm
  quantity: number;
  color?: string;
  cutLength_mm: number;
  svgPathOrGroup?: string;
}

export interface PlacedPart {
  partId: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotated: boolean;
  color: string;
  svgPathOrGroup?: string;
}

export interface CncArtifact {
  id: string;
  name: string;
  svgContent: string;
  widthMm: number;
  heightMm: number;
  cutLengthMm: number;
  engraveAreaCm2: number;
  materialCategory?: string;
  recommendedThicknessMm?: number;
  layerCount?: number;
  createdAt: string;
  source: 'ai_prompt' | 'image_trace' | 'parametric_box' | 'catalog';
  gcode?: string;
}

export interface CamTransferData {
  gcode: string;
  machineType: 'CO2' | 'Diodo' | 'Fibra' | 'Router' | 'Plasma';
  fileName: string;
  cutLength_mm: number;
  passes?: number;
  feedRate?: number;
}

export type PlanType = 'Criar' | 'Iniciar' | 'Avançar' | 'Crescer' | 'Escalar';

export interface PlanConfig {
  id: PlanType;
  name: string;
  priceMonthly: number;
  usersLimit: number;
  catalogLimit: number;
  productsLimit: number;
  aiCreditsMonthly: number;
  features: string[];
  hasInvoices: boolean;
  hasMarketplaces: boolean;
  retentionMonths: number;
}
