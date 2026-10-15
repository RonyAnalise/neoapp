import React, { useRef } from 'react';
import { X, Printer, FileText } from 'lucide-react';
import { Fatura, Cliente, EmpresaConfig } from '../types';
import { InvoiceTemplate } from './InvoiceTemplate';

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

  if (!fatura || !cliente) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 p-2 sm:p-4 backdrop-blur-xs flex items-center justify-center print:fixed print:inset-0 print:z-[99999] print:bg-white print:p-0 print:m-0 print:overflow-hidden print:block">
      <div className="relative w-full max-w-4xl rounded-2xl bg-gray-100 shadow-2xl flex flex-col max-h-[96vh] print:max-h-none print:shadow-none print:bg-white print:p-0 print:m-0 print:w-[210mm] print:h-[297mm] print:max-w-none print:block print:overflow-hidden">
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
        <div className="overflow-y-auto p-3 sm:p-6 bg-gray-200/70 print:p-0 print:m-0 print:bg-white print:overflow-hidden print:block">
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
    </div>
  );
};
