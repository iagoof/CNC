import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut
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
import { ProductionOrder, Material, Quote, UF, ProductInventory, SalesOrder, Machine } from '../../types';
import {
  INITIAL_COMPANY,
  INITIAL_MACHINES,
  INITIAL_MATERIALS,
  INITIAL_PRODUCTS,
  INITIAL_FIXED_COSTS,
  INITIAL_TAXES,
  INITIAL_PRODUCTION_ORDERS,
  INITIAL_SALES_ORDERS,
  INITIAL_QUOTES
} from '../../data/initialData';
import { DEFAULT_PROJECTS_SEED } from './seedData';

// Inicialização oficial do Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Identificador canônico da oficina compartilhada
export const SHARED_STORE_ID = 'shared_cnc_store';

function hasCloudFirestoreAuth(): boolean {
  return Boolean(auth.currentUser && auth.currentUser.emailVerified);
}

// ============================================================================
// LOCAL TRANSACTIONAL STORE (Persistência reativa local quando sem token Cloud)
// ============================================================================
type CollectionName =
  | 'orders'
  | 'materials'
  | 'quotes'
  | 'projects'
  | 'settings'
  | 'financial_settings'
  | 'products'
  | 'sales_orders'
  | 'machines';

const LOCAL_DB_PREFIX = `cnc_local_db_v2:${SHARED_STORE_ID}:`;
const LOCAL_SEEDED_KEY = `cnc_local_db_v2:${SHARED_STORE_ID}:__seeded__`;
const localListeners = new Map<CollectionName, Set<() => void>>();

function readLocalCollection<T extends Record<string, any>>(col: CollectionName): Record<string, T> {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_DB_PREFIX + col);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalCollection<T extends Record<string, any>>(col: CollectionName, map: Record<string, T>): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.setItem(LOCAL_DB_PREFIX + col, JSON.stringify(map));
  notifyLocalListeners(col);
}

function notifyLocalListeners(col: CollectionName): void {
  const subs = localListeners.get(col);
  if (subs) {
    subs.forEach(fn => {
      try {
        fn();
      } catch (err) {
        console.warn(`Erro no listener local (${col}):`, err);
      }
    });
  }
}

function subscribeLocalCollection(col: CollectionName, emit: () => void): Unsubscribe {
  if (!localListeners.has(col)) {
    localListeners.set(col, new Set());
  }
  localListeners.get(col)!.add(emit);
  queueMicrotask(emit);
  return () => {
    localListeners.get(col)?.delete(emit);
  };
}

let seedingPromise: Promise<void> | null = null;

async function ensureLocalStoreSeeded(): Promise<void> {
  if (typeof window === 'undefined' || !window.localStorage) return;
  if (window.localStorage.getItem(LOCAL_SEEDED_KEY) === 'true') return;
  if (seedingPromise) return seedingPromise;

  seedingPromise = (async () => {
    try {
      const nowIso = new Date().toISOString();

      // 1. Machines
      const existingMachines = readLocalCollection<Machine & { ownerId: string }>('machines');
      if (Object.keys(existingMachines).length === 0) {
        const machMap: Record<string, any> = {};
        for (const m of INITIAL_MACHINES) {
          machMap[m.id] = { ...m, ownerId: SHARED_STORE_ID, createdAt: nowIso, updatedAt: nowIso };
        }
        writeLocalCollection('machines', machMap);
      }

      // 2. Materials
      const existingMaterials = readLocalCollection<Material & { ownerId: string }>('materials');
      if (Object.keys(existingMaterials).length === 0) {
        const matMap: Record<string, any> = {};
        for (const mat of INITIAL_MATERIALS) {
          matMap[mat.id] = { ...mat, ownerId: SHARED_STORE_ID, createdAt: nowIso, updatedAt: nowIso };
        }
        writeLocalCollection('materials', matMap);
      }

      // 3. Settings
      const existingSettings = readLocalCollection<FirestoreCompanySettings>('settings');
      if (Object.keys(existingSettings).length === 0) {
        const settingId = `set-${SHARED_STORE_ID}`;
        writeLocalCollection('settings', {
          [settingId]: {
            id: settingId,
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
            cemigRateKwh: 0.96,
            monthlyWorkHours: 160,
            createdAt: nowIso,
            updatedAt: nowIso
          }
        });
      }

      // 4. Financial Settings
      const existingFin = readLocalCollection<FirestoreFinancialSettings>('financial_settings');
      if (Object.keys(existingFin).length === 0) {
        writeLocalCollection('financial_settings', {
          [SHARED_STORE_ID]: {
            id: SHARED_STORE_ID,
            ownerId: SHARED_STORE_ID,
            monthlyRevenueTarget: 35000,
            fixedCosts: INITIAL_FIXED_COSTS,
            taxes: INITIAL_TAXES,
            createdAt: nowIso,
            updatedAt: nowIso
          } as any
        });
      }

      // 5. Products
      const existingProducts = readLocalCollection<ProductInventory & { id: string; ownerId: string }>('products');
      const skuToProdId = new Map<string, string>();
      if (Object.keys(existingProducts).length === 0) {
        const prodMap: Record<string, any> = {};
        for (const p of INITIAL_PRODUCTS) {
          const prodId = await productDocumentId(SHARED_STORE_ID, p.sku);
          skuToProdId.set(p.sku, prodId);
          prodMap[prodId] = {
            ...p,
            id: prodId,
            ownerId: SHARED_STORE_ID,
            createdAt: nowIso,
            updatedAt: nowIso
          };
        }
        writeLocalCollection('products', prodMap);
      } else {
        for (const p of Object.values(existingProducts)) {
          skuToProdId.set(p.sku, p.id);
        }
      }

      // 6. Production Orders (with linked inventoryProductId & inventoryReservedQuantity)
      const existingOrders = readLocalCollection<any>('orders');
      if (Object.keys(existingOrders).length === 0) {
        const ordMap: Record<string, any> = {};
        for (const op of INITIAL_PRODUCTION_ORDERS) {
          const prodId = skuToProdId.get(op.sku) || (await productDocumentId(SHARED_STORE_ID, op.sku));
          const isCompleted = op.status === 'Pronto/Embalado';
          ordMap[op.id] = {
            ...op,
            ownerId: SHARED_STORE_ID,
            ...(isCompleted
              ? {}
              : {
                  inventoryProductId: prodId,
                  inventoryReservedQuantity: op.quantityRequested
                }),
            createdAt: op.createdAt || nowIso,
            updatedAt: nowIso
          };
        }
        writeLocalCollection('orders', ordMap);
      }

      // 7. Sales Orders
      const existingSales = readLocalCollection<any>('sales_orders');
      if (Object.keys(existingSales).length === 0) {
        const salesMap: Record<string, any> = {};
        for (const so of INITIAL_SALES_ORDERS) {
          salesMap[so.id] = {
            ...so,
            ownerId: SHARED_STORE_ID,
            createdAt: so.createdAt || nowIso,
            updatedAt: nowIso
          };
        }
        writeLocalCollection('sales_orders', salesMap);
      }

      // 8. Quotes
      const existingQuotes = readLocalCollection<any>('quotes');
      if (Object.keys(existingQuotes).length === 0) {
        const quotesMap: Record<string, any> = {};
        for (const q of INITIAL_QUOTES) {
          quotesMap[q.id] = {
            ...q,
            ownerId: SHARED_STORE_ID,
            createdAt: q.createdAt || nowIso,
            updatedAt: nowIso
          };
        }
        writeLocalCollection('quotes', quotesMap);
      }

      // 9. Projects
      const existingProjects = readLocalCollection<any>('projects');
      if (Object.keys(existingProjects).length === 0) {
        const projMap: Record<string, any> = {};
        for (const proj of DEFAULT_PROJECTS_SEED) {
          projMap[proj.id] = {
            ...proj,
            ownerId: SHARED_STORE_ID,
            createdAt: nowIso,
            updatedAt: nowIso
          };
        }
        writeLocalCollection('projects', projMap);
      }

      window.localStorage.setItem(LOCAL_SEEDED_KEY, 'true');
    } finally {
      seedingPromise = null;
    }
  })();

  return seedingPromise;
}

// Validação de conexão inicial com o servidor Firestore
export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      return false;
    }
    return true;
  }
}

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

export async function syncUserProfile(user: { uid: string; email?: string | null; displayName?: string | null; photoURL?: string | null }): Promise<void> {
  if (!hasCloudFirestoreAuth()) return;
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
      await ensureWorkshopDataSeeded();
      await syncUserProfile(cncUser);
      return cncUser;
    }
    return null;
  } catch (error) {
    console.error('Erro ao realizar login Google:', error);
    throw error;
  }
}

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
      await ensureWorkshopDataSeeded();
      await syncUserProfile(cncUser);
      return cncUser;
    }
    return null;
  } catch {
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
    await ensureWorkshopDataSeeded();
    return fallbackUser;
  }
}

export async function registerWithEmail(email: string, password: string, displayName: string): Promise<CncUser | null> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = displayName.trim() || cleanEmail.split('@')[0];
  try {
    const result = await createUserWithEmailAndPassword(auth, cleanEmail, password);
    if (result.user) {
      if (cleanName) {
        try {
          await updateProfile(result.user, { displayName: cleanName });
        } catch {}
      }
      const cncUser: CncUser = {
        uid: result.user.uid,
        email: result.user.email,
        displayName: cleanName,
        photoURL: result.user.photoURL,
        role: result.user.email === 'iagoofss@gmail.com' ? 'admin' : 'operator'
      };
      setActiveSessionUser(cncUser);
      await ensureWorkshopDataSeeded();
      await syncUserProfile(cncUser);
      return cncUser;
    }
    return null;
  } catch {
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
    await ensureWorkshopDataSeeded();
    return fallbackUser;
  }
}

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
  await ensureWorkshopDataSeeded();
  return cncUser;
}

export async function logoutUser(): Promise<void> {
  setActiveSessionUser(null);
  try {
    await signOut(auth);
  } catch {}
}

export async function ensureWorkshopDataSeeded(): Promise<void> {
  await ensureLocalStoreSeeded();
  if (!hasCloudFirestoreAuth()) return;
  try {
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
        cemigRateKwh: 0.96,
        monthlyWorkHours: 160,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    const finSnap = await getDoc(doc(db, 'financial_settings', SHARED_STORE_ID));
    if (!finSnap.exists()) {
      await setDoc(doc(db, 'financial_settings', SHARED_STORE_ID), {
        id: SHARED_STORE_ID,
        ownerId: SHARED_STORE_ID,
        monthlyRevenueTarget: 35000,
        fixedCosts: INITIAL_FIXED_COSTS,
        taxes: INITIAL_TAXES,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

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
    console.warn('Aviso na sincronização de sementes da oficina com nuvem:', err);
  }
}

// ============================================================================
// ORDENS DE PRODUÇÃO (Production Orders)
// ============================================================================
function formatOrder(id: string, data: Record<string, any>): ProductionOrder {
  return {
    id,
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
    notes: data.notes,
    inventoryProductId: data.inventoryProductId,
    inventoryReservedQuantity: data.inventoryReservedQuantity
  };
}

export function subscribeToOrders(
  _userId: string,
  onData: (orders: ProductionOrder[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const emitLocal = () => {
    void ensureLocalStoreSeeded().then(() => {
      const map = readLocalCollection<Record<string, any>>('orders');
      onData(Object.entries(map).map(([id, d]) => formatOrder(id, d)));
    });
  };

  const unsubLocal = subscribeLocalCollection('orders', emitLocal);
  if (!hasCloudFirestoreAuth()) return unsubLocal;

  const unsubCloud = onSnapshot(
    query(collection(db, 'orders')),
    snapshot => {
      const orders: ProductionOrder[] = [];
      const map: Record<string, any> = {};
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const formatted = formatOrder(docSnap.id, data);
        orders.push(formatted);
        map[docSnap.id] = { ...data, ...formatted, ownerId: data.ownerId || SHARED_STORE_ID };
      });
      if (orders.length > 0) {
        writeLocalCollection('orders', map);
      }
      onData(orders);
    },
    error => {
      if (onError) onError(error);
      emitLocal();
    }
  );

  return () => {
    unsubLocal();
    unsubCloud();
  };
}

function findLocalOwnedProduct(storeId: string, sku: string) {
  const productsMap = readLocalCollection<Record<string, any>>('products');
  const candidates = Object.values(productsMap)
    .filter(p => p.sku === sku)
    .map(p => ({ id: p.id, ownerId: p.ownerId || SHARED_STORE_ID, sku: p.sku }));
  return {
    productsMap,
    selected: selectOwnedProduct(storeId || SHARED_STORE_ID, sku, candidates)
  };
}

export async function progressProductionInFirestore(
  orderId: string,
  _userId: string,
  change: { status: ProductionOrder['status'] } | { scannedQuantity: number }
): Promise<number> {
  if (!getCurrentCncUser()) throw new Error('Entre na sua conta para alterar a produção.');
  await ensureLocalStoreSeeded();

  if (!hasCloudFirestoreAuth()) {
    const ordersMap = readLocalCollection<Record<string, any>>('orders');
    const current = ordersMap[orderId];
    if (!current) throw new Error('OP não encontrada.');
    const sku = current.sku;
    const custom = current.inventoryMode === 'custom' || String(sku).startsWith('CUSTOM-') || String(sku).startsWith('SKU-qi-');
    const orderOwner = current.ownerId || SHARED_STORE_ID;
    const plan = planProductionProgress(orderOwner, { ...current, ownerId: orderOwner }, change);
    if (plan.status === current.status && plan.scannedQuantity === (current.scannedQuantity ?? 0)) {
      return plan.scannedQuantity;
    }

    const { productsMap, selected } = custom ? { productsMap: readLocalCollection<Record<string, any>>('products'), selected: undefined } : findLocalOwnedProduct(SHARED_STORE_ID, sku);
    if (plan.completedNow && !custom) {
      const targetId = selected?.id || (await productDocumentId(SHARED_STORE_ID, sku));
      const product = productsMap[targetId];
      if (product) {
        const physicalStock = adjustedPhysicalStock(SHARED_STORE_ID, sku, product, current.quantityRequested);
        const inProductionStock = releaseProductionReservation(
          current.inventoryProductId ? current : { ...current, inventoryProductId: product.id, inventoryReservedQuantity: current.quantityRequested },
          product.id,
          product
        );
        productsMap[product.id] = { ...product, physicalStock, inProductionStock, updatedAt: new Date().toISOString() };
        writeLocalCollection('products', productsMap);
      } else if (current.inventoryProductId) {
        throw new Error('O produto reservado pela OP não foi encontrado.');
      }
    }
    ordersMap[orderId] = { ...current, status: plan.status, scannedQuantity: plan.scannedQuantity, updatedAt: new Date().toISOString() };
    writeLocalCollection('orders', ordersMap);
    return plan.scannedQuantity;
  }

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
    const orderOwner = current.data().ownerId || SHARED_STORE_ID;
    const plan = planProductionProgress(orderOwner, { ...current.data(), ownerId: orderOwner }, change);
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
  if (!Number.isSafeInteger(order.quantityRequested) || order.quantityRequested <= 0 || order.status !== 'Aguardando Corte' || order.scannedQuantity !== 0) {
    throw new Error('Quantidade ou estado inicial da OP inválido.');
  }
  await ensureLocalStoreSeeded();

  if (!hasCloudFirestoreAuth()) {
    const ordersMap = readLocalCollection<Record<string, any>>('orders');
    const { productsMap, selected } = findLocalOwnedProduct(SHARED_STORE_ID, order.sku);
    const targetId = selected?.id || (await productDocumentId(SHARED_STORE_ID, order.sku));
    const product = productsMap[targetId];
    if (!product || product.sku !== order.sku) throw new Error('Produto não encontrado nesta conta.');
    const existing = ordersMap[order.id];
    if (existing) {
      if (existing.sku === order.sku && existing.quantityRequested === order.quantityRequested && existing.inventoryProductId === product.id && existing.inventoryReservedQuantity === order.quantityRequested) return;
      throw new Error('Identificador de OP já utilizado.');
    }
    const current = product.inProductionStock ?? 0;
    const next = current + order.quantityRequested;
    if (!Number.isSafeInteger(current) || current < 0 || !Number.isSafeInteger(next)) throw new Error('Saldo em produção inválido.');
    const nowIso = new Date().toISOString();
    ordersMap[order.id] = {
      ...order,
      ownerId: SHARED_STORE_ID,
      inventoryProductId: product.id,
      inventoryReservedQuantity: order.quantityRequested,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    productsMap[product.id] = { ...product, inProductionStock: next, updatedAt: nowIso };
    writeLocalCollection('products', productsMap);
    writeLocalCollection('orders', ordersMap);
    return;
  }

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
  if (!order.sku.startsWith('CUSTOM-') || !Number.isSafeInteger(order.quantityRequested) || order.quantityRequested <= 0 || order.status !== 'Aguardando Corte' || order.scannedQuantity !== 0) {
    throw new Error('Dados da OP sob encomenda inválidos.');
  }
  await ensureLocalStoreSeeded();

  if (!hasCloudFirestoreAuth()) {
    const ordersMap = readLocalCollection<Record<string, any>>('orders');
    const { productsMap, selected } = findLocalOwnedProduct(SHARED_STORE_ID, order.sku);
    const targetId = selected?.id || (await productDocumentId(SHARED_STORE_ID, order.sku));
    if (productsMap[targetId]) throw new Error('Este SKU já pertence ao catálogo. Use uma OP com reserva de estoque.');
    const saved = ordersMap[order.id];
    if (saved) {
      if (saved.inventoryMode === 'custom' && saved.sku === order.sku && saved.quantityRequested === order.quantityRequested) return;
      throw new Error('Identificador de OP já utilizado.');
    }
    const nowIso = new Date().toISOString();
    ordersMap[order.id] = { ...order, ownerId: SHARED_STORE_ID, inventoryMode: 'custom', createdAt: nowIso, updatedAt: nowIso };
    writeLocalCollection('orders', ordersMap);
    return;
  }

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
  await ensureLocalStoreSeeded();

  if (!hasCloudFirestoreAuth()) {
    const ordersMap = readLocalCollection<Record<string, any>>('orders');
    const order = ordersMap[orderId];
    if (!order) return;
    if (order.status === 'Pronto/Embalado' || (order.scannedQuantity ?? 0) > 0) {
      throw new Error('Uma OP conferida ou concluída não pode ser excluída.');
    }
    const custom = order.inventoryMode === 'custom' || String(order.sku).startsWith('CUSTOM-');
    if (!custom) {
      const { productsMap, selected } = findLocalOwnedProduct(SHARED_STORE_ID, order.sku);
      const targetId = selected?.id || (await productDocumentId(SHARED_STORE_ID, order.sku));
      const product = productsMap[targetId];
      if (product) {
        if (product.sku !== order.sku) throw new Error('Produto incompatível com a OP.');
        const inProductionStock = releaseProductionReservation(
          order.inventoryProductId ? order : { ...order, inventoryProductId: product.id, inventoryReservedQuantity: order.quantityRequested },
          product.id,
          product
        );
        productsMap[product.id] = { ...product, inProductionStock, updatedAt: new Date().toISOString() };
        writeLocalCollection('products', productsMap);
      } else if (order.inventoryProductId) {
        throw new Error('Produto reservado não encontrado.');
      }
    }
    delete ordersMap[orderId];
    writeLocalCollection('orders', ordersMap);
    return;
  }

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
  await ensureLocalStoreSeeded();
  const ordersMap = readLocalCollection<Record<string, any>>('orders');
  const nowIso = new Date().toISOString();
  ordersMap[order.id] = {
    ...(ordersMap[order.id] || {}),
    ...order,
    ownerId: SHARED_STORE_ID,
    createdAt: ordersMap[order.id]?.createdAt || order.createdAt || nowIso,
    updatedAt: nowIso
  };
  writeLocalCollection('orders', ordersMap);
  if (!hasCloudFirestoreAuth()) return;

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
  await ensureLocalStoreSeeded();
  const ordersMap = readLocalCollection<Record<string, any>>('orders');
  delete ordersMap[orderId];
  writeLocalCollection('orders', ordersMap);
  if (!hasCloudFirestoreAuth()) return;

  const path = `orders/${orderId}`;
  try {
    await deleteDoc(doc(db, 'orders', orderId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ============================================================================
// MATERIAIS (Materials)
// ============================================================================
export function subscribeToMaterials(
  _userId: string,
  onData: (materials: Material[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const emitLocal = () => {
    void ensureLocalStoreSeeded().then(() => {
      const map = readLocalCollection<Record<string, any>>('materials');
      const list: Material[] = Object.entries(map).map(([id, data]) => ({
        id,
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
      }));
      onData(list);
    });
  };

  const unsubLocal = subscribeLocalCollection('materials', emitLocal);
  if (!hasCloudFirestoreAuth()) return unsubLocal;

  const unsubCloud = onSnapshot(
    query(collection(db, 'materials')),
    snapshot => {
      const materials: Material[] = [];
      const map: Record<string, any> = {};
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const item: Material = {
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
        };
        materials.push(item);
        map[docSnap.id] = { ...item, ownerId: SHARED_STORE_ID };
      });
      if (materials.length > 0) writeLocalCollection('materials', map);
      onData(materials);
    },
    error => {
      if (onError) onError(error);
      emitLocal();
    }
  );

  return () => {
    unsubLocal();
    unsubCloud();
  };
}

export async function saveMaterialToFirestore(material: Material, _userId: string): Promise<void> {
  await ensureLocalStoreSeeded();
  const materialsMap = readLocalCollection<Record<string, any>>('materials');
  const nowIso = new Date().toISOString();
  materialsMap[material.id] = {
    ...material,
    ownerId: SHARED_STORE_ID,
    createdAt: materialsMap[material.id]?.createdAt || nowIso,
    updatedAt: nowIso
  };
  writeLocalCollection('materials', materialsMap);
  if (!hasCloudFirestoreAuth()) return;

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
  await ensureLocalStoreSeeded();
  const materialsMap = readLocalCollection<Record<string, any>>('materials');
  delete materialsMap[materialId];
  writeLocalCollection('materials', materialsMap);
  if (!hasCloudFirestoreAuth()) return;

  const path = `materials/${materialId}`;
  try {
    await deleteDoc(doc(db, 'materials', materialId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ============================================================================
// ORÇAMENTOS (Quotes)
// ============================================================================
export function subscribeToQuotes(
  _userId: string,
  onData: (quotes: Quote[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const emitLocal = () => {
    void ensureLocalStoreSeeded().then(() => {
      const map = readLocalCollection<Record<string, any>>('quotes');
      const list: Quote[] = Object.entries(map).map(([id, data]) => ({
        id,
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
      }));
      onData(list);
    });
  };

  const unsubLocal = subscribeLocalCollection('quotes', emitLocal);
  if (!hasCloudFirestoreAuth()) return unsubLocal;

  const unsubCloud = onSnapshot(
    query(collection(db, 'quotes')),
    snapshot => {
      const quotes: Quote[] = [];
      const map: Record<string, any> = {};
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const item: Quote = {
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
        };
        quotes.push(item);
        map[docSnap.id] = { ...item, ownerId: data.ownerId || SHARED_STORE_ID };
      });
      if (quotes.length > 0) writeLocalCollection('quotes', map);
      onData(quotes);
    },
    error => {
      if (onError) onError(error);
      emitLocal();
    }
  );

  return () => {
    unsubLocal();
    unsubCloud();
  };
}

export async function saveQuoteToFirestore(quote: Quote, _userId: string): Promise<void> {
  await ensureLocalStoreSeeded();
  const quotesMap = readLocalCollection<Record<string, any>>('quotes');
  const nowIso = new Date().toISOString();
  quotesMap[quote.id] = {
    ...quote,
    items: quote.items.map(item => Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined))),
    ownerId: SHARED_STORE_ID,
    createdAt: quotesMap[quote.id]?.createdAt || quote.createdAt || nowIso,
    updatedAt: nowIso
  };
  writeLocalCollection('quotes', quotesMap);
  if (!hasCloudFirestoreAuth()) return;

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
  if (!getCurrentCncUser()) throw new Error('Entre na sua conta para excluir orçamentos.');
  await ensureLocalStoreSeeded();

  if (!hasCloudFirestoreAuth()) {
    const quotesMap = readLocalCollection<Record<string, any>>('quotes');
    const existing = quotesMap[quoteId];
    if (!existing) return;
    if (existing.status === 'Convertido em Pedido') throw new Error('Este orçamento possui pedido vinculado e não pode ser excluído.');
    delete quotesMap[quoteId];
    writeLocalCollection('quotes', quotesMap);
    return;
  }

  const path = `quotes/${quoteId}`;
  try {
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

// ============================================================================
// PROJETOS VETORIAIS & CAD (Projects)
// ============================================================================
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
  const emitLocal = () => {
    void ensureLocalStoreSeeded().then(() => {
      const map = readLocalCollection<FirestoreProject>('projects');
      onData(Object.values(map));
    });
  };

  const unsubLocal = subscribeLocalCollection('projects', emitLocal);
  if (!hasCloudFirestoreAuth()) return unsubLocal;

  const unsubCloud = onSnapshot(
    query(collection(db, 'projects')),
    snapshot => {
      const projects: FirestoreProject[] = [];
      const map: Record<string, FirestoreProject> = {};
      snapshot.forEach(docSnap => {
        const d = docSnap.data() as FirestoreProject;
        projects.push(d);
        map[docSnap.id] = d;
      });
      if (projects.length > 0) writeLocalCollection('projects', map);
      onData(projects);
    },
    error => {
      if (onError) onError(error);
      emitLocal();
    }
  );

  return () => {
    unsubLocal();
    unsubCloud();
  };
}

export async function saveProjectToFirestore(project: FirestoreProject, _userId: string): Promise<void> {
  await ensureLocalStoreSeeded();
  const projMap = readLocalCollection<FirestoreProject>('projects');
  const nowIso = new Date().toISOString();
  projMap[project.id] = {
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
    createdAt: projMap[project.id]?.createdAt || nowIso,
    updatedAt: nowIso
  };
  writeLocalCollection('projects', projMap);
  if (!hasCloudFirestoreAuth()) return;

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
  await ensureLocalStoreSeeded();
  const projMap = readLocalCollection<FirestoreProject>('projects');
  delete projMap[projectId];
  writeLocalCollection('projects', projMap);
  if (!hasCloudFirestoreAuth()) return;

  const path = `projects/${projectId}`;
  try {
    await deleteDoc(doc(db, 'projects', projectId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ============================================================================
// CONFIGURAÇÕES DA EMPRESA E PARÂMETROS FINANCEIROS
// ============================================================================
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
  const emitLocal = () => {
    void ensureLocalStoreSeeded().then(() => {
      const map = readLocalCollection<FirestoreCompanySettings>('settings');
      const setting = map[`set-${SHARED_STORE_ID}`] || Object.values(map)[0] || null;
      onData(setting);
    });
  };

  const unsubLocal = subscribeLocalCollection('settings', emitLocal);
  if (!hasCloudFirestoreAuth()) return unsubLocal;

  const unsubCloud = onSnapshot(
    query(collection(db, 'settings')),
    snapshot => {
      if (snapshot.empty) {
        emitLocal();
        return;
      }
      const sharedDoc = snapshot.docs.find(d => d.id === `set-${SHARED_STORE_ID}` || d.data().ownerId === SHARED_STORE_ID);
      const docSnap = sharedDoc || snapshot.docs[0];
      const data = docSnap.data() as FirestoreCompanySettings;
      writeLocalCollection('settings', { [`set-${SHARED_STORE_ID}`]: data });
      onData(data);
    },
    error => {
      if (onError) onError(error);
      emitLocal();
    }
  );

  return () => {
    unsubLocal();
    unsubCloud();
  };
}

export async function saveCompanySettingsToFirestore(
  settings: Partial<FirestoreCompanySettings> & { tradeName: string },
  _userId: string
): Promise<void> {
  if (!settings.tradeName.trim()) throw new Error('Informe o nome fantasia da oficina.');
  await ensureLocalStoreSeeded();
  const settingId = `set-${SHARED_STORE_ID}`;
  const settingsMap = readLocalCollection<FirestoreCompanySettings>('settings');
  const nowIso = new Date().toISOString();
  settingsMap[settingId] = {
    ...(settingsMap[settingId] || {}),
    id: settingId,
    ownerId: SHARED_STORE_ID,
    tradeName: settings.tradeName,
    ...(settings.name !== undefined ? { name: settings.name } : {}),
    ...(settings.ie !== undefined ? { ie: settings.ie } : {}),
    ...(settings.address !== undefined ? { address: settings.address } : {}),
    ...(settings.cep !== undefined ? { cep: settings.cep } : {}),
    ...(settings.phone !== undefined ? { phone: settings.phone } : {}),
    ...(settings.email !== undefined ? { email: settings.email } : {}),
    ...(settings.cnpj !== undefined ? { cnpj: settings.cnpj } : {}),
    ...(settings.city !== undefined ? { city: settings.city } : {}),
    ...(settings.uf !== undefined ? { uf: settings.uf } : {}),
    createdAt: settingsMap[settingId]?.createdAt || nowIso,
    updatedAt: nowIso
  };
  writeLocalCollection('settings', settingsMap);
  if (!hasCloudFirestoreAuth()) return;

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

export function subscribeToFinancialSettings(
  _userId: string,
  onData: (settings: FirestoreFinancialSettings | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const emitLocal = () => {
    void ensureLocalStoreSeeded().then(() => {
      const map = readLocalCollection<FirestoreFinancialSettings>('financial_settings');
      onData(map[SHARED_STORE_ID] || Object.values(map)[0] || null);
    });
  };

  const unsubLocal = subscribeLocalCollection('financial_settings', emitLocal);
  if (!hasCloudFirestoreAuth()) return unsubLocal;

  const unsubCloud = onSnapshot(
    doc(db, 'financial_settings', SHARED_STORE_ID),
    snapshot => {
      if (snapshot.exists()) {
        const data = snapshot.data() as FirestoreFinancialSettings;
        writeLocalCollection('financial_settings', { [SHARED_STORE_ID]: data });
        onData(data);
      } else {
        emitLocal();
      }
    },
    error => {
      if (onError) onError(error);
      emitLocal();
    }
  );

  return () => {
    unsubLocal();
    unsubCloud();
  };
}

export async function saveFinancialSettingsToFirestore(input: FinancialSettingsInput, _userId: string): Promise<void> {
  validateFinancialSettings(input);
  await ensureLocalStoreSeeded();
  const finMap = readLocalCollection<FirestoreFinancialSettings>('financial_settings');
  const nowIso = new Date().toISOString();
  finMap[SHARED_STORE_ID] = {
    id: SHARED_STORE_ID,
    ownerId: SHARED_STORE_ID,
    ...input,
    createdAt: (finMap[SHARED_STORE_ID] as any)?.createdAt || nowIso,
    updatedAt: nowIso
  } as any;
  writeLocalCollection('financial_settings', finMap);
  if (!hasCloudFirestoreAuth()) return;

  const path = `financial_settings/${SHARED_STORE_ID}`;
  try {
    const ref = doc(db, 'financial_settings', SHARED_STORE_ID);
    await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(ref);
      if (snapshot.exists()) transaction.update(ref, { ...input, updatedAt: serverTimestamp() });
      else transaction.set(ref, { id: SHARED_STORE_ID, ownerId: SHARED_STORE_ID, ...input, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// ============================================================================
// PRODUTOS & ESTOQUE (ProductInventory)
// ============================================================================
export function subscribeToProducts(
  _userId: string,
  onData: (products: ProductInventory[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const emitLocal = () => {
    void ensureLocalStoreSeeded().then(() => {
      const map = readLocalCollection<Record<string, any>>('products');
      const itemsMap = new Map<string, ProductInventory>();
      Object.values(map).forEach(d => {
        const sku = String(d.sku || '').trim();
        if (!sku) return;
        itemsMap.set(sku, {
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
      onData([...itemsMap.values()]);
    });
  };

  const unsubLocal = subscribeLocalCollection('products', emitLocal);
  if (!hasCloudFirestoreAuth()) return unsubLocal;

  const unsubCloud = onSnapshot(
    query(collection(db, 'products')),
    snapshot => {
      const itemsMap = new Map<string, ProductInventory>();
      const rawMap: Record<string, any> = {};
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
        itemsMap.set(sku, item);
        rawMap[docSnap.id] = { ...item, id: docSnap.id, ownerId: d.ownerId || SHARED_STORE_ID, createdAt: d.createdAt };
      });
      if (itemsMap.size > 0) writeLocalCollection('products', rawMap);
      onData([...itemsMap.values()]);
    },
    error => {
      if (onError) onError(error);
      emitLocal();
    }
  );

  return () => {
    unsubLocal();
    unsubCloud();
  };
}

async function resolveOwnedProduct(storeId: string, sku: string) {
  const targetId = storeId || SHARED_STORE_ID;
  const id = await productDocumentId(targetId, sku);
  const snapshots = await getDocs(query(collection(db, 'products'), where('sku', '==', sku)));
  const candidate = selectOwnedProduct(
    targetId,
    sku,
    snapshots.docs.map(snapshot => ({ id: snapshot.id, ownerId: snapshot.data().ownerId, sku: snapshot.data().sku }))
  );
  return {
    target: doc(db, 'products', id),
    candidate: candidate ? doc(db, 'products', candidate.id) : doc(db, 'products', id)
  };
}

export async function saveProductToFirestore(product: ProductInventory, _userId: string, createOnly = false): Promise<void> {
  if (!getCurrentCncUser()) throw new Error('Entre na sua conta para salvar produtos.');
  await ensureLocalStoreSeeded();
  const cleanId = await productDocumentId(SHARED_STORE_ID, product.sku);
  const nowIso = new Date().toISOString();

  if (!hasCloudFirestoreAuth()) {
    const { productsMap, selected } = findLocalOwnedProduct(SHARED_STORE_ID, product.sku);
    const targetDoc = productsMap[cleanId];
    const candidateDoc = selected && selected.id !== cleanId ? productsMap[selected.id] : undefined;
    if (createOnly && (targetDoc || candidateDoc)) {
      throw new Error('Este SKU já está cadastrado. Atualize a lista de produtos.');
    }
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
      updatedAt: nowIso
    };
    const plan = planProductSave(
      SHARED_STORE_ID,
      product.sku,
      cleanId,
      targetDoc,
      candidateDoc ? { id: selected!.id, data: candidateDoc } : undefined,
      dataToSave,
      nowIso
    );
    productsMap[cleanId] = plan.create ? plan.data : { ...targetDoc, ...plan.data };
    if (plan.deleteId) delete productsMap[plan.deleteId];
    writeLocalCollection('products', productsMap);
    return;
  }

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
      const plan = planProductSave(
        SHARED_STORE_ID,
        product.sku,
        cleanId,
        target.exists() ? target.data() : undefined,
        candidate.exists() && refs.candidate.path !== refs.target.path ? { id: candidate.id, data: candidate.data() } : undefined,
        dataToSave,
        serverTimestamp()
      );
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
  await ensureLocalStoreSeeded();

  if (!hasCloudFirestoreAuth()) {
    const { productsMap, selected } = findLocalOwnedProduct(SHARED_STORE_ID, sku);
    const targetId = selected?.id || (await productDocumentId(SHARED_STORE_ID, sku));
    const existing = productsMap[targetId];
    if (!existing) throw new Error('Produto não encontrado. Atualize a lista.');
    const physicalStock = adjustedPhysicalStock(SHARED_STORE_ID, sku, existing, delta);
    productsMap[targetId] = { ...existing, physicalStock, updatedAt: new Date().toISOString() };
    writeLocalCollection('products', productsMap);
    return;
  }

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
  await ensureLocalStoreSeeded();

  if (!hasCloudFirestoreAuth()) {
    const { productsMap, selected } = findLocalOwnedProduct(SHARED_STORE_ID, sku);
    const targetId = selected?.id || (await productDocumentId(SHARED_STORE_ID, sku));
    const existing = productsMap[targetId];
    if (!existing) return;
    assertProductDeletable(SHARED_STORE_ID, sku, existing);
    delete productsMap[targetId];
    writeLocalCollection('products', productsMap);
    return;
  }

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

// ============================================================================
// PEDIDOS DE VENDA & CANAIS (SalesOrder)
// ============================================================================
function formatSalesOrder(d: Record<string, any>): SalesOrder {
  return {
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
    createdAt: typeof d.createdAt?.toDate === 'function' ? d.createdAt.toDate().toISOString() : d.createdAt || new Date().toISOString()
  };
}

export function subscribeToSalesOrders(
  _userId: string,
  onData: (orders: SalesOrder[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const emitLocal = () => {
    void ensureLocalStoreSeeded().then(() => {
      const map = readLocalCollection<Record<string, any>>('sales_orders');
      onData(Object.values(map).map(formatSalesOrder));
    });
  };

  const unsubLocal = subscribeLocalCollection('sales_orders', emitLocal);
  if (!hasCloudFirestoreAuth()) return unsubLocal;

  const unsubCloud = onSnapshot(
    query(collection(db, 'sales_orders')),
    snapshot => {
      const orders: SalesOrder[] = [];
      const map: Record<string, any> = {};
      snapshot.forEach(docSnap => {
        const d = docSnap.data();
        const formatted = formatSalesOrder(d);
        orders.push(formatted);
        map[docSnap.id] = { ...formatted, ownerId: d.ownerId || SHARED_STORE_ID };
      });
      if (orders.length > 0) writeLocalCollection('sales_orders', map);
      onData(orders);
    },
    error => {
      if (onError) onError(error);
      emitLocal();
    }
  );

  return () => {
    unsubLocal();
    unsubCloud();
  };
}

export async function convertQuoteInFirestore(quote: Quote, context: PricingContext, userId: string): Promise<void> {
  if (!getCurrentCncUser()) throw new Error('Entre na sua conta para converter orçamentos.');
  await ensureLocalStoreSeeded();

  if (!hasCloudFirestoreAuth()) {
    const quotesMap = readLocalCollection<Record<string, any>>('quotes');
    const salesMap = readLocalCollection<Record<string, any>>('sales_orders');
    const ordersMap = readLocalCollection<Record<string, any>>('orders');
    const clean = (value: object) => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
    const nowIso = new Date().toISOString();

    await convertQuoteInTransaction(
      {
        getQuote: async id => {
          const q = quotesMap[id];
          return q ? ({ ...q, ownerId: SHARED_STORE_ID } as Quote & { ownerId: string }) : undefined;
        },
        getSale: async id => {
          const s = salesMap[id];
          return s ? ({ ...s, ownerId: SHARED_STORE_ID } as SalesOrder & { ownerId: string }) : undefined;
        },
        getProduction: async id => ordersMap[id],
        writeQuote: (value, exists) => {
          if (exists && quotesMap[value.id]) {
            quotesMap[value.id] = { ...quotesMap[value.id], status: value.status, updatedAt: nowIso };
          } else {
            quotesMap[value.id] = {
              ...clean(value),
              items: value.items.map(clean),
              ownerId: SHARED_STORE_ID,
              createdAt: nowIso,
              updatedAt: nowIso
            };
          }
        },
        createSale: value => {
          salesMap[value.id] = {
            ...clean(value),
            items: value.items.map(clean),
            ownerId: SHARED_STORE_ID,
            createdAt: nowIso,
            updatedAt: nowIso
          };
        },
        createProduction: value => {
          ordersMap[value.id] = {
            ...clean(value),
            ownerId: SHARED_STORE_ID,
            inventoryMode: 'custom',
            createdAt: nowIso,
            updatedAt: nowIso
          };
        }
      },
      quote,
      context,
      SHARED_STORE_ID
    );

    writeLocalCollection('quotes', quotesMap);
    writeLocalCollection('sales_orders', salesMap);
    writeLocalCollection('orders', ordersMap);
    return;
  }

  try {
    await runTransaction(db, async transaction => {
      if (!getCurrentCncUser()) throw new Error('A conta mudou. Atualize a tela antes de converter.');
      const read = async (col: string, id: string) => {
        const snapshot = await transaction.get(doc(db, col, id));
        return snapshot.exists() ? snapshot.data() : undefined;
      };
      const clean = (value: object) => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
      await convertQuoteInTransaction(
        {
          getQuote: async id => {
            const q = await read('quotes', id);
            return q ? ({ ...q, ownerId: userId } as Quote & { ownerId: string }) : undefined;
          },
          getSale: async id => {
            const s = await read('sales_orders', id);
            return s ? ({ ...s, ownerId: userId } as SalesOrder & { ownerId: string }) : undefined;
          },
          getProduction: id => read('orders', id),
          writeQuote: (value, exists) => {
            const ref = doc(db, 'quotes', value.id);
            if (exists) transaction.update(ref, { status: value.status, updatedAt: serverTimestamp() });
            else transaction.set(ref, { ...clean(value), items: value.items.map(clean), ownerId: SHARED_STORE_ID, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
          },
          createSale: value => transaction.set(doc(db, 'sales_orders', value.id), { ...clean(value), items: value.items.map(clean), ownerId: SHARED_STORE_ID, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }),
          createProduction: value => transaction.set(doc(db, 'orders', value.id), { ...clean(value), ownerId: SHARED_STORE_ID, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        },
        quote,
        context,
        userId
      );
    });
  } catch (error) {
    if ((error as { code?: string })?.code) throw new Error('Não foi possível confirmar a conversão na nuvem. Verifique a conexão e as permissões e tente novamente.');
    throw error;
  }
}

export async function createCatalogOrderInFirestore(order: SalesOrder, _userId: string): Promise<void> {
  if (!getCurrentCncUser()) throw new Error('Entre na sua conta para registrar pedidos.');
  await ensureLocalStoreSeeded();

  if (!hasCloudFirestoreAuth()) {
    const salesMap = readLocalCollection<Record<string, any>>('sales_orders');
    const productsMap = readLocalCollection<Record<string, any>>('products');
    const nowIso = new Date().toISOString();

    await reserveCatalogOrder(
      {
        getOrder: async id => {
          const existing = salesMap[id];
          return existing ? ({ ...existing, ownerId: SHARED_STORE_ID } as SalesOrder & { ownerId: string }) : undefined;
        },
        getProduct: async id => {
          const prod = productsMap[id];
          return prod ? ({ ...prod, ownerId: SHARED_STORE_ID } as ProductInventory & { ownerId: string }) : undefined;
        },
        createOrder: (value, ownerId) => {
          salesMap[value.id] = {
            ...value,
            ownerId,
            createdAt: nowIso,
            updatedAt: nowIso
          };
        },
        updateStock: (id, committedStock) => {
          if (!productsMap[id]) throw new Error('A reserva não possui produto correspondente.');
          productsMap[id] = { ...productsMap[id], committedStock, updatedAt: nowIso };
        }
      },
      order,
      SHARED_STORE_ID
    );

    writeLocalCollection('products', productsMap);
    writeLocalCollection('sales_orders', salesMap);
    return;
  }

  try {
    const productRefs = new Map(
      await Promise.all(
        [...new Set(order.items.map(item => item.sku))].map(async sku => {
          const refs = await resolveOwnedProduct(SHARED_STORE_ID, sku);
          return [refs.target.id, refs] as const;
        })
      )
    );
    await runTransaction(db, async transaction => {
      if (!getCurrentCncUser()) throw new Error('A conta mudou. Entre novamente antes de confirmar.');
      const stockRefs = new Map<string, ReturnType<typeof doc>>();
      await reserveCatalogOrder(
        {
          getOrder: async id => {
            const snapshot = await transaction.get(doc(db, 'sales_orders', id));
            return snapshot.exists() ? (snapshot.data() as SalesOrder & { ownerId: string }) : undefined;
          },
          getProduct: async id => {
            const refs = productRefs.get(id);
            if (!refs) throw new Error('Produto não localizado nesta conta. Atualize o catálogo.');
            const target = await transaction.get(refs.target);
            const candidate = refs.candidate.path === refs.target.path ? target : await transaction.get(refs.candidate);
            if (target.exists() && candidate.exists() && refs.candidate.path !== refs.target.path) throw new Error('Produtos duplicados. Revise os registros antes de confirmar.');
            const snapshot = candidate.exists() ? candidate : target;
            stockRefs.set(id, snapshot.ref);
            return snapshot.exists() ? (snapshot.data() as ProductInventory & { ownerId: string }) : undefined;
          },
          createOrder: (value, ownerId) =>
            transaction.set(doc(db, 'sales_orders', value.id), {
              ...value,
              ownerId,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            }),
          updateStock: (id, committedStock) => {
            const ref = stockRefs.get(id);
            if (!ref) throw new Error('A reserva não possui produto correspondente.');
            transaction.update(ref, { committedStock, updatedAt: serverTimestamp() });
          }
        },
        order,
        SHARED_STORE_ID
      );
    });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code) throw new Error('Não foi possível confirmar pedido e estoque na nuvem. Verifique a conexão e as permissões e tente novamente.');
    throw error;
  }
}

export async function saveSalesOrderToFirestore(order: SalesOrder, _userId: string): Promise<void> {
  await ensureLocalStoreSeeded();
  const salesMap = readLocalCollection<Record<string, any>>('sales_orders');
  const nowIso = new Date().toISOString();
  salesMap[order.id] = {
    ...(salesMap[order.id] || {}),
    ...order,
    ownerId: SHARED_STORE_ID,
    createdAt: salesMap[order.id]?.createdAt || order.createdAt || nowIso,
    updatedAt: nowIso
  };
  writeLocalCollection('sales_orders', salesMap);
  if (!hasCloudFirestoreAuth()) return;

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
  await ensureLocalStoreSeeded();
  const salesMap = readLocalCollection<Record<string, any>>('sales_orders');
  delete salesMap[orderId];
  writeLocalCollection('sales_orders', salesMap);
  if (!hasCloudFirestoreAuth()) return;

  const path = `sales_orders/${orderId}`;
  try {
    await deleteDoc(doc(db, 'sales_orders', orderId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ============================================================================
// MÁQUINAS CADASTRADAS (Machine)
// ============================================================================
export function subscribeToMachines(
  _userId: string,
  onData: (machines: Machine[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const emitLocal = () => {
    void ensureLocalStoreSeeded().then(() => {
      const map = readLocalCollection<Record<string, any>>('machines');
      const list: Machine[] = Object.entries(map).map(([id, d]) => ({
        id: d.id || id,
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
      }));
      onData(list);
    });
  };

  const unsubLocal = subscribeLocalCollection('machines', emitLocal);
  if (!hasCloudFirestoreAuth()) return unsubLocal;

  const unsubCloud = onSnapshot(
    query(collection(db, 'machines')),
    snapshot => {
      const machines: Machine[] = [];
      const map: Record<string, any> = {};
      snapshot.forEach(docSnap => {
        const d = docSnap.data();
        const item: Machine = {
          id: d.id || docSnap.id,
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
        };
        machines.push(item);
        map[item.id] = { ...item, ownerId: SHARED_STORE_ID };
      });
      if (machines.length > 0) writeLocalCollection('machines', map);
      onData(machines);
    },
    error => {
      if (onError) onError(error);
      emitLocal();
    }
  );

  return () => {
    unsubLocal();
    unsubCloud();
  };
}

export async function saveMachineToFirestore(machine: Machine, _userId: string): Promise<void> {
  await ensureLocalStoreSeeded();
  const machinesMap = readLocalCollection<Record<string, any>>('machines');
  const nowIso = new Date().toISOString();
  machinesMap[machine.id] = {
    ...machine,
    ownerId: SHARED_STORE_ID,
    createdAt: machinesMap[machine.id]?.createdAt || nowIso,
    updatedAt: nowIso
  };
  writeLocalCollection('machines', machinesMap);
  if (!hasCloudFirestoreAuth()) return;

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
  await ensureLocalStoreSeeded();
  const machinesMap = readLocalCollection<Record<string, any>>('machines');
  delete machinesMap[machineId];
  writeLocalCollection('machines', machinesMap);
  if (!hasCloudFirestoreAuth()) return;

  const path = `machines/${machineId}`;
  try {
    await deleteDoc(doc(db, 'machines', machineId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
