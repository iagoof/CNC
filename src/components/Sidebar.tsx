import React from 'react';
import { CompanyProfile, PlanType } from '../types';
import {
  LayoutDashboard,
  Box,
  Cpu,
  Scissors,
  Calculator,
  FileText,
  Clock,
  Package,
  Store,
  ShieldCheck,
  Settings,
  Flame,
  MapPin,
  Zap,
  Activity,
  Sparkles,
  LogIn,
  LogOut,
  Cloud,
  CheckCircle2,
  Shield
} from 'lucide-react';
import { useFirebase } from '../services/firebase/FirebaseContext';

interface SidebarProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  company: CompanyProfile;
  currentPlan: PlanType;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  company,
  currentPlan
}) => {
  const navItems = [
    { id: 'dashboard', label: 'Visão Geral', icon: LayoutDashboard, section: 'Gestão' },
    { id: 'studio-ai', label: 'Design Studio AI', icon: Sparkles, badge: 'Novo IA', section: 'Engenharia & CAD' },
    { id: 'studio', label: 'Estúdio 3D CAD', icon: Box, badge: '3D', section: 'Engenharia & CAD' },
    { id: 'cam-ai', label: 'Otimizador CAM IA', icon: Cpu, badge: 'IA G-Code', section: 'Engenharia & CAD' },
    { id: 'nesting', label: 'Nesting de Chapas', icon: Scissors, section: 'Engenharia & CAD' },
    { id: 'pricing', label: 'Mark-up Divisor', icon: Calculator, section: 'Comercial' },
    { id: 'quotes', label: 'Orçamentos', icon: FileText, section: 'Comercial' },
    { id: 'production', label: 'Produção & Kanban', icon: Clock, section: 'Chão de Fábrica' },
    { id: 'inventory', label: 'Estoque por SKU', icon: Package, section: 'Chão de Fábrica' },
    { id: 'catalog', label: 'Catálogo & Loja', icon: Store, section: 'Vendas' },
    { id: 'fiscal', label: 'Fiscal & Etiquetas', icon: ShieldCheck, section: 'Fiscal' },
    { id: 'observability', label: 'Observabilidade SRE', icon: Activity, badge: 'SRE 99.9%', section: 'Infra & Confiabilidade' },
    { id: 'settings', label: 'Cadastros Técnicos', icon: Settings, section: 'Configurações' }
  ];

  const { user, isAuthenticated, isAdmin, login, logout, isOnline } = useFirebase();

  return (
    <aside className="w-64 h-screen bg-white border-r border-slate-200 flex flex-col shrink-0 select-none z-30 shadow-sm print:hidden">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-100 flex flex-col gap-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-400 flex items-center justify-center text-white font-black shadow-md shadow-amber-500/20 shrink-0">
            <Flame className="w-5 h-5 fill-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-base tracking-tight text-slate-900">CNC APP</span>
              <span className="text-[10px] font-mono bg-amber-50 text-amber-700 border border-amber-200/60 px-1.5 py-0.2 rounded font-bold">
                v2.0
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">ERP & CAM Industrial</p>
          </div>
        </div>

        {/* Location Badge (Juiz de Fora / MG) */}
        <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-2.5 space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
            <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="truncate">Juiz de Fora / MG</span>
          </div>
          <div className="flex justify-between text-[10px] text-slate-500 font-mono">
            <span>CEMIG Tarifa:</span>
            <span className="font-bold text-slate-700">R$ 1,02/kWh</span>
          </div>
        </div>

        {/* Firebase Cloud Sync Status */}
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-2.5 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold">
            <div className="flex items-center gap-1.5 text-slate-800">
              <Cloud className="w-3.5 h-3.5 text-amber-600" />
              <span>Nuvem Firestore</span>
            </div>
            {isOnline ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                <CheckCircle2 className="w-3 h-3" /> Online
              </span>
            ) : (
              <span className="text-[10px] font-bold text-slate-500">Offline</span>
            )}
          </div>

          {isAuthenticated ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="truncate text-[11px] text-slate-700 font-medium">
                  {user?.displayName || user?.email}
                </div>
                {isAdmin && (
                  <span className="flex items-center gap-0.5 text-[9px] font-bold bg-amber-500 text-slate-950 px-1.5 py-0.5 rounded shadow-xs">
                    <Shield className="w-2.5 h-2.5 fill-current" /> Admin
                  </span>
                )}
              </div>
              <button
                onClick={logout}
                className="w-full flex items-center justify-center gap-1.5 py-1 px-2 text-[10px] font-medium text-slate-600 hover:text-red-600 bg-white border border-slate-200 rounded-lg hover:border-red-200 transition-colors cursor-pointer"
              >
                <LogOut className="w-3 h-3" /> Sair da Conta
              </button>
            </div>
          ) : (
            <button
              onClick={login}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg shadow-sm transition-all cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" /> Conectar Google
            </button>
          )}
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1 text-xs">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium transition-all text-left ${
                isActive
                  ? 'bg-amber-500 text-white font-bold shadow-sm shadow-amber-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-700'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </div>

              {item.badge && (
                <span
                  className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-amber-50 text-amber-700 border border-amber-200/50'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer Profile & Workshop Status */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/70 space-y-2.5">
        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-1.5 text-emerald-700 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span>Fábrica Operando</span>
          </div>
          <span className="text-[10px] font-mono text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
            copper-psyche
          </span>
        </div>

        <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500">
          <span>Plano Ativo:</span>
          <span className="font-bold text-amber-700 font-mono flex items-center gap-1">
            <Zap className="w-3 h-3 text-amber-600" />
            {currentPlan}
          </span>
        </div>
      </div>
    </aside>
  );
};

