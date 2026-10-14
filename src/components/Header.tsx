import React from 'react';
import { Menu, Shield, Zap, Sparkles } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import { useAuth } from '../hooks/useAuth';

interface HeaderProps {
  title: string;
  subtitle?: string;
  onOpenMobileMenu: () => void;
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle, onOpenMobileMenu }) => {
  const { userProfile, isAdmin } = useAuth();

  return (
    <header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b border-gray-200 bg-white/95 px-4 sm:px-8 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileMenu}
          className="rounded-xl p-2 text-gray-600 hover:bg-gray-100 lg:hidden cursor-pointer"
          aria-label="Abrir menu"
        >
          <Menu className="h-6 w-6" />
        </button>
        <div>
          <h1 className="text-lg sm:text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            {title}
          </h1>
          {subtitle && <p className="text-xs text-gray-500 font-medium">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* PWA In-App Install Prompt */}
        <PWAInstallButton />

        {/* Status Pill */}
        <div className="hidden sm:flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-1.5 border border-emerald-200">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-xs font-bold text-emerald-800">Firestore Conectado</span>
        </div>

        {/* Admin Badge */}
        {isAdmin && (
          <span className="hidden md:inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800 border border-amber-200">
            <Shield className="w-3.5 h-3.5 text-amber-600" />
            <span>Admin</span>
          </span>
        )}
      </div>
    </header>
  );
};
