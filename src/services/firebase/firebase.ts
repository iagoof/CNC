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
  doc,
  getDoc,
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
          thickness_mm: data.thickness_mm || 3,
          sheetWidth_mm: data.sheetWidth_mm || 1850,
          sheetLength_mm: data.sheetLength_mm || 2750,
          unitCost: data.unitCost || 0,
          shippingCost: data.shippingCost || 0,
          lossPercentage: data.lossPercentage ?? 5,
          density_kg_m3: data.density_kg_m3 || 750,
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
    const existingSnap = await getDoc(docRef);

    if (existingSnap.exists()) {
      await updateDoc(docRef, {
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
      await setDoc(docRef, {
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
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteMaterialFromFirestore(materialId: string): Promise<void> {
  const path = `materials/${materialId}`;
  try {
    await deleteDoc(doc(db, 'materials', materialId));
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

export async function deleteQuoteFromFirestore(quoteId: string): Promise<void> {
  const path = `quotes/${quoteId}`;
  try {
    await deleteDoc(doc(db, 'quotes', quoteId));
  } catch (error) {
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
  source?: 'ai_prompt' | 'image_trace' | 'parametric_box' | 'catalog';
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
    const existingSnap = await getDoc(docRef);

    if (existingSnap.exists()) {
      await updateDoc(docRef, {
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
      await setDoc(docRef, {
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
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteProjectFromFirestore(projectId: string): Promise<void> {
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
  const settingId = settings.id || `set-${userId}`;
  const path = `settings/${settingId}`;
  try {
    const docRef = doc(db, 'settings', settingId);
    const existingSnap = await getDoc(docRef);

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

    if (existingSnap.exists()) {
      await updateDoc(docRef, dataToSave);
    } else {
      await setDoc(docRef, {
        id: settingId,
        ownerId: userId,
        ...dataToSave,
        createdAt: serverTimestamp()
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
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

export async function saveProductToFirestore(product: ProductInventory, userId: string): Promise<void> {
  const cleanId = (product.sku || 'sku-custom').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  const path = `products/${cleanId}`;
  try {
    const docRef = doc(db, 'products', cleanId);
    const existingSnap = await getDoc(docRef);

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

    if (existingSnap.exists()) {
      await updateDoc(docRef, dataToSave);
    } else {
      await setDoc(docRef, {
        id: cleanId,
        ownerId: userId,
        ...dataToSave,
        createdAt: serverTimestamp()
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteProductFromFirestore(sku: string): Promise<void> {
  const cleanId = sku.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  const path = `products/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'products', cleanId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
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
          laserPowerW: Number(d.laserPowerW || 0),
          workAreaX_mm: Number(d.workAreaX_mm || 0),
          workAreaY_mm: Number(d.workAreaY_mm || 0),
          purchasePrice: Number(d.purchasePrice || 0),
          depreciationYears: Number(d.depreciationYears || 5),
          monthlyWorkHours: Number(d.monthlyWorkHours || 160),
          energyConsumptionKwh: Number(d.energyConsumptionKwh || 0),
          monthlyMaintenanceCosts: Number(d.monthlyMaintenanceCosts || 0),
          tubeSpareCost: Number(d.tubeSpareCost || 0),
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
    const existingSnap = await getDoc(docRef);

    const baseData: Record<string, any> = {
      name: machine.name,
      model: machine.model || '',
      type: machine.type || 'CO2',
      laserPowerW: Number(machine.laserPowerW || 0),
      workAreaX_mm: Number(machine.workAreaX_mm || 1),
      workAreaY_mm: Number(machine.workAreaY_mm || 1),
      purchasePrice: Number(machine.purchasePrice || 0),
      depreciationYears: Number(machine.depreciationYears || 5),
      monthlyWorkHours: Number(machine.monthlyWorkHours || 160),
      energyConsumptionKwh: Number(machine.energyConsumptionKwh || 0),
      monthlyMaintenanceCosts: Number(machine.monthlyMaintenanceCosts || 0),
      tubeSpareCost: Number(machine.tubeSpareCost || 0),
      notes: machine.notes || '',
      updatedAt: serverTimestamp()
    };

    if (existingSnap.exists()) {
      await updateDoc(docRef, baseData);
    } else {
      await setDoc(docRef, {
        id: machine.id,
        ownerId: userId,
        ...baseData,
        createdAt: serverTimestamp()
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteMachineFromFirestore(machineId: string): Promise<void> {
  const path = `machines/${machineId}`;
  try {
    await deleteDoc(doc(db, 'machines', machineId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

