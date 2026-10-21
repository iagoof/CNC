import { Machine, Material, FixedCost, UF, TaxConfig } from '../types';

// Tabela oficial média de tarifas elétricas estaduais no Brasil (R$/kWh industrial/comercial B3)
export const TARIFA_ENERGIA_POR_UF: Record<UF, number> = {
  PR: 0.89,
  SP: 0.94,
  RJ: 1.15,
  MG: 1.02,
  RS: 0.98,
  SC: 0.86,
  BA: 0.96,
  DF: 0.91,
  ES: 0.93,
  GO: 0.95,
  MT: 1.04,
  MS: 1.01,
  CE: 0.99,
  PE: 0.97,
  AM: 1.12,
  PA: 1.10,
  RN: 0.94,
  PB: 0.92,
  AL: 0.98,
  SE: 0.95,
  PI: 1.05,
  MA: 1.03,
  TO: 1.06,
  RO: 1.08,
  AC: 1.18,
  AP: 1.02,
  RR: 1.14
};

export const TARIFA_MEDIA_NACIONAL_KWH = 1.07;

/**
 * Converte valor periódico para base mensal padrão
 */
export function convertToMonthlyCost(amount: number, periodicity: FixedCost['periodicity']): number {
  switch (periodicity) {
    case 'Diário':
      return amount * 30;
    case 'Semanal':
      return amount * 4.33;
    case 'Mensal':
      return amount * 1;
    case 'Trimestral':
      return amount / 3;
    case 'Semestral':
      return amount / 6;
    case 'Anual':
      return amount / 12;
    default:
      return amount;
  }
}

/**
 * Depreciação Horária da Máquina:
 * Dep_hora = Preço_Máquina ÷ (Anos_Depreciação × 12 × Horas_Trabalhadas_Mês)
 */
export function calcMachineDepreciationHourly(machine: Machine): number {
  const totalMonths = (machine.depreciationYears || 5) * 12;
  const totalHours = totalMonths * (machine.monthlyWorkHours || 160);
  if (totalHours <= 0) return 0;
  return machine.purchasePrice / totalHours;
}

/**
 * Custo de Energia Elétrica Horária da Máquina:
 * Energia_hora = Consumo_kWh × Tarifa_Estadual_UF
 */
export function calcMachineEnergyHourly(machine: Machine, uf?: UF): number {
  const tariff = uf && TARIFA_ENERGIA_POR_UF[uf] ? TARIFA_ENERGIA_POR_UF[uf] : TARIFA_MEDIA_NACIONAL_KWH;
  return (machine.energyConsumptionKwh || 0) * tariff;
}

/**
 * Custo Total da Máquina por Hora e por Segundo
 * Custo_Hora = Dep_hora + Energia_hora + ((Custos_Mensais + Tubo_Reserva_Mensalizado) ÷ Horas_Mês)
 * Custo_Segundo = Custo_Hora ÷ 3600
 */
export function calcMachineCostRates(machine: Machine, uf?: UF): { hourly: number; perSecond: number } {
  const depHourly = calcMachineDepreciationHourly(machine);
  const energyHourly = calcMachineEnergyHourly(machine, uf);
  
  const totalDepreciationMonths = (machine.depreciationYears || 5) * 12;
  const tubeSpareMonthly = totalDepreciationMonths > 0 ? (machine.tubeSpareCost || 0) / totalDepreciationMonths : 0;
  
  const monthlyWorkHours = machine.monthlyWorkHours || 160;
  const maintenanceHourly = ((machine.monthlyMaintenanceCosts || 0) + tubeSpareMonthly) / (monthlyWorkHours > 0 ? monthlyWorkHours : 160);
  
  const totalHourly = depHourly + energyHourly + maintenanceHourly;
  return {
    hourly: totalHourly,
    perSecond: totalHourly / 3600
  };
}

/**
 * Área da chapa em m² e Custo por Metro Quadrado
 * Área_m² = (Largura_mm × Comprimento_mm) ÷ 1.000.000
 * Custo_m² = [(Custo_Unid + Frete_Unid) × (1 + %Perda ÷ 100)] ÷ Área_m²
 */
export function calcMaterialM2Cost(material: Material): { areaM2: number; costPerM2: number } {
  if (!material.sheetWidth_mm || !material.sheetLength_mm || material.sheetWidth_mm <= 0 || material.sheetLength_mm <= 0) {
    return { areaM2: 0, costPerM2: 0 };
  }
  const areaM2 = (material.sheetWidth_mm * material.sheetLength_mm) / 1_000_000;
  const lossFactor = 1 + (material.lossPercentage || 0) / 100;
  const totalRawCost = ((material.unitCost || 0) + (material.shippingCost || 0)) * lossFactor;
  const costPerM2 = areaM2 > 0 ? totalRawCost / areaM2 : 0;
  return { areaM2, costPerM2 };
}

/**
 * Tempo e Custo de Operação Laser da Peça
 * Tempo_s = Comprimento_Linha_mm ÷ Velocidade_mms
 * Custo_Máq_Peça = Tempo_s × Custo_Segundo
 */
export function calcLaserCutTimeAndCost(
  cutLength_mm: number,
  speed_mms: number,
  costPerSecond: number,
  engraveArea_cm2 = 0,
  engraveSpeed_mms = 250,
  lineInterval_mm = 0.08
): { cutSeconds: number; engraveSeconds: number; totalSeconds: number; totalCost: number } {
  const effectiveCutSpeed = speed_mms > 0 ? speed_mms : 20;
  const cutSeconds = cutLength_mm > 0 ? cutLength_mm / effectiveCutSpeed : 0;
  
  let engraveSeconds = 0;
  if (engraveArea_cm2 > 0 && engraveSpeed_mms > 0 && lineInterval_mm > 0) {
    // Área em mm² = cm² * 100. Linhas totais = Altura / intervalo.
    // Estimativa determinística de varredura bidirecional
    const area_mm2 = engraveArea_cm2 * 100;
    const totalScanLength_mm = area_mm2 / lineInterval_mm;
    engraveSeconds = totalScanLength_mm / engraveSpeed_mms;
  }
  
  const totalSeconds = cutSeconds + engraveSeconds;
  const totalCost = totalSeconds * costPerSecond;
  
  return {
    cutSeconds,
    engraveSeconds,
    totalSeconds,
    totalCost
  };
}

/**
 * Mark-up de Custo Fixo (%CF):
 * %CF = (∑Custos_Fixos_Mensais ÷ Meta_Faturamento_Mensal) × 100
 */
export function calcFixedCostMarkupPercentage(fixedCosts: FixedCost[], monthlyRevenueTarget: number): {
  totalMonthlyCosts: number;
  fixedCostPct: number;
  isDeficitAlert: boolean;
} {
  const totalMonthlyCosts = fixedCosts.reduce((acc, cost) => acc + convertToMonthlyCost(cost.amount, cost.periodicity), 0);
  if (!monthlyRevenueTarget || monthlyRevenueTarget <= 0) {
    return {
      totalMonthlyCosts,
      fixedCostPct: 0,
      isDeficitAlert: true
    };
  }
  const fixedCostPct = (totalMonthlyCosts / monthlyRevenueTarget) * 100;
  const isDeficitAlert = monthlyRevenueTarget < totalMonthlyCosts;
  return {
    totalMonthlyCosts,
    fixedCostPct,
    isDeficitAlert
  };
}

/**
 * Precificação por Mark-up Divisor com Trava de Margem Máxima:
 * Custo_Direto = Custo_Mat + Custo_Máq + Custo_Insumos + Taxa_Fixa
 * Preço_Venda = Custo_Direto ÷ [1 − (%CF + %Impostos + %Taxa_Extra + %Margem) ÷ 100]
 * Trava de Margem Máxima: %Margem_Máx = 100% − (%CF + %Impostos + %Taxa_Extra).
 * Se Denominador ≤ 0, bloqueado!
 */
export function calcSalePriceMarkupDivisor(params: {
  directCost: number;
  fixedCostPct: number;
  taxPct: number;
  extraTaxPct?: number;
  desiredProfitMarginPct: number;
}): {
  salePrice: number;
  divisor: number;
  maxAllowedMarginPct: number;
  isValid: boolean;
  errorMessage?: string;
  profitAmount: number;
} {
  const { directCost, fixedCostPct, taxPct, extraTaxPct = 0, desiredProfitMarginPct } = params;
  
  const sumDeductionsWithoutMargin = fixedCostPct + taxPct + extraTaxPct;
  const maxAllowedMarginPct = Math.max(0, 100 - sumDeductionsWithoutMargin - 0.5); // margem de folga de 0.5%
  
  const totalDeductions = sumDeductionsWithoutMargin + desiredProfitMarginPct;
  const divisor = (100 - totalDeductions) / 100;
  
  if (divisor <= 0.001) {
    return {
      salePrice: 0,
      divisor,
      maxAllowedMarginPct,
      isValid: false,
      errorMessage: `Soma das alíquotas (${totalDeductions.toFixed(1)}%) ultrapassa 100%. A margem máxima viável é ${maxAllowedMarginPct.toFixed(1)}%.`,
      profitAmount: 0
    };
  }
  
  const salePrice = directCost / divisor;
  const profitAmount = salePrice * (desiredProfitMarginPct / 100);
  
  return {
    salePrice,
    divisor,
    maxAllowedMarginPct,
    isValid: true,
    profitAmount
  };
}

/**
 * Dimensionamento de Ordem de Produção (OP):
 * Disponível = máx(0, Saldo_Físico − Comprometido)
 * OP_Ideal = |Déficit_Pedido| + Estoque_Ideal − Em_Produção
 * Respeita quantidade mínima e múltiplos do lote
 */
export function calcProductionOrderQuantity(params: {
  physicalStock: number;
  committedStock: number;
  idealStock: number;
  inProduction: number;
  minBatch: number;
  batchMultiple: number;
}): {
  available: number;
  deficit: number;
  rawRequired: number;
  recommendedBatch: number;
} {
  const { physicalStock, committedStock, idealStock, inProduction, minBatch, batchMultiple } = params;
  const available = Math.max(0, physicalStock - committedStock);
  const deficit = Math.max(0, committedStock - physicalStock);
  
  const rawRequired = Math.max(0, deficit + idealStock - inProduction);
  if (rawRequired <= 0) {
    return {
      available,
      deficit,
      rawRequired: 0,
      recommendedBatch: 0
    };
  }
  
  let batch = Math.max(rawRequired, minBatch > 0 ? minBatch : 1);
  const mult = batchMultiple > 0 ? batchMultiple : 1;
  batch = Math.ceil(batch / mult) * mult;
  
  return {
    available,
    deficit,
    rawRequired,
    recommendedBatch: batch
  };
}

/**
 * Ritmo Esperado do Mês (Dashboard):
 * Ritmo_Hoje = Meta_Mensal × (Dia_Atual ÷ Total_Dias_Mês)
 */
export function calcMonthPace(monthlyTarget: number, currentDay?: number, totalDaysInMonth?: number): {
  targetPaceToday: number;
  day: number;
  totalDays: number;
  pacePercentage: number;
} {
  const now = new Date();
  const day = currentDay !== undefined ? currentDay : now.getDate();
  const totalDays = totalDaysInMonth !== undefined ? totalDaysInMonth : new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  
  const paceFraction = day / totalDays;
  const targetPaceToday = monthlyTarget * paceFraction;
  return {
    targetPaceToday,
    day,
    totalDays,
    pacePercentage: Math.min(100, Math.round(paceFraction * 100))
  };
}

/**
 * Estimativa de Impostos do Período:
 * Impostos_Estimados = Receita_Paga_Período × (∑%Impostos_Ativos ÷ 100)
 */
export function calcEstimatedTaxes(paidRevenue: number, taxes: TaxConfig[]): number {
  const sumPct = taxes.filter(t => t.active).reduce((acc, t) => acc + t.percentage, 0);
  return paidRevenue * (sumPct / 100);
}

/**
 * Compensação Geométrica de Kerf do Laser:
 * Padrão CUT App: Kerf = 0,15 mm
 * Deslocamento Contorno Externo: +Kerf / 2 (+0.075 mm)
 * Deslocamento Furo Interno: -Kerf / 2 (-0.075 mm)
 */
export function calcKerfOffsets(kerf_mm = 0.15): {
  kerf_mm: number;
  outerOffset_mm: number;
  innerHoleOffset_mm: number;
} {
  const half = kerf_mm / 2;
  return {
    kerf_mm,
    outerOffset_mm: Number(half.toFixed(4)),
    innerHoleOffset_mm: Number((-half).toFixed(4))
  };
}
