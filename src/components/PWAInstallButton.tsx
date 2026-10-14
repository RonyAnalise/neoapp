import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition cursor-pointer"
        title="Instalar aplicativo NeoApp no seu dispositivo"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Instalar App</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-2 rounded-lg border border-emerald-600/40 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition cursor-pointer"
          title="Instalar no iPhone / iPad"
        >
          <Smartphone className="w-3.5 h-3.5 text-emerald-700" />
          <span>Instalar no iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-700 flex items-center justify-center text-white font-bold text-sm">
                    N
                  </div>
                  <h3 className="text-base font-bold text-gray-900">Instalar no iPhone / iPad</h3>
                </div>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="text-gray-400 hover:text-gray-600 p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs text-gray-600">
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-start gap-2.5">
                  <span className="font-bold text-emerald-700 bg-emerald-100 rounded-full w-5 h-5 flex items-center justify-center text-[11px] shrink-0">1</span>
                  <p>Abra o <strong>NeoApp</strong> no navegador <strong>Safari</strong> do iOS.</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-start gap-2.5">
                  <span className="font-bold text-emerald-700 bg-emerald-100 rounded-full w-5 h-5 flex items-center justify-center text-[11px] shrink-0">2</span>
                  <p>Toque no ícone de <strong>Compartilhar</strong> (quadrado com seta para cima) na barra inferior.</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-start gap-2.5">
                  <span className="font-bold text-emerald-700 bg-emerald-100 rounded-full w-5 h-5 flex items-center justify-center text-[11px] shrink-0">3</span>
                  <p>Role para baixo e selecione <strong>Adicionar à Tela de Início</strong>.</p>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-emerald-700 py-2.5 text-xs font-semibold text-white hover:bg-emerald-800 transition"
              >
                Entendi
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
