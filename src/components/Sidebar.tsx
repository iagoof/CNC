import React from 'react';
import { APP_RELEASE } from '../version';
import { CompanyProfile } from '../types';
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
  Activity,
  Sparkles,
  LogOut,
  Shield,
  Circle
} from 'lucide-react';
import { useFirebase } from '../services/firebase/FirebaseContext';

interface SidebarProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  company: CompanyProfile;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  company
}) => {
  const navItems = [
    { id: 'dashboard', label: 'Visão Geral', icon: LayoutDashboard, section: 'Gestão' },
    { id: 'studio-ai', label: 'Estúdio Vetorial', icon: Sparkles, section: 'Engenharia & CAD' },
    { id: 'studio', label: 'Estúdio 3D CAD', icon: Box, badge: '3D', section: 'Engenharia & CAD' },
    { id: 'cam-ai', label: 'Diagnóstico CAM', icon: Cpu, section: 'Engenharia & CAD' },
    { id: 'nesting', label: 'Nesting de Chapas', icon: Scissors, section: 'Engenharia & CAD' },
    { id: 'pricing', label: 'Mark-up Divisor', icon: Calculator, section: 'Comercial' },
    { id: 'quotes', label: 'Orçamentos', icon: FileText, section: 'Comercial' },
    { id: 'production', label: 'Produção & Kanban', icon: Clock, section: 'Chão de Fábrica' },
    { id: 'inventory', label: 'Estoque por SKU', icon: Package, section: 'Chão de Fábrica' },
    { id: 'catalog', label: 'Catálogo & Loja', icon: Store, section: 'Vendas' },
    { id: 'fiscal', label: 'Fiscal & Etiquetas', icon: ShieldCheck, section: 'Fiscal' },
    { id: 'observability', label: 'Diagnóstico Local', icon: Activity, section: 'Infra & Confiabilidade' },
    { id: 'settings', label: 'Cadastros Técnicos', icon: Settings, section: 'Configurações' }
  ];

  const { user, isAdmin, logout, isOnline } = useFirebase();

  // Obter as iniciais do nome ou e-mail
  const getInitials = () => {
    if (user?.displayName) {
      const parts = user.displayName.trim().split(' ');
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      return user.displayName.slice(0, 2).toUpperCase();
    }
    if (user?.email) {
      return user.email.slice(0, 2).toUpperCase();
    }
    return 'OP';
  };

  return (
    <aside className="w-64 h-screen bg-white border-r border-slate-200 flex flex-col shrink-0 select-none z-30 shadow-sm print:hidden">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-400 flex items-center justify-center text-white font-black shadow-md shadow-amber-500/20 shrink-0">
            <Flame className="w-5 h-5 fill-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-base tracking-tight text-slate-900">CNC APP</span>
              <span className="text-[10px] font-mono bg-amber-50 text-amber-700 border border-amber-200/60 px-1.5 py-0.2 rounded font-bold">
                v{APP_RELEASE}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">ERP & CAM Industrial</p>
          </div>
        </div>

        {/* Indicador de Conexão Firestore */}
        <div
          title={isOnline ? 'Conectado à nuvem Firestore' : 'Modo offline'}
          className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-slate-50 border border-slate-200/80 px-2 py-0.5 rounded-full"
        >
          <Circle
            className={`w-2 h-2 ${isOnline ? 'fill-emerald-500 text-emerald-500' : 'fill-slate-400 text-slate-400'}`}
          />
          <span>{isOnline ? 'Nuvem' : 'Off'}</span>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1 text-xs" aria-label="Menu principal">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium transition-all text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 cursor-pointer ${
                isActive
                  ? 'bg-amber-500 text-white font-bold shadow-sm shadow-amber-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-700'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </div>
              {item.badge && (
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded border transition-colors shrink-0 ml-1.5 ${
                    isActive
                      ? 'bg-amber-600/50 text-white border-amber-300/40'
                      : 'bg-amber-50 text-amber-800 border-amber-200/80'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Rodapé: Perfil do Operador Autenticado & Encerramento de Sessão */}
      <div className="border-t border-slate-100 p-3 bg-slate-50/50 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-white border border-slate-200/80 shadow-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || 'Operador'}
                className="w-8 h-8 rounded-lg object-cover border border-slate-200 shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-700 font-bold text-xs flex items-center justify-center shrink-0">
                {getInitials()}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-bold text-slate-800 truncate leading-tight">
                  {user?.displayName || (user?.email ? user.email.split('@')[0] : 'Operador')}
                </p>
                {isAdmin && (
                  <span className="flex items-center gap-0.5 text-[9px] font-bold bg-amber-500 text-slate-950 px-1 py-0.2 rounded shrink-0">
                    <Shield className="w-2.5 h-2.5 fill-current" /> Admin
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-500 truncate leading-tight mt-0.5">
                {user?.email || 'Oficina Conectada'}
              </p>
            </div>
          </div>

          <button
            onClick={logout}
            aria-label="Sair da plataforma"
            title="Sair da plataforma e voltar à tela de login"
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 transition-colors shrink-0 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {/* Informações da Oficina Compactas */}
        {company.tradeName && (
          <div className="px-2 py-1 text-[10px] text-slate-500 flex items-center justify-between">
            <span className="truncate font-medium">{company.tradeName}</span>
            <span className="text-slate-400 shrink-0">{company.city}/{company.uf}</span>
          </div>
        )}
      </div>
    </aside>
  );
};
