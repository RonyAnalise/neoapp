import React, { useRef, useState } from 'react';
import { X, Printer, FileText, Camera, Clock, ShieldCheck } from 'lucide-react';
import { Fatura, Cliente, EmpresaConfig } from '../types';
import { InvoiceTemplate } from './InvoiceTemplate';
import { formatDateBr } from '../lib/calculations';

interface InvoiceModalProps {
  fatura: Fatura | null;
  cliente: Cliente | null;
  empresa: EmpresaConfig;
  allClientInvoices?: Fatura[];
  onClose: () => void;
  onOpenBoleto?: (fatura: Fatura) => void;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({
  fatura,
  cliente,
  empresa,
  allClientInvoices = [],
  onClose,
  onOpenBoleto,
}) => {
  const invoiceRef = useRef<HTMLDivElement>(null);
  const [showMeterPhoto, setShowMeterPhoto] = useState(false);

  if (!fatura || !cliente) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 p-2 sm:p-4 backdrop-blur-xs flex items-center justify-center print:static print:p-0 print:m-0 print:bg-transparent print:overflow-visible print:block">
      <div className="relative w-full max-w-4xl rounded-2xl bg-gray-100 shadow-2xl flex flex-col max-h-[96vh] print:max-h-none print:shadow-none print:bg-transparent print:p-0 print:m-0 print:w-auto print:h-auto print:block print:overflow-visible">
        {/* Modal Action Bar */}
        <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-white px-4 py-3 rounded-t-2xl shadow-xs no-print">
          <div className="flex items-center gap-2">
            <span className="font-black text-gray-900 text-sm sm:text-base">
              Fatura #{fatura.invoiceNumber}
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                fatura.status === 'paid'
                  ? 'bg-emerald-100 text-emerald-800'
                  : fatura.status === 'overdue'
                  ? 'bg-rose-100 text-rose-800'
                  : fatura.status === 'cancelled'
                  ? 'bg-gray-100 text-gray-600 line-through'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {fatura.status === 'paid'
                ? 'PAGA'
                : fatura.status === 'overdue'
                ? 'VENCIDA'
                : fatura.status === 'cancelled'
                ? 'CANCELADA'
                : 'PENDENTE'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {fatura.meterPhotoBase64 && (
              <button
                type="button"
                onClick={() => setShowMeterPhoto(true)}
                className="flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition cursor-pointer"
                title="Visualizar foto do medidor enviada para cálculo da fatura"
              >
                <Camera className="w-3.5 h-3.5 text-emerald-700" />
                <span>Foto do Medidor</span>
              </button>
            )}

            {(fatura.boletoBase64 || fatura.boletoStoragePath) && onOpenBoleto && (
              <button
                onClick={() => onOpenBoleto(fatura)}
                className="flex items-center gap-1.5 rounded-lg border border-orange-300 bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-700 hover:bg-orange-100 transition cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Boleto Bancário</span>
              </button>
            )}

            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 px-4 py-2 text-xs font-bold text-white transition cursor-pointer shadow-xs"
              title="Imprimir fatura em folha A4"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir Fatura</span>
            </button>

            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="overflow-y-auto p-3 sm:p-6 bg-gray-200/70 print:p-0 print:m-0 print:bg-transparent print:overflow-visible print:block">
          <div ref={invoiceRef} className="print:m-0 print:p-0">
            <InvoiceTemplate
              fatura={fatura}
              cliente={cliente}
              empresa={empresa}
              allClientInvoices={allClientInvoices}
            />
          </div>
        </div>
      </div>

      {/* Modal Visualizador da Foto do Medidor */}
      {showMeterPhoto && fatura.meterPhotoBase64 && (
        <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <div>
                <span className="bg-emerald-700 text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                  Foto do Medidor (IA)
                </span>
                <h4 className="text-sm font-black text-gray-900 mt-1">
                  Fatura #{fatura.invoiceNumber} • Leitura: {fatura.currentReading} kWh
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setShowMeterPhoto(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-gray-950 flex items-center justify-center overflow-auto max-h-[60vh]">
              <img
                src={fatura.meterPhotoBase64}
                alt="Foto do Medidor"
                className="max-h-[55vh] max-w-full rounded-lg object-contain shadow-lg"
              />
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-gray-600">
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>
                  Retenção de 30 dias (Expira em:{' '}
                  <strong>
                    {fatura.meterPhotoExpiresAt
                      ? formatDateBr(fatura.meterPhotoExpiresAt.split('T')[0])
                      : '30 dias'}
                  </strong>
                  )
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowMeterPhoto(false)}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold transition cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
