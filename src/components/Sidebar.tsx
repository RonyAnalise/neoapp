import React from 'react';
import {
  LayoutDashboard,
  Users,
  Gauge,
  Receipt,
  CreditCard,
  History,
  BarChart3,
  Building2,
  Zap,
  ShieldCheck,
  ClipboardList,
  Settings,
  LogOut,
  X,
  Calculator,
  FileCheck2,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export type ActiveTab =
  | 'dashboard'
  | 'clientes'
  | 'consumo'
  | 'faturas'
  | 'pagamentos'
  | 'taxas_coelba'
  | 'historico'
  | 'relatorios'
  | 'orcamento'
  | 'empresa'
  | 'tarifas'
  | 'usuarios'
  | 'auditoria'
  | 'sistema';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  mobileOpen,
  setMobileOpen,
}) => {
  const { userProfile, isAdmin, logout } = useAuth();

  const menuItems = [
    { id: 'dashboard' as ActiveTab, label: '1. Dashboard', icon: LayoutDashboard },
    { id: 'clientes' as ActiveTab, label: '2. Clientes', icon: Users },
    { id: 'consumo' as ActiveTab, label: '3. Consumo de energia', icon: Gauge },
    { id: 'faturas' as ActiveTab, label: '4. Faturas', icon: Receipt },
    { id: 'pagamentos' as ActiveTab, label: '5. Pagamentos', icon: CreditCard },
    { id: 'taxas_coelba' as ActiveTab, label: '6. Taxas Coelba', icon: FileCheck2 },
    { id: 'historico' as ActiveTab, label: '7. Histórico de consumo', icon: History },
    { id: 'relatorios' as ActiveTab, label: '8. Relatórios', icon: BarChart3 },
    { id: 'orcamento' as ActiveTab, label: '9. Orçamento / Simulação', icon: Calculator },
    { id: 'empresa' as ActiveTab, label: '10. Cadastro da empresa', icon: Building2, adminOnly: true },
    { id: 'tarifas' as ActiveTab, label: '11. Configurações de energia', icon: Zap, adminOnly: true },
    { id: 'usuarios' as ActiveTab, label: '12. Usuários e permissões', icon: ShieldCheck, adminOnly: true },
    { id: 'auditoria' as ActiveTab, label: '13. Auditoria', icon: ClipboardList, adminOnly: true },
    { id: 'sistema' as ActiveTab, label: '14. Configurações do sistema', icon: Settings },
  ];

  const handleSelect = (id: ActiveTab) => {
    setActiveTab(id);
    setMobileOpen(false);
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-[#0f3d20] text-emerald-50 shadow-2xl transition-transform duration-300 ease-in-out lg:sticky lg:top-0 lg:h-screen lg:shrink-0 lg:z-30 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="flex h-20 items-center justify-between border-b border-emerald-800/80 px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-600 to-green-400 text-white shadow-md">
              <Zap className="h-6 w-6 fill-current text-yellow-300" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-black text-xl tracking-tight text-white">NeoApp</span>
                <span className="rounded-md bg-emerald-700/80 px-1.5 py-0.5 text-[9px] font-bold text-emerald-200">
                  PRO
                </span>
              </div>
              <p className="text-[11px] text-emerald-300/80 font-medium">Neo Energia Carnaúbanos</p>
            </div>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="text-emerald-400 hover:text-white lg:hidden p-1"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* User Card */}
        <div className="border-b border-emerald-800/60 p-4">
          <div className="flex items-center gap-3 rounded-2xl bg-emerald-900/50 p-3 border border-emerald-800/40">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-700 font-bold text-white text-sm shadow-xs">
              {userProfile?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-white">{userProfile?.name || 'Carregando...'}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    isAdmin ? 'bg-amber-400' : 'bg-emerald-400'
                  }`}
                />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                  {isAdmin ? 'Administrador' : 'Operador'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Menu Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-4 custom-scrollbar">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isCurrent = activeTab === item.id;
            const isLocked = item.adminOnly && !isAdmin;

            return (
              <button
                key={item.id}
                onClick={() => !isLocked && handleSelect(item.id)}
                disabled={isLocked}
                className={`group flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-medium transition-all ${
                  isCurrent
                    ? 'bg-emerald-600 text-white font-bold shadow-md'
                    : isLocked
                    ? 'opacity-40 cursor-not-allowed text-emerald-300/60'
                    : 'text-emerald-100/90 hover:bg-emerald-800/60 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`h-4 w-4 shrink-0 transition-transform ${
                      isCurrent ? 'text-yellow-300 scale-110' : 'text-emerald-300 group-hover:text-white'
                    }`}
                  />
                  <span>{item.label}</span>
                </div>
                {item.adminOnly && (
                  <span className="text-[9px] uppercase tracking-wider text-emerald-300/60 px-1 py-0.5 rounded bg-emerald-950/40">
                    ADM
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Logout Bottom Footer */}
        <div className="border-t border-emerald-800/80 p-4">
          <button
            onClick={() => logout()}
            className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-rose-300 hover:bg-rose-950/40 hover:text-rose-200 transition"
          >
            <LogOut className="h-4 w-4" />
            <span>13. Sair do Sistema</span>
          </button>
        </div>
      </aside>
    </>
  );
};
