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
  FirestoreProject,
  FirestoreCompanySettings
} from './firebase';
import { ProductionOrder, Material, Quote } from '../../types';

interface FirebaseContextType {
  user: FirebaseUser | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  isOnline: boolean;
  login: () => Promise<void>;
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
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

export const FirebaseProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [syncError, setSyncError] = useState<string | null>(null);
  const reportError = () => setSyncError('Não foi possível sincronizar com a nuvem. Os dados locais foram mantidos. Verifique a conexão e as permissões antes de continuar.');
  const [projects, setProjects] = useState<FirestoreProject[]>([]);
  const [companySettings, setCompanySettings] = useState<FirestoreCompanySettings | null>(null);

  const isAdmin = user?.email === 'iagoofss@gmail.com';

  useEffect(() => {
    // Validação inicial de conectividade
    testConnection().then(online => setIsOnline(online));
    const onSyncError = (event: Event) => setSyncError((event as CustomEvent<string>).detail);
    window.addEventListener('cnc-sync-error', onSyncError);

    // Monitoramento do estado de autenticação
    const unsubscribe = onAuthStateChanged(auth, currentUser => {
      setUser(currentUser);
      setIsLoading(false);
    });

    return () => { unsubscribe(); window.removeEventListener('cnc-sync-error', onSyncError); };
  }, []);

  // Subscrição em tempo real de Projetos e Configurações da Empresa quando logado
  useEffect(() => {
    if (!user) {
      setProjects([]);
      setCompanySettings(null);
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

    return () => {
      unsubProjects();
      unsubSettings();
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

  return (
    <FirebaseContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isAdmin,
        isLoading,
        isOnline,
        login: handleLogin,
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
        syncCompanySettingsMutation
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

