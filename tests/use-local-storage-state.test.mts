import { JSDOM } from 'jsdom';
import test from 'node:test';
import assert from 'node:assert/strict';

const jsdom = new JSDOM('<!html><html><body></body></html>', {
  url: 'http://localhost/'
});

Object.defineProperty(globalThis, 'window', {
  value: jsdom.window,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, 'CustomEvent', {
  value: jsdom.window.CustomEvent,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, 'document', {
  value: jsdom.window.document,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, 'navigator', {
  value: jsdom.window.navigator,
  writable: true,
  configurable: true,
});
(globalThis as any).HTMLElement = jsdom.window.HTMLElement;
(globalThis as any).Element = jsdom.window.Element;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useLocalStorageState } from '../src/utils/useLocalStorageState.ts';

test('dispara cnc-sync-error ao falhar window.localStorage.setItem', async () => {
  jsdom.window.localStorage.clear();
  const origSetItem = jsdom.window.Storage.prototype.setItem;
  jsdom.window.Storage.prototype.setItem = () => {
    throw new Error('QuotaExceededError');
  };

  const events: CustomEvent[] = [];
  const listener = (e: Event) => events.push(e as CustomEvent);
  jsdom.window.addEventListener('cnc-sync-error', listener);

  try {
    function Comp() {
      useLocalStorageState('error-key', 'initial');
      return null;
    }
    const container = jsdom.window.document.createElement('div');
    jsdom.window.document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(Comp));
    });

    assert.equal(events.length, 1);
    assert.equal(
      events[0].detail,
      'O navegador não conseguiu salvar os dados. Libere espaço ou exporte um backup antes de fechar esta página.'
    );

    await act(async () => {
      root.unmount();
    });
    container.remove();
  } finally {
    jsdom.window.removeEventListener('cnc-sync-error', listener);
    jsdom.window.Storage.prototype.setItem = origSetItem;
  }
});

test('carrega valor existente do localStorage e atualiza via setValue', async () => {
  jsdom.window.localStorage.clear();
  jsdom.window.localStorage.setItem('valid-key', JSON.stringify({ count: 10 }));

  let stateValue: { count: number } | undefined;
  let setterFn: any;

  function Comp() {
    const [val, setVal] = useLocalStorageState<{ count: number }>('valid-key', { count: 0 });
    stateValue = val;
    setterFn = setVal;
    return null;
  }

  const container = jsdom.window.document.createElement('div');
  jsdom.window.document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(React.createElement(Comp));
  });

  assert.deepEqual(stateValue, { count: 10 });

  await act(async () => {
    setterFn({ count: 20 });
  });

  assert.deepEqual(stateValue, { count: 20 });
  assert.equal(jsdom.window.localStorage.getItem('valid-key'), JSON.stringify({ count: 20 }));

  await act(async () => {
    setterFn((prev: any) => ({ count: prev.count + 5 }));
  });

  assert.deepEqual(stateValue, { count: 25 });
  assert.equal(jsdom.window.localStorage.getItem('valid-key'), JSON.stringify({ count: 25 }));

  await act(async () => {
    root.unmount();
  });
  container.remove();
});

test('trata JSON corrompido ou formato incompatível usando o valor inicial', async () => {
  jsdom.window.localStorage.clear();
  jsdom.window.localStorage.setItem('corrupt-key', '{ invalid json');
  jsdom.window.localStorage.setItem('type-mismatch-key', JSON.stringify([1, 2, 3]));

  let corruptVal: any;
  let mismatchVal: any;

  function Comp() {
    const [cVal] = useLocalStorageState('corrupt-key', 'default-str');
    const [mVal] = useLocalStorageState<number>('type-mismatch-key', 42);
    corruptVal = cVal;
    mismatchVal = mVal;
    return null;
  }

  const container = jsdom.window.document.createElement('div');
  jsdom.window.document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(React.createElement(Comp));
  });

  assert.equal(corruptVal, 'default-str');
  assert.equal(mismatchVal, 42);

  await act(async () => {
    root.unmount();
  });
  container.remove();
});

test('muda a chave sem sobrescrever os dados da nova conta com o valor anterior', async () => {
  jsdom.window.localStorage.clear();
  jsdom.window.localStorage.setItem('account-1:theme', JSON.stringify('dark'));
  jsdom.window.localStorage.setItem('account-2:theme', JSON.stringify('light'));

  let currentTheme: any;

  function Comp({ accountKey }: { accountKey: string }) {
    const [theme] = useLocalStorageState(accountKey, 'system');
    currentTheme = theme;
    return null;
  }

  const container = jsdom.window.document.createElement('div');
  jsdom.window.document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(React.createElement(Comp, { accountKey: 'account-1:theme' }));
  });

  assert.equal(currentTheme, 'dark');

  await act(async () => {
    root.render(React.createElement(Comp, { accountKey: 'account-2:theme' }));
  });

  assert.equal(currentTheme, 'light');
  assert.equal(jsdom.window.localStorage.getItem('account-2:theme'), JSON.stringify('light'));

  await act(async () => {
    root.unmount();
  });
  container.remove();
});
