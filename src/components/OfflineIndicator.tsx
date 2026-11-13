import React from 'react';
import { WifiOff, Wifi, RefreshCw, AlertTriangle, X } from 'lucide-react';
import { useDetailedOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const {
    isOnline,
    wasOffline,
    isChecking,
    justDisconnected,
    dismissDisconnectedAlert,
    dismissReconnectedToast,
    checkConnection,
  } = useDetailedOnlineStatus();

  return (
    <>
      {/* 1. Modal Emergencial quando a conexão cai */}
      {justDisconnected && !isOnline && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 text-center shadow-2xl border-2 border-red-500 space-y-4">
            <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 mx-auto flex items-center justify-center animate-bounce">
              <WifiOff className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-black text-gray-900">
                Atenção: A Conexão com a Internet Caiu!
              </h3>
              <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                O sistema está configurado para <strong>gravar tudo diretamente no banco de dados na nuvem</strong>.
              </p>
              <div className="mt-3 p-3.5 bg-red-50 rounded-2xl border border-red-200 text-left text-xs text-red-900 space-y-1.5">
                <p className="font-black flex items-center gap-1.5 text-red-700">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  Nada é gravado no navegador
                </p>
                <p className="text-[11px] text-red-700 leading-normal">
                  Todas as faturas, leituras e dados devem ser enviados diretamente ao Firestore. Para evitar perda de dados, reconecte-se à internet antes de realizar qualquer gravação.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => checkConnection()}
                disabled={isChecking}
                className="px-4 py-2.5 rounded-xl bg-red-600 text-white text-xs font-black hover:bg-red-700 transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
                <span>{isChecking ? 'Verificando Rede...' : 'Testar Conexão Agora'}</span>
              </button>
              <button
                onClick={dismissDisconnectedAlert}
                className="px-4 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-xs font-bold hover:bg-gray-200 transition cursor-pointer"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Barra Superior Fixa e Persistente enquanto estiver Offline */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-[9999] bg-gradient-to-r from-red-700 via-rose-600 to-red-700 text-white px-4 py-2.5 shadow-2xl border-b-2 border-red-800 flex flex-col sm:flex-row items-center justify-between gap-3 animate-slideDown">
          <div className="flex items-center gap-3">
            <span className="flex h-3 w-3 relative shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-300 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-400"></span>
            </span>
            <WifiOff className="w-5 h-5 text-yellow-300 shrink-0" />
            <div>
              <p className="text-xs sm:text-sm font-black tracking-wide text-white flex items-center gap-1.5">
                SEM CONEXÃO COM A INTERNET
              </p>
              <p className="text-[11px] text-red-100 font-medium">
                Tudo é gravado <strong>diretamente no banco de dados</strong>. Nenhuma alteração será salva no navegador enquanto estiver offline.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => checkConnection()}
              disabled={isChecking}
              className="px-3.5 py-1.5 rounded-xl bg-white text-red-800 text-xs font-black hover:bg-yellow-100 transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
              <span>{isChecking ? 'Verificando...' : 'Testar Conexão'}</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. Toast de Conexão Restabelecida */}
      {wasOffline && isOnline && (
        <div className="fixed top-4 right-4 z-[9999] bg-emerald-600 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-emerald-400 animate-slideDown">
          <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <Wifi className="w-5 h-5 text-emerald-100" />
          </div>
          <div>
            <p className="text-xs font-black text-white">
              Conexão com a Internet Restabelecida!
            </p>
            <p className="text-[11px] text-emerald-100">
              Conectado diretamente ao banco de dados Firestore. Gravação liberada.
            </p>
          </div>
          <button
            onClick={dismissReconnectedToast}
            className="w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition ml-2 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </>
  );
};
