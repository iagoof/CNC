import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { NestingView } from '../src/components/nesting/NestingView';
import { INITIAL_MACHINES, INITIAL_MATERIALS } from '../src/data/initialData';
import '../src/index.css';

const session = sessionStorage.getItem('cnc-nesting-audit-session') || crypto.randomUUID();
sessionStorage.setItem('cnc-nesting-audit-session', session);
const accountA = `__audit__:${session}:A`, accountB = `__audit__:${session}:B`;
const transfer = { name: 'Triângulo com furo — validação', width: 70, height: 40, cutLength_mm: 1,
  quantity: 1, transferId: 'workflow', accountId: accountA,
  svgContent: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 40" width="70mm" height="40mm"><path fill="none" stroke="red" data-layer="cut" d="M0 0H70L35 40Z"/><circle fill="none" stroke="red" data-layer="cut" cx="35" cy="10" r="2"/><line data-layer="engrave" stroke="blue" x1="25" y1="10" x2="30" y2="10"/></svg>' };
function WorkflowAudit() {
  const [account, setAccount] = useState(accountA), [open, setOpen] = useState(true);
  return <div className="flex h-screen flex-col">
    <header className="flex flex-wrap items-center gap-4 bg-slate-900 px-6 py-3 text-sm text-white">
      <strong>Ambiente de validação — dados isolados</strong>
      <span>Conta de teste {account === accountA ? 'A' : 'B'}</span>
      <button className="underline" onClick={() => setAccount(account === accountA ? accountB : accountA)}>Trocar conta de teste</button>
      <button className="underline" onClick={() => setOpen(!open)}>{open ? 'Fechar nesting' : 'Abrir nesting'}</button>
    </header>
    {open && <NestingView materials={INITIAL_MATERIALS} machines={INITIAL_MACHINES} initialPart={transfer} accountId={account} uf="SP" />}
  </div>;
}
createRoot(document.getElementById('root')!).render(<WorkflowAudit />);
