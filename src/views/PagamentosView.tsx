import React, { useState } from 'react';
import { CreditCard, CheckCircle2, Search, DollarSign, Calendar, Eye, Download, ShieldCheck } from 'lucide-react';
import { Fatura, Pagamento, Cliente } from '../types';
import { formatCurrency, formatDateBr, formatReferencePeriod } from '../lib/calculations';
import { ConfirmationModal } from '../components/ConfirmationModal';

interface PagamentosViewProps {
  pagamentos: Pagamento[];
  faturas: Fatura[];
  clientes: Cliente[];
  onConfirmPayment: (faturaId: string, amount: number) => Promise<void>;
  onOpenInvoiceModal: (fatura: Fatura) => void;
}

export const PagamentosView: React.FC<PagamentosViewProps> = ({
  pagamentos,
  faturas,
  clientes,
  onConfirmPayment,
  onOpenInvoiceModal,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [tab, setTab] = useState<'realizados' | 'pendentes'>('realizados');
  const [selectedFaturaToPay, setSelectedFaturaToPay] = useState<Fatura | null>(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [paying, setPaying] = useState(false);

  const handleOpenConfirm = (fat: Fatura) => {
    setSelectedFaturaToPay(fat);
    setConfirmModalOpen(true);
  };

  const handleConfirmPay = async () => {
    if (!selectedFaturaToPay) return;
    setPaying(true);
    try {
      await onConfirmPayment(selectedFaturaToPay.id, selectedFaturaToPay.totalToPay);
      setConfirmModalOpen(false);
    } catch (err) {
      alert('Erro ao confirmar pagamento: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setPaying(false);
    }
  };

  // Filter confirmed payments
  const filteredPagamentos = pagamentos.filter((p) => {
    const fat = faturas.find((f) => f.id === p.invoiceId);
    const client = clientes.find((c) => c.id === p.clientId || c.id === fat?.clientId);
    const term = searchTerm.toLowerCase();

    return (
      (fat?.invoiceNumber || '').toLowerCase().includes(term) ||
      (client?.name || '').toLowerCase().includes(term)
    );
  });

  // Filter pending faturas that require payment
  const pendingFaturas = faturas.filter(
    (f) =>
      (f.status === 'pending' || f.status === 'overdue') &&
      ((f.invoiceNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (f.clientName || '').toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const totalPaidSum = pagamentos.reduce((acc, p) => acc + (p.amountPaid || 0), 0);
  const totalPendingSum = pendingFaturas.reduce((acc, f) => acc + (f.totalToPay || 0), 0);

  return (
    <div className="space-y-6">
      {/* Top Financial Metric Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-emerald-200 bg-emerald-50/30 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
              Total Recebido (Confirmado)
            </span>
            <h3 className="text-2xl font-black text-emerald-800 mt-1">
              {formatCurrency(totalPaidSum)}
            </h3>
            <span className="text-[11px] text-emerald-600 font-bold">
              {pagamentos.length} recebimentos registrados
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-amber-200 bg-amber-50/30 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
              Valores a Receber (Pendente/Vencido)
            </span>
            <h3 className="text-2xl font-black text-amber-800 mt-1">
              {formatCurrency(totalPendingSum)}
            </h3>
            <span className="text-[11px] text-amber-600 font-bold">
              {pendingFaturas.length} faturas aguardando baixa
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Tabs and Search Bar */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl w-full sm:w-auto">
          <button
            onClick={() => setTab('realizados')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex-1 sm:flex-initial ${
              tab === 'realizados'
                ? 'bg-white text-emerald-900 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Pagamentos Confirmados ({pagamentos.length})
          </button>
          <button
            onClick={() => setTab('pendentes')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex-1 sm:flex-initial ${
              tab === 'pendentes'
                ? 'bg-white text-emerald-900 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Faturas Pendentes ({pendingFaturas.length})
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar fatura ou cliente..."
            className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-xs text-gray-900 focus:border-emerald-600 focus:outline-none"
          />
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
        {tab === 'realizados' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Fatura</th>
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4">Valor Pago</th>
                  <th className="py-3 px-4">Data Pagamento</th>
                  <th className="py-3 px-4">Método</th>
                  <th className="py-3 px-4">Confirmado Por</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredPagamentos.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-gray-400">
                      Nenhum pagamento registrado ainda.
                    </td>
                  </tr>
                ) : (
                  filteredPagamentos.map((pag) => {
                    const fat = faturas.find((f) => f.id === pag.invoiceId);
                    const client = clientes.find((c) => c.id === pag.clientId || c.id === fat?.clientId);
                    return (
                      <tr key={pag.id} className="hover:bg-gray-50/60 transition">
                        <td className="py-3 px-4 font-mono font-bold text-gray-900">
                          #{fat?.invoiceNumber || pag.invoiceId.slice(0, 8)}
                        </td>
                        <td className="py-3 px-4 font-bold text-gray-900">
                          {client?.name || fat?.clientName || 'Cliente'}
                        </td>
                        <td className="py-3 px-4 font-black text-emerald-800 text-sm">
                          {formatCurrency(pag.amountPaid)}
                        </td>
                        <td className="py-3 px-4 text-gray-700">{formatDateBr(pag.paymentDate)}</td>
                        <td className="py-3 px-4 text-gray-600 capitalize">
                          {pag.confirmationMethod === 'manual' ? 'Baixa Manual' : pag.confirmationMethod}
                        </td>
                        <td className="py-3 px-4 text-gray-700 font-medium">{pag.confirmedBy || 'Sistema'}</td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            Confirmado
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {fat && (
                            <button
                              onClick={() => onOpenInvoiceModal(fat)}
                              className="text-xs font-bold text-emerald-700 hover:underline"
                            >
                              Ver Fatura
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Fatura</th>
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4">Competência</th>
                  <th className="py-3 px-4">Valor Total</th>
                  <th className="py-3 px-4">Vencimento</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pendingFaturas.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-400">
                      Nenhuma fatura pendente de pagamento! Todas as contas estão em dia.
                    </td>
                  </tr>
                ) : (
                  pendingFaturas.map((fat) => (
                    <tr key={fat.id} className="hover:bg-gray-50/60 transition">
                      <td className="py-3 px-4 font-mono font-bold text-gray-900">
                        #{fat.invoiceNumber}
                      </td>
                      <td className="py-3 px-4 font-bold text-gray-900">{fat.clientName}</td>
                      <td className="py-3 px-4 font-medium text-gray-700">
                        {formatReferencePeriod(fat.referenceMonth, fat.referenceYear)}
                      </td>
                      <td className="py-3 px-4 font-black text-emerald-800 text-sm">
                        {formatCurrency(fat.totalToPay)}
                      </td>
                      <td className="py-3 px-4 text-gray-700">{formatDateBr(fat.dueDate)}</td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            fat.status === 'overdue'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {fat.status === 'overdue' ? 'Vencida' : 'Pendente'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleOpenConfirm(fat)}
                          className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 transition cursor-pointer"
                        >
                          Confirmar Pagamento
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation Modal: Automatic Deletion of Boleto on Paid Status */}
      <ConfirmationModal
        isOpen={confirmModalOpen}
        title="Confirmar Pagamento & Excluir Boleto"
        message={
          selectedFaturaToPay
            ? `Deseja registrar o pagamento de ${formatCurrency(
                selectedFaturaToPay.totalToPay
              )} referente à fatura #${selectedFaturaToPay.invoiceNumber} (${selectedFaturaToPay.clientName})?\n\nConforme a regra do sistema, o status será alterado para PAGO e o arquivo do boleto bancário (PDF) será permanentemente apagado do Firebase.`
            : ''
        }
        confirmLabel="Confirmar Pagamento & Apagar Boleto"
        cancelLabel="Voltar"
        confirmVariant="success"
        loading={paying}
        onConfirm={handleConfirmPay}
        onCancel={() => setConfirmModalOpen(false)}
      />
    </div>
  );
};
