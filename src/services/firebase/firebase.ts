import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import {
  getFirestore,
  runTransaction,
  doc,
  getDoc,
  getDocs,
  getDocFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  Unsubscribe
} from 'firebase/firestore';
import firebaseConfig from '../../../firebase-applet-config.json';
import { reserveCatalogOrder, productDocumentId } from '../../utils/orderReservation';
import { convertQuoteInTransaction } from '../../utils/quoteConversion';
import { planProductionProgress, releaseProductionReservation } from '../../utils/productionProgress';
import type { PricingContext } from '../../utils/quoteEngine';
import { selectOwnedProduct, planProductSave, assertProductDeletable, adjustedPhysicalStock } from '../../utils/productIdentity';
import { validateFinancialSettings, type FinancialSettingsInput } from '../../utils/financialSettings';
import { ProductionOrder, Material, Quote, CompanyProfile, UF, ProductInventory, SalesOrder, Machine } from '../../types';

// Inicialização oficial do Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Validação de conexão inicial com o servidor Firestore
export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Conexão Firebase offline ou pendente de rede:', error.message);
      return false;
    }
    // Falhas de permissão no doc teste são normais devido ao default-deny
    return true;
  }
}

// Inicializa teste de conexão na inicialização
testConnection().catch(() => {});

// Enumeração de Operações Firestore
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

// Interface obrigatória de diagnóstico de erros Firestore
export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

// Tratador central de erros com serialização JSON obrigatória
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Login via Popup Google
export async function loginWithGoogle(): Promise<FirebaseUser | null> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    if (result.user) {
      await syncUserProfile(result.user);
    }
    return result.user;
  } catch (error) {
    console.error('Erro ao realizar login Google:', error);
    throw error;
  }
}

// Logout
export async function logoutUser(): Promise<void> {
  await signOut(auth);
}

// Sincronização do Perfil do Usuário
export async function syncUserProfile(user: FirebaseUser): Promise<void> {
  const path = `users/${user.uid}`;
  try {
    const userRef = doc(db, 'users', user.uid);
    const existingSnap = await getDoc(userRef);
    const isAdminUser = user.email === 'iagoofss@gmail.com';
    const role = isAdminUser ? 'admin' : 'operator';

    if (!existingSnap.exists()) {
      await setDoc(userRef, {
        id: user.uid,
        email: user.email || '',
        displayName: user.displayName || 'Operador CNC',
        photoURL: user.photoURL || '',
        role: role,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } else {
      await updateDoc(userRef, {
        displayName: user.displayName || 'Operador CNC',
        photoURL: user.photoURL || '',
        updatedAt: serverTimestamp()
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// --- SERVIÇOS DE PERSISTÊNCIA EM TEMPO REAL ---

// Ordens de Produção (Production Orders)
export function subscribeToOrders(
  userId: string,
  onData: (orders: ProductionOrder[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const collectionPath = 'orders';
  const q = query(collection(db, collectionPath), where('ownerId', '==', userId));

  return onSnapshot(
    q,
    snapshot => {
      const orders: ProductionOrder[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        orders.push({
          id: docSnap.id,
          orderNumber: data.orderNumber || '',
          sku: data.sku || '',
          productName: data.productName || '',
          quantityRequested: data.quantityRequested || 0,
          quantityIdealCalculated: data.quantityIdealCalculated || data.quantityRequested || 0,
          status: data.status || 'Aguardando Corte',
          createdAt: typeof data.createdAt?.toDate === 'function' ? data.createdAt.toDate().toISOString() : data.createdAt || new Date().toISOString(),
          dueDate: data.dueDate || new Date().toISOString(),
          priority: data.priority || 'Normal',
          machineId: data.machineId || '',
          materialName: data.materialName || '',
          laserTimeEstimatedMin: data.laserTimeEstimatedMin || 0,
          scannedQuantity: data.scannedQuantity || 0,
          assignedTo: data.assignedTo,
          notes: data.notes
        });
      });
      onData(orders);
    },
    error => {
      if (onError) onError(error);
      console.warn(`Falha ao sincronizar ${collectionPath}:`, error.code);
      window.dispatchEvent(new CustomEvent('cnc-sync-error', { detail: `Falha ao carregar ${collectionPath}. Verifique a conexão e as permissões da conta.` }));
    }
  );
}

export async function progressProductionInFirestore(orderId: string, userId: string, change: { status: ProductionOrder['status'] } | { scannedQuantity: number }): Promise<number> {
  if (auth.currentUser?.uid !== userId) throw new Error('Entre na sua conta para alterar a produção.');
  const orderRef = doc(db, 'orders', orderId);
  const initial = await getDoc(orderRef);
  if (!initial.exists() || initial.data().ownerId !== userId) throw new Error('OP não encontrada nesta conta.');
  const sku = initial.data().sku;
  const custom = initial.data().inventoryMode === 'custom';
  const refs = custom ? null : await resolveOwnedProduct(userId, sku);
  return runTransaction(db, async transaction => {
    if (auth.currentUser?.uid !== userId) throw new Error('A conta mudou. Atualize a tela.');
    const current = await transaction.get(orderRef);
    if (!current.exists() || current.data().sku !== sku || (current.data().inventoryMode === 'custom') !== custom) throw new Error('A OP mudou. Atualize a tela.');
    const plan = planProductionProgress(userId, current.data(), change);
    if (plan.status === current.data().status && plan.scannedQuantity === (current.data().scannedQuantity ?? 0)) return plan.scannedQuantity;
    if (plan.completedNow && refs) {
      const target = await transaction.get(refs.target);
      const candidate = refs.candidate.path === refs.target.path ? target : await transaction.get(refs.candidate);
      if (target.exists() && candidate.exists() && refs.candidate.path !== refs.target.path) throw new Error('Produtos duplicados. Revise o cadastro.');
      const product = candidate.exists() ? candidate : target;
      if (product.exists()) {
        const data = product.data();
        const physicalStock = adjustedPhysicalStock(userId, sku, data, current.data().quantityRequested);
        const inProductionStock = releaseProductionReservation(current.data(), product.id, data);
        transaction.update(product.ref, { physicalStock, inProductionStock, updatedAt: serverTimestamp() });
      } else if (current.data().inventoryProductId) {
        throw new Error('O produto reservado pela OP não foi encontrado.');
      }
    }
    transaction.update(orderRef, { status: plan.status, scannedQuantity: plan.scannedQuantity, updatedAt: serverTimestamp() });
    return plan.scannedQuantity;
  });
}

export async function createInventoryProductionInFirestore(order: ProductionOrder, userId: string): Promise<void> {
  if (auth.currentUser?.uid !== userId) throw new Error('Entre na sua conta para criar uma OP.');
  if (!Number.isSafeInteger(order.quantityRequested) || order.quantityRequested <= 0 || order.status !== 'Aguardando Corte' || order.scannedQuantity !== 0) throw new Error('Quantidade ou estado inicial da OP inválido.');
  const refs = await resolveOwnedProduct(userId, order.sku);
  const orderRef = doc(db, 'orders', order.id);
  await runTransaction(db, async transaction => {
    if (auth.currentUser?.uid !== userId) throw new Error('A conta mudou. Atualize a tela.');
    const existing = await transaction.get(orderRef);
    const target = await transaction.get(refs.target);
    const candidate = refs.candidate.path === refs.target.path ? target : await transaction.get(refs.candidate);
    if (target.exists() && candidate.exists() && refs.candidate.path !== refs.target.path) throw new Error('Produtos duplicados. Revise o cadastro.');
    const product = candidate.exists() ? candidate : target;
    if (!product.exists() || product.data().ownerId !== userId || product.data().sku !== order.sku) throw new Error('Produto não encontrado nesta conta.');
    if (existing.exists()) {
      const saved = existing.data();
      if (saved.ownerId === userId && saved.sku === order.sku && saved.quantityRequested === order.quantityRequested && saved.inventoryProductId === product.id && saved.inventoryReservedQuantity === order.quantityRequested) return;
      throw new Error('Identificador de OP já utilizado.');
    }
    const current = product.data().inProductionStock ?? 0;
    const next = current + order.quantityRequested;
    if (!Number.isSafeInteger(current) || current < 0 || !Number.isSafeInteger(next)) throw new Error('Saldo em produção inválido.');
    transaction.set(orderRef, { ...order, ownerId: userId, inventoryProductId: product.id, inventoryReservedQuantity: order.quantityRequested, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    transaction.update(product.ref, { inProductionStock: next, updatedAt: serverTimestamp() });
  });
}

export async function createCustomProductionInFirestore(order: ProductionOrder, userId: string): Promise<void> {
  if (auth.currentUser?.uid !== userId) throw new Error('Entre na sua conta para criar uma OP.');
  if (!order.sku.startsWith('CUSTOM-') || !Number.isSafeInteger(order.quantityRequested) || order.quantityRequested <= 0 || order.status !== 'Aguardando Corte' || order.scannedQuantity !== 0) throw new Error('Dados da OP sob encomenda inválidos.');
  const orderRef = doc(db, 'orders', order.id);
  const refs = await resolveOwnedProduct(userId, order.sku);
  await runTransaction(db, async transaction => {
    if (auth.currentUser?.uid !== userId) throw new Error('A conta mudou. Atualize a tela.');
    const saved = await transaction.get(orderRef);
    const product = await transaction.get(refs.candidate);
    if (product.exists()) throw new Error('Este SKU já pertence ao catálogo. Use uma OP com reserva de estoque.');
    if (saved.exists()) {
      const data = saved.data();
      if (data.ownerId === userId && data.inventoryMode === 'custom' && data.sku === order.sku && data.quantityRequested === order.quantityRequested) return;
      throw new Error('Identificador de OP já utilizado.');
    }
    transaction.set(orderRef, { ...order, ownerId: userId, inventoryMode: 'custom', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  });
}

export async function deleteInventoryProductionInFirestore(orderId: string, userId: string): Promise<void> {
  if (auth.currentUser?.uid !== userId) throw new Error('Entre na sua conta para excluir uma OP.');
  if (orderId.startsWith('op-q-')) throw new Error('OP vinculada a orçamento: o cancelamento precisa preservar o pedido comercial.');
  const orderRef = doc(db, 'orders', orderId);
  const initial = await getDoc(orderRef);
  if (!initial.exists()) return;
  if (initial.data().ownerId !== userId) throw new Error('OP de outra conta.');
  const sku = initial.data().sku, custom = initial.data().inventoryMode === 'custom', refs = custom ? null : await resolveOwnedProduct(userId, sku);
  await runTransaction(db, async transaction => {
    if (auth.currentUser?.uid !== userId) throw new Error('A conta mudou. Atualize a tela.');
    const current = await transaction.get(orderRef);
    if (!current.exists()) return;
    const order = current.data();
    if (order.ownerId !== userId || order.sku !== sku || (order.inventoryMode === 'custom') !== custom) throw new Error('A OP mudou. Atualize a tela.');
    if (order.status === 'Pronto/Embalado' || (order.scannedQuantity ?? 0) > 0) throw new Error('Uma OP conferida ou concluída não pode ser excluída.');
    if (refs) {
      const target = await transaction.get(refs.target);
      const candidate = refs.candidate.path === refs.target.path ? target : await transaction.get(refs.candidate);
      if (target.exists() && candidate.exists() && refs.candidate.path !== refs.target.path) throw new Error('Produtos duplicados.');
      const product = candidate.exists() ? candidate : target;
      if (product.exists()) {
        if (product.data().ownerId !== userId || product.data().sku !== sku) throw new Error('Produto incompatível com a OP.');
        const inProductionStock = releaseProductionReservation(order, product.id, product.data());
        transaction.update(product.ref, { inProductionStock, updatedAt: serverTimestamp() });
      } else if (order.inventoryProductId) throw new Error('Produto reservado não encontrado.');
    }
    transaction.delete(orderRef);
  });
}

export async function saveOrderToFirestore(order: ProductionOrder, userId: string): Promise<void> {
  const path = `orders/${order.id}`;
  try {
    const docRef = doc(db, 'orders', order.id);
    const existingSnap = await getDoc(docRef);

    if (existingSnap.exists()) {
      await updateDoc(docRef, {
        status: order.status,
        priority: order.priority,
        scannedQuantity: order.scannedQuantity,
        dueDate: order.dueDate,
        assignedTo: order.assignedTo ?? '',
        notes: order.notes ?? '',
        productName: order.productName,
        quantityRequested: order.quantityRequested,
        quantityIdealCalculated: order.quantityIdealCalculated,
        machineId: order.machineId,
        materialName: order.materialName,
        laserTimeEstimatedMin: order.laserTimeEstimatedMin,
        updatedAt: serverTimestamp()
      });
    } else {
      await setDoc(docRef, {
        id: order.id,
        orderNumber: order.orderNumber,
        ownerId: userId,
        sku: order.sku,
        productName: order.productName,
        quantityRequested: order.quantityRequested,
        quantityIdealCalculated: order.quantityIdealCalculated,
        status: order.status,
        priority: order.priority,
        machineId: order.machineId,
        materialName: order.materialName,
        laserTimeEstimatedMin: order.laserTimeEstimatedMin,
        scannedQuantity: order.scannedQuantity,
        dueDate: order.dueDate,
        assignedTo: order.assignedTo ?? '',
        notes: order.notes ?? '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteOrderFromFirestore(orderId: string): Promise<void> {
  const path = `orders/${orderId}`;
  try {
    await deleteDoc(doc(db, 'orders', orderId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Materiais (Materials)
export function subscribeToMaterials(
  userId: string,
  onData: (materials: Material[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const collectionPath = 'materials';
  const q = query(collection(db, collectionPath), where('ownerId', '==', userId));

  return onSnapshot(
    q,
    snapshot => {
      const materials: Material[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        materials.push({
          id: docSnap.id,
          name: data.name || '',
          category: data.category || 'MDF',
          thickness_mm: data.thickness_mm ?? 0,
          sheetWidth_mm: data.sheetWidth_mm ?? 0,
          sheetLength_mm: data.sheetLength_mm ?? 0,
          unitCost: data.unitCost ?? 0,
          shippingCost: data.shippingCost ?? 0,
          lossPercentage: data.lossPercentage ?? 5,
          density_kg_m3: data.density_kg_m3 ?? 0,
          speedsByMachine: Array.isArray(data.speedsByMachine) ? data.speedsByMachine : []
        });
      });
      onData(materials);
    },
    error => {
      if (onError) onError(error);
      console.warn(`Falha ao sincronizar ${collectionPath}:`, error.code);
      window.dispatchEvent(new CustomEvent('cnc-sync-error', { detail: `Falha ao carregar ${collectionPath}. Verifique a conexão e as permissões da conta.` }));
    }
  );
}

export async function saveMaterialToFirestore(material: Material, userId: string): Promise<void> {
  const path = `materials/${material.id}`;
  try {
    const docRef = doc(db, 'materials', material.id);
    await runTransaction(db, async transaction => {
      const existingSnap = await transaction.get(docRef);
      if (existingSnap.exists() && existingSnap.data().ownerId !== userId) throw new Error('Material pertence a outra conta.');
      if (existingSnap.exists()) {
        transaction.update(docRef, {
        name: material.name,
        category: material.category,
        thickness_mm: material.thickness_mm,
        sheetWidth_mm: material.sheetWidth_mm,
        sheetLength_mm: material.sheetLength_mm,
        unitCost: material.unitCost,
        shippingCost: material.shippingCost,
        lossPercentage: material.lossPercentage,
        density_kg_m3: material.density_kg_m3,
        speedsByMachine: material.speedsByMachine,
        updatedAt: serverTimestamp()
        });
      } else {
        transaction.set(docRef, {
        id: material.id,
        ownerId: userId,
        name: material.name,
        category: material.category,
        thickness_mm: material.thickness_mm,
        sheetWidth_mm: material.sheetWidth_mm,
        sheetLength_mm: material.sheetLength_mm,
        unitCost: material.unitCost,
        shippingCost: material.shippingCost,
        lossPercentage: material.lossPercentage,
        density_kg_m3: material.density_kg_m3,
        speedsByMachine: material.speedsByMachine,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
        });
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteMaterialFromFirestore(materialId: string, userId: string): Promise<void> {
  const path = `materials/${materialId}`;
  try {
    const docRef = doc(db, 'materials', materialId);
    await runTransaction(db, async transaction => {
      const existing = await transaction.get(docRef);
      if (!existing.exists()) return;
      if (existing.data().ownerId !== userId) throw new Error('Material pertence a outra conta.');
      transaction.delete(docRef);
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Orçamentos (Quotes)
export function subscribeToQuotes(
  userId: string,
  onData: (quotes: Quote[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const collectionPath = 'quotes';
  const q = query(collection(db, collectionPath), where('ownerId', '==', userId));

  return onSnapshot(
    q,
    snapshot => {
      const quotes: Quote[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        quotes.push({
          id: docSnap.id,
          quoteNumber: data.quoteNumber || '',
          customerName: data.customerName || '',
          customerPhone: data.customerPhone || '',
          customerEmail: data.customerEmail || '',
          customerDoc: data.customerDoc || '',
          items: Array.isArray(data.items) ? data.items : [],
          validUntil: data.validUntil || '',
          notes: data.notes || '',
          desiredProfitMarginPct: data.desiredProfitMarginPct ?? 35,
          extraTaxPct: data.extraTaxPct ?? 0,
          fixedExtraFee: data.fixedExtraFee ?? 0,
          createdAt: typeof data.createdAt?.toDate === 'function' ? data.createdAt.toDate().toISOString() : data.createdAt || new Date().toISOString(),
          status: data.status || 'Rascunho'
        });
      });
      onData(quotes);
    },
    error => {
      if (onError) onError(error);
      console.warn(`Falha ao sincronizar ${collectionPath}:`, error.code);
      window.dispatchEvent(new CustomEvent('cnc-sync-error', { detail: `Falha ao carregar ${collectionPath}. Verifique a conexão e as permissões da conta.` }));
    }
  );
}

export async function saveQuoteToFirestore(quote: Quote, userId: string): Promise<void> {
  const path = `quotes/${quote.id}`;
  try {
    const docRef = doc(db, 'quotes', quote.id);
    const existingSnap = await getDoc(docRef);

    if (existingSnap.exists()) {
      await updateDoc(docRef, {
        customerName: quote.customerName,
        customerPhone: quote.customerPhone,
        customerEmail: quote.customerEmail,
        customerDoc: quote.customerDoc,
        status: quote.status,
        validUntil: quote.validUntil,
        notes: quote.notes,
        items: quote.items.map(item => Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined))),
        desiredProfitMarginPct: quote.desiredProfitMarginPct,
        extraTaxPct: quote.extraTaxPct,
        fixedExtraFee: quote.fixedExtraFee,
        updatedAt: serverTimestamp()
      });
    } else {
      await setDoc(docRef, {
        id: quote.id,
        ownerId: userId,
        quoteNumber: quote.quoteNumber,
        customerName: quote.customerName,
        customerPhone: quote.customerPhone,
        customerEmail: quote.customerEmail,
        customerDoc: quote.customerDoc,
        status: quote.status,
        validUntil: quote.validUntil,
        notes: quote.notes,
        items: quote.items.map(item => Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined))),
        desiredProfitMarginPct: quote.desiredProfitMarginPct,
        extraTaxPct: quote.extraTaxPct,
        fixedExtraFee: quote.fixedExtraFee,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteQuoteFromFirestore(quoteId: string, userId: string): Promise<void> {
  const path = `quotes/${quoteId}`;
  try {
    if (auth.currentUser?.uid !== userId) throw new Error('Entre na sua conta para excluir orçamentos.');
    const quoteRef = doc(db, 'quotes', quoteId);
    await runTransaction(db, async transaction => {
      if (auth.currentUser?.uid !== userId) throw new Error('A conta mudou. Atualize a tela.');
      const snapshot = await transaction.get(quoteRef);
      if (!snapshot.exists()) return;
      if (snapshot.data().ownerId !== userId) throw new Error('Orçamento de outra conta.');
      if (snapshot.data().status === 'Convertido em Pedido') throw new Error('Este orçamento possui pedido vinculado e não pode ser excluído.');
      transaction.delete(quoteRef);
    });
  } catch (error) {
    if (!(error as { code?: string })?.code) throw error;
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Vetores e Projetos CAD/CAM (Projects)
export interface FirestoreProject {
  id: string;
  name: string;
  ownerId: string;
  svgContent: string;
  widthMm: number;
  heightMm: number;
  cutLengthMm?: number;
  engraveAreaCm2?: number;
  materialCategory?: string;
  recommendedThicknessMm?: number;
  source?: 'ai_prompt' | 'image_trace' | 'parametric_box' | 'catalog' | 'local_vector';
  createdAt?: any;
  updatedAt?: any;
}

export function subscribeToProjects(
  userId: string,
  onData: (projects: FirestoreProject[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const collectionPath = 'projects';
  const q = query(collection(db, collectionPath), where('ownerId', '==', userId));

  return onSnapshot(
    q,
    snapshot => {
      const projects: FirestoreProject[] = [];
      snapshot.forEach(docSnap => {
        projects.push(docSnap.data() as FirestoreProject);
      });
      onData(projects);
    },
    error => {
      if (onError) onError(error);
      console.warn(`Falha ao sincronizar ${collectionPath}:`, error.code);
      window.dispatchEvent(new CustomEvent('cnc-sync-error', { detail: `Falha ao carregar ${collectionPath}. Verifique a conexão e as permissões da conta.` }));
    }
  );
}

export async function saveProjectToFirestore(project: FirestoreProject, userId: string): Promise<void> {
  const path = `projects/${project.id}`;
  try {
    const docRef = doc(db, 'projects', project.id);
    await runTransaction(db, async transaction => {
      const existingSnap = await transaction.get(docRef);
      if (existingSnap.exists() && existingSnap.data().ownerId !== userId) {
        throw new Error('Projeto pertence a outra conta.');
      }
      if (existingSnap.exists()) {
        transaction.update(docRef, {
        name: project.name,
        svgContent: project.svgContent,
        widthMm: project.widthMm,
        heightMm: project.heightMm,
        cutLengthMm: project.cutLengthMm || 0,
        engraveAreaCm2: project.engraveAreaCm2 || 0,
        materialCategory: project.materialCategory || 'MDF',
        recommendedThicknessMm: project.recommendedThicknessMm || 3,
        source: project.source || 'ai_prompt',
        updatedAt: serverTimestamp()
        });
      } else {
        transaction.set(docRef, {
        id: project.id,
        name: project.name,
        ownerId: userId,
        svgContent: project.svgContent,
        widthMm: project.widthMm,
        heightMm: project.heightMm,
        cutLengthMm: project.cutLengthMm || 0,
        engraveAreaCm2: project.engraveAreaCm2 || 0,
        materialCategory: project.materialCategory || 'MDF',
        recommendedThicknessMm: project.recommendedThicknessMm || 3,
        source: project.source || 'ai_prompt',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
        });
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteProjectFromFirestore(projectId: string, userId: string): Promise<void> {
  const path = `projects/${projectId}`;
  try {
    const docRef = doc(db, 'projects', projectId);
    await runTransaction(db, async transaction => {
      const existing = await transaction.get(docRef);
      if (!existing.exists()) return;
      if (existing.data().ownerId !== userId) throw new Error('Projeto pertence a outra conta.');
      transaction.delete(docRef);
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Configurações da Empresa e Máquinas (CompanySettings)
export interface FirestoreCompanySettings {
  name?: string;
  ie?: string;
  address?: string;
  cep?: string;
  phone?: string;
  email?: string;
  id: string;
  ownerId: string;
  tradeName: string;
  cnpj?: string;
  city?: string;
  uf?: UF;
  cemigRateKwh?: number;
  monthlyWorkHours?: number;
  createdAt?: any;
  updatedAt?: any;
}

export function subscribeToCompanySettings(
  userId: string,
  onData: (settings: FirestoreCompanySettings | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const collectionPath = 'settings';
  const q = query(collection(db, collectionPath), where('ownerId', '==', userId));

  return onSnapshot(
    q,
    snapshot => {
      if (snapshot.empty) {
        onData(null);
        return;
      }
      const docSnap = snapshot.docs[0];
      onData(docSnap.data() as FirestoreCompanySettings);
    },
    error => {
      if (onError) onError(error);
      console.warn(`Falha ao sincronizar ${collectionPath}:`, error.code);
      window.dispatchEvent(new CustomEvent('cnc-sync-error', { detail: `Falha ao carregar ${collectionPath}. Verifique a conexão e as permissões da conta.` }));
    }
  );
}

export async function saveCompanySettingsToFirestore(
  settings: Partial<FirestoreCompanySettings> & { tradeName: string },
  userId: string
): Promise<void> {
  if (!settings.tradeName.trim()) throw new Error('Informe o nome fantasia da oficina.');
  const settingId = settings.id || `set-${userId}`;
  const path = `settings/${settingId}`;
  try {
    const docRef = doc(db, 'settings', settingId);
    const dataToSave: Record<string, any> = {
      tradeName: settings.tradeName,
      updatedAt: serverTimestamp()
    };
    for (const field of ['name', 'ie', 'address', 'cep', 'phone', 'email'] as const) {
      if (settings[field] !== undefined) dataToSave[field] = settings[field];
    }
    if (settings.cnpj !== undefined) dataToSave.cnpj = settings.cnpj;
    if (settings.city !== undefined) dataToSave.city = settings.city;
    if (settings.uf !== undefined) dataToSave.uf = settings.uf;
    if (settings.cemigRateKwh !== undefined) dataToSave.cemigRateKwh = Number(settings.cemigRateKwh);
    if (settings.monthlyWorkHours !== undefined) dataToSave.monthlyWorkHours = Number(settings.monthlyWorkHours);

    await runTransaction(db, async transaction => {
      const existingSnap = await transaction.get(docRef);
      if (existingSnap.exists() && existingSnap.data().ownerId !== userId) throw new Error('Perfil pertence a outra conta.');
      if (existingSnap.exists()) transaction.update(docRef, dataToSave);
      else transaction.set(docRef, { id: settingId, ownerId: userId, ...dataToSave, createdAt: serverTimestamp() });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export interface FirestoreFinancialSettings extends FinancialSettingsInput {
  id: string;
  ownerId: string;
}

export function subscribeToFinancialSettings(userId: string, onData: (settings: FirestoreFinancialSettings | null) => void, onError?: (err: Error) => void): Unsubscribe {
  return onSnapshot(doc(db, 'financial_settings', userId), snapshot => {
    onData(snapshot.exists() ? snapshot.data() as FirestoreFinancialSettings : null);
  }, error => {
    if (onError) onError(error);
    window.dispatchEvent(new CustomEvent('cnc-sync-error', { detail: 'Falha ao carregar os parâmetros financeiros da conta.' }));
  });
}

export async function saveFinancialSettingsToFirestore(input: FinancialSettingsInput, userId: string): Promise<void> {
  validateFinancialSettings(input);
  const path = `financial_settings/${userId}`;
  try {
    const ref = doc(db, 'financial_settings', userId);
    await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(ref);
      if (snapshot.exists() && snapshot.data().ownerId !== userId) throw new Error('Configurações financeiras pertencem a outra conta.');
      if (snapshot.exists()) transaction.update(ref, { ...input, updatedAt: serverTimestamp() });
      else transaction.set(ref, { id: userId, ownerId: userId, ...input, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    });
  } catch (error) { handleFirestoreError(error, OperationType.WRITE, path); }
}

// PRODUTOS & ESTOQUE (ProductInventory)
export function subscribeToProducts(
  userId: string,
  onData: (products: ProductInventory[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const collectionPath = 'products';
  const q = query(collection(db, collectionPath), where('ownerId', '==', userId));

  return onSnapshot(
    q,
    snapshot => {
      const items: ProductInventory[] = [];
      snapshot.forEach(docSnap => {
        const d = docSnap.data();
        items.push({
          sku: d.sku,
          name: d.name,
          category: d.category,
          physicalStock: Number(d.physicalStock || 0),
          committedStock: Number(d.committedStock || 0),
          minStock: Number(d.minStock || 0),
          idealStock: Number(d.idealStock || 0),
          inProductionStock: Number(d.inProductionStock || 0),
          minBatchToProduce: Number(d.minBatchToProduce || 1),
          batchMultiple: Number(d.batchMultiple || 1),
          unitPrice: Number(d.unitPrice || 0),
          costPrice: Number(d.costPrice || 0),
          materialId: d.materialId || '',
          estimatedLaserTimeSeconds: Number(d.estimatedLaserTimeSeconds || 0),
          dimensions_mm: d.dimensions_mm || { width: 0, height: 0, depth: 0 }
        });
      });
      onData(items);
    },
    error => {
      if (onError) onError(error);
      console.warn(`Falha ao sincronizar ${collectionPath}:`, error.code);
      window.dispatchEvent(new CustomEvent('cnc-sync-error', { detail: `Falha ao carregar ${collectionPath}. Verifique a conexão e as permissões da conta.` }));
    }
  );
}

async function resolveOwnedProduct(userId: string, sku: string) {
  const id = await productDocumentId(userId, sku);
  const snapshots = await getDocs(query(collection(db, 'products'), where('ownerId', '==', userId), where('sku', '==', sku)));
  const candidate = selectOwnedProduct(userId, sku, snapshots.docs.map(snapshot => ({ id: snapshot.id, ownerId: snapshot.data().ownerId, sku: snapshot.data().sku })));
  return { target: doc(db, 'products', id), candidate: candidate ? doc(db, 'products', candidate.id) : doc(db, 'products', id) };
}

export async function saveProductToFirestore(product: ProductInventory, userId: string, createOnly = false): Promise<void> {
  if (auth.currentUser?.uid !== userId) throw new Error('Entre na sua conta para salvar produtos.');
  const cleanId = await productDocumentId(userId, product.sku);
  const path = `products/${cleanId}`;
  try {
    const refs = await resolveOwnedProduct(userId, product.sku);

    const dataToSave: Record<string, any> = {
      sku: product.sku,
      name: product.name,
      category: product.category || 'Geral',
      physicalStock: Number(product.physicalStock || 0),
      committedStock: Number(product.committedStock || 0),
      minStock: Number(product.minStock || 0),
      idealStock: Number(product.idealStock || 0),
      inProductionStock: Number(product.inProductionStock || 0),
      minBatchToProduce: Number(product.minBatchToProduce || 1),
      batchMultiple: Number(product.batchMultiple || 1),
      unitPrice: Number(product.unitPrice || 0),
      costPrice: Number(product.costPrice || 0),
      materialId: product.materialId || '',
      estimatedLaserTimeSeconds: Number(product.estimatedLaserTimeSeconds || 0),
      dimensions_mm: product.dimensions_mm || { width: 0, height: 0, depth: 0 },
      updatedAt: serverTimestamp()
    };

    await runTransaction(db, async transaction => {
      if (auth.currentUser?.uid !== userId) throw new Error('A conta mudou. Atualize a tela.');
      const target = await transaction.get(refs.target);
      const candidate = refs.candidate.path === refs.target.path ? target : await transaction.get(refs.candidate);
      if (createOnly && (target.exists() || candidate.exists())) throw new Error('Este SKU já está cadastrado. Atualize a lista de produtos.');
      const plan = planProductSave(userId, product.sku, cleanId, target.exists() ? target.data() : undefined,
        candidate.exists() && refs.candidate.path !== refs.target.path ? { id: candidate.id, data: candidate.data() } : undefined,
        dataToSave, serverTimestamp());
      if (plan.create) transaction.set(refs.target, plan.data);
      else transaction.update(refs.target, plan.data);
      if (plan.deleteId) transaction.delete(doc(db, 'products', plan.deleteId));
    });
  } catch (error) {
    if (!(error as { code?: string })?.code) throw error;
    throw new Error('Não foi possível salvar o produto. Verifique a conexão e as permissões.');
  }
}

export async function adjustProductStockInFirestore(sku: string, delta: number, userId: string): Promise<void> {
  if (auth.currentUser?.uid !== userId) throw new Error('Entre na sua conta para ajustar o estoque.');
  const refs = await resolveOwnedProduct(userId, sku);
  await runTransaction(db, async transaction => {
    if (auth.currentUser?.uid !== userId) throw new Error('A conta mudou. Atualize a tela.');
    const target = await transaction.get(refs.target);
    const candidate = refs.candidate.path === refs.target.path ? target : await transaction.get(refs.candidate);
    if (target.exists() && candidate.exists() && refs.candidate.path !== refs.target.path) throw new Error('Produtos duplicados. Revise os registros.');
    const existing = candidate.exists() ? candidate : target;
    if (!existing.exists()) throw new Error('Produto não encontrado. Atualize a lista.');
    const physicalStock = adjustedPhysicalStock(userId, sku, existing.data(), delta);
    transaction.update(existing.ref, { physicalStock, updatedAt: serverTimestamp() });
  });
}

export async function deleteProductFromFirestore(sku: string, userId: string): Promise<void> {
  if (auth.currentUser?.uid !== userId) throw new Error('Entre na sua conta para excluir produtos.');
  const cleanId = await productDocumentId(userId, sku);
  const path = `products/${cleanId}`;
  try {
    const refs = await resolveOwnedProduct(userId, sku);
    await runTransaction(db, async transaction => {
      if (auth.currentUser?.uid !== userId) throw new Error('A conta mudou. Atualize a tela.');
      const target = await transaction.get(refs.target);
      const candidate = refs.candidate.path === refs.target.path ? target : await transaction.get(refs.candidate);
      if (target.exists() && candidate.exists() && refs.candidate.path !== refs.target.path) throw new Error('Produtos duplicados. Revise os registros antes de excluir.');
      const existing = candidate.exists() ? candidate : target;
      if (!existing.exists()) return;
      assertProductDeletable(userId, sku, existing.data());
      transaction.delete(existing.ref);
    });
  } catch (error) {
    if (!(error as { code?: string })?.code) throw error;
    throw new Error('Não foi possível excluir o produto. Verifique a conexão e as permissões.');
  }
}

// PEDIDOS DE VENDA & CANAIS (SalesOrder)
export function subscribeToSalesOrders(
  userId: string,
  onData: (orders: SalesOrder[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const collectionPath = 'sales_orders';
  const q = query(collection(db, collectionPath), where('ownerId', '==', userId));

  return onSnapshot(
    q,
    snapshot => {
      const orders: SalesOrder[] = [];
      snapshot.forEach(docSnap => {
        const d = docSnap.data();
        orders.push({
          id: d.id,
          orderNumber: d.orderNumber,
          sourceQuoteId: d.sourceQuoteId,
          channel: d.channel,
          customerName: d.customerName,
          customerDoc: d.customerDoc || '',
          customerCity: d.customerCity || '',
          customerUf: d.customerUf || 'MG',
          items: Array.isArray(d.items) ? d.items : [],
          subtotal: Number(d.subtotal || 0),
          shippingCost: Number(d.shippingCost || 0),
          discount: Number(d.discount || 0),
          total: Number(d.total || 0),
          paymentMethod: d.paymentMethod || 'Pix Asaas',
          paymentStatus: d.paymentStatus || 'Pendente',
          paidAt: d.paidAt,
          fulfillmentStatus: d.fulfillmentStatus || 'Pendente',
          invoiceKey: d.invoiceKey,
          trackingCode: d.trackingCode,
          createdAt: typeof d.createdAt?.toDate === 'function' ? d.createdAt.toDate().toISOString() : (d.createdAt || new Date().toISOString())
        });
      });
      onData(orders);
    },
    error => {
      if (onError) onError(error);
      console.warn(`Falha ao sincronizar ${collectionPath}:`, error.code);
      window.dispatchEvent(new CustomEvent('cnc-sync-error', { detail: `Falha ao carregar ${collectionPath}. Verifique a conexão e as permissões da conta.` }));
    }
  );
}

export async function convertQuoteInFirestore(quote: Quote, context: PricingContext, userId: string): Promise<void> {
  if (!userId || auth.currentUser?.uid !== userId) throw new Error('Entre na sua conta para converter orçamentos.');
  try {
    await runTransaction(db, async transaction => {
      if (auth.currentUser?.uid !== userId) throw new Error('A conta mudou. Atualize a tela antes de converter.');
      const read = async (collection: string, id: string) => {
        const snapshot = await transaction.get(doc(db, collection, id));
        return snapshot.exists() ? snapshot.data() : undefined;
      };
      const clean = (value: object) => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
      await convertQuoteInTransaction({
        getQuote: async id => await read('quotes', id) as Quote & { ownerId: string } | undefined,
        getSale: async id => await read('sales_orders', id) as SalesOrder & { ownerId: string } | undefined,
        getProduction: id => read('orders', id),
        writeQuote: (value, exists) => {
          const ref = doc(db, 'quotes', value.id);
          if (exists) transaction.update(ref, { status: value.status, updatedAt: serverTimestamp() });
          else transaction.set(ref, { ...clean(value), items: value.items.map(clean), ownerId: userId, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        },
        createSale: value => transaction.set(doc(db, 'sales_orders', value.id), { ...clean(value), items: value.items.map(clean), ownerId: userId, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }),
        createProduction: value => transaction.set(doc(db, 'orders', value.id), { ...clean(value), ownerId: userId, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
      }, quote, context, userId);
    });
  } catch (error) {
    if ((error as { code?: string })?.code) throw new Error('Não foi possível confirmar a conversão na nuvem. Verifique a conexão e as permissões e tente novamente.');
    throw error;
  }
}

export async function createCatalogOrderInFirestore(order: SalesOrder, userId: string): Promise<void> {
  if (!userId || auth.currentUser?.uid !== userId) throw new Error('Entre na sua conta para registrar pedidos.');
  try {
    const productRefs = new Map(await Promise.all([...new Set(order.items.map(item => item.sku))].map(async sku => {
      const refs = await resolveOwnedProduct(userId, sku);
      return [refs.target.id, refs] as const;
    })));
    await runTransaction(db, async transaction => {
      if (auth.currentUser?.uid !== userId) throw new Error('A conta mudou. Entre novamente antes de confirmar.');
      const stockRefs = new Map<string, ReturnType<typeof doc>>();
      await reserveCatalogOrder({
        getOrder: async id => {
          const snapshot = await transaction.get(doc(db, 'sales_orders', id));
          return snapshot.exists() ? snapshot.data() as SalesOrder & { ownerId: string } : undefined;
        },
        getProduct: async id => {
          const refs = productRefs.get(id);
          if (!refs) throw new Error('Produto não localizado nesta conta. Atualize o catálogo.');
          const target = await transaction.get(refs.target);
          const candidate = refs.candidate.path === refs.target.path ? target : await transaction.get(refs.candidate);
          if (target.exists() && candidate.exists() && refs.candidate.path !== refs.target.path) throw new Error('Produtos duplicados. Revise os registros antes de confirmar.');
          const snapshot = candidate.exists() ? candidate : target;
          stockRefs.set(id, snapshot.ref);
          return snapshot.exists() ? snapshot.data() as ProductInventory & { ownerId: string } : undefined;
        },
        createOrder: (value, ownerId) => transaction.set(doc(db, 'sales_orders', value.id), {
          ...value, ownerId, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        }),
        updateStock: (id, committedStock) => {
          const ref = stockRefs.get(id);
          if (!ref) throw new Error('A reserva não possui produto correspondente.');
          transaction.update(ref, { committedStock, updatedAt: serverTimestamp() });
        }
      }, order, userId);
    });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code) throw new Error('Não foi possível confirmar pedido e estoque na nuvem. Verifique a conexão e as permissões e tente novamente.');
    throw error;
  }
}

export async function saveSalesOrderToFirestore(order: SalesOrder, userId: string): Promise<void> {
  const path = `sales_orders/${order.id}`;
  try {
    const docRef = doc(db, 'sales_orders', order.id);
    const existingSnap = await getDoc(docRef);

    const sanitizedItems = (order.items || []).map(item =>
      Object.fromEntries(
        Object.entries({
          sku: item.sku,
          productName: item.productName,
          quantity: Number(item.quantity || 1),
          unitPrice: Number(item.unitPrice || 0),
          totalPrice: Number(item.totalPrice || 0),
          laserTimeSeconds: Number(item.laserTimeSeconds || 0)
        }).filter(([, v]) => v !== undefined)
      )
    );

    const baseData: Record<string, any> = {
      orderNumber: order.orderNumber,
      channel: order.channel || 'Loja Própria',
      customerName: order.customerName,
      customerDoc: order.customerDoc || '',
      customerCity: order.customerCity || '',
      customerUf: order.customerUf || 'MG',
      items: sanitizedItems,
      subtotal: Number(order.subtotal || 0),
      shippingCost: Number(order.shippingCost || 0),
      discount: Number(order.discount || 0),
      total: Number(order.total || 0),
      paymentMethod: order.paymentMethod || 'Pix Asaas',
      paymentStatus: order.paymentStatus || 'Pendente',
      fulfillmentStatus: order.fulfillmentStatus || 'Pendente',
      updatedAt: serverTimestamp()
    };

    if (order.sourceQuoteId) baseData.sourceQuoteId = order.sourceQuoteId;
    if (order.paidAt) baseData.paidAt = order.paidAt;
    if (order.invoiceKey) baseData.invoiceKey = order.invoiceKey;
    if (order.trackingCode) baseData.trackingCode = order.trackingCode;

    if (existingSnap.exists()) {
      await updateDoc(docRef, baseData);
    } else {
      await setDoc(docRef, {
        id: order.id,
        ownerId: userId,
        ...baseData,
        createdAt: serverTimestamp()
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteSalesOrderFromFirestore(orderId: string): Promise<void> {
  const path = `sales_orders/${orderId}`;
  try {
    await deleteDoc(doc(db, 'sales_orders', orderId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// MÁQUINAS CADASTRADAS (Machine)
export function subscribeToMachines(
  userId: string,
  onData: (machines: Machine[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const collectionPath = 'machines';
  const q = query(collection(db, collectionPath), where('ownerId', '==', userId));

  return onSnapshot(
    q,
    snapshot => {
      const machines: Machine[] = [];
      snapshot.forEach(docSnap => {
        const d = docSnap.data();
        machines.push({
          id: d.id,
          name: d.name,
          model: d.model || '',
          type: d.type || 'CO2',
          laserPowerW: Number(d.laserPowerW ?? 0),
          workAreaX_mm: Number(d.workAreaX_mm ?? 0),
          workAreaY_mm: Number(d.workAreaY_mm ?? 0),
          purchasePrice: Number(d.purchasePrice ?? 0),
          depreciationYears: Number(d.depreciationYears ?? 0),
          monthlyWorkHours: Number(d.monthlyWorkHours ?? 0),
          energyConsumptionKwh: Number(d.energyConsumptionKwh ?? 0),
          monthlyMaintenanceCosts: Number(d.monthlyMaintenanceCosts ?? 0),
          tubeSpareCost: Number(d.tubeSpareCost ?? 0),
          notes: d.notes || ''
        });
      });
      onData(machines);
    },
    error => {
      if (onError) onError(error);
      console.warn(`Falha ao sincronizar ${collectionPath}:`, error.code);
      window.dispatchEvent(new CustomEvent('cnc-sync-error', { detail: `Falha ao carregar ${collectionPath}. Verifique a conexão e as permissões da conta.` }));
    }
  );
}

export async function saveMachineToFirestore(machine: Machine, userId: string): Promise<void> {
  const path = `machines/${machine.id}`;
  try {
    const docRef = doc(db, 'machines', machine.id);

    const baseData: Record<string, any> = {
      name: machine.name,
      model: machine.model || '',
      type: machine.type || 'CO2',
      laserPowerW: Number(machine.laserPowerW ?? 0),
      workAreaX_mm: Number(machine.workAreaX_mm ?? 0),
      workAreaY_mm: Number(machine.workAreaY_mm ?? 0),
      purchasePrice: Number(machine.purchasePrice ?? 0),
      depreciationYears: Number(machine.depreciationYears ?? 0),
      monthlyWorkHours: Number(machine.monthlyWorkHours ?? 0),
      energyConsumptionKwh: Number(machine.energyConsumptionKwh ?? 0),
      monthlyMaintenanceCosts: Number(machine.monthlyMaintenanceCosts ?? 0),
      tubeSpareCost: Number(machine.tubeSpareCost ?? 0),
      notes: machine.notes || '',
      updatedAt: serverTimestamp()
    };

    await runTransaction(db, async transaction => {
      const existingSnap = await transaction.get(docRef);
      if (existingSnap.exists() && existingSnap.data().ownerId !== userId) throw new Error('Máquina pertence a outra conta.');
      if (existingSnap.exists()) {
        transaction.update(docRef, baseData);
      } else {
        transaction.set(docRef, {
        id: machine.id,
        ownerId: userId,
        ...baseData,
        createdAt: serverTimestamp()
        });
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteMachineFromFirestore(machineId: string, userId: string): Promise<void> {
  const path = `machines/${machineId}`;
  try {
    const docRef = doc(db, 'machines', machineId);
    await runTransaction(db, async transaction => {
      const existing = await transaction.get(docRef);
      if (!existing.exists()) return;
      if (existing.data().ownerId !== userId) throw new Error('Máquina pertence a outra conta.');
      transaction.delete(docRef);
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

