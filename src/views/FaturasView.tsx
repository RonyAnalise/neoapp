import React, { useState } from 'react';
import {
  Receipt,
  Plus,
  Search,
  FileText,
  Download,
  CheckCircle,
  Clock,
  AlertTriangle,
  XCircle,
  Eye,
  Paperclip,
  Trash2,
  DollarSign,
  ArrowRight,
  Zap,
} from 'lucide-react';
import { Cliente, Fatura, Leitura, EmpresaConfig, EnergyTariffs, InvoiceStatus } from '../types';
import {
  formatCurrency,
  formatNumberBr,
  formatDateBr,
  formatReferencePeriod,
  getMonthName,
  calculateInvoice,
  calculateDaysBetween,
} from '../lib/calculations';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { BoletoModal } from '../components/BoletoModal';
import { logAuditEvent } from '../lib/auditService';
import { useAuth } from '../hooks/useAuth';
import { downloadBoletoFile } from '../lib/boletoService';

interface FaturasViewProps {
  faturas: Fatura[];
  clientes: Cliente[];
  leituras: Leitura[];
  empresa: EmpresaConfig;
  tariffs: EnergyTariffs;
  prefillClientId?: string;
  onIssueInvoice: (invoice: Omit<Fatura, 'id' | 'createdAt'>) => Promise<void>;
  onConfirmPayment: (faturaId: string, amount: number) => Promise<void>;
  onCancelInvoice: (faturaId: string, reason: string) => Promise<void>;
  onDeleteInvoice?: (faturaId: string) => Promise<void>;
  onOpenInvoiceModal: (fatura: Fatura) => void;
  onSyncAllSeedInvoices?: () => Promise<void>;
  isSyncing?: boolean;
}

export const FaturasView: React.FC<FaturasViewProps> = ({
  faturas,
  clientes,
  leituras,
  empresa,
  tariffs,
  prefillClientId,
  onIssueInvoice,
  onConfirmPayment,
  onCancelInvoice,
  onDeleteInvoice,
  onOpenInvoiceModal,
  onSyncAllSeedInvoices,
  isSyncing,
}) => {
  const { userProfile, isAdmin } = useAuth();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | InvoiceStatus>('all');
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>('all');
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  // New invoice modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [clientId, setClientId] = useState(prefillClientId || '');
  const [invoiceMonth, setInvoiceMonth] = useState(currentMonth);
  const [invoiceYear, setInvoiceYear] = useState(currentYear);
  const [prevReadingDate, setPrevReadingDate] = useState('');
  const [prevReading, setPrevReading] = useState<number | ''>('');
  const [currReadingDate, setCurrReadingDate] = useState(new Date().toISOString().split('T')[0]);
  const [currReading, setCurrReading] = useState<number | ''>('');
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + (empresa.paymentDueDays || 15));
    return d.toISOString().split('T')[0];
  });
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);

  // Boleto file attachment during emission (Caminho 2: Firestore Base64)
  const [createBoletoFile, setCreateBoletoFile] = useState<File | null>(null);
  const [createBoletoBase64, setCreateBoletoBase64] = useState<string | null>(null);
  const [createBoletoLoading, setCreateBoletoLoading] = useState(false);
  const [createBoletoError, setCreateBoletoError] = useState<string | null>(null);

  // Boleto modal state
  const [boletoModalFatura, setBoletoModalFatura] = useState<Fatura | null>(null);

  // Payment confirmation modal state
  const [payingFatura, setPayingFatura] = useState<Fatura | null>(null);
  const [confirmPaymentOpen, setConfirmPaymentOpen] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);

  // Cancellation modal state
  const [cancellingFatura, setCancellingFatura] = useState<Fatura | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [processingCancel, setProcessingCancel] = useState(false);

  // Deletion modal state
  const [invoiceToDelete, setInvoiceToDelete] = useState<Fatura | null>(null);
  const [deletingInvoice, setDeletingInvoice] = useState(false);
  const [deleteInvoiceError, setDeleteInvoiceError] = useState<string | null>(null);

  // Open create invoice dialog and auto-fill previous readings for client
  const handleOpenCreate = (targetClientId?: string) => {
    setFormError(null);
    const selClient = targetClientId || clientId || clientes[0]?.id || '';
    setClientId(selClient);

    const clientObj = clientes.find((c) => c.id === selClient);
    if (clientObj) {
      // Find latest reading or previous invoice
      const prevInvoices = faturas
        .filter((f) => f.clientId === selClient && f.status !== 'cancelled')
        .sort((a, b) => b.referenceYear - a.referenceYear || b.referenceMonth - a.referenceMonth);

      const prevReadings = leituras
        .filter((l) => l.clientId === selClient && l.status === 'valid')
        .sort((a, b) => b.referenceYear - a.referenceYear || b.referenceMonth - a.referenceMonth);

      if (prevInvoices.length > 0) {
        setPrevReading(prevInvoices[0].currentReading);
        setPrevReadingDate(prevInvoices[0].currentReadingDate);
      } else if (prevReadings.length > 0) {
        setPrevReading(prevReadings[0].currentReadingValue);
        setPrevReadingDate(prevReadings[0].currentReadingDate);
      } else {
        // Initial setup
        setPrevReading('');
        setPrevReadingDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
      }
    }

    setCurrReading('');
    setCreateBoletoFile(null);
    setCreateBoletoBase64(null);
    setCreateBoletoLoading(false);
    setCreateBoletoError(null);
    setCreateModalOpen(true);
  };

  const handleCreateBoletoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCreateBoletoError(null);
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (selected.type !== 'application/pdf' && !selected.name.toLowerCase().endsWith('.pdf')) {
      setCreateBoletoError('Apenas arquivos no formato PDF são permitidos para boletos bancários.');
      return;
    }

    // 720 KB limit for Base64 in Firestore (Caminho 2)
    if (selected.size > 720 * 1024) {
      const sizeKb = (selected.size / 1024).toFixed(0);
      setCreateBoletoError(
        `O arquivo tem ${sizeKb} KB. Para salvar direto no banco de dados (Caminho 2), o limite é de 720 KB por documento.`
      );
      return;
    }

    setCreateBoletoFile(selected);
    setCreateBoletoLoading(true);

    const reader = new FileReader();
    reader.onload = () => {
      setCreateBoletoBase64(reader.result as string);
      setCreateBoletoLoading(false);
    };
    reader.onerror = () => {
      setCreateBoletoError('Falha ao processar arquivo PDF.');
      setCreateBoletoLoading(false);
    };
    reader.readAsDataURL(selected);
  };

  const handleClientChange = (newClientId: string) => {
    setClientId(newClientId);
    const prevInvoices = faturas
      .filter((f) => f.clientId === newClientId && f.status !== 'cancelled')
      .sort((a, b) => b.referenceYear - a.referenceYear || b.referenceMonth - a.referenceMonth);

    const prevReadings = leituras
      .filter((l) => l.clientId === newClientId && l.status === 'valid')
      .sort((a, b) => b.referenceYear - a.referenceYear || b.referenceMonth - a.referenceMonth);

    if (prevInvoices.length > 0) {
      setPrevReading(prevInvoices[0].currentReading);
      setPrevReadingDate(prevInvoices[0].currentReadingDate);
    } else if (prevReadings.length > 0) {
      setPrevReading(prevReadings[0].currentReadingValue);
      setPrevReadingDate(prevReadings[0].currentReadingDate);
    } else {
      setPrevReading('');
      setPrevReadingDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    }
  };

  // Effective tariffs: use client custom if defined, otherwise system defaults
  const selectedClientObj = clientes.find((c) => c.id === clientId);
  const effectiveNeoTariff =
    selectedClientObj?.customNeoTariff && selectedClientObj.customNeoTariff > 0
      ? selectedClientObj.customNeoTariff
      : tariffs.neoTariff;

  const effectiveCoelbaTariff =
    selectedClientObj?.customCoelbaTariff && selectedClientObj.customCoelbaTariff > 0
      ? selectedClientObj.customCoelbaTariff
      : tariffs.coelbaReferenceTariff;

  const isCustomNeo = !!(selectedClientObj?.customNeoTariff && selectedClientObj.customNeoTariff > 0);
  const isCustomCoelba = !!(selectedClientObj?.customCoelbaTariff && selectedClientObj.customCoelbaTariff > 0);

  // Preview computation in real time
  const numPrev = typeof prevReading === 'number' ? prevReading : 0;
  const numCurr = typeof currReading === 'number' ? currReading : 0;
  const isInputValid = currReading !== '' && numCurr >= numPrev;

  const previewCalc = isInputValid
    ? calculateInvoice({
        previousReading: numPrev,
        currentReading: numCurr,
        neoTariff: effectiveNeoTariff,
        coelbaTariff: effectiveCoelbaTariff,
      })
    : null;

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!clientId) {
      setFormError('Selecione um cliente.');
      return;
    }

    const selectedClient = clientes.find((c) => c.id === clientId);
    if (!selectedClient) {
      setFormError('Cliente não encontrado.');
      return;
    }

    if (selectedClient.status === 'inactive') {
      setFormError('Clientes inativos não podem emitir novas faturas até que sejam reativados.');
      return;
    }

    if (prevReading === '' || currReading === '') {
      setFormError('Informe a leitura anterior e a leitura atual.');
      return;
    }

    if (Number(currReading) < Number(prevReading)) {
      setFormError('A leitura atual não pode ser inferior à leitura anterior.');
      return;
    }

    // Check for duplicate invoice in the same month/year
    const duplicate = faturas.find(
      (f) =>
        f.clientId === clientId &&
        f.referenceMonth === invoiceMonth &&
        f.referenceYear === invoiceYear &&
        f.status !== 'cancelled'
    );

    if (duplicate) {
      setFormError(
        `Já existe uma fatura ativa (#${duplicate.invoiceNumber}) para este cliente na competência ${invoiceMonth}/${invoiceYear}. Duplicidade bloqueada pelas regras de negócio.`
      );
      return;
    }

    setIssuing(true);
    try {
      const calc = calculateInvoice({
        previousReading: Number(prevReading),
        currentReading: Number(currReading),
        neoTariff: effectiveNeoTariff,
        coelbaTariff: effectiveCoelbaTariff,
      });

      // Generate formatted invoice number e.g. "FAT-202609-001"
      const invoiceNumber = `FAT-${invoiceYear}${String(invoiceMonth).padStart(2, '0')}-${String(
        faturas.length + 1
      ).padStart(3, '0')}`;

      await onIssueInvoice({
        invoiceNumber,
        clientId,
        clientName: selectedClient.name,
        referenceMonth: invoiceMonth,
        referenceYear: invoiceYear,
        previousReading: Number(prevReading),
        previousReadingDate: prevReadingDate || new Date().toISOString().split('T')[0],
        currentReading: Number(currReading),
        currentReadingDate: currReadingDate,
        consumptionKwh: calc.consumptionKwh,
        appliedNeoTariff: effectiveNeoTariff,
        appliedCoelbaTariff: effectiveCoelbaTariff,
        neoAmount: calc.neoAmount,
        coelbaEstimateAmount: calc.coelbaEstimateAmount,
        savingsAmount: calc.savingsAmount,
        savingsPercentage: calc.savingsPercentage,
        totalToPay: calc.totalToPay,
        issueDate: new Date().toISOString().split('T')[0],
        dueDate,
        status: 'pending',
        notes,
        // Boleto bancário anexado na emissão (Caminho 2: Firestore Base64)
        boletoBase64: createBoletoBase64 || null,
        boletoFileName: createBoletoFile?.name || null,
        boletoUploadedAt: createBoletoBase64 ? new Date().toISOString() : null,
        boletoStoragePath: null,
        // Historical snapshots to guarantee reproducibility
        historicalCompanyData: { ...empresa },
        historicalClientData: { ...selectedClient },
        createdBy: userProfile?.name || 'Operador',
      });

      await logAuditEvent({
        operationType: 'issue_invoice',
        collectionName: 'faturas',
        relatedDocument: invoiceNumber,
        user: userProfile?.name || 'Operador',
        userEmail: userProfile?.email || '',
        newData: {
          invoiceNumber,
          clientId,
          consumptionKwh: calc.consumptionKwh,
          totalToPay: calc.totalToPay,
          savingsAmount: calc.savingsAmount,
        },
      });

      setCreateModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao emitir fatura.');
    } finally {
      setIssuing(false);
    }
  };

  const handleOpenConfirmPayment = (fat: Fatura) => {
    setPayingFatura(fat);
    setConfirmPaymentOpen(true);
  };

  const handleExecutePayment = async () => {
    if (!payingFatura) return;
    setProcessingPayment(true);
    try {
      await onConfirmPayment(payingFatura.id, payingFatura.totalToPay);
      await logAuditEvent({
        operationType: 'confirm_payment',
        collectionName: 'faturas',
        relatedDocument: payingFatura.id,
        user: userProfile?.name || 'Operador',
        userEmail: userProfile?.email || '',
        newData: {
          invoiceNumber: payingFatura.invoiceNumber,
          amountPaid: payingFatura.totalToPay,
          paymentDate: new Date().toISOString(),
          boletoDeleted: !!payingFatura.boletoStoragePath,
        },
      });

      setConfirmPaymentOpen(false);
    } catch (err) {
      alert('Erro ao confirmar pagamento: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleOpenCancel = (fat: Fatura) => {
    setCancellingFatura(fat);
    setCancellationReason('');
    setConfirmCancelOpen(true);
  };

  const handleExecuteCancel = async () => {
    if (!cancellingFatura || !cancellationReason.trim()) return;
    setProcessingCancel(true);
    try {
      await onCancelInvoice(cancellingFatura.id, cancellationReason);
      await logAuditEvent({
        operationType: 'cancel_invoice',
        collectionName: 'faturas',
        relatedDocument: cancellingFatura.id,
        user: userProfile?.name || 'Operador',
        userEmail: userProfile?.email || '',
        justification: cancellationReason,
      });

      setConfirmCancelOpen(false);
    } catch (err) {
      alert('Erro ao cancelar fatura: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setProcessingCancel(false);
    }
  };

  // Filter faturas
  const filteredFaturas = faturas
    .filter((f) => {
      const term = searchTerm.toLowerCase();
      const matchesSearch =
        f.invoiceNumber.toLowerCase().includes(term) ||
        (f.clientName || '').toLowerCase().includes(term);

      const matchesStatus = statusFilter === 'all' || f.status === statusFilter;
      const matchesMonth = selectedMonth === 'all' || f.referenceMonth === selectedMonth;
      const matchesYear = f.referenceYear === selectedYear;

      return matchesSearch && matchesStatus && matchesMonth && matchesYear;
    })
    .sort((a, b) => {
      if (a.referenceYear !== b.referenceYear) return b.referenceYear - a.referenceYear;
      return b.referenceMonth - a.referenceMonth;
    });

  return (
    <div className="space-y-6">
      {/* Search and Filters Bar */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200/80 shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div className="flex-1 flex flex-col sm:flex-row items-center gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por fatura ou cliente..."
              className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-xs text-gray-900 focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | InvoiceStatus)}
              className="rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-900 focus:border-emerald-600 focus:outline-none"
            >
              <option value="all">Todos os Status</option>
              <option value="pending">Pendentes</option>
              <option value="paid">Pagas</option>
              <option value="overdue">Vencidas</option>
              <option value="cancelled">Canceladas</option>
            </select>

            <select
              value={selectedMonth}
              onChange={(e) =>
                setSelectedMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))
              }
              className="rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-900 focus:border-emerald-600 focus:outline-none"
            >
              <option value="all">Todos os Meses</option>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {getMonthName(i + 1)}
                </option>
              ))}
            </select>

            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-900 focus:border-emerald-600 focus:outline-none"
            >
              {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onSyncAllSeedInvoices && faturas.length < 38 && (
            <button
              onClick={onSyncAllSeedInvoices}
              disabled={isSyncing}
              className="flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-600 px-4 py-2.5 text-xs font-bold text-white transition shadow-xs cursor-pointer disabled:opacity-50"
              title="Gravar as 38 faturas e clientes identificados das imagens no Firestore"
            >
              <Zap className="w-4 h-4 fill-current text-yellow-200" />
              <span>{isSyncing ? 'Gravando no Banco...' : '⚡ Gravar 38 Faturas no Banco'}</span>
            </button>
          )}

          <button
            onClick={() => handleOpenCreate()}
            className="flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 transition shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Emitir Nova Fatura</span>
          </button>
        </div>
      </div>

      {/* Faturas Table */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto lg:overflow-x-visible">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Cliente</th>
                <th className="py-3 px-3">Competência</th>
                <th className="py-3 px-3">Total a Pagar</th>
                <th className="py-3 px-3">Vencimento</th>
                <th className="py-3 px-3 text-center">Boleto</th>
                <th className="py-3 px-3 text-center">Situação</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredFaturas.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-400">
                    Nenhuma fatura encontrada para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredFaturas.map((fat) => (
                  <tr key={fat.id} className="hover:bg-gray-50/60 transition">
                    <td className="py-3 px-4">
                      <div className="font-bold text-gray-900">{fat.clientName || 'Cliente'}</div>
                      <div className="text-[10px] text-gray-400 font-mono">#{fat.invoiceNumber}</div>
                    </td>
                    <td className="py-3 px-3 font-semibold text-gray-800 whitespace-nowrap">
                      {formatReferencePeriod(fat.referenceMonth, fat.referenceYear)}
                    </td>
                    <td className="py-3 px-3 font-black text-emerald-800 text-sm whitespace-nowrap">
                      {formatCurrency(fat.totalToPay)}
                    </td>
                    <td className="py-3 px-3 text-gray-700 whitespace-nowrap">{formatDateBr(fat.dueDate)}</td>
                    <td className="py-3 px-4 text-center">
                      {fat.status === 'paid' ? (
                        <span
                          className="inline-block text-[10px] text-gray-400 font-medium italic"
                          title="Boleto bancário excluído do Firebase automaticamente após confirmação de pagamento"
                        >
                          Excluído (Pago)
                        </span>
                      ) : fat.boletoBase64 ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => setBoletoModalFatura(fat)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-800 hover:bg-orange-200 transition cursor-pointer"
                            title="Gerenciar ou substituir boleto bancário"
                          >
                            <Paperclip className="w-3 h-3" />
                            <span>Anexado</span>
                          </button>
                          <button
                            onClick={() =>
                              downloadBoletoFile(
                                fat.boletoBase64!,
                                fat.boletoFileName || `Boleto_Fatura_${fat.invoiceNumber}.pdf`
                              )
                            }
                            className="p-1 rounded text-orange-700 hover:bg-orange-100 transition cursor-pointer"
                            title="Baixar Boleto Bancário (PDF)"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setBoletoModalFatura(fat)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-500 hover:bg-gray-200 transition cursor-pointer"
                          title="Anexar boleto PDF no banco"
                        >
                          <Paperclip className="w-3 h-3" />
                          <span>Sem Boleto</span>
                        </button>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          fat.status === 'paid'
                            ? 'bg-emerald-100 text-emerald-800'
                            : fat.status === 'overdue'
                            ? 'bg-rose-100 text-rose-800'
                            : fat.status === 'cancelled'
                            ? 'bg-gray-200 text-gray-600 line-through'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {fat.status === 'paid'
                          ? 'PAGA'
                          : fat.status === 'overdue'
                          ? 'VENCIDA'
                          : fat.status === 'cancelled'
                          ? 'CANCELADA'
                          : 'PENDENTE'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onOpenInvoiceModal(fat)}
                          className="flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition"
                          title="Visualizar fatura e baixar PDF"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Fatura</span>
                        </button>

                        {fat.status !== 'paid' && fat.status !== 'cancelled' && (
                          <button
                            onClick={() => handleOpenConfirmPayment(fat)}
                            className="flex items-center gap-1 rounded-lg bg-emerald-700 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-800 transition"
                            title="Confirmar pagamento da fatura"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>Pagar</span>
                          </button>
                        )}

                        {isAdmin && fat.status !== 'cancelled' && fat.status !== 'paid' && (
                          <button
                            onClick={() => handleOpenCancel(fat)}
                            className="p-1 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 transition"
                            title="Cancelar fatura"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}

                        {onDeleteInvoice && (
                          <button
                            onClick={() => {
                              setDeleteInvoiceError(null);
                              setInvoiceToDelete(fat);
                            }}
                            className="p-1 rounded-lg border border-gray-200 text-gray-400 hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50 transition cursor-pointer"
                            title="Excluir fatura do banco de dados"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Emitir Nova Fatura */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4 backdrop-blur-xs flex items-center justify-center">
          <div className="w-full max-w-2xl bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-gray-100 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-black">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Emissão de Fatura de Energia</h3>
                  <p className="text-xs text-gray-500">
                    Cálculo automático e geração de documento Neo Energia
                  </p>
                </div>
              </div>
              <button onClick={() => setCreateModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                ✕
              </button>
            </div>

            {formError && (
              <div className="mb-4 flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              {/* Cliente */}
              <div>
                <label className="block font-bold text-gray-700 mb-1">Cliente *</label>
                <select
                  required
                  value={clientId}
                  onChange={(e) => handleClientChange(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900 focus:border-emerald-600 focus:outline-none"
                >
                  <option value="" disabled>
                    Selecione o cliente
                  </option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} • {c.cpfCnpj} {c.clientCodeCoelba ? `(Cód: ${c.clientCodeCoelba})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Competência e Vencimento */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Mês de Referência *</label>
                  <select
                    value={invoiceMonth}
                    onChange={(e) => setInvoiceMonth(Number(e.target.value))}
                    className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900"
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {getMonthName(i + 1)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Ano *</label>
                  <input
                    type="number"
                    value={invoiceYear}
                    onChange={(e) => setInvoiceYear(Number(e.target.value))}
                    className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Data de Vencimento *</label>
                  <input
                    type="date"
                    required
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900"
                  />
                </div>
              </div>

              {/* Leituras */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Leitura Anterior */}
                <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-3.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-gray-800">Leitura Anterior (kWh)</span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">
                      Automática
                    </span>
                  </div>
                  <input
                    type="number"
                    step="any"
                    required
                    value={prevReading}
                    onChange={(e) =>
                      setPrevReading(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    placeholder="40265"
                    className="w-full rounded-xl border border-gray-300 p-2 font-mono font-bold text-gray-800 bg-white"
                  />
                  <div className="mt-2">
                    <label className="block text-[10px] text-gray-500">Data Leitura Anterior</label>
                    <input
                      type="date"
                      value={prevReadingDate}
                      onChange={(e) => setPrevReadingDate(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 p-1.5 text-gray-700 bg-white text-[11px]"
                    />
                  </div>
                </div>

                {/* Leitura Atual */}
                <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50/40 p-3.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-black text-emerald-950">Leitura Atual (kWh) *</span>
                    <span className="text-[10px] bg-emerald-700 text-white px-2 py-0.5 rounded font-bold">
                      Aferição
                    </span>
                  </div>
                  <input
                    type="number"
                    step="any"
                    required
                    value={currReading}
                    onChange={(e) =>
                      setCurrReading(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    placeholder="41364"
                    className="w-full rounded-xl border border-emerald-300 p-2 font-mono font-black text-emerald-900 bg-white"
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <label className="block text-[10px] text-gray-600">Data Leitura Atual</label>
                    {calculateDaysBetween(prevReadingDate, currReadingDate) !== null && (
                      <span className="text-[10px] text-emerald-800 font-bold bg-emerald-100/80 px-2 py-0.5 rounded">
                        {calculateDaysBetween(prevReadingDate, currReadingDate)} dias utilizados
                      </span>
                    )}
                  </div>
                  <input
                    type="date"
                    required
                    value={currReadingDate}
                    onChange={(e) => setCurrReadingDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 p-1.5 text-gray-700 bg-white text-[11px] mt-1"
                  />
                </div>
              </div>

              {/* Resumo dos Cálculos em Tempo Real */}
              {previewCalc && (
                <div className="rounded-2xl border-2 border-[#1b7a3e] bg-[#fafffb] p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-[#156231]">CONSUMO APURADO:</span>
                      <span className="text-base font-black text-gray-900">
                        {formatNumberBr(previewCalc.consumptionKwh)} kWh
                        {calculateDaysBetween(prevReadingDate, currReadingDate) !== null && (
                          <span className="text-xs font-bold text-gray-500 ml-1.5">
                            ({calculateDaysBetween(prevReadingDate, currReadingDate)} dias)
                          </span>
                        )}
                      </span>
                    </div>
                    <span className="text-[11px] text-gray-500 font-semibold">
                      Tarifa Neo: {formatCurrency(effectiveNeoTariff, false)}/kWh{' '}
                      <span className={isCustomNeo ? 'text-emerald-700 font-bold' : ''}>
                        ({isCustomNeo ? 'personalizada' : 'padrão'})
                      </span>{' '}
                      • Coelba: {formatCurrency(effectiveCoelbaTariff, false)}/kWh{' '}
                      <span className={isCustomCoelba ? 'text-amber-700 font-bold' : ''}>
                        ({isCustomCoelba ? 'personalizada' : 'padrão'})
                      </span>
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
                    <div className="bg-white rounded-xl p-2.5 border border-emerald-100">
                      <span className="text-[10px] font-bold text-gray-500 uppercase block">
                        Na Coelba pagaria:
                      </span>
                      <span className="text-sm font-bold text-gray-800">
                        {formatCurrency(previewCalc.coelbaEstimateAmount)}
                      </span>
                    </div>

                    <div className="bg-emerald-100/70 rounded-xl p-2.5 border border-emerald-300">
                      <span className="text-[10px] font-black text-emerald-900 uppercase block">
                        Total com Desconto Neo:
                      </span>
                      <span className="text-lg font-black text-[#156231]">
                        {formatCurrency(previewCalc.totalToPay)}
                      </span>
                    </div>

                    <div className="bg-orange-100/80 rounded-xl p-2.5 border border-orange-300">
                      <span className="text-[10px] font-black text-orange-900 uppercase block">
                        Desconto Neo ({previewCalc.savingsPercentage.toFixed(1)}%):
                      </span>
                      <span className="text-base font-black text-[#e97825]">
                        {formatCurrency(previewCalc.savingsAmount)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Anexar Boleto Bancário (Caminho 2: Firestore Base64) */}
              <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-orange-600" />
                    <span className="font-bold text-gray-800">Boleto Bancário (PDF) - Opcional</span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-orange-100 text-orange-800">
                    Caminho 2 (Firestore)
                  </span>
                </div>

                {createBoletoError && (
                  <div className="flex items-center gap-1.5 text-[11px] text-rose-700 bg-rose-50 p-2 rounded-lg border border-rose-200">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{createBoletoError}</span>
                  </div>
                )}

                {createBoletoFile ? (
                  <div className="flex items-center justify-between bg-white border border-emerald-200 rounded-xl p-2.5">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div>
                        <p className="font-bold text-gray-900 truncate max-w-[220px]">
                          {createBoletoFile.name}
                        </p>
                        <p className="text-[10px] text-gray-500">
                          {(createBoletoFile.size / 1024).toFixed(0)} KB • Pronto para salvar com a fatura
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCreateBoletoFile(null);
                        setCreateBoletoBase64(null);
                      }}
                      className="text-xs text-rose-600 hover:text-rose-800 font-semibold p-1 cursor-pointer"
                    >
                      Remover
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 border border-dashed border-gray-300 rounded-xl p-3 bg-white hover:border-orange-500 cursor-pointer transition">
                    <Paperclip className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-600 font-medium">
                      {createBoletoLoading ? 'Processando PDF...' : 'Anexar Boleto em PDF (máx. 720 KB)'}
                    </span>
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={handleCreateBoletoChange}
                      className="hidden"
                    />
                  </label>
                )}

                <p className="text-[10px] text-gray-500">
                  * O boleto ficará disponível para download e será <strong>automaticamente apagado do Firebase</strong> quando o pagamento for confirmado (status PAGO).
                </p>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Observações da Fatura</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Informações adicionais para este faturamento..."
                  className="w-full rounded-xl border border-gray-300 p-2 text-gray-900"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="rounded-xl border border-gray-300 px-4 py-2 font-semibold text-gray-700 hover:bg-gray-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={issuing || !previewCalc}
                  className="rounded-xl bg-emerald-700 px-5 py-2 font-bold text-white hover:bg-emerald-800 transition disabled:opacity-50"
                >
                  {issuing ? 'Emitindo...' : 'Confirmar e Emitir Fatura'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Anexar Boleto */}
      {boletoModalFatura && (
        <BoletoModal
          fatura={boletoModalFatura}
          isOpen={!!boletoModalFatura}
          onClose={() => setBoletoModalFatura(null)}
          onBoletoUpdated={(updatedFields) => {
            // Update local state instance
            setBoletoModalFatura((prev) => (prev ? { ...prev, ...updatedFields } : null));
          }}
        />
      )}

      {/* Confirmation Modal: Confirm Payment + Automatic PDF Deletion */}
      <ConfirmationModal
        isOpen={confirmPaymentOpen}
        title="Confirmar Pagamento da Fatura"
        message={
          payingFatura
            ? `Deseja registrar o pagamento de ${formatCurrency(
                payingFatura.totalToPay
              )} referente à fatura #${payingFatura.invoiceNumber}? \n\nConforme a regra de segurança do sistema, o PDF do boleto bancário será expurgado e excluído do armazenamento, mantendo preservado o histórico contábil.`
            : ''
        }
        confirmLabel="Confirmar Pagamento & Excluir PDF"
        cancelLabel="Cancelar"
        confirmVariant="success"
        loading={processingPayment}
        onConfirm={handleExecutePayment}
        onCancel={() => setConfirmPaymentOpen(false)}
      />

      {/* Confirmation Modal: Cancel Invoice */}
      <ConfirmationModal
        isOpen={confirmCancelOpen}
        title="Cancelar Fatura Emitida"
        message="O cancelamento de uma fatura preserva o histórico de auditoria e impede nova contagem duplicada. Informe a justificativa obrigatória."
        confirmLabel="Confirmar Cancelamento"
        cancelLabel="Voltar"
        confirmVariant="danger"
        requireJustification={true}
        justification={cancellationReason}
        onJustificationChange={setCancellationReason}
        loading={processingCancel}
        onConfirm={handleExecuteCancel}
        onCancel={() => setConfirmCancelOpen(false)}
      />

      {/* Confirmation Modal: Delete Invoice */}
      {invoiceToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-gray-100">
            <div className="flex items-center gap-3 text-rose-600 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-100">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  Excluir Fatura #{invoiceToDelete.invoiceNumber}
                </h3>
                <p className="text-xs text-gray-500">
                  Competência {formatReferencePeriod(invoiceToDelete.referenceMonth, invoiceToDelete.referenceYear)}
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-gray-50 p-4 space-y-2 text-xs border border-gray-200/70 mb-4">
              <div className="flex justify-between">
                <span className="text-gray-500">Cliente:</span>
                <span className="font-bold text-gray-900">{invoiceToDelete.clientName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Total a Pagar:</span>
                <span className="font-bold text-emerald-800">{formatCurrency(invoiceToDelete.totalToPay)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Situação:</span>
                <span className="font-bold text-gray-800">{invoiceToDelete.status.toUpperCase()}</span>
              </div>
            </div>

            <p className="text-xs text-gray-600 mb-4 leading-relaxed">
              Tem certeza que deseja apagar esta fatura do sistema? O documento e qualquer boleto associado serão removidos permanentemente do banco de dados.
              {invoiceToDelete.status === 'paid' && (
                <span className="block text-rose-700 font-bold mt-2 bg-rose-50 p-2.5 rounded-xl border border-rose-200">
                  ⚠️ Esta fatura já consta como PAGA. Ao confirmar, o registro de pagamento confirmado também será excluído do sistema.
                </span>
              )}
            </p>

            {deleteInvoiceError && (
              <div className="mb-4 rounded-xl bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
                {deleteInvoiceError}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={deletingInvoice}
                onClick={() => {
                  setInvoiceToDelete(null);
                  setDeleteInvoiceError(null);
                }}
                className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deletingInvoice}
                onClick={async () => {
                  if (!onDeleteInvoice || !invoiceToDelete) return;
                  setDeletingInvoice(true);
                  setDeleteInvoiceError(null);
                  try {
                    await onDeleteInvoice(invoiceToDelete.id);
                    await logAuditEvent({
                      operationType: 'delete_invoice',
                      collectionName: 'faturas',
                      relatedDocument: invoiceToDelete.id,
                      user: userProfile?.name || 'Operador',
                      userEmail: userProfile?.email || '',
                      justification: `Exclusão da fatura #${invoiceToDelete.invoiceNumber} (${invoiceToDelete.clientName})`,
                    }).catch(() => {});
                    setInvoiceToDelete(null);
                  } catch (err) {
                    setDeleteInvoiceError('Erro ao excluir fatura: ' + (err instanceof Error ? err.message : String(err)));
                  } finally {
                    setDeletingInvoice(false);
                  }
                }}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 transition cursor-pointer disabled:opacity-50"
              >
                {deletingInvoice ? 'Excluindo...' : 'Sim, Excluir Fatura'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
