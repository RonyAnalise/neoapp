import React, { useState, useMemo } from 'react';
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
  MessageCircle,
  BellRing,
  Smartphone,
  Edit3,
  RotateCcw,
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
import { getWhatsAppNotificationUrl } from '../lib/notificationService';

interface FaturasViewProps {
  faturas: Fatura[];
  clientes: Cliente[];
  leituras: Leitura[];
  empresa: EmpresaConfig;
  tariffs: EnergyTariffs;
  prefillClientId?: string;
  onIssueInvoice: (invoice: Omit<Fatura, 'id' | 'createdAt'>) => Promise<void>;
  onUpdateInvoice?: (faturaId: string, updatedData: Partial<Fatura>) => Promise<void>;
  onConfirmPayment: (faturaId: string, amount: number) => Promise<void>;
  onUnmarkPayment?: (faturaId: string) => Promise<void>;
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
  onUpdateInvoice,
  onConfirmPayment,
  onUnmarkPayment,
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
  const [selectedYear, setSelectedYear] = useState<number | 'all'>('all');

  const availableYears = useMemo(() => {
    const years = new Set<number>([currentYear - 1, currentYear, currentYear + 1]);
    faturas.forEach((f) => {
      if (f.referenceYear) years.add(f.referenceYear);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [faturas, currentYear]);

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

  // Unmark payment modal state
  const [unmarkingFatura, setUnmarkingFatura] = useState<Fatura | null>(null);
  const [unmarkPaymentOpen, setUnmarkPaymentOpen] = useState(false);
  const [processingUnmark, setProcessingUnmark] = useState(false);

  // Cancellation modal state
  const [cancellingFatura, setCancellingFatura] = useState<Fatura | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [processingCancel, setProcessingCancel] = useState(false);

  const [invoiceToDelete, setInvoiceToDelete] = useState<Fatura | null>(null);
  const [deletingInvoice, setDeletingInvoice] = useState(false);
  const [deleteInvoiceError, setDeleteInvoiceError] = useState<string | null>(null);

  // Notificação de fatura emitida
  const [issuedNotificationSuccess, setIssuedNotificationSuccess] = useState<{
    client: Cliente;
    invoiceNumber: string;
    fatura: Fatura;
  } | null>(null);

  // Modal de edição de fatura
  const [editingFatura, setEditingFatura] = useState<Fatura | null>(null);
  const [editPrevReading, setEditPrevReading] = useState<number | ''>('');
  const [editPrevReadingDate, setEditPrevReadingDate] = useState('');
  const [editCurrReading, setEditCurrReading] = useState<number | ''>('');
  const [editCurrReadingDate, setEditCurrReadingDate] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editNeoTariff, setEditNeoTariff] = useState<number>(0);
  const [editCoelbaTariff, setEditCoelbaTariff] = useState<number>(0);
  const [editStatus, setEditStatus] = useState<InvoiceStatus>('pending');
  const [editNotes, setEditNotes] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const handleOpenEdit = (fat: Fatura) => {
    setEditingFatura(fat);
    setEditPrevReading(fat.previousReading);
    setEditPrevReadingDate(fat.previousReadingDate || '');
    setEditCurrReading(fat.currentReading);
    setEditCurrReadingDate(fat.currentReadingDate || '');
    setEditDueDate(fat.dueDate || '');
    setEditNeoTariff(fat.appliedNeoTariff || tariffs.neoTariff);
    setEditCoelbaTariff(fat.appliedCoelbaTariff || tariffs.coelbaReferenceTariff);
    setEditStatus(fat.status);
    setEditNotes(fat.notes || '');
    setEditError(null);
  };

  const editPreviewCalc = useMemo(() => {
    if (!editingFatura || editPrevReading === '' || editCurrReading === '') return null;
    try {
      return calculateInvoice({
        previousReading: Number(editPrevReading),
        currentReading: Number(editCurrReading),
        neoTariff: editNeoTariff,
        coelbaTariff: editCoelbaTariff,
      });
    } catch {
      return null;
    }
  }, [editingFatura, editPrevReading, editCurrReading, editNeoTariff, editCoelbaTariff]);

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFatura || !onUpdateInvoice) return;
    if (editPrevReading === '' || editCurrReading === '') {
      setEditError('Preencha os valores de leitura anterior e atual.');
      return;
    }
    if (Number(editCurrReading) < Number(editPrevReading)) {
      setEditError('A leitura atual não pode ser inferior à leitura anterior.');
      return;
    }

    setSavingEdit(true);
    setEditError(null);
    try {
      const calc =
        editPreviewCalc ||
        calculateInvoice({
          previousReading: Number(editPrevReading),
          currentReading: Number(editCurrReading),
          neoTariff: editNeoTariff,
          coelbaTariff: editCoelbaTariff,
        });

      await onUpdateInvoice(editingFatura.id, {
        previousReading: Number(editPrevReading),
        previousReadingDate: editPrevReadingDate,
        currentReading: Number(editCurrReading),
        currentReadingDate: editCurrReadingDate,
        dueDate: editDueDate,
        appliedNeoTariff: editNeoTariff,
        appliedCoelbaTariff: editCoelbaTariff,
        consumptionKwh: calc.consumptionKwh,
        neoAmount: calc.neoAmount,
        coelbaEstimateAmount: calc.coelbaEstimateAmount,
        savingsAmount: calc.savingsAmount,
        savingsPercentage: calc.savingsPercentage,
        totalToPay: calc.totalToPay,
        status: editStatus,
        notes: editNotes,
      });

      setEditingFatura(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Erro ao salvar alterações da fatura.');
    } finally {
      setSavingEdit(false);
    }
  };

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

      const createdFatPreview: Fatura = {
        id: invoiceNumber,
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
        boletoBase64: createBoletoBase64 || null,
        boletoFileName: createBoletoFile?.name || null,
        boletoUploadedAt: createBoletoBase64 ? new Date().toISOString() : null,
        boletoStoragePath: null,
        createdAt: new Date().toISOString(),
        createdBy: userProfile?.name || 'Operador',
      };

      setIssuedNotificationSuccess({
        client: selectedClient,
        invoiceNumber,
        fatura: createdFatPreview,
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

  const handleOpenUnmarkPayment = (fat: Fatura) => {
    setUnmarkingFatura(fat);
    setUnmarkPaymentOpen(true);
  };

  const handleExecuteUnmarkPayment = async () => {
    if (!unmarkingFatura || !onUnmarkPayment) return;
    setProcessingUnmark(true);
    try {
      await onUnmarkPayment(unmarkingFatura.id);
      setUnmarkPaymentOpen(false);
    } catch (err) {
      alert('Erro ao desmarcar pagamento: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setProcessingUnmark(false);
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
      const matchesYear = selectedYear === 'all' || f.referenceYear === selectedYear;

      return matchesSearch && matchesStatus && matchesMonth && matchesYear;
    })
    .sort((a, b) => {
      if (a.referenceYear !== b.referenceYear) return b.referenceYear - a.referenceYear;
      return b.referenceMonth - a.referenceMonth;
    });

  return (
    <div className="space-y-6">
      {/* Quick Status Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setStatusFilter('all')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
            statusFilter === 'all'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          <span>Todas as Faturas</span>
          <span
            className={`text-[10px] px-1.5 py-0.2 rounded-full ${
              statusFilter === 'all' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {faturas.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('paid')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
            statusFilter === 'paid'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-white text-emerald-800 border border-emerald-200 hover:bg-emerald-50'
          }`}
        >
          <CheckCircle className="w-3.5 h-3.5" />
          <span>Pagas</span>
          <span
            className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
              statusFilter === 'paid' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
            }`}
          >
            {faturas.filter((f) => f.status === 'paid').length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('pending')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
            statusFilter === 'pending'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'bg-white text-amber-800 border border-amber-200 hover:bg-amber-50'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Pendentes</span>
          <span
            className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
              statusFilter === 'pending' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
            }`}
          >
            {faturas.filter((f) => f.status === 'pending').length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('overdue')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
            statusFilter === 'overdue'
              ? 'bg-rose-600 text-white shadow-xs'
              : 'bg-white text-rose-800 border border-rose-200 hover:bg-rose-50'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Vencidas</span>
          <span
            className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
              statusFilter === 'overdue' ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-800'
            }`}
          >
            {faturas.filter((f) => f.status === 'overdue').length}
          </span>
        </button>
      </div>

      {/* Banner de Notificação de Fatura Emitida para o Celular */}
      {issuedNotificationSuccess && (
        <div className="rounded-2xl bg-gradient-to-r from-emerald-800 to-[#0c3319] p-4 text-white shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-400 text-emerald-950 flex items-center justify-center font-black shrink-0 shadow-xs">
              <BellRing className="w-5 h-5 animate-bounce" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-emerald-700 text-yellow-300 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Notificação no Celular
                </span>
                <span className="text-sm font-black">
                  Fatura #{issuedNotificationSuccess.invoiceNumber} Lançada com Sucesso!
                </span>
              </div>
              <p className="text-xs text-emerald-200 mt-0.5">
                O Portal do Cliente notificou o celular de{' '}
                <strong>{issuedNotificationSuccess.client.name}</strong> em tempo real com som e vibração.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            {getWhatsAppNotificationUrl(
              issuedNotificationSuccess.client,
              issuedNotificationSuccess.fatura
            ) && (
              <a
                href={getWhatsAppNotificationUrl(
                  issuedNotificationSuccess.client,
                  issuedNotificationSuccess.fatura
                )!}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-black text-xs transition shadow-xs cursor-pointer"
                title="Avisar também pelo WhatsApp"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Enviar no WhatsApp</span>
              </a>
            )}
            <button
              type="button"
              onClick={() => setIssuedNotificationSuccess(null)}
              className="p-1 rounded-lg text-emerald-300 hover:text-white transition cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

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
              onChange={(e) =>
                setSelectedYear(e.target.value === 'all' ? 'all' : Number(e.target.value))
              }
              className="rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-900 focus:border-emerald-600 focus:outline-none"
            >
              <option value="all">Todos os Anos</option>
              {availableYears.map((y) => (
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

                        {onUpdateInvoice && (
                          <button
                            onClick={() => handleOpenEdit(fat)}
                            className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 px-2.5 py-1 text-xs font-bold text-gray-700 transition cursor-pointer shadow-2xs"
                            title="Editar valores e dados da fatura"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                            <span>Editar</span>
                          </button>
                        )}

                        {(() => {
                          const cli = clientes.find((c) => c.id === fat.clientId);
                          if (!cli) return null;
                          const waUrl = getWhatsAppNotificationUrl(cli, fat);
                          if (!waUrl) return null;
                          return (
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 rounded-lg border border-emerald-200 text-emerald-600 hover:bg-emerald-50 transition cursor-pointer"
                              title="Avisar cliente no WhatsApp"
                            >
                              <MessageCircle className="w-3.5 h-3.5 text-emerald-700" />
                            </a>
                          );
                        })()}

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

                        {fat.status === 'paid' && onUnmarkPayment && (
                          <button
                            onClick={() => handleOpenUnmarkPayment(fat)}
                            className="flex items-center gap-1 rounded-lg bg-amber-50 border border-amber-200 px-2 py-1 text-xs font-bold text-amber-800 hover:bg-amber-100 transition cursor-pointer shadow-2xs"
                            title="Desmarcar pagamento e fazer a fatura voltar ao status Pendente"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                            <span>Desmarcar</span>
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

      {/* Confirmation Modal: Desmarcar Pagamento e Voltar para Pendente */}
      <ConfirmationModal
        isOpen={unmarkPaymentOpen}
        title="Desmarcar Pagamento da Fatura"
        message={
          unmarkingFatura
            ? `Deseja realmente desmarcar o pagamento da fatura #${unmarkingFatura.invoiceNumber} (${unmarkingFatura.clientName}) no valor de ${formatCurrency(
                unmarkingFatura.totalToPay
              )}?\n\nA fatura sairá da lista de pagamentos e voltará a ficar com o status PENDENTE.`
            : ''
        }
        confirmLabel="Sim, Desmarcar Pagamento"
        cancelLabel="Cancelar"
        confirmVariant="danger"
        loading={processingUnmark}
        onConfirm={handleExecuteUnmarkPayment}
        onCancel={() => setUnmarkPaymentOpen(false)}
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

      {/* Modal Editar Fatura */}
      {editingFatura && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4 backdrop-blur-xs flex items-center justify-center">
          <div className="w-full max-w-2xl bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-gray-100 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center font-black">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">
                    Editar Fatura #{editingFatura.invoiceNumber}
                  </h3>
                  <p className="text-xs text-gray-500">
                    {editingFatura.clientName} • Competência {formatReferencePeriod(editingFatura.referenceMonth, editingFatura.referenceYear)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditingFatura(null)}
                className="text-gray-400 hover:text-gray-600 cursor-pointer p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {editError && (
              <div className="mb-4 flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              {/* Leituras */}
              <div className="rounded-2xl bg-gray-50/80 p-4 border border-gray-200/70">
                <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-emerald-600" />
                  Leituras do Medidor (kWh)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-gray-700 mb-1">Data Leitura Anterior</label>
                    <input
                      type="date"
                      value={editPrevReadingDate}
                      onChange={(e) => setEditPrevReadingDate(e.target.value)}
                      className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-gray-700 mb-1">Leitura Anterior (kWh) *</label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={editPrevReading}
                      onChange={(e) => setEditPrevReading(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900 font-mono font-bold bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-gray-700 mb-1">Data Leitura Atual</label>
                    <input
                      type="date"
                      value={editCurrReadingDate}
                      onChange={(e) => setEditCurrReadingDate(e.target.value)}
                      className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-gray-700 mb-1">Leitura Atual (kWh) *</label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={editCurrReading}
                      onChange={(e) => setEditCurrReading(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900 font-mono font-bold bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Vencimento e Tarifas */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Data de Vencimento *</label>
                  <input
                    type="date"
                    required
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Tarifa Neo (R$/kWh)</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={editNeoTariff}
                    onChange={(e) => setEditNeoTariff(Number(e.target.value))}
                    className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Tarifa Coelba (R$/kWh)</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={editCoelbaTariff}
                    onChange={(e) => setEditCoelbaTariff(Number(e.target.value))}
                    className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900 font-mono"
                  />
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block font-bold text-gray-700 mb-1">Status da Fatura</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as InvoiceStatus)}
                  className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900 font-bold"
                >
                  <option value="pending">Pendente (Aguardando Pagamento)</option>
                  <option value="paid">Paga (Confirmada)</option>
                  <option value="overdue">Vencida</option>
                  <option value="cancelled">Cancelada</option>
                </select>
              </div>

              {/* Observações */}
              <div>
                <label className="block font-bold text-gray-700 mb-1">Observações Internas</label>
                <textarea
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Informações adicionais..."
                  className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900"
                />
              </div>

              {/* Recálculo em tempo real */}
              {editPreviewCalc && (
                <div className="rounded-2xl bg-blue-50/80 p-4 border border-blue-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-blue-900">Consumo Calculado:</span>
                    <span className="font-mono font-bold text-blue-950 text-sm">
                      {formatNumberBr(editPreviewCalc.consumptionKwh)} kWh
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-gray-600">
                    <span>Estimativa Concessionária (s/ desconto):</span>
                    <span className="font-mono">{formatCurrency(editPreviewCalc.coelbaEstimateAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between text-emerald-700">
                    <span>Economia para o Cliente:</span>
                    <span className="font-mono font-bold">
                      {formatCurrency(editPreviewCalc.savingsAmount)} ({editPreviewCalc.savingsPercentage.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="pt-2 border-t border-blue-200 flex items-center justify-between text-sm">
                    <span className="font-bold text-blue-950">Novo Total a Pagar:</span>
                    <span className="font-mono font-black text-lg text-blue-900">
                      {formatCurrency(editPreviewCalc.totalToPay)}
                    </span>
                  </div>
                </div>
              )}

              {/* Ações */}
              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  disabled={savingEdit}
                  onClick={() => setEditingFatura(null)}
                  className="rounded-xl border border-gray-300 px-5 py-2.5 font-bold text-gray-700 hover:bg-gray-100 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-2.5 shadow-md transition cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  {savingEdit ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Salvando Alterações...
                    </>
                  ) : (
                    'Salvar Alterações'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
