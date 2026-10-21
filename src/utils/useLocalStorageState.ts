import { useState, useEffect } from 'react';

export function useLocalStorageState<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item !== null) {
        return JSON.parse(item);
      }
    } catch (e) {
      console.warn(`Erro ao carregar chave "${key}" do localStorage:`, e);
    }
    return initialValue;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch (e) {
      console.warn(`Erro ao salvar chave "${key}" no localStorage:`, e);
    }
  }, [key, state]);

  return [state, setState];
}
