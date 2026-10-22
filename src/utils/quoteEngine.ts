import type { CompanyProfile, FixedCost, Machine, Material, OrderItem, ProductionOrder, Quote, SalesOrder, TaxConfig } from '../types/index.ts';
import { calcFixedCostMarkupPercentage, calcLaserCutTimeAndCost, calcMachineCostRates, calcMaterialM2Cost, calcSalePriceMarkupDivisor, isMachineCostConfigured } from './calculations.ts';

export interface PricingContext {
  materials: Material[];
  machines: Machine[];
  fixedCosts: FixedCost[];
  monthlyRevenueTarget: number;
  taxes: TaxConfig[];
  company: CompanyProfile;
}

export const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export const entityId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
export const documentNumber = (prefix: string, id: string) => `${prefix}-${new Date().getFullYear()}-${id.replaceAll('-', '').slice(-12).toUpperCase()}`;

export function priceQuote(quote: Pick<Quote, 'items' | 'desiredProfitMarginPct' | 'extraTaxPct' | 'fixedExtraFee'>, context: PricingContext) {
  const errors: string[] = [];
  const { fixedCostPct, isDeficitAlert } = calcFixedCostMarkupPercentage(context.fixedCosts, context.monthlyRevenueTarget);
  if (!(context.monthlyRevenueTarget > 0) || !Number.isFinite(context.monthlyRevenueTarget)) errors.push('Informe uma meta mensal válida.');
  if (context.fixedCosts.some(cost => !Number.isFinite(cost.amount) || cost.amount < 0)) errors.push('Revise os custos fixos cadastrados.');
  if (context.taxes.some(tax => tax.active && (!Number.isFinite(tax.percentage) || tax.percentage < 0 || tax.percentage >= 100))) errors.push('Revise as alíquotas ativas.');
  if (isDeficitAlert) errors.push('A meta mensal não cobre os custos fixos.');
  if (!Number.isFinite(quote.fixedExtraFee) || quote.fixedExtraFee < 0) errors.push('Taxa fixa inválida.');
  if (!quote.items.length) errors.push('Adicione ao menos uma peça.');
  const taxPct = context.taxes.filter(t => t.active).reduce((sum, t) => sum + t.percentage, 0);
  const items = quote.items.map(item => {
    const mat = context.materials.find(m => m.id === item.materialId);
    const mach = context.machines.find(m => m.id === item.machineId);
    const pieceWidth = item.width_mm ?? 0;
    const pieceHeight = item.height_mm ?? 0;
    const validNumbers = [pieceWidth, pieceHeight, item.quantity].every(n => Number.isFinite(n) && n > 0)
      && Number.isSafeInteger(item.quantity)
      && [item.cutLength_mm, item.engraveArea_cm2, item.additionalCost].every(n => Number.isFinite(n) && n >= 0);
    if (!mat || !mach || !validNumbers || !item.description.trim()) errors.push(`Revise os dados da peça: ${item.description || 'sem descrição'}.`);
    if (mach && !isMachineCostConfigured(mach)) errors.push(`Configure custos e horas da máquina para a peça: ${item.description || 'sem descrição'}.`);
    const materialCostUnit = mat ? pieceWidth * pieceHeight / 1e6 * calcMaterialM2Cost(mat).costPerM2 : 0;
    const speed = mat?.speedsByMachine.find(s => s.machineId === mach?.id);
    if (!speed || !Number.isFinite(speed.cutSpeed_mms) || speed.cutSpeed_mms <= 0
      || !Number.isFinite(speed.engraveSpeed_mms) || speed.engraveSpeed_mms <= 0
      || !Number.isFinite(speed.lineInterval_mm) || speed.lineInterval_mm <= 0) {
      errors.push(`Configure velocidades e intervalo de gravação para a peça: ${item.description || 'sem descrição'}.`);
    }
    const laser = calcLaserCutTimeAndCost(item.cutLength_mm, speed?.cutSpeed_mms ?? 20,
      mach ? calcMachineCostRates(mach, context.company.uf).perSecond : 0,
      item.engraveArea_cm2, speed?.engraveSpeed_mms ?? 250, speed?.lineInterval_mm ?? 0.08);
    const directCostUnit = materialCostUnit + laser.totalCost + item.additionalCost;
    const pricing = calcSalePriceMarkupDivisor({ directCost: directCostUnit, fixedCostPct, taxPct,
      extraTaxPct: quote.extraTaxPct, desiredProfitMarginPct: quote.desiredProfitMarginPct });
    if (!pricing.isValid) errors.push(pricing.errorMessage || 'Margem inviável.');
    const unitPrice = pricing.isValid && validNumbers ? money(pricing.salePrice) : 0;
    return { ...item, pieceWidth, pieceHeight, materialCostUnit, laserTimeSecUnit: laser.totalSeconds,
      laserCostUnit: laser.totalCost, directCostUnit, unitPrice, totalPrice: money(unitPrice * item.quantity),
      totalLaserSeconds: laser.totalSeconds * item.quantity };
  });
  const subtotal = money(items.reduce((sum, i) => sum + i.totalPrice, 0));
  const total = money(subtotal + quote.fixedExtraFee);
  if (!Number.isFinite(total) || total <= 0) errors.push('O total da proposta deve ser positivo.');
  return { items, subtotal, total, totalLaserSeconds: items.reduce((sum, i) => sum + i.totalLaserSeconds, 0),
    errors: [...new Set(errors)], isValid: errors.length === 0 };
}

/** One pricing implementation for the editor, saved proposal and sales conversion. */
export function convertQuote(quote: Quote, context: PricingContext, existingOrders: SalesOrder[] = [], ids?: { orderId: string; productionId: (index: number) => string }) {
  if (quote.status === 'Convertido em Pedido' || existingOrders.some(order => order.sourceQuoteId === quote.id)) {
    throw new Error('Este orçamento já foi convertido em pedido.');
  }
  const priced = priceQuote(quote, context);
  if (!priced.isValid) throw new Error(priced.errors.join(' '));
  if (!quote.customerName.trim()) throw new Error('Informe o nome do cliente.');
  const id = ids?.orderId ?? entityId('ped');
  const now = new Date().toISOString();
  const orderItems: OrderItem[] = priced.items.map(item => ({ sku: `SKU-${item.id}`, productName: item.description,
    quantity: item.quantity, unitPrice: item.unitPrice, totalPrice: item.totalPrice, laserTimeSeconds: item.totalLaserSeconds }));
  const order: SalesOrder = { id, orderNumber: documentNumber('PED', id), sourceQuoteId: quote.id,
    channel: 'Balcão/Direto', customerName: quote.customerName, customerDoc: quote.customerDoc,
    customerCity: context.company.city, customerUf: context.company.uf, items: orderItems,
    subtotal: priced.subtotal, shippingCost: quote.fixedExtraFee, discount: 0, total: priced.total,
    paymentMethod: 'A definir', paymentStatus: 'Pendente', fulfillmentStatus: 'Em Produção', createdAt: now };
  const productionOrders: ProductionOrder[] = priced.items.map((item, index) => {
    const opId = ids?.productionId(index) ?? entityId('op');
    return { id: opId, orderNumber: documentNumber('OP', opId), sku: orderItems[index].sku,
      productName: item.description, quantityRequested: item.quantity, quantityIdealCalculated: item.quantity,
      status: 'Aguardando Corte', createdAt: now, dueDate: new Date(Date.now() + 3 * 864e5).toISOString(), priority: 'Alta',
      machineId: item.machineId, materialName: context.materials.find(m => m.id === item.materialId)!.name,
      laserTimeEstimatedMin: Math.ceil(item.totalLaserSeconds / 60), scannedQuantity: 0,
      notes: `Orçamento ${quote.quoteNumber} / Pedido ${order.orderNumber}` };
  });
  return { order, productionOrders, quote: { ...quote, status: 'Convertido em Pedido' as const } };
}
