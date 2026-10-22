import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import {
  auth,
  loginWithGoogle,
  loginWithEmail,
  registerWithEmail,
  loginDirectOperator,
  logoutUser,
  getActiveSessionUser,
  CncUser,
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
  subscribeToFinancialSettings,
  saveFinancialSettingsToFirestore,
  subscribeToProducts,
  saveProductToFirestore,
  adjustProductStockInFirestore,
  deleteProductFromFirestore,
  subscribeToSalesOrders,
  saveSalesOrderToFirestore,
  createCatalogOrderInFirestore,
  convertQuoteInFirestore,
  deleteSalesOrderFromFirestore,
  subscribeToMachines,
  saveMachineToFirestore,
  deleteMachineFromFirestore,
  FirestoreProject,
  FirestoreCompanySettings,
  FirestoreFinancialSettings
} from './firebase';
import { ProductionOrder, Material, Quote, ProductInventory, SalesOrder, Machine } from '../../types';
import type { FinancialSettingsInput } from '../../utils/financialSettings';
import type { PricingContext } from '../../utils/quoteEngine';

export type AnyUser = CncUser | FirebaseUser;

interface FirebaseContextType {
  user: AnyUser | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  isOnline: boolean;
  login: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string, name: string) => Promise<void>;
  loginDirect: (name?: string, email?: string) => Promise<void>;
  logout: () => Promise<void>;
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
  financialSettings: FirestoreFinancialSettings | null;
  syncFinancialSettingsMutation: (settings: FinancialSettingsInput) => Promise<void>;
  products: ProductInventory[] | null;
  syncProductMutation: (product: ProductInventory, createOnly?: boolean) => Promise<void>;
  adjustStockMutation: (sku: string, delta: number) => Promise<void>;
  deleteProductMutation: (sku: string) => Promise<void>;
  salesOrders: SalesOrder[] | null;
  syncSalesOrderMutation: (order: SalesOrder) => Promise<void>;
  createCatalogOrderMutation: (order: SalesOrder) => Promise<void>;
  convertQuoteMutation: (quote: Quote, context: PricingContext) => Promise<void>;
  deleteSalesOrderMutation: (orderId: string) => Promise<void>;
  machines: Machine[] | null;
  syncMachineMutation: (machine: Machine) => Promise<void>;
  deleteMachineMutation: (machineId: string) => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

export const FirebaseProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AnyUser | null>(() => getActiveSessionUser());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [syncError, setSyncError] = useState<string | null>(null);
  const reportError = () => setSyncError('Não foi possível sincronizar com a nuvem. Os dados locais foram mantidos. Verifique a conexão e as permissões antes de continuar.');
  const [projects, setProjects] = useState<FirestoreProject[]>([]);
  const [companySettings, setCompanySettings] = useState<FirestoreCompanySettings | null>(null);
  const [financialSettings, setFinancialSettings] = useState<FirestoreFinancialSettings | null>(null);
  const [products, setProducts] = useState<ProductInventory[] | null>(null);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[] | null>(null);
  const [machines, setMachines] = useState<Machine[] | null>(null);

  const isAdmin = user?.email === 'iagoofss@gmail.com';

  useEffect(() => {
    // Validação inicial de conectividade
    testConnection().then(online => setIsOnline(online));
    const onSyncError = (event: Event) => setSyncError((event as CustomEvent<string>).detail);
    window.addEventListener('cnc-sync-error', onSyncError);

    // Verifica sessão persistente prévia
    const saved = getActiveSessionUser();
    if (saved) {
      setUser(saved);
      setIsLoading(false);
    }

    const unsubscribe = onAuthStateChanged(auth, currentUser => {
      if (currentUser) {
        setUser(currentUser);
      } else {
        const local = getActiveSessionUser();
        if (local) {
          setUser(local);
        } else {
          setUser(null);
        }
      }
      setIsLoading(false);
    });

    return () => { unsubscribe(); window.removeEventListener('cnc-sync-error', onSyncError); };
  }, []);

  // Subscrição em tempo real de Projetos, Configurações, Produtos, Pedidos e Máquinas quando logado
  useEffect(() => {
    if (!user) {
      setProjects([]);
      setCompanySettings(null);
      setFinancialSettings(null);
      setProducts(null);
      setSalesOrders(null);
      setMachines(null);
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
    const unsubFinancialSettings = subscribeToFinancialSettings(user.uid, setFinancialSettings, err => console.warn('Falha ao carregar configurações financeiras:', err));

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
      unsubFinancialSettings();
      unsubProducts();
      unsubSalesOrders();
      unsubMachines();
    };
  }, [user]);

  const handleLogin = async () => {
    try {
      const res = await loginWithGoogle();
      if (res) setUser(res);
    } catch (err) {
      console.error('Falha no login Google:', err);
      throw err;
    }
  };

  const handleLoginWithEmail = async (email: string, pass: string) => {
    try {
      const res = await loginWithEmail(email, pass);
      if (res) setUser(res);
    } catch (err) {
      console.error('Falha no login com e-mail:', err);
      throw err;
    }
  };

  const handleRegisterWithEmail = async (email: string, pass: string, name: string) => {
    try {
      const res = await registerWithEmail(email, pass, name);
      if (res) setUser(res);
    } catch (err) {
      console.error('Falha no cadastro com e-mail:', err);
      throw err;
    }
  };

  const handleLoginDirect = async (name?: string, email?: string) => {
    try {
      const res = await loginDirectOperator(name, email);
      if (res) setUser(res);
    } catch (err) {
      console.error('Falha no login direto:', err);
      throw err;
    }
  };

  const handleLogout = async () => {
    try {
      await logoutUser();
      setUser(null);
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
      await deleteMaterialFromFirestore(materialId, user.uid);
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
      await deleteQuoteFromFirestore(quoteId, user.uid);
    } catch (err) {
      console.warn('Erro ao excluir orçamento no Firestore:', err);
      reportError();
      throw err;
    }
  };

  const syncProjectMutation = async (project: FirestoreProject) => {
    if (!user) throw new Error('Conecte sua conta para salvar projetos.');
    try {
      await saveProjectToFirestore(project, user.uid);
    } catch (err) {
      console.warn('Erro ao persistir projeto no Firestore:', err);
      reportError();
      throw err;
    }
  };

  const deleteProjectMutation = async (projectId: string) => {
    if (!user) throw new Error('Conecte sua conta para excluir projetos.');
    try {
      await deleteProjectFromFirestore(projectId, user.uid);
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

  const syncFinancialSettingsMutation = async (settings: FinancialSettingsInput) => {
    if (!user) throw new Error('Entre na sua conta para salvar parâmetros financeiros.');
    try { await saveFinancialSettingsToFirestore(settings, user.uid); }
    catch (err) { reportError(); throw err; }
  };

  const syncProductMutation = async (product: ProductInventory, createOnly = false) => {
    if (!user) throw new Error('Entre na sua conta para salvar produtos.');
    try {
      await saveProductToFirestore(product, user.uid, createOnly);
    } catch (err) {
      console.warn('Erro ao persistir produto no Firestore:', err);
      reportError();
      throw err;
    }
  };

  const adjustStockMutation = async (sku: string, delta: number) => {
    if (!user) throw new Error('Entre na sua conta para ajustar o estoque.');
    await adjustProductStockInFirestore(sku, delta, user.uid);
  };

  const deleteProductMutation = async (sku: string) => {
    if (!user) return;
    try {
      await deleteProductFromFirestore(sku, user.uid);
    } catch (err) {
      console.warn('Erro ao excluir produto no Firestore:', err);
      reportError();
      throw err;
    }
  };

  const convertQuoteMutation = async (quote: Quote, context: PricingContext) => {
    if (!user) throw new Error('Entre na sua conta para converter orçamentos.');
    try { await convertQuoteInFirestore(quote, context, user.uid); }
    catch (error) { reportError(); throw error; }
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
      await deleteMachineFromFirestore(machineId, user.uid);
    } catch (err) {
      console.warn('Erro ao excluir máquina no Firestore:', err);
      reportError();
      throw err;
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
        login: handleLogin,
        loginWithEmail: handleLoginWithEmail,
        registerWithEmail: handleRegisterWithEmail,
        loginDirect: handleLoginDirect,
        logout: handleLogout,
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
        financialSettings,
        syncFinancialSettingsMutation,
        products,
        syncProductMutation,
        adjustStockMutation,
        deleteProductMutation,
        salesOrders,
        syncSalesOrderMutation,
        createCatalogOrderMutation,
        convertQuoteMutation,
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

