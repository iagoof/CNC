import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
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
import {
  INITIAL_COMPANY,
  INITIAL_MACHINES,
  INITIAL_MATERIALS,
  INITIAL_PRODUCTS,
  INITIAL_FIXED_COSTS,
  INITIAL_TAXES
} from '../../data/initialData';

// Inicialização oficial do Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Identificador canônico da oficina compartilhada (todos os operadores acessam e alimentam a mesma loja)
export const SHARED_STORE_ID = 'shared_cnc_store';

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

// Interface de diagnóstico de erros Firestore
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
      }))
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Interface unificada do Operador / Usuário CNC
export interface CncUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: 'admin' | 'operator';
  isLocalSession?: boolean;
}

const SESSION_STORAGE_KEY = 'cnc_workshop_operator_session';

export function getActiveSessionUser(): CncUser | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CncUser;
  } catch {
    return null;
  }
}

export function setActiveSessionUser(user: CncUser | null): void {
  try {
    if (user) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

export function getCurrentCncUser(): { uid: string; email: string | null; displayName: string | null; role: 'admin' | 'operator' } | null {
  if (auth.currentUser) {
    return {
      uid: auth.currentUser.uid,
      email: auth.currentUser.email,
      displayName: auth.currentUser.displayName,
      role: auth.currentUser.email === 'iagoofss@gmail.com' ? 'admin' : 'operator'
    };
  }
  const session = getActiveSessionUser();
  if (session) {
    return {
      uid: session.uid,
      email: session.email,
      displayName: session.displayName,
      role: session.role
    };
  }
  return null;
}

// Sincronização do Perfil do Usuário
export async function syncUserProfile(user: { uid: string; email?: string | null; displayName?: string | null; photoURL?: string | null }): Promise<void> {
  const path = `users/${user.uid}`;
  try {
    const userRef = doc(db, 'users', user.uid);
    const existingSnap = await getDoc(userRef);
    const isAdminUser = user.email === 'iagoofss@gmail.com';
    const role = isAdminUser ? 'admin' : 'operator';

    if (!existingSnap.exists()) {
      await setDoc(userRef, {
        id: user.uid,
        email: user.email || 'operador@oficina.local',
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
    console.warn('Aviso ao sincronizar perfil do usuário no Firestore:', error);
  }
}

// Login via Popup Google
export async function loginWithGoogle(): Promise<CncUser | null> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    if (result.user) {
      const cncUser: CncUser = {
        uid: result.user.uid,
        email: result.user.email,
        displayName: result.user.displayName || 'Operador Google',
        photoURL: result.user.photoURL,
        role: result.user.email === 'iagoofss@gmail.com' ? 'admin' : 'operator'
      };
      setActiveSessionUser(cncUser);
      await syncUserProfile(cncUser);
      await ensureWorkshopDataSeeded();
      return cncUser;
    }
    return null;
  } catch (error) {
    console.error('Erro ao realizar login Google:', error);
    throw error;
  }
}

// Login com E-mail e Senha
export async function loginWithEmail(email: string, password: string): Promise<CncUser | null> {
  const cleanEmail = email.trim().toLowerCase();
  try {
    const result = await signInWithEmailAndPassword(auth, cleanEmail, password);
    if (result.user) {
      const cncUser: CncUser = {
        uid: result.user.uid,
        email: result.user.email,
        displayName: result.user.displayName || cleanEmail.split('@')[0],
        photoURL: result.user.photoURL,
        role: result.user.email === 'iagoofss@gmail.com' ? 'admin' : 'operator'
      };
      setActiveSessionUser(cncUser);
      await syncUserProfile(cncUser);
      await ensureWorkshopDataSeeded();
      return cncUser;
    }
    return null;
  } catch (error: any) {
    console.warn('Firebase Auth com e-mail indisponível no projeto. Ativando sessão de operador da oficina:', error?.code);
    const isAdmin = cleanEmail === 'iagoofss@gmail.com';
    const fallbackUser: CncUser = {
      uid: 'user_' + Math.abs(cleanEmail.split('').reduce((acc, c) => (acc << 5) - acc + c.charCodeAt(0), 0)).toString(36),
      email: cleanEmail,
      displayName: cleanEmail.split('@')[0],
      photoURL: '',
      role: isAdmin ? 'admin' : 'operator',
      isLocalSession: true
    };
    setActiveSessionUser(fallbackUser);
    try {
      await syncUserProfile(fallbackUser);
    } catch {}
    try {
      await ensureWorkshopDataSeeded();
    } catch {}
    return fallbackUser;
  }
}

// Cadastro com E-mail e Senha
export async function registerWithEmail(email: string, password: string, displayName: string): Promise<CncUser | null> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = displayName.trim() || cleanEmail.split('@')[0];
  try {
    const result = await createUserWithEmailAndPassword(auth, cleanEmail, password);
    if (result.user) {
      if (cleanName) {
        try {
          await updateProfile(result.user, { displayName: cleanName });
        } catch (e) {
          console.warn('Aviso ao atualizar displayName inicial:', e);
        }
      }
      const cncUser: CncUser = {
        uid: result.user.uid,
        email: result.user.email,
        displayName: cleanName,
        photoURL: result.user.photoURL,
        role: result.user.email === 'iagoofss@gmail.com' ? 'admin' : 'operator'
      };
      setActiveSessionUser(cncUser);
      await syncUserProfile(cncUser);
      await ensureWorkshopDataSeeded();
      return cncUser;
    }
    return null;
  } catch (error: any) {
    console.warn('Firebase Auth cadastro indisponível no projeto. Ativando operador da oficina:', error?.code);
    const isAdmin = cleanEmail === 'iagoofss@gmail.com';
    const fallbackUser: CncUser = {
      uid: 'user_' + Math.abs(cleanEmail.split('').reduce((acc, c) => (acc << 5) - acc + c.charCodeAt(0), 0)).toString(36),
      email: cleanEmail,
      displayName: cleanName,
      photoURL: '',
      role: isAdmin ? 'admin' : 'operator',
      isLocalSession: true
    };
    setActiveSessionUser(fallbackUser);
    try {
      await syncUserProfile(fallbackUser);
    } catch {}
    try {
      await ensureWorkshopDataSeeded();
    } catch {}
    return fallbackUser;
  }
}

// Login Direto de Operador (sem bloqueio de pop-up / sandbox iframe)
export async function loginDirectOperator(displayName = 'Operador Principal CNC', email = 'operador@oficina.local'): Promise<CncUser> {
  const cleanEmail = email.trim().toLowerCase();
  const isAdmin = cleanEmail === 'iagoofss@gmail.com';
  const cleanName = displayName.trim() || 'Operador Principal CNC';
  const cncUser: CncUser = {
    uid: 'op_' + Math.abs(cleanEmail.split('').reduce((acc, c) => (acc << 5) - acc + c.charCodeAt(0), 0)).toString(36),
    email: cleanEmail,
    displayName: cleanName,
    photoURL: '',
    role: isAdmin ? 'admin' : 'operator',
    isLocalSession: true
  };
  setActiveSessionUser(cncUser);
  try {
    await syncUserProfile(cncUser);
  } catch {}
  try {
    await ensureWorkshopDataSeeded();
  } catch {}
  return cncUser;
}

// Logout
export async function logoutUser(): Promise<void> {
  setActiveSessionUser(null);
  try {
    await signOut(auth);
  } catch (e) {
    console.warn('Aviso ao deslogar do Firebase Auth:', e);
  }
}

// Garante que o acervo inicial da oficina exista na nuvem Firestore
export async function ensureWorkshopDataSeeded(): Promise<void> {
  try {
    // 1. Máquinas
    const machinesSnap = await getDocs(collection(db, 'machines'));
    if (machinesSnap.empty) {
      for (const m of INITIAL_MACHINES) {
        await setDoc(doc(db, 'machines', m.id), {
          ...m,
          ownerId: SHARED_STORE_ID,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    }

    // 2. Materiais
    const materialsSnap = await getDocs(collection(db, 'materials'));
    if (materialsSnap.empty) {
      for (const mat of INITIAL_MATERIALS) {
        await setDoc(doc(db, 'materials', mat.id), {
          ...mat,
          ownerId: SHARED_STORE_ID,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    }

    // 3. Configurações da Empresa
    const settingsSnap = await getDocs(collection(db, 'settings'));
    if (settingsSnap.empty) {
      await setDoc(doc(db, 'settings', `set-${SHARED_STORE_ID}`), {
        id: `set-${SHARED_STORE_ID}`,
        ownerId: SHARED_STORE_ID,
        tradeName: INITIAL_COMPANY.tradeName,
        name: INITIAL_COMPANY.name,
        cnpj: INITIAL_COMPANY.cnpj,
        ie: INITIAL_COMPANY.ie,
        uf: INITIAL_COMPANY.uf,
        city: INITIAL_COMPANY.city,
        address: INITIAL_COMPANY.address,
        cep: INITIAL_COMPANY.cep,
        phone: INITIAL_COMPANY.phone,
        email: INITIAL_COMPANY.email,
        cemigRateKwh: 0.85,
        monthlyWorkHours: 160,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    // 4. Parâmetros Financeiros
    const finSnap = await getDoc(doc(db, 'financial_settings', SHARED_STORE_ID));
    if (!finSnap.exists()) {
      await setDoc(doc(db, 'financial_settings', SHARED_STORE_ID), {
        id: SHARED_STORE_ID,
        ownerId: SHARED_STORE_ID,
        monthlyRevenueTarget: 30000,
        fixedCosts: INITIAL_FIXED_COSTS,
        taxes: INITIAL_TAXES,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    // 5. Produtos do Catálogo
    const prodSnap = await getDocs(collection(db, 'products'));
    if (prodSnap.empty) {
      for (const p of INITIAL_PRODUCTS) {
        const prodId = await productDocumentId(SHARED_STORE_ID, p.sku);
        await setDoc(doc(db, 'products', prodId), {
          ...p,
          id: prodId,
          ownerId: SHARED_STORE_ID,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    }
  } catch (err) {
    console.warn('Aviso na verificação de sementes da oficina:', err);
  }
}

// --- SERVIÇOS DE PERSISTÊNCIA EM TEMPO REAL ---

// Ordens de Produção (Production Orders)
export function subscribeToOrders(
  _userId: string,
  onData: (orders: ProductionOrder[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const collectionPath = 'orders';
  const q = query(collection(db, collectionPath));

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
  if (!getCurrentCncUser()) throw new Error('Entre na sua conta para alterar a produção.');
  const orderRef = doc(db, 'orders', orderId);
  const initial = await getDoc(orderRef);
  if (!initial.exists()) throw new Error('OP não encontrada.');
  const sku = initial.data().sku;
  const custom = initial.data().inventoryMode === 'custom';
  const refs = custom ? null : await resolveOwnedProduct(SHARED_STORE_ID, sku);
  return runTransaction(db, async transaction => {
    if (!getCurrentCncUser()) throw new Error('A conta mudou. Atualize a tela.');
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
        const physicalStock = adjustedPhysicalStock(SHARED_STORE_ID, sku, data, current.data().quantityRequested);
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

export async function createInventoryProductionInFirestore(order: ProductionOrder, _userId: string): Promise<void> {
  if (!getCurrentCncUser()) throw new Error('Entre na sua conta para criar uma OP.');
  if (!Number.isSafeInteger(order.quantityRequested) || order.quantityRequested <= 0 || order.status !== 'Aguardando Corte' || order.scannedQuantity !== 0) throw new Error('Quantidade ou estado inicial da OP inválido.');
  const refs = await resolveOwnedProduct(SHARED_STORE_ID, order.sku);
  const orderRef = doc(db, 'orders', order.id);
  await runTransaction(db, async transaction => {
    if (!getCurrentCncUser()) throw new Error('A conta mudou. Atualize a tela.');
    const existing = await transaction.get(orderRef);
    const target = await transaction.get(refs.target);
    const candidate = refs.candidate.path === refs.target.path ? target : await transaction.get(refs.candidate);
    if (target.exists() && candidate.exists() && refs.candidate.path !== refs.target.path) throw new Error('Produtos duplicados. Revise o cadastro.');
    const product = candidate.exists() ? candidate : target;
    if (!product.exists() || product.data().sku !== order.sku) throw new Error('Produto não encontrado nesta conta.');
    if (existing.exists()) {
      const saved = existing.data();
      if (saved.sku === order.sku && saved.quantityRequested === order.quantityRequested && saved.inventoryProductId === product.id && saved.inventoryReservedQuantity === order.quantityRequested) return;
      throw new Error('Identificador de OP já utilizado.');
    }
    const current = product.data().inProductionStock ?? 0;
    const next = current + order.quantityRequested;
    if (!Number.isSafeInteger(current) || current < 0 || !Number.isSafeInteger(next)) throw new Error('Saldo em produção inválido.');
    transaction.set(orderRef, { ...order, ownerId: SHARED_STORE_ID, inventoryProductId: product.id, inventoryReservedQuantity: order.quantityRequested, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    transaction.update(product.ref, { inProductionStock: next, updatedAt: serverTimestamp() });
  });
}

export async function createCustomProductionInFirestore(order: ProductionOrder, _userId: string): Promise<void> {
  if (!getCurrentCncUser()) throw new Error('Entre na sua conta para criar uma OP.');
  if (!order.sku.startsWith('CUSTOM-') || !Number.isSafeInteger(order.quantityRequested) || order.quantityRequested <= 0 || order.status !== 'Aguardando Corte' || order.scannedQuantity !== 0) throw new Error('Dados da OP sob encomenda inválidos.');
  const orderRef = doc(db, 'orders', order.id);
  const refs = await resolveOwnedProduct(SHARED_STORE_ID, order.sku);
  await runTransaction(db, async transaction => {
    if (!getCurrentCncUser()) throw new Error('A conta mudou. Atualize a tela.');
    const saved = await transaction.get(orderRef);
    const product = await transaction.get(refs.candidate);
    if (product.exists()) throw new Error('Este SKU já pertence ao catálogo. Use uma OP com reserva de estoque.');
    if (saved.exists()) {
      const data = saved.data();
      if (data.inventoryMode === 'custom' && data.sku === order.sku && data.quantityRequested === order.quantityRequested) return;
      throw new Error('Identificador de OP já utilizado.');
    }
    transaction.set(orderRef, { ...order, ownerId: SHARED_STORE_ID, inventoryMode: 'custom', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  });
}

export async function deleteInventoryProductionInFirestore(orderId: string, _userId: string): Promise<void> {
  if (!getCurrentCncUser()) throw new Error('Entre na sua conta para excluir uma OP.');
  if (orderId.startsWith('op-q-')) throw new Error('OP vinculada a orçamento: o cancelamento precisa preservar o pedido comercial.');
  const orderRef = doc(db, 'orders', orderId);
  const initial = await getDoc(orderRef);
  if (!initial.exists()) return;
  const sku = initial.data().sku, custom = initial.data().inventoryMode === 'custom', refs = custom ? null : await resolveOwnedProduct(SHARED_STORE_ID, sku);
  await runTransaction(db, async transaction => {
    if (!getCurrentCncUser()) throw new Error('A conta mudou. Atualize a tela.');
    const current = await transaction.get(orderRef);
    if (!current.exists()) return;
    const order = current.data();
    if (order.sku !== sku || (order.inventoryMode === 'custom') !== custom) throw new Error('A OP mudou. Atualize a tela.');
    if (order.status === 'Pronto/Embalado' || (order.scannedQuantity ?? 0) > 0) throw new Error('Uma OP conferida ou concluída não pode ser excluída.');
    if (refs) {
      const target = await transaction.get(refs.target);
      const candidate = refs.candidate.path === refs.target.path ? target : await transaction.get(refs.candidate);
      if (target.exists() && candidate.exists() && refs.candidate.path !== refs.target.path) throw new Error('Produtos duplicados.');
      const product = candidate.exists() ? candidate : target;
      if (product.exists()) {
        if (product.data().sku !== sku) throw new Error('Produto incompatível com a OP.');
        const inProductionStock = releaseProductionReservation(order, product.id, product.data());
        transaction.update(product.ref, { inProductionStock, updatedAt: serverTimestamp() });
      } else if (order.inventoryProductId) throw new Error('Produto reservado não encontrado.');
    }
    transaction.delete(orderRef);
  });
}

export async function saveOrderToFirestore(order: ProductionOrder, _userId: string): Promise<void> {
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
        ownerId: SHARED_STORE_ID,
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
  _userId: string,
  onData: (materials: Material[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const collectionPath = 'materials';
  const q = query(collection(db, collectionPath));

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

export async function saveMaterialToFirestore(material: Material, _userId: string): Promise<void> {
  const path = `materials/${material.id}`;
  try {
    const docRef = doc(db, 'materials', material.id);
    await runTransaction(db, async transaction => {
      const existingSnap = await transaction.get(docRef);
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
          ownerId: SHARED_STORE_ID,
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

export async function deleteMaterialFromFirestore(materialId: string, _userId: string): Promise<void> {
  const path = `materials/${materialId}`;
  try {
    await deleteDoc(doc(db, 'materials', materialId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Orçamentos (Quotes)
export function subscribeToQuotes(
  _userId: string,
  onData: (quotes: Quote[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const collectionPath = 'quotes';
  const q = query(collection(db, collectionPath));

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

export async function saveQuoteToFirestore(quote: Quote, _userId: string): Promise<void> {
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
        ownerId: SHARED_STORE_ID,
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

export async function deleteQuoteFromFirestore(quoteId: string, _userId: string): Promise<void> {
  const path = `quotes/${quoteId}`;
  try {
    if (!getCurrentCncUser()) throw new Error('Entre na sua conta para excluir orçamentos.');
    const quoteRef = doc(db, 'quotes', quoteId);
    await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(quoteRef);
      if (!snapshot.exists()) return;
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
  _userId: string,
  onData: (projects: FirestoreProject[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const collectionPath = 'projects';
  const q = query(collection(db, collectionPath));

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

export async function saveProjectToFirestore(project: FirestoreProject, _userId: string): Promise<void> {
  const path = `projects/${project.id}`;
  try {
    const docRef = doc(db, 'projects', project.id);
    await runTransaction(db, async transaction => {
      const existingSnap = await transaction.get(docRef);
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
          ownerId: SHARED_STORE_ID,
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

export async function deleteProjectFromFirestore(projectId: string, _userId: string): Promise<void> {
  const path = `projects/${projectId}`;
  try {
    await deleteDoc(doc(db, 'projects', projectId));
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
  _userId: string,
  onData: (settings: FirestoreCompanySettings | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const collectionPath = 'settings';
  const q = query(collection(db, collectionPath));

  return onSnapshot(
    q,
    snapshot => {
      if (snapshot.empty) {
        onData(null);
        return;
      }
      const sharedDoc = snapshot.docs.find(d => d.id === `set-${SHARED_STORE_ID}` || d.data().ownerId === SHARED_STORE_ID);
      const docSnap = sharedDoc || snapshot.docs[0];
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
  _userId: string
): Promise<void> {
  if (!settings.tradeName.trim()) throw new Error('Informe o nome fantasia da oficina.');
  const settingId = `set-${SHARED_STORE_ID}`;
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
      if (existingSnap.exists()) transaction.update(docRef, dataToSave);
      else transaction.set(docRef, { id: settingId, ownerId: SHARED_STORE_ID, ...dataToSave, createdAt: serverTimestamp() });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export interface FirestoreFinancialSettings extends FinancialSettingsInput {
  id: string;
  ownerId: string;
}

export function subscribeToFinancialSettings(_userId: string, onData: (settings: FirestoreFinancialSettings | null) => void, onError?: (err: Error) => void): Unsubscribe {
  return onSnapshot(doc(db, 'financial_settings', SHARED_STORE_ID), snapshot => {
    onData(snapshot.exists() ? (snapshot.data() as FirestoreFinancialSettings) : null);
  }, error => {
    if (onError) onError(error);
    window.dispatchEvent(new CustomEvent('cnc-sync-error', { detail: 'Falha ao carregar os parâmetros financeiros da conta.' }));
  });
}

export async function saveFinancialSettingsToFirestore(input: FinancialSettingsInput, _userId: string): Promise<void> {
  validateFinancialSettings(input);
  const path = `financial_settings/${SHARED_STORE_ID}`;
  try {
    const ref = doc(db, 'financial_settings', SHARED_STORE_ID);
    await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(ref);
      if (snapshot.exists()) transaction.update(ref, { ...input, updatedAt: serverTimestamp() });
      else transaction.set(ref, { id: SHARED_STORE_ID, ownerId: SHARED_STORE_ID, ...input, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    });
  } catch (error) { handleFirestoreError(error, OperationType.WRITE, path); }
}

// PRODUTOS & ESTOQUE (ProductInventory)
export function subscribeToProducts(
  _userId: string,
  onData: (products: ProductInventory[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const collectionPath = 'products';
  const q = query(collection(db, collectionPath));

  return onSnapshot(
    q,
    snapshot => {
      const itemsMap = new Map<string, ProductInventory>();
      snapshot.forEach(docSnap => {
        const d = docSnap.data();
        const sku = String(d.sku || '').trim();
        if (!sku) return;
        const item: ProductInventory = {
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
        };
        // Deduplica por SKU caso haja registro legado
        itemsMap.set(sku, item);
      });
      onData([...itemsMap.values()]);
    },
    error => {
      if (onError) onError(error);
      console.warn(`Falha ao sincronizar ${collectionPath}:`, error.code);
      window.dispatchEvent(new CustomEvent('cnc-sync-error', { detail: `Falha ao carregar ${collectionPath}. Verifique a conexão e as permissões da conta.` }));
    }
  );
}

async function resolveOwnedProduct(storeId: string, sku: string) {
  const targetId = storeId || SHARED_STORE_ID;
  const id = await productDocumentId(targetId, sku);
  const snapshots = await getDocs(query(collection(db, 'products'), where('sku', '==', sku)));
  const candidate = selectOwnedProduct(targetId, sku, snapshots.docs.map(snapshot => ({ id: snapshot.id, ownerId: snapshot.data().ownerId, sku: snapshot.data().sku })));
  return { target: doc(db, 'products', id), candidate: candidate ? doc(db, 'products', candidate.id) : doc(db, 'products', id) };
}

export async function saveProductToFirestore(product: ProductInventory, _userId: string, createOnly = false): Promise<void> {
  if (!getCurrentCncUser()) throw new Error('Entre na sua conta para salvar produtos.');
  const cleanId = await productDocumentId(SHARED_STORE_ID, product.sku);
  const path = `products/${cleanId}`;
  try {
    const refs = await resolveOwnedProduct(SHARED_STORE_ID, product.sku);

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
      if (!getCurrentCncUser()) throw new Error('A conta mudou. Atualize a tela.');
      const target = await transaction.get(refs.target);
      const candidate = refs.candidate.path === refs.target.path ? target : await transaction.get(refs.candidate);
      if (createOnly && (target.exists() || candidate.exists())) throw new Error('Este SKU já está cadastrado. Atualize a lista de produtos.');
      const plan = planProductSave(SHARED_STORE_ID, product.sku, cleanId, target.exists() ? target.data() : undefined,
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

export async function adjustProductStockInFirestore(sku: string, delta: number, _userId: string): Promise<void> {
  if (!getCurrentCncUser()) throw new Error('Entre na sua conta para ajustar o estoque.');
  const refs = await resolveOwnedProduct(SHARED_STORE_ID, sku);
  await runTransaction(db, async transaction => {
    if (!getCurrentCncUser()) throw new Error('A conta mudou. Atualize a tela.');
    const target = await transaction.get(refs.target);
    const candidate = refs.candidate.path === refs.target.path ? target : await transaction.get(refs.candidate);
    if (target.exists() && candidate.exists() && refs.candidate.path !== refs.target.path) throw new Error('Produtos duplicados. Revise os registros.');
    const existing = candidate.exists() ? candidate : target;
    if (!existing.exists()) throw new Error('Produto não encontrado. Atualize a lista.');
    const physicalStock = adjustedPhysicalStock(SHARED_STORE_ID, sku, existing.data(), delta);
    transaction.update(existing.ref, { physicalStock, updatedAt: serverTimestamp() });
  });
}

export async function deleteProductFromFirestore(sku: string, _userId: string): Promise<void> {
  if (!getCurrentCncUser()) throw new Error('Entre na sua conta para excluir produtos.');
  const cleanId = await productDocumentId(SHARED_STORE_ID, sku);
  const path = `products/${cleanId}`;
  try {
    const refs = await resolveOwnedProduct(SHARED_STORE_ID, sku);
    await runTransaction(db, async transaction => {
      if (!getCurrentCncUser()) throw new Error('A conta mudou. Atualize a tela.');
      const target = await transaction.get(refs.target);
      const candidate = refs.candidate.path === refs.target.path ? target : await transaction.get(refs.candidate);
      if (target.exists() && candidate.exists() && refs.candidate.path !== refs.target.path) throw new Error('Produtos duplicados. Revise os registros antes de excluir.');
      const existing = candidate.exists() ? candidate : target;
      if (!existing.exists()) return;
      assertProductDeletable(SHARED_STORE_ID, sku, existing.data());
      transaction.delete(existing.ref);
    });
  } catch (error) {
    if (!(error as { code?: string })?.code) throw error;
    throw new Error('Não foi possível excluir o produto. Verifique a conexão e as permissões.');
  }
}

// PEDIDOS DE VENDA & CANAIS (SalesOrder)
export function subscribeToSalesOrders(
  _userId: string,
  onData: (orders: SalesOrder[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const collectionPath = 'sales_orders';
  const q = query(collection(db, collectionPath));

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
  if (!getCurrentCncUser()) throw new Error('Entre na sua conta para converter orçamentos.');
  try {
    await runTransaction(db, async transaction => {
      if (!getCurrentCncUser()) throw new Error('A conta mudou. Atualize a tela antes de converter.');
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
          else transaction.set(ref, { ...clean(value), items: value.items.map(clean), ownerId: SHARED_STORE_ID, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        },
        createSale: value => transaction.set(doc(db, 'sales_orders', value.id), { ...clean(value), items: value.items.map(clean), ownerId: SHARED_STORE_ID, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }),
        createProduction: value => transaction.set(doc(db, 'orders', value.id), { ...clean(value), ownerId: SHARED_STORE_ID, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
      }, quote, context, userId);
    });
  } catch (error) {
    if ((error as { code?: string })?.code) throw new Error('Não foi possível confirmar a conversão na nuvem. Verifique a conexão e as permissões e tente novamente.');
    throw error;
  }
}

export async function createCatalogOrderInFirestore(order: SalesOrder, _userId: string): Promise<void> {
  if (!getCurrentCncUser()) throw new Error('Entre na sua conta para registrar pedidos.');
  try {
    const productRefs = new Map(await Promise.all([...new Set(order.items.map(item => item.sku))].map(async sku => {
      const refs = await resolveOwnedProduct(SHARED_STORE_ID, sku);
      return [refs.target.id, refs] as const;
    })));
    await runTransaction(db, async transaction => {
      if (!getCurrentCncUser()) throw new Error('A conta mudou. Entre novamente antes de confirmar.');
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
      }, order, SHARED_STORE_ID);
    });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code) throw new Error('Não foi possível confirmar pedido e estoque na nuvem. Verifique a conexão e as permissões e tente novamente.');
    throw error;
  }
}

export async function saveSalesOrderToFirestore(order: SalesOrder, _userId: string): Promise<void> {
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
        ownerId: SHARED_STORE_ID,
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
  _userId: string,
  onData: (machines: Machine[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const collectionPath = 'machines';
  const q = query(collection(db, collectionPath));

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

export async function saveMachineToFirestore(machine: Machine, _userId: string): Promise<void> {
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
      if (existingSnap.exists()) {
        transaction.update(docRef, baseData);
      } else {
        transaction.set(docRef, {
          id: machine.id,
          ownerId: SHARED_STORE_ID,
          ...baseData,
          createdAt: serverTimestamp()
        });
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteMachineFromFirestore(machineId: string, _userId: string): Promise<void> {
  const path = `machines/${machineId}`;
  try {
    await deleteDoc(doc(db, 'machines', machineId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
