import React from 'react';
import { CompanyProfile, PlanType } from '../types';
import {
  LayoutDashboard,
  Box,
  Scissors,
  Calculator,
  FileText,
  Clock,
  Package,
  Store,
  ShieldCheck,
  Settings,
  Sparkles,
  Zap,
  Flame
} from 'lucide-react';

interface NavbarProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  company: CompanyProfile;
  currentPlan: PlanType;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onSelectTab,
  company,
  currentPlan
}) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'studio', label: 'Studio 3D & IA', icon: Box, highlight: true },
    { id: 'nesting', label: 'Nesting de Chapas', icon: Scissors },
    { id: 'pricing', label: 'Mark-up Divisor', icon: Calculator },
    { id: 'quotes', label: 'Orçamentos', icon: FileText },
    { id: 'production', label: 'Produção & Kanban', icon: Clock },
    { id: 'inventory', label: 'Estoque SKU', icon: Package },
    { id: 'catalog', label: 'Catálogo & Loja', icon: Store },
    { id: 'fiscal', label: 'Fiscal & Etiquetas', icon: ShieldCheck },
    { id: 'settings', label: 'Cadastros', icon: Settings }
  ];

  return (
    <header className="border-b border-slate-800 bg-slate-950/95 sticky top-0 z-40 backdrop-blur-md">
      {/* Top Bar with Brand & Context */}
      <div className="px-6 py-2.5 flex items-center justify-between border-b border-slate-800/60">
        <div className="flex items-center gap-3">
          {/* CUT App Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-400 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-amber-500/20">
              <Flame className="w-5 h-5 fill-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-sm tracking-wider text-white">CUT App</span>
                <span className="text-[10px] font-mono bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded font-bold">
                  v2.0
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium">ERP & CAD/CAM Laser</p>
            </div>
          </div>

          <div className="hidden md:block h-5 w-[1px] bg-slate-800 mx-2" />

          {/* Company Badge */}
          <div className="hidden md:flex items-center gap-2 text-xs">
            <span className="font-bold text-slate-200">{company.tradeName}</span>
            <span className="text-[10px] text-slate-400 font-mono bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
              {company.city}/{company.uf}
            </span>
          </div>
        </div>

        {/* Right Info: Plan Badge & Quick Status */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 bg-slate-900 rounded-lg border border-slate-800 text-xs">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-slate-400 text-[11px]">Plano:</span>
            <span className="font-bold text-amber-300 font-mono">{currentPlan}</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Fábrica Online</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <nav className="px-6 flex items-center gap-1 overflow-x-auto no-scrollbar py-1">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                isActive
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/10'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${item.highlight && !isActive ? 'text-amber-400' : ''}`} />
              <span>{item.label}</span>
              {item.highlight && !isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              )}
            </button>
          );
        })}
      </nav>
    </header>
  );
};
