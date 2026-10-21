import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import {
  auth,
  loginWithGoogle,
  logoutUser,
  testConnection,
  subscribeToOrders,
  saveOrderToFirestore,
  deleteOrderFromFirestore,
  subscribeToMaterials,
  saveMaterialToFirestore,
  deleteMaterialFromFirestore,
  subscribeToQuotes,
  saveQuoteToFirestore,
  deleteQuoteFromFirestore,
  subscribeToProjects,
  saveProjectToFirestore,
  deleteProjectFromFirestore,
  subscribeToCompanySettings,
  saveCompanySettingsToFirestore,
  subscribeToProducts,
  saveProductToFirestore,
  deleteProductFromFirestore,
  subscribeToSalesOrders,
  saveSalesOrderToFirestore,
  createCatalogOrderInFirestore,
  deleteSalesOrderFromFirestore,
  subscribeToMachines,
  saveMachineToFirestore,
  deleteMachineFromFirestore,
  FirestoreProject,
  FirestoreCompanySettings
} from './firebase';
import { seedFirestoreIfEmpty, SeedResult } from './seedData';
import { ProductionOrder, Material, Quote, ProductInventory, SalesOrder, Machine } from '../../types';

interface FirebaseContextType {
  user: FirebaseUser | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  isOnline: boolean;
  isSeeding: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  seedInitialDataMutation: () => Promise<SeedResult>;
  syncOrders: (orders: ProductionOrder[], setOrders: React.Dispatch<React.SetStateAction<ProductionOrder[]>>) => (() => void) | undefined;
  syncOrderMutation: (order: ProductionOrder) => Promise<void>;
  deleteOrderMutation: (orderId: string) => Promise<void>;
  syncMaterialMutation: (material: Material) => Promise<void>;
  deleteMaterialMutation: (materialId: string) => Promise<void>;
  syncQuoteMutation: (quote: Quote) => Promise<void>;
  deleteQuoteMutation: (quoteId: string) => Promise<void>;
  projects: FirestoreProject[];
  syncProjectMutation: (project: FirestoreProject) => Promise<void>;
  deleteProjectMutation: (projectId: string) => Promise<void>;
  companySettings: FirestoreCompanySettings | null;
  syncCompanySettingsMutation: (settings: Partial<FirestoreCompanySettings> & { tradeName: string }) => Promise<void>;
  products: ProductInventory[];
  syncProductMutation: (product: ProductInventory) => Promise<void>;
  deleteProductMutation: (sku: string) => Promise<void>;
  salesOrders: SalesOrder[];
  syncSalesOrderMutation: (order: SalesOrder) => Promise<void>;
  createCatalogOrderMutation: (order: SalesOrder) => Promise<void>;
  deleteSalesOrderMutation: (orderId: string) => Promise<void>;
  machines: Machine[];
  syncMachineMutation: (machine: Machine) => Promise<void>;
  deleteMachineMutation: (machineId: string) => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

export const FirebaseProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isSeeding, setIsSeeding] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const reportError = () => setSyncError('Não foi possível sincronizar com a nuvem. Os dados locais foram mantidos. Verifique a conexão e as permissões antes de continuar.');
  const [projects, setProjects] = useState<FirestoreProject[]>([]);
  const [companySettings, setCompanySettings] = useState<FirestoreCompanySettings | null>(null);
  const [products, setProducts] = useState<ProductInventory[]>([]);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);

  const isAdmin = user?.email === 'iagoofss@gmail.com';

  useEffect(() => {
    // Validação inicial de conectividade
    testConnection().then(online => setIsOnline(online));
    const onSyncError = (event: Event) => setSyncError((event as CustomEvent<string>).detail);
    window.addEventListener('cnc-sync-error', onSyncError);

    // Monitoramento do estado de autenticação e seed automático de dados no Firestore
    const unsubscribe = onAuthStateChanged(auth, async currentUser => {
      setUser(currentUser);
      setIsLoading(false);
      if (currentUser) {
        setIsSeeding(true);
        try {
          await seedFirestoreIfEmpty(currentUser.uid);
        } catch (err) {
          console.warn('Aviso ao semear dados iniciais no Firestore:', err);
        } finally {
          setIsSeeding(false);
        }
      }
    });

    return () => { unsubscribe(); window.removeEventListener('cnc-sync-error', onSyncError); };
  }, []);

  // Subscrição em tempo real de Projetos, Configurações, Produtos, Pedidos e Máquinas quando logado
  useEffect(() => {
    if (!user) {
      setProjects([]);
      setCompanySettings(null);
      setProducts([]);
      setSalesOrders([]);
      setMachines([]);
      return;
    }

    const unsubProjects = subscribeToProjects(
      user.uid,
      remoteProjects => {
        setProjects(remoteProjects || []);
      },
      err => console.warn('Aviso ao sincronizar projetos do Firestore:', err)
    );

    const unsubSettings = subscribeToCompanySettings(
      user.uid,
      remoteSettings => {
        setCompanySettings(remoteSettings);
      },
      err => console.warn('Aviso ao sincronizar configurações da empresa do Firestore:', err)
    );

    const unsubProducts = subscribeToProducts(
      user.uid,
      remoteProducts => {
        setProducts(remoteProducts || []);
      },
      err => console.warn('Aviso ao sincronizar produtos do Firestore:', err)
    );

    const unsubSalesOrders = subscribeToSalesOrders(
      user.uid,
      remoteSalesOrders => {
        setSalesOrders(remoteSalesOrders || []);
      },
      err => console.warn('Aviso ao sincronizar pedidos de venda do Firestore:', err)
    );

    const unsubMachines = subscribeToMachines(
      user.uid,
      remoteMachines => {
        setMachines(remoteMachines || []);
      },
      err => console.warn('Aviso ao sincronizar máquinas do Firestore:', err)
    );

    return () => {
      unsubProjects();
      unsubSettings();
      unsubProducts();
      unsubSalesOrders();
      unsubMachines();
    };
  }, [user]);

  const handleLogin = async () => {
    try {
      await loginWithGoogle();
    } catch (err) {
      console.error('Falha no login Google:', err);
      setSyncError('Não foi possível conectar sua conta Google. Tente novamente.');
    }
  };

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch (err) {
      console.error('Falha no logout:', err);
      setSyncError('Não foi possível sair da conta. Tente novamente.');
    }
  };

  const syncOrders = (
    _localOrders: ProductionOrder[],
    setOrders: React.Dispatch<React.SetStateAction<ProductionOrder[]>>
  ) => {
    if (!user) return undefined;
    const unsub = subscribeToOrders(user.uid, remoteOrders => {
      if (remoteOrders) {
        setOrders(remoteOrders);
      }
    });
    return unsub;
  };

  const syncOrderMutation = async (order: ProductionOrder) => {
    if (!user) return;
    try {
      await saveOrderToFirestore(order, user.uid);
    } catch (err) {
      console.warn('Erro ao persistir ordem no Firestore:', err);
      reportError();
      throw err;
    }
  };

  const deleteOrderMutation = async (orderId: string) => {
    if (!user) return;
    try {
      await deleteOrderFromFirestore(orderId);
    } catch (err) {
      console.warn('Erro ao excluir ordem no Firestore:', err);
      reportError();
      throw err;
    }
  };

  const syncMaterialMutation = async (material: Material) => {
    if (!user) return;
    try {
      await saveMaterialToFirestore(material, user.uid);
    } catch (err) {
      console.warn('Erro ao persistir material no Firestore:', err);
      reportError();
      throw err;
    }
  };

  const deleteMaterialMutation = async (materialId: string) => {
    if (!user) return;
    try {
      await deleteMaterialFromFirestore(materialId);
    } catch (err) {
      console.warn('Erro ao excluir material no Firestore:', err);
      reportError();
      throw err;
    }
  };

  const syncQuoteMutation = async (quote: Quote) => {
    if (!user) return;
    try {
      await saveQuoteToFirestore(quote, user.uid);
    } catch (err) {
      console.warn('Erro ao persistir orçamento no Firestore:', err);
      reportError();
      throw err;
    }
  };

  const deleteQuoteMutation = async (quoteId: string) => {
    if (!user) return;
    try {
      await deleteQuoteFromFirestore(quoteId);
    } catch (err) {
      console.warn('Erro ao excluir orçamento no Firestore:', err);
      reportError();
      throw err;
    }
  };

  const syncProjectMutation = async (project: FirestoreProject) => {
    if (!user) return;
    try {
      await saveProjectToFirestore(project, user.uid);
    } catch (err) {
      console.warn('Erro ao persistir projeto no Firestore:', err);
      reportError();
      throw err;
    }
  };

  const deleteProjectMutation = async (projectId: string) => {
    if (!user) return;
    try {
      await deleteProjectFromFirestore(projectId);
    } catch (err) {
      console.warn('Erro ao excluir projeto no Firestore:', err);
      reportError();
      throw err;
    }
  };

  const syncCompanySettingsMutation = async (settings: Partial<FirestoreCompanySettings> & { tradeName: string }) => {
    if (!user) return;
    try {
      await saveCompanySettingsToFirestore(settings, user.uid);
    } catch (err) {
      console.warn('Erro ao persistir configurações da empresa no Firestore:', err);
      reportError();
      throw err;
    }
  };

  const syncProductMutation = async (product: ProductInventory) => {
    if (!user) return;
    try {
      await saveProductToFirestore(product, user.uid);
    } catch (err) {
      console.warn('Erro ao persistir produto no Firestore:', err);
      reportError();
      throw err;
    }
  };

  const deleteProductMutation = async (sku: string) => {
    if (!user) return;
    try {
      await deleteProductFromFirestore(sku);
    } catch (err) {
      console.warn('Erro ao excluir produto no Firestore:', err);
      reportError();
      throw err;
    }
  };

  const createCatalogOrderMutation = async (order: SalesOrder) => {
    if (!user) throw new Error('Entre na sua conta para registrar pedidos.');
    try { await createCatalogOrderInFirestore(order, user.uid); }
    catch (error) { reportError(); throw error; }
  };

  const syncSalesOrderMutation = async (order: SalesOrder) => {
    if (!user) return;
    try {
      await saveSalesOrderToFirestore(order, user.uid);
    } catch (err) {
      console.warn('Erro ao persistir pedido de venda no Firestore:', err);
      reportError();
      throw err;
    }
  };

  const deleteSalesOrderMutation = async (orderId: string) => {
    if (!user) return;
    try {
      await deleteSalesOrderFromFirestore(orderId);
    } catch (err) {
      console.warn('Erro ao excluir pedido de venda no Firestore:', err);
      reportError();
      throw err;
    }
  };

  const syncMachineMutation = async (machine: Machine) => {
    if (!user) return;
    try {
      await saveMachineToFirestore(machine, user.uid);
    } catch (err) {
      console.warn('Erro ao persistir máquina no Firestore:', err);
      reportError();
      throw err;
    }
  };

  const deleteMachineMutation = async (machineId: string) => {
    if (!user) return;
    try {
      await deleteMachineFromFirestore(machineId);
    } catch (err) {
      console.warn('Erro ao excluir máquina no Firestore:', err);
      reportError();
      throw err;
    }
  };

  const seedInitialDataMutation = async (): Promise<SeedResult> => {
    if (!user) throw new Error('Usuário precisa estar autenticado para sincronizar dados no Firestore');
    setIsSeeding(true);
    try {
      return await seedFirestoreIfEmpty(user.uid);
    } catch (err) {
      console.warn('Erro ao semear dados manualmente no Firestore:', err);
      reportError();
      throw err;
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <FirebaseContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isAdmin,
        isLoading,
        isOnline,
        isSeeding,
        login: handleLogin,
        logout: handleLogout,
        seedInitialDataMutation,
        syncOrders,
        syncOrderMutation,
        deleteOrderMutation,
        syncMaterialMutation,
        deleteMaterialMutation,
        syncQuoteMutation,
        deleteQuoteMutation,
        projects,
        syncProjectMutation,
        deleteProjectMutation,
        companySettings,
        syncCompanySettingsMutation,
        products,
        syncProductMutation,
        deleteProductMutation,
        salesOrders,
        syncSalesOrderMutation,
        createCatalogOrderMutation,
        deleteSalesOrderMutation,
        machines,
        syncMachineMutation,
        deleteMachineMutation
      }}
    >
      {syncError && <div role="alert" className="fixed bottom-4 right-4 z-50 max-w-md rounded-xl border border-red-200 bg-white p-4 text-sm text-red-800 shadow-lg"><p>{syncError}</p><button onClick={() => setSyncError(null)} className="mt-2 underline">Fechar aviso</button></div>}
      {children}
    </FirebaseContext.Provider>
  );
};

export function useFirebase() {
  const context = useContext(FirebaseContext);
  if (!context) {
    throw new Error('useFirebase deve ser utilizado dentro de um FirebaseProvider');
  }
  return context;
}

