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
import { ProductionOrder, Material, Quote, CompanyProfile } from '../../types';

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
      handleFirestoreError(error, OperationType.LIST, collectionPath);
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
          lossPercentage: data.lossPercentage || 5,
          density_kg_m3: data.density_kg_m3 || 750,
          speedsByMachine: []
        });
      });
      onData(materials);
    },
    error => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.LIST, collectionPath);
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
          items: [],
          validUntil: data.validUntil || '',
          notes: data.notes || '',
          desiredProfitMarginPct: 35,
          extraTaxPct: 6,
          fixedExtraFee: 0,
          createdAt: typeof data.createdAt?.toDate === 'function' ? data.createdAt.toDate().toISOString() : data.createdAt || new Date().toISOString(),
          status: data.status || 'Rascunho'
        });
      });
      onData(quotes);
    },
    error => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.LIST, collectionPath);
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
      handleFirestoreError(error, OperationType.LIST, collectionPath);
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
  id: string;
  ownerId: string;
  tradeName: string;
  cnpj?: string;
  city?: string;
  uf?: string;
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
      handleFirestoreError(error, OperationType.LIST, collectionPath);
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

