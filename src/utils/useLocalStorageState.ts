import { useState, useEffect, useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';

function readValue<T>(key: string, initialValue: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return initialValue;
    const value = JSON.parse(raw);
    const matches = value !== null && typeof value === typeof initialValue && Array.isArray(value) === Array.isArray(initialValue);
    if (!matches) throw new Error('Formato incompatível.');
    return value as T;
  } catch (error) {
    console.warn(`Não foi possível carregar ${key}:`, error);
    return initialValue;
  }
}

/** A key change never writes the previous account's value into the new account. */
export function useLocalStorageState<T>(key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [record, setRecord] = useState(() => ({ key, value: readValue(key, initialValue) }));
  if (record.key !== key) {
    setRecord({ key, value: readValue(key, initialValue) });
  }
  useEffect(() => {
    if (record.key !== key) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(record.value));
    } catch {
      window.dispatchEvent(new CustomEvent('cnc-sync-error', { detail: 'O navegador não conseguiu salvar os dados. Libere espaço ou exporte um backup antes de fechar esta página.' }));
    }
  }, [key, record]);
  const setValue: Dispatch<SetStateAction<T>> = useCallback(value => {
    setRecord(prev => prev.key !== key ? prev : { key, value: typeof value === 'function' ? (value as (previous: T) => T)(prev.value) : value });
  }, [key]);
  return [record.key === key ? record.value : readValue(key, initialValue), setValue];
}
