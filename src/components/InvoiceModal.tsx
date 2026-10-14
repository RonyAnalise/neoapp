import React, { useRef, useState } from 'react';
import { X, Download, Printer, CheckCircle, AlertTriangle, FileText } from 'lucide-react';
import { Fatura, Cliente, EmpresaConfig } from '../types';
import { InvoiceTemplate } from './InvoiceTemplate';
import { generateInvoicePdf } from '../lib/pdfService';

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
  const [downloading, setDownloading] = useState(false);
  const invoiceRef = useRef<HTMLDivElement>(null);

  if (!fatura || !cliente) return null;

  const handleDownload = async () => {
    if (!invoiceRef.current) return;
    setDownloading(true);
    try {
      await generateInvoicePdf(invoiceRef.current, fatura.invoiceNumber);
    } catch (err) {
      alert('Erro ao gerar o PDF da fatura.');
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 p-2 sm:p-4 backdrop-blur-xs flex items-center justify-center print:static print:p-0 print:m-0 print:bg-white print:overflow-visible print:block">
      <div className="relative w-full max-w-4xl rounded-2xl bg-gray-100 shadow-2xl flex flex-col max-h-[96vh] print:max-h-none print:shadow-none print:bg-transparent print:p-0 print:m-0 print:w-full print:max-w-none print:block">
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
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50 transition cursor-pointer"
              title="Imprimir fatura"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Imprimir</span>
            </button>

            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50 transition cursor-pointer shadow-xs"
              title="Baixar em formato PDF"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{downloading ? 'Gerando PDF...' : 'Baixar PDF'}</span>
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
    </div>
  );
};
