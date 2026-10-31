import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'danger' | 'success' | 'primary';
  requireJustification?: boolean;
  justification?: string;
  onJustificationChange?: (val: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  confirmVariant = 'primary',
  requireJustification = false,
  justification = '',
  onJustificationChange,
  onConfirm,
  onCancel,
  loading = false,
}) => {
  if (!isOpen) return null;

  const getConfirmStyle = () => {
    switch (confirmVariant) {
      case 'danger':
        return 'bg-rose-600 hover:bg-rose-700 text-white';
      case 'success':
        return 'bg-emerald-700 hover:bg-emerald-800 text-white';
      default:
        return 'bg-emerald-600 hover:bg-emerald-700 text-white';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-gray-100">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`rounded-xl p-2.5 ${
                confirmVariant === 'danger'
                  ? 'bg-rose-100 text-rose-600'
                  : confirmVariant === 'success'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-gray-900">{title}</h3>
          </div>
          <button
            onClick={onCancel}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600 p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="mt-3 text-sm text-gray-600 leading-relaxed">{message}</p>

        {requireJustification && (
          <div className="mt-4">
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Justificativa obrigatória (auditoria):
            </label>
            <textarea
              value={justification}
              onChange={(e) => onJustificationChange?.(e.target.value)}
              placeholder="Descreva o motivo desta ação administrativa..."
              rows={3}
              className="w-full rounded-xl border border-gray-300 p-2.5 text-xs text-gray-900 focus:border-emerald-600 focus:outline-none"
            />
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2.5">
          <button
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading || (requireJustification && !justification.trim())}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition shadow-xs disabled:opacity-50 ${loading ? 'pointer-events-none opacity-60' : 'cursor-pointer'} ${getConfirmStyle()}`}
          >
            {loading ? 'Processando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
