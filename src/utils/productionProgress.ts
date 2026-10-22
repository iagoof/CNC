import type { ProductionOrder } from '../types/index.ts';

export function releaseProductionReservation(order: Record<string, any>, productId: string, product: Record<string, any>) {
  const current = product.inProductionStock ?? 0;
  if (!Number.isSafeInteger(current) || current < 0) throw new Error('Saldo em produção inválido.');
  if (!order.inventoryProductId) {
    if (current > 0) throw new Error('Reserva antiga sem vínculo com a OP. Reconcilie o saldo em produção.');
    return current;
  }
  if (order.inventoryProductId !== productId || order.inventoryReservedQuantity !== order.quantityRequested || !Number.isSafeInteger(order.inventoryReservedQuantity) || order.inventoryReservedQuantity <= 0 || current < order.inventoryReservedQuantity) throw new Error('Reserva da OP incompatível com o estoque. Revise os vínculos.');
  return current - order.inventoryReservedQuantity;
}

export function planProductionProgress(ownerId: string, order: Record<string, any>, change: { status: ProductionOrder['status'] } | { scannedQuantity: number }) {
  if (order.ownerId !== ownerId) throw new Error('A OP não pertence à sua conta.');
  const statuses = ['Aguardando Corte', 'Cortando na Laser', 'Acabamento/Pintura', 'Montagem', 'Pronto/Embalado'];
  if (!statuses.includes(order.status) || !Number.isSafeInteger(order.quantityRequested) || order.quantityRequested <= 0) throw new Error('Revise os dados da OP.');
  const previous = order.scannedQuantity ?? 0;
  if (!Number.isSafeInteger(previous) || previous < 0 || previous > order.quantityRequested) throw new Error('Conferência da OP inválida.');
  let scannedQuantity = previous, status = order.status;
  if ('scannedQuantity' in change) {
    // Compare with the remote count: a stale screen must not overwrite another scan.
    if (!Number.isSafeInteger(change.scannedQuantity) || change.scannedQuantity !== previous + 1 || change.scannedQuantity > order.quantityRequested || status === 'Pronto/Embalado') throw new Error('A conferência mudou ou a OP foi concluída. Atualize a tela antes de bipar novamente.');
    scannedQuantity = change.scannedQuantity;
    if (scannedQuantity === order.quantityRequested) status = 'Pronto/Embalado';
  } else {
    if (!statuses.includes(change.status)) throw new Error('Etapa de produção inválida.');
    if (status === 'Pronto/Embalado' && change.status !== status) throw new Error('Uma OP concluída não pode voltar ao processo.');
    if (change.status === 'Pronto/Embalado' && scannedQuantity !== order.quantityRequested) throw new Error('Confira todas as unidades antes de concluir a OP.');
    status = change.status;
  }
  return { status, scannedQuantity, completedNow: order.status !== 'Pronto/Embalado' && status === 'Pronto/Embalado' };
}
