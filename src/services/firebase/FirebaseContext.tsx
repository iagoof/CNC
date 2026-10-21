import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import {
  auth,
  loginWithGoogle,
  logoutUser,
  testConnection,
  subscribeToOrders,
  saveOrderToFirestore,
  subscribeToMaterials,
  saveMaterialToFirestore,
  subscribeToQuotes,
  saveQuoteToFirestore
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
  syncOrders: (orders: ProductionOrder[], setOrders: React.Dispatch<React.SetStateAction<ProductionOrder[]>>) => void;
  syncOrderMutation: (order: ProductionOrder) => Promise<void>;
  syncMaterialMutation: (material: Material) => Promise<void>;
  syncQuoteMutation: (quote: Quote) => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

export const FirebaseProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isOnline, setIsOnline] = useState<boolean>(true);

  const isAdmin = user?.email === 'iagoofss@gmail.com';

  useEffect(() => {
    // Validação inicial de conectividade
    testConnection().then(online => setIsOnline(online));

    // Monitoramento do estado de autenticação
    const unsubscribe = onAuthStateChanged(auth, currentUser => {
      setUser(currentUser);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      await loginWithGoogle();
    } catch (err) {
      console.error('Falha no login Google:', err);
    }
  };

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch (err) {
      console.error('Falha no logout:', err);
    }
  };

  const syncOrders = (
    localOrders: ProductionOrder[],
    setOrders: React.Dispatch<React.SetStateAction<ProductionOrder[]>>
  ) => {
    if (!user) return;
    const unsub = subscribeToOrders(user.uid, remoteOrders => {
      if (remoteOrders && remoteOrders.length > 0) {
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
    }
  };

  const syncMaterialMutation = async (material: Material) => {
    if (!user) return;
    try {
      await saveMaterialToFirestore(material, user.uid);
    } catch (err) {
      console.warn('Erro ao persistir material no Firestore:', err);
    }
  };

  const syncQuoteMutation = async (quote: Quote) => {
    if (!user) return;
    try {
      await saveQuoteToFirestore(quote, user.uid);
    } catch (err) {
      console.warn('Erro ao persistir orçamento no Firestore:', err);
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
        syncMaterialMutation,
        syncQuoteMutation
      }}
    >
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
