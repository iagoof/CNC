import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { useLocalStorageState } from './src/utils/useLocalStorageState.ts';

class MockLocalStorage {
  private store = new Map<string, string>();
  shouldThrowOnSet = false;

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.shouldThrowOnSet) {
      throw new Error('QuotaExceededError');
    }
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

const mockStorage = new MockLocalStorage();
const eventListeners = new Map<string, Set<(e: any) => void>>();

(globalThis as any).window = globalThis;
(globalThis as any).window.localStorage = mockStorage;
(globalThis as any).window.dispatchEvent = (event: any) => {
  const listeners = eventListeners.get(event.type);
  if (listeners) {
    listeners.forEach(cb => cb(event));
  }
  return true;
};
(globalThis as any).window.addEventListener = (type: string, listener: (e: any) => void) => {
  if (!eventListeners.has(type)) {
    eventListeners.set(type, new Set());
  }
  eventListeners.get(type)!.add(listener);
};
(globalThis as any).window.removeEventListener = (type: string, listener: (e: any) => void) => {
  const listeners = eventListeners.get(type);
  if (listeners) {
    listeners.delete(listener);
  }
};
(globalThis as any).CustomEvent = class CustomEvent {
  type: string;
  detail: any;
  constructor(type: string, params?: { detail?: any }) {
    this.type = type;
    this.detail = params?.detail;
  }
};

function createHookRunner<T>(initialKey: string, initialValue: T) {
  let stateRecord: any = null;
  let effectCleanup: (() => void) | void = undefined;

  let currentKey = initialKey;
  let currentInitValue = initialValue;

  let latestTuple: [T, React.Dispatch<React.SetStateAction<T>>] | null = null;

  const dispatcher = {
    useState(initialState: any) {
      if (stateRecord === null) {
        stateRecord = typeof initialState === 'function' ? initialState() : initialState;
      }
      const setState = (action: any) => {
        const next = typeof action === 'function' ? action(stateRecord) : action;
        stateRecord = next;
        runCycle();
      };
      return [stateRecord, setState];
    },
    useEffect(effect: () => void | (() => void), deps?: any[]) {
      if (effectCleanup) effectCleanup();
      effectCleanup = effect();
    },
    useCallback(fn: any, deps?: any[]) {
      return fn;
    }
  };

  function runCycle() {
    const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    const prevDispatcher = internals.H;
    internals.H = dispatcher;
    try {
      latestTuple = useLocalStorageState<T>(currentKey, currentInitValue);
    } finally {
      internals.H = prevDispatcher;
    }
  }

  runCycle();

  return {
    get result() {
      return latestTuple![0];
    },
    setValue(val: T | ((prev: T) => T)) {
      latestTuple![1](val);
    },
    changeProps(newKey: string, newInitValue: T) {
      currentKey = newKey;
      currentInitValue = newInitValue;
      runCycle();
    }
  };
}

test('loads initialValue when localStorage has no record', () => {
  mockStorage.clear();
  const runner = createHookRunner('settings', { theme: 'dark' });

  assert.deepEqual(runner.result, { theme: 'dark' });
  assert.equal(mockStorage.getItem('settings'), JSON.stringify({ theme: 'dark' }));
});

test('loads saved JSON value from localStorage', () => {
  mockStorage.clear();
  mockStorage.setItem('count', JSON.stringify(42));

  const runner = createHookRunner('count', 0);
  assert.equal(runner.result, 42);
});

test('falls back to initialValue when stored JSON is invalid', () => {
  mockStorage.clear();
  mockStorage.setItem('config', 'invalid-json-{');

  const runner = createHookRunner('config', { enabled: true });
  assert.deepEqual(runner.result, { enabled: true });
});

test('falls back to initialValue when stored type does not match initialValue type', () => {
  mockStorage.clear();
  // Stored is a number, initialValue is an object
  mockStorage.setItem('profile', JSON.stringify(123));

  const runner = createHookRunner('profile', { name: 'User' });
  assert.deepEqual(runner.result, { name: 'User' });
});

test('falls back to initialValue when stored array status differs from initialValue', () => {
  mockStorage.clear();
  // Stored is array, initial is plain object
  mockStorage.setItem('tags', JSON.stringify(['a', 'b']));

  const runner = createHookRunner('tags', { a: 'b' } as any);
  assert.deepEqual(runner.result, { a: 'b' });
});

test('updates value directly and persists to localStorage', () => {
  mockStorage.clear();
  const runner = createHookRunner('volume', 50);

  assert.equal(runner.result, 50);

  runner.setValue(75);
  assert.equal(runner.result, 75);
  assert.equal(mockStorage.getItem('volume'), JSON.stringify(75));
});

test('updates value using functional updater', () => {
  mockStorage.clear();
  const runner = createHookRunner('counter', 10);

  runner.setValue(prev => prev + 5);
  assert.equal(runner.result, 15);
  assert.equal(mockStorage.getItem('counter'), JSON.stringify(15));
});

test('handles key switch cleanly without leaking previous account data', () => {
  mockStorage.clear();
  mockStorage.setItem('user2_data', JSON.stringify('User 2 data'));

  const runner = createHookRunner('user1_data', 'User 1 data');
  assert.equal(runner.result, 'User 1 data');

  runner.changeProps('user2_data', 'Fallback data');
  assert.equal(runner.result, 'User 2 data');
});

test('dispatches cnc-sync-error event when localStorage setItem fails', () => {
  mockStorage.clear();
  mockStorage.shouldThrowOnSet = true;

  let eventFired = false;
  let eventDetail: any = null;

  const handleSyncError = (e: any) => {
    eventFired = true;
    eventDetail = e.detail;
  };

  (globalThis as any).window.addEventListener('cnc-sync-error', handleSyncError);

  try {
    const runner = createHookRunner('quota_test', 'value');
    assert.equal(runner.result, 'value');
    assert.equal(eventFired, true);
    assert.match(eventDetail, /O navegador não conseguiu salvar os dados/);
  } finally {
    mockStorage.shouldThrowOnSet = false;
    (globalThis as any).window.removeEventListener('cnc-sync-error', handleSyncError);
  }
});
