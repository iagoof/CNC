export interface ProductDocumentCandidate { id: string; ownerId: string; sku: string }

export function adjustedPhysicalStock(ownerId: string, sku: string, product: Record<string, any>, delta: number) {
  if (product.ownerId !== ownerId || product.sku !== sku) throw new Error('Produto incompatível com a conta.');
  if (!Number.isSafeInteger(delta) || delta === 0) throw new Error('Informe um ajuste inteiro diferente de zero.');
  const next = product.physicalStock + delta;
  if (!Number.isSafeInteger(product.physicalStock) || product.physicalStock < 0 || !Number.isSafeInteger(next) || next < 0) throw new Error('O ajuste deixaria o estoque inválido ou negativo.');
  return next;
}

/** A legacy document is eligible only when its stored owner and SKU match. */
export function selectOwnedProduct(ownerId: string, sku: string, candidates: ProductDocumentCandidate[]) {
  if (candidates.some(candidate => candidate.ownerId !== ownerId || candidate.sku !== sku)) throw new Error('Produto incompatível com a conta ou SKU solicitado.');
  if (candidates.length > 1) throw new Error(`Existem produtos duplicados para ${sku}. Revise os registros antes de continuar.`);
  return candidates[0];
}

export function planProductSave(ownerId: string, sku: string, targetId: string,
  target: Record<string, any> | undefined, legacy: { id: string; data: Record<string, any> } | undefined,
  fields: Record<string, any>, now: unknown): { create: boolean; data: Record<string, any>; deleteId?: string } {
  if (target && legacy) throw new Error('Produtos duplicados. Revise os registros antes de salvar.');
  const existing = legacy?.data || target;
  if (existing && (existing.ownerId !== ownerId || existing.sku !== sku)) throw new Error('O produto não pertence a esta conta ou possui outro SKU.');
  const committedStock = existing ? existing.committedStock ?? 0 : fields.committedStock;
  if (!Number.isSafeInteger(committedStock) || committedStock < 0) throw new Error('Revise o estoque comprometido do produto.');
  if (legacy && !legacy.data.createdAt) throw new Error('O registro antigo não possui data de criação. Revise antes de migrar.');
  const saved = { ...fields, committedStock };
  return target ? { create: false, data: saved, deleteId: undefined } : {
    create: true, deleteId: legacy?.id,
    data: { ...legacy?.data, ...saved, id: targetId, ownerId, createdAt: now,
      ...(legacy ? { legacyId: legacy.id, legacyCreatedAt: legacy.data.createdAt } : {}) }
  };
}

export function assertProductDeletable(ownerId: string, sku: string, product: Record<string, any>) {
  if (product.ownerId !== ownerId || product.sku !== sku) throw new Error('Produto incompatível com a conta.');
  const counts = [product.committedStock ?? 0, product.inProductionStock ?? 0];
  if (counts.some(value => !Number.isSafeInteger(value) || value < 0)) throw new Error('Revise as reservas e a produção antes de excluir.');
  if (counts.some(value => value > 0)) throw new Error('O produto possui reservas ou produção em andamento e não pode ser excluído.');
}
