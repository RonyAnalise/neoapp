import React, { useState } from 'react';
import { CreditCard, CheckCircle2, Search, DollarSign, Calendar, Eye, Download, ShieldCheck, RotateCcw } from 'lucide-react';
import { Fatura, Pagamento, Cliente } from '../types';
import { formatCurrency, formatDateBr, formatReferencePeriod } from '../lib/calculations';
import { ConfirmationModal } from '../components/ConfirmationModal';

interface PagamentosViewProps {
  pagamentos: Pagamento[];
  faturas: Fatura[];
  clientes: Cliente[];
  onConfirmPayment: (faturaId: string, amount: number) => Promise<void>;
  onUnmarkPayment?: (faturaId: string) => Promise<void>;
  onOpenInvoiceModal: (fatura: Fatura) => void;
}

export const PagamentosView: React.FC<PagamentosViewProps> = ({
  pagamentos,
  faturas,
  clientes,
  onConfirmPayment,
  onUnmarkPayment,
  onOpenInvoiceModal,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [tab, setTab] = useState<'realizados' | 'pendentes'>('realizados');
  const [selectedFaturaToPay, setSelectedFaturaToPay] = useState<Fatura | null>(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [paying, setPaying] = useState(false);

  // Estados para desmarcar pagamento
  const [selectedFaturaToUnmark, setSelectedFaturaToUnmark] = useState<Fatura | null>(null);
  const [unmarkModalOpen, setUnmarkModalOpen] = useState(false);
  const [unmarking, setUnmarking] = useState(false);

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

  const handleOpenUnmark = (fat: Fatura) => {
    setSelectedFaturaToUnmark(fat);
    setUnmarkModalOpen(true);
  };

  const handleConfirmUnmark = async () => {
    if (!selectedFaturaToUnmark || !onUnmarkPayment) return;
    setUnmarking(true);
    try {
      await onUnmarkPayment(selectedFaturaToUnmark.id);
      setUnmarkModalOpen(false);
    } catch (err) {
      alert('Erro ao desmarcar pagamento: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setUnmarking(false);
    }
  };

  // Build list of confirmed payments, supplementing from paid faturas if payment doc is being reconciled
  const paidFaturas = faturas.filter((f) => f.status === 'paid');

  const allConfirmedPaymentsList = React.useMemo(() => {
    const list = [...pagamentos];
    // Adiciona temporariamente faturas marcadas como 'paid' que ainda estão gravando em pagamentos
    paidFaturas.forEach((fat) => {
      const exists = list.some((p) => p.invoiceId === fat.id || p.invoiceId === fat.invoiceNumber);
      if (!exists) {
        list.push({
          id: `virtual-${fat.id}`,
          invoiceId: fat.id,
          clientId: fat.clientId,
          amountPaid: fat.totalToPay,
          paymentDate: fat.paidAt || fat.issueDate || new Date().toISOString(),
          confirmationMethod: 'manual',
          confirmedBy: fat.paidBy || 'Operador',
          status: 'confirmed',
          createdAt: fat.paidAt || new Date().toISOString(),
        });
      }
    });
    return list;
  }, [pagamentos, paidFaturas]);

  // Filter confirmed payments
  const filteredPagamentos = allConfirmedPaymentsList.filter((p) => {
    const fat = faturas.find((f) => f.id === p.invoiceId || f.invoiceNumber === p.invoiceId);
    const client = clientes.find((c) => c.id === p.clientId || c.id === fat?.clientId);
    const term = searchTerm.toLowerCase();

    return (
      (fat?.invoiceNumber || '').toLowerCase().includes(term) ||
      (client?.name || '').toLowerCase().includes(term)
    );
  });

  // Filter pending faturas that require payment (excludes already paid or confirmed)
  const pendingFaturas = faturas.filter(
    (f) =>
      f.status !== 'paid' &&
      f.status !== 'cancelled' &&
      !allConfirmedPaymentsList.some(
        (p) => (p.invoiceId === f.id || p.invoiceId === f.invoiceNumber) && p.status === 'confirmed'
      ) &&
      ((f.invoiceNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (f.clientName || '').toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const totalPaidSum = allConfirmedPaymentsList.reduce((acc, p) => acc + (p.amountPaid || 0), 0);
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
              {allConfirmedPaymentsList.length} recebimentos registrados
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
            Pagamentos Confirmados ({allConfirmedPaymentsList.length})
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
                          <div className="flex items-center justify-end gap-2">
                            {fat && (
                              <button
                                onClick={() => onOpenInvoiceModal(fat)}
                                className="text-xs font-bold text-emerald-700 hover:underline cursor-pointer"
                              >
                                Ver Fatura
                              </button>
                            )}
                            {onUnmarkPayment && (
                              <button
                                onClick={() => {
                                  const targetFat =
                                    fat ||
                                    faturas.find(
                                      (f) => f.id === pag.invoiceId || f.invoiceNumber === pag.invoiceId
                                    );
                                  if (targetFat) {
                                    handleOpenUnmark(targetFat);
                                  } else {
                                    alert('Fatura correspondente não encontrada para desmarcar.');
                                  }
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition cursor-pointer shadow-2xs"
                                title="Desmarcar pagamento e fazer a fatura voltar ao status Pendente"
                              >
                                <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                                <span>Desmarcar Pago</span>
                              </button>
                            )}
                          </div>
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

      {/* Confirmation Modal: Desmarcar Pagamento e Voltar para Pendente */}
      <ConfirmationModal
        isOpen={unmarkModalOpen}
        title="Desmarcar Pagamento & Retornar para Pendente"
        message={
          selectedFaturaToUnmark
            ? `Deseja realmente desmarcar o pagamento da fatura #${selectedFaturaToUnmark.invoiceNumber} (${selectedFaturaToUnmark.clientName}) no valor de ${formatCurrency(
                selectedFaturaToUnmark.totalToPay
              )}?\n\nA fatura sairá da lista de pagamentos confirmados e retornará para a lista de FATURAS PENDENTES.`
            : ''
        }
        confirmLabel="Sim, Desmarcar Pagamento"
        cancelLabel="Cancelar"
        confirmVariant="danger"
        loading={unmarking}
        onConfirm={handleConfirmUnmark}
        onCancel={() => setUnmarkModalOpen(false)}
      />
    </div>
  );
};
