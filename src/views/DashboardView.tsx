import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  CheckCircle2,
  Clock,
  AlertOctagon,
  TrendingUp,
  DollarSign,
  Zap,
  Calendar,
  ArrowUpRight,
  FileCheck,
  FileX,
  AlertCircle,
  Search,
  X,
  Plus,
  Phone,
  MessageCircle,
  Eye,
  Wallet,
  Receipt,
} from 'lucide-react';
import { Cliente, Fatura } from '../types';
import { formatCurrency, formatNumberBr, getMonthName } from '../lib/calculations';
import { ActiveTab } from '../components/Sidebar';

interface DashboardViewProps {
  clientes: Cliente[];
  faturas: Fatura[];
  onNavigate: (tab: ActiveTab) => void;
  onOpenInvoiceModal?: (fatura: Fatura) => void;
  onNavigateToInvoice?: (prefillClientId: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  clientes,
  faturas,
  onNavigate,
  onOpenInvoiceModal,
  onNavigateToInvoice,
}) => {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // Filtrar faturas desconsiderando canceladas
  const nonCancelledInvoices = useMemo(
    () => faturas.filter((f) => f.status !== 'cancelled'),
    [faturas]
  );

  // Detectar a competência mais recente com dados de faturas
  const latestInvoiceWithData = useMemo(() => {
    return [...nonCancelledInvoices].sort((a, b) => {
      if (a.referenceYear !== b.referenceYear) return b.referenceYear - a.referenceYear;
      return b.referenceMonth - a.referenceMonth;
    })[0];
  }, [nonCancelledInvoices]);

  const initialYear = latestInvoiceWithData ? latestInvoiceWithData.referenceYear : currentYear;
  const initialMonth = latestInvoiceWithData ? latestInvoiceWithData.referenceMonth : currentMonth;

  const [selectedYear, setSelectedYear] = useState<number>(initialYear);
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>(initialMonth);
  const [hasInitializedSelection, setHasInitializedSelection] = useState(false);

  // Inicializa uma única vez na competência mais recente com faturas quando os dados carregarem
  useEffect(() => {
    if (!hasInitializedSelection && nonCancelledInvoices.length > 0) {
      const latest = [...nonCancelledInvoices].sort((a, b) => {
        if (a.referenceYear !== b.referenceYear) return b.referenceYear - a.referenceYear;
        return b.referenceMonth - a.referenceMonth;
      })[0];
      if (latest) {
        setSelectedYear(latest.referenceYear);
        setSelectedMonth(latest.referenceMonth);
      }
      setHasInitializedSelection(true);
    }
  }, [hasInitializedSelection, nonCancelledInvoices.length]);

  // Contagem de clientes ativos
  const activeClients = useMemo(
    () => clientes.filter((c) => c.status === 'active'),
    [clientes]
  );
  const activeClientsCount = activeClients.length;

  // Faturas da competência selecionada
  const isAllMonths = selectedMonth === 'all';
  const monthInvoices = useMemo(() => {
    return nonCancelledInvoices.filter((f) => {
      if (f.referenceYear !== selectedYear) return false;
      if (isAllMonths) return true;
      return f.referenceMonth === selectedMonth;
    });
  }, [nonCancelledInvoices, selectedYear, selectedMonth, isAllMonths]);

  // Função utilitária para verificar se um cliente tem fatura emitida
  const clientHasInvoice = (client: Cliente, invList: Fatura[]) => {
    return invList.some((f) => {
      if (f.clientId && f.clientId === client.id) return true;
      if (
        client.meterNumber &&
        f.meterNumber &&
        f.meterNumber.trim().toLowerCase() === client.meterNumber.trim().toLowerCase()
      ) {
        return true;
      }
      if (
        client.consumerUnit &&
        f.consumerUnit &&
        f.consumerUnit.trim().toLowerCase() === client.consumerUnit.trim().toLowerCase()
      ) {
        return true;
      }
      return false;
    });
  };

  // Clientes com e sem fatura no mês selecionado
  const clientsWithInvoice = useMemo(() => {
    return activeClients.filter((c) => clientHasInvoice(c, monthInvoices));
  }, [activeClients, monthInvoices]);

  const clientsWithoutInvoice = useMemo(() => {
    return activeClients.filter((c) => !clientHasInvoice(c, monthInvoices));
  }, [activeClients, monthInvoices]);

  const countGenerated = clientsWithInvoice.length;
  const countPendingGeneration = clientsWithoutInvoice.length;
  const generationPercent =
    activeClientsCount > 0 ? Math.round((countGenerated / activeClientsCount) * 100) : 0;

  // Modal de listagem de clientes (emitidas vs pendentes)
  const [emissionModalOpen, setEmissionModalOpen] = useState(false);
  const [emissionModalTab, setEmissionModalTab] = useState<'pending' | 'generated'>('pending');
  const [modalSearch, setModalSearch] = useState('');

  const filteredPendingClients = useMemo(() => {
    if (!modalSearch.trim()) return clientsWithoutInvoice;
    const q = modalSearch.toLowerCase().trim();
    return clientsWithoutInvoice.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.meterNumber && c.meterNumber.toLowerCase().includes(q)) ||
        (c.cpfCnpj && c.cpfCnpj.includes(q)) ||
        (c.consumerUnit && c.consumerUnit.toLowerCase().includes(q))
    );
  }, [clientsWithoutInvoice, modalSearch]);

  const filteredGeneratedClients = useMemo(() => {
    if (!modalSearch.trim()) return clientsWithInvoice;
    const q = modalSearch.toLowerCase().trim();
    return clientsWithInvoice.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.meterNumber && c.meterNumber.toLowerCase().includes(q)) ||
        (c.cpfCnpj && c.cpfCnpj.includes(q)) ||
        (c.consumerUnit && c.consumerUnit.toLowerCase().includes(q))
    );
  }, [clientsWithInvoice, modalSearch]);

  const getInvoiceForClient = (client: Cliente) => {
    return monthInvoices.find(
      (f) =>
        f.clientId === client.id ||
        (client.meterNumber &&
          f.meterNumber &&
          f.meterNumber.trim().toLowerCase() === client.meterNumber.trim().toLowerCase())
    );
  };

  const handleIssueForClient = (clientId: string) => {
    setEmissionModalOpen(false);
    if (onNavigateToInvoice) {
      onNavigateToInvoice(clientId);
    } else {
      onNavigate('faturas');
    }
  };

  const pendingInvoices = monthInvoices.filter((f) => f.status === 'pending');
  const paidInvoices = monthInvoices.filter((f) => f.status === 'paid');
  const overdueInvoices = monthInvoices.filter((f) => f.status === 'overdue');

  // Total geral de pagamentos confirmados em todo o histórico
  const allPaidInvoices = nonCancelledInvoices.filter((f) => f.status === 'paid');
  const allPaidSum = allPaidInvoices.reduce((acc, f) => acc + (f.totalToPay || 0), 0);

  // Métricas da competência selecionada
  const totalInvoicedMonth = monthInvoices.reduce((acc, f) => acc + (f.totalToPay || 0), 0);
  const totalReceivedMonth = paidInvoices.reduce((acc, f) => acc + (f.totalToPay || 0), 0);
  const totalConsumptionMonth = monthInvoices.reduce((acc, f) => acc + (f.consumptionKwh || 0), 0);
  const totalSavingsMonth = monthInvoices.reduce((acc, f) => acc + (f.savingsAmount || 0), 0);

  // Total de Taxas Fixas Pagas pelo Administrador (somatório das taxas cadastradas nas faturas do mês)
  const totalFixedFeesMonth = monthInvoices.reduce((acc, f) => {
    const cli = clientes.find((c) => c.id === f.clientId);
    const fee = f.fixedFee !== undefined ? (f.fixedFee || 0) : (cli?.fixedFee || 0);
    return acc + fee;
  }, 0);

  // Valor Líquido = Faturamento Total - Total de Taxas
  const netRevenueMonth = totalInvoicedMonth - totalFixedFeesMonth;

  // Métricas acumuladas gerais
  const totalAccumulatedSavings = nonCancelledInvoices.reduce((acc, f) => acc + (f.savingsAmount || 0), 0);
  const totalAccumulatedConsumption = nonCancelledInvoices.reduce((acc, f) => acc + (f.consumptionKwh || 0), 0);

  // Evolução mensal de consumo (kWh) no ano selecionado
  const monthlyBreakdown = Array.from({ length: 12 }, (_, i) => {
    const mNum = i + 1;
    const invs = nonCancelledInvoices.filter(
      (f) => f.referenceYear === selectedYear && f.referenceMonth === mNum
    );
    const kwh = invs.reduce((sum, f) => sum + (f.consumptionKwh || 0), 0);
    const savings = invs.reduce((sum, f) => sum + (f.savingsAmount || 0), 0);
    const billed = invs.reduce((sum, f) => sum + (f.totalToPay || 0), 0);
    const fixedFees = invs.reduce((sum, f) => {
      const cli = clientes.find((c) => c.id === f.clientId);
      const fee = f.fixedFee !== undefined ? (f.fixedFee || 0) : (cli?.fixedFee || 0);
      return sum + fee;
    }, 0);
    const net = billed - fixedFees;
    const paid = invs.filter((f) => f.status === 'paid').reduce((sum, f) => sum + (f.totalToPay || 0), 0);
    return {
      month: getMonthName(mNum).slice(0, 3),
      fullName: getMonthName(mNum),
      mNum,
      kwh,
      savings,
      billed,
      fixedFees,
      net,
      paid,
      invoicesCount: invs.length,
    };
  });

  const maxKwh = Math.max(...monthlyBreakdown.map((m) => m.kwh), 100);

  return (
    <div className="space-y-6">
      {/* Barra de Filtro de Competência & Ações Rápidas */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-gray-200/80 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <Calendar className="w-5 h-5 text-emerald-700" />
          <span className="font-bold text-gray-900 text-sm">Competência:</span>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="rounded-xl border border-gray-300 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-900 focus:border-emerald-600 focus:outline-none"
          >
            <option value="all">Todas as Competências (Geral)</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {getMonthName(i + 1)}
              </option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="rounded-xl border border-gray-300 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-900 focus:border-emerald-600 focus:outline-none"
          >
            {[currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          {isAllMonths && (
            <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-md">
              Visão Geral Consolidada
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onNavigate('clientes')}
            className="rounded-xl border border-emerald-600/30 bg-emerald-50 px-3.5 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition cursor-pointer"
          >
            + Novo Cliente
          </button>
          <button
            onClick={() => onNavigate('consumo')}
            className="rounded-xl border border-emerald-600/30 bg-emerald-50 px-3.5 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition cursor-pointer"
          >
            + Lançar Leitura
          </button>
          <button
            onClick={() => onNavigate('faturas')}
            className="rounded-xl bg-emerald-700 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 transition shadow-xs cursor-pointer flex items-center gap-1.5"
          >
            + Emitir Fatura
          </button>
        </div>
      </div>

      {/* Seção Principal: Emissão de Faturas na Competência Selecionada */}
      <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-xl bg-emerald-100 text-emerald-800">
                <FileCheck className="w-4 h-4" />
              </span>
              <h3 className="text-base font-black text-gray-900">
                Status de Emissão de Faturas — {isAllMonths ? `Geral ${selectedYear}` : `${getMonthName(selectedMonth)}/${selectedYear}`}
              </h3>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Controle de faturamento dos clientes ativos de acordo com o mês selecionado ({isAllMonths ? `Ano ${selectedYear}` : `${getMonthName(selectedMonth)} de ${selectedYear}`}).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-bold px-3 py-1.5 rounded-xl border flex items-center gap-1.5 ${
                countPendingGeneration === 0 && activeClientsCount > 0
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-amber-50 text-amber-900 border-amber-200'
              }`}
            >
              {countPendingGeneration === 0 && activeClientsCount > 0 ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>100% dos Clientes Faturados</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                  <span>{countPendingGeneration} cliente(s) aguardando fatura</span>
                </>
              )}
            </span>
          </div>
        </div>

        {/* Dual Cards: Já Geradas vs Ainda Sem Fatura */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card 1: Faturas Já Geradas */}
          <div
            onClick={() => {
              setEmissionModalTab('generated');
              setModalSearch('');
              setEmissionModalOpen(true);
            }}
            className="group relative overflow-hidden rounded-2xl p-5 border border-emerald-200 bg-gradient-to-br from-emerald-50/80 via-white to-emerald-50/30 hover:border-emerald-400 hover:shadow-md transition cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[11px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-100/90 px-2.5 py-0.5 rounded-md inline-block">
                  ✓ Faturas Já Geradas
                </span>
                <div className="flex items-baseline gap-2 mt-2.5">
                  <h4 className="text-3xl font-black text-emerald-950">{countGenerated}</h4>
                  <span className="text-xs font-bold text-gray-600">
                    de {activeClientsCount} clientes ativos ({generationPercent}%)
                  </span>
                </div>
                <p className="text-xs text-emerald-800 mt-1 font-medium">
                  {monthInvoices.length} fatura(s) cadastrada(s) para este período
                </p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition shrink-0">
                <FileCheck className="w-6 h-6" />
              </div>
            </div>

            {/* Barra de Progresso */}
            <div className="mt-4">
              <div className="h-2.5 w-full bg-emerald-100/80 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-600 rounded-full transition-all duration-500"
                  style={{ width: `${generationPercent}%` }}
                />
              </div>
            </div>

            <div className="mt-3.5 flex items-center justify-between text-xs">
              <span className="text-emerald-700 font-bold group-hover:underline flex items-center gap-1">
                Ver lista de clientes já faturados ({countGenerated}) <ArrowUpRight className="w-3.5 h-3.5" />
              </span>
              <span className="text-[11px] text-gray-400 font-medium">Clique para ver</span>
            </div>
          </div>

          {/* Card 2: Clientes Sem Fatura no Mês */}
          <div
            onClick={() => {
              setEmissionModalTab('pending');
              setModalSearch('');
              setEmissionModalOpen(true);
            }}
            className={`group relative overflow-hidden rounded-2xl p-5 border transition cursor-pointer ${
              countPendingGeneration > 0
                ? 'border-amber-300 bg-gradient-to-br from-amber-50/90 via-white to-amber-50/40 hover:border-amber-400 hover:shadow-md'
                : 'border-gray-200 bg-gradient-to-br from-gray-50/60 via-white to-gray-50/20 hover:border-gray-300'
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <span
                  className={`text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-md inline-block ${
                    countPendingGeneration > 0
                      ? 'text-amber-900 bg-amber-100 font-bold'
                      : 'text-gray-600 bg-gray-100'
                  }`}
                >
                  {countPendingGeneration > 0 ? '⚠️ Ainda Sem Fatura Gerada' : '✨ 0 Pendentes'}
                </span>
                <div className="flex items-baseline gap-2 mt-2.5">
                  <h4
                    className={`text-3xl font-black ${
                      countPendingGeneration > 0 ? 'text-amber-950' : 'text-gray-900'
                    }`}
                  >
                    {countPendingGeneration}
                  </h4>
                  <span className="text-xs font-bold text-gray-600">
                    {countPendingGeneration === 1 ? 'cliente sem fatura' : 'clientes sem fatura'}
                  </span>
                </div>
                <p
                  className={`text-xs mt-1 font-medium ${
                    countPendingGeneration > 0 ? 'text-amber-800 font-semibold' : 'text-gray-500'
                  }`}
                >
                  {countPendingGeneration > 0
                    ? `Aguardando leitura e geração da fatura deste mês`
                    : `Todos os ${activeClientsCount} clientes ativos já possuem fatura gerada!`}
                </p>
              </div>
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-xs group-hover:scale-105 transition shrink-0 ${
                  countPendingGeneration > 0
                    ? 'bg-amber-500 text-white'
                    : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {countPendingGeneration > 0 ? (
                  <FileX className="w-6 h-6" />
                ) : (
                  <CheckCircle2 className="w-6 h-6" />
                )}
              </div>
            </div>

            {/* Barra de Progresso Complementar */}
            <div className="mt-4">
              <div className="h-2.5 w-full bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    countPendingGeneration > 0 ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${100 - generationPercent}%` }}
                />
              </div>
            </div>

            <div className="mt-3.5 flex items-center justify-between text-xs">
              <span
                className={`font-bold group-hover:underline flex items-center gap-1 ${
                  countPendingGeneration > 0 ? 'text-amber-800' : 'text-gray-600'
                }`}
              >
                {countPendingGeneration > 0 ? (
                  <>Ver quem ainda falta emitir ({countPendingGeneration}) <ArrowUpRight className="w-3.5 h-3.5" /></>
                ) : (
                  <>Ver todos os clientes <ArrowUpRight className="w-3.5 h-3.5" /></>
                )}
              </span>
              <span className="text-[11px] text-gray-400 font-medium">Clique para ver</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid de KPIs Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Clientes */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Clientes Ativos</p>
            <h3 className="text-xl sm:text-2xl font-black text-gray-900 mt-1">{activeClientsCount}</h3>
            <span className="text-[10px] sm:text-[11px] text-gray-500 font-medium block">
              {clientes.length} cadastrados no total
            </span>
          </div>
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        </div>

        {/* Consumo do Mês */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              {isAllMonths ? 'Consumo Anual' : `Consumo (${getMonthName(selectedMonth).slice(0, 3)})`}
            </p>
            <h3 className="text-xl sm:text-2xl font-black text-emerald-700 mt-1">
              {formatNumberBr(totalConsumptionMonth)} <span className="text-xs font-bold">kWh</span>
            </h3>
            <span className="text-[10px] sm:text-[11px] text-gray-500 font-medium block truncate">
              Acumulado: {formatNumberBr(totalAccumulatedConsumption)} kWh
            </span>
          </div>
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        </div>

        {/* Faturamento Total */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              {isAllMonths ? 'Faturado no Ano' : 'Faturamento Total'}
            </p>
            <h3 className="text-xl sm:text-2xl font-black text-gray-900 mt-1">
              {formatCurrency(totalInvoicedMonth)}
            </h3>
            <span className="text-[10px] sm:text-[11px] text-emerald-600 font-bold block mt-0.5">
              Recebido: {formatCurrency(totalReceivedMonth)}
            </span>
          </div>
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
            <DollarSign className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        </div>

        {/* Economia do Mês */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Economia Gerada</p>
            <h3 className="text-xl sm:text-2xl font-black text-[#e97825] mt-1">
              {formatCurrency(totalSavingsMonth)}
            </h3>
            <span className="text-[10px] sm:text-[11px] text-orange-600 font-bold block mt-0.5 truncate">
              Acumulado: {formatCurrency(totalAccumulatedSavings)}
            </span>
          </div>
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-orange-100 text-orange-700 flex items-center justify-center shrink-0">
            <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        </div>
      </div>

      {/* Cards de Status das Faturas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Pendentes */}
        <div
          onClick={() => onNavigate('faturas')}
          className="rounded-2xl p-4 border border-amber-200 bg-amber-50/40 hover:bg-amber-100/60 transition cursor-pointer flex items-center justify-between group"
          title="Ver faturas pendentes em Faturas"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center group-hover:scale-105 transition">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-600">Faturas Pendentes</p>
              <h4 className="text-lg font-black text-amber-800">{pendingInvoices.length}</h4>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs font-bold text-gray-700 block">
              {formatCurrency(pendingInvoices.reduce((s, f) => s + f.totalToPay, 0))}
            </span>
            <span className="text-[10px] font-bold text-amber-700 group-hover:underline flex items-center justify-end gap-0.5 mt-0.5">
              Ver em Faturas <ArrowUpRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* Pagas */}
        <div
          onClick={() => onNavigate('faturas')}
          className="rounded-2xl p-4 border border-emerald-200 bg-emerald-50/40 hover:bg-emerald-100/60 transition cursor-pointer flex items-center justify-between group"
          title="Ver faturas pagas em Faturas"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center group-hover:scale-105 transition">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-600">Faturas Pagas</p>
              <h4 className="text-lg font-black text-emerald-800">
                {isAllMonths ? allPaidInvoices.length : paidInvoices.length}
              </h4>
              {!isAllMonths && allPaidInvoices.length > 0 && allPaidInvoices.length !== paidInvoices.length && (
                <span className="text-[10px] text-gray-500 font-medium">
                  {allPaidInvoices.length} em todo o histórico
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs font-black text-emerald-800 block">
              {formatCurrency(
                isAllMonths
                  ? allPaidSum
                  : paidInvoices.reduce((s, f) => s + f.totalToPay, 0)
              )}
            </span>
            <span className="text-[10px] font-bold text-emerald-700 group-hover:underline flex items-center justify-end gap-0.5 mt-0.5">
              Ver em Faturas <ArrowUpRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* Vencidas */}
        <div
          onClick={() => onNavigate('faturas')}
          className="rounded-2xl p-4 border border-rose-200 bg-rose-50/40 hover:bg-rose-100/60 transition cursor-pointer flex items-center justify-between group"
          title="Ver faturas vencidas em Faturas"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center group-hover:scale-105 transition">
              <AlertOctagon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-600">Faturas Vencidas</p>
              <h4 className="text-lg font-black text-rose-800">{overdueInvoices.length}</h4>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs font-bold text-rose-800 block">
              {formatCurrency(overdueInvoices.reduce((s, f) => s + f.totalToPay, 0))}
            </span>
            <span className="text-[10px] font-bold text-rose-700 group-hover:underline flex items-center justify-end gap-0.5 mt-0.5">
              Ver em Faturas <ArrowUpRight className="w-3 h-3" />
            </span>
          </div>
        </div>
      </div>

      {/* Gráfico Anual de Evolução do Consumo Mensal (Largura Total) */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-gray-200/80 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3 mb-5">
          <div>
            <h4 className="text-sm sm:text-base font-bold text-gray-900">
              Evolução do Consumo Mensal (kWh)
            </h4>
            <p className="text-xs text-gray-500 mt-0.5">
              Ano de referência {selectedYear} • Clique em qualquer mês para filtrar a competência
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-200">
              Total Faturado no Ano: {formatNumberBr(monthlyBreakdown.reduce((s, m) => s + m.kwh, 0))} kWh
            </span>
          </div>
        </div>

        {/* Gráfico de Barras Responsivo */}
        <div className="grid grid-cols-12 gap-2 sm:gap-4 items-end h-56 pt-6 px-1 sm:px-4">
          {monthlyBreakdown.map((m) => {
            const heightPercent = maxKwh > 0 ? Math.round((m.kwh / maxKwh) * 100) : 0;
            const isCurr = !isAllMonths && m.mNum === selectedMonth;
            return (
              <div
                key={m.month}
                onClick={() => setSelectedMonth(m.mNum)}
                className="flex flex-col items-center gap-1.5 h-full justify-end group cursor-pointer"
                title={`${m.fullName}/${selectedYear}: ${formatNumberBr(m.kwh)} kWh (${m.invoicesCount} faturas)`}
              >
                <div className="opacity-0 group-hover:opacity-100 text-[10px] font-bold text-gray-700 transition whitespace-nowrap">
                  {m.kwh > 0 ? `${formatNumberBr(m.kwh)}` : ''}
                </div>
                <div
                  style={{ height: `${Math.max(6, heightPercent)}%` }}
                  className={`w-full max-w-[42px] rounded-t-lg transition-all ${
                    isCurr
                      ? 'bg-[#1b7a3e] ring-2 ring-emerald-600 shadow-sm'
                      : m.paid > 0
                      ? 'bg-emerald-500 hover:bg-emerald-600'
                      : m.kwh > 0
                      ? 'bg-emerald-300 hover:bg-emerald-400'
                      : 'bg-gray-100 hover:bg-gray-200'
                  }`}
                />
                <span
                  className={`text-[11px] font-semibold mt-1 transition ${
                    isCurr ? 'text-[#1b7a3e] font-black' : 'text-gray-500 group-hover:text-gray-900'
                  }`}
                >
                  {m.month}
                </span>
              </div>
            );
          })}
        </div>

        {/* Legenda do Gráfico */}
        <div className="mt-6 pt-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-md bg-[#1b7a3e]" />
              Mês Selecionado
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-md bg-emerald-500" />
              Com Pagamentos Confirmados
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-md bg-emerald-300" />
              Consumo Faturado
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-md bg-gray-100 border border-gray-200" />
              Sem Consumo
            </span>
          </div>

          <button
            onClick={() => onNavigate('faturas')}
            className="font-bold text-emerald-700 hover:text-emerald-800 transition flex items-center gap-1 cursor-pointer"
          >
            Acessar Faturas Completas <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Modal de Detalhes de Emissão de Faturas */}
      {emissionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] shadow-2xl flex flex-col overflow-hidden border border-gray-100">
            {/* Cabeçalho do Modal */}
            <div className="px-6 py-5 bg-gradient-to-r from-emerald-950 via-[#0d4f27] to-[#1b7a3e] text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center border border-white/20">
                  <FileCheck className="w-5 h-5 text-yellow-300" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black tracking-tight text-white">
                    Emissão de Faturas na Competência
                  </h3>
                  <p className="text-xs text-emerald-100 mt-0.5">
                    {isAllMonths ? `Geral ${selectedYear}` : `${getMonthName(selectedMonth)} de ${selectedYear}`} • {activeClientsCount} clientes ativos
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEmissionModalOpen(false)}
                className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Abas e Busca */}
            <div className="p-5 border-b border-gray-100 bg-gray-50/60 shrink-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setEmissionModalTab('pending')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                    emissionModalTab === 'pending'
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <FileX className="w-4 h-4" />
                  <span>Ainda Sem Fatura ({countPendingGeneration})</span>
                </button>
                <button
                  onClick={() => setEmissionModalTab('generated')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                    emissionModalTab === 'generated'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <FileCheck className="w-4 h-4" />
                  <span>Faturas Já Geradas ({countGenerated})</span>
                </button>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  placeholder="Pesquisar por nome do cliente, número do medidor, CPF/CNPJ..."
                  className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
                />
              </div>
            </div>

            {/* Lista com Rolagem */}
            <div className="p-5 overflow-y-auto max-h-[50vh] divide-y divide-gray-100 space-y-3">
              {emissionModalTab === 'pending' ? (
                filteredPendingClients.length === 0 ? (
                  <div className="text-center py-10">
                    <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-2" />
                    <h4 className="text-sm font-bold text-gray-800">
                      {countPendingGeneration === 0
                        ? 'Tudo 100% faturado!'
                        : 'Nenhum cliente encontrado com este filtro.'}
                    </h4>
                    <p className="text-xs text-gray-500 mt-1">
                      {countPendingGeneration === 0
                        ? `Todos os ${activeClientsCount} clientes ativos já possuem fatura gerada para este mês.`
                        : 'Tente buscar com outro termo ou limpe a pesquisa.'}
                    </p>
                  </div>
                ) : (
                  filteredPendingClients.map((c) => (
                    <div
                      key={c.id}
                      className="pt-3 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-2xl hover:bg-gray-50 transition"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-gray-900">{c.name}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-900">
                            Sem Fatura
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                          {c.meterNumber && (
                            <span className="font-semibold text-gray-700">
                              Medidor: <strong className="text-emerald-800">{c.meterNumber}</strong>
                            </span>
                          )}
                          {c.consumerUnit && (
                            <span>UC: {c.consumerUnit}</span>
                          )}
                          {c.cpfCnpj && (
                            <span>CPF/CNPJ: {c.cpfCnpj}</span>
                          )}
                          {c.phone && (
                            <span className="flex items-center gap-1 text-gray-600">
                              <Phone className="w-3 h-3 text-gray-400" />
                              {c.phone}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => {
                            setEmissionModalOpen(false);
                            onNavigate('consumo');
                          }}
                          className="px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-xs font-bold text-gray-700 hover:bg-gray-100 transition cursor-pointer"
                        >
                          Lançar Leitura
                        </button>
                        <button
                          onClick={() => handleIssueForClient(c.id)}
                          className="px-3.5 py-1.5 rounded-xl bg-emerald-700 text-xs font-bold text-white hover:bg-emerald-800 transition shadow-xs flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Emitir Fatura</span>
                        </button>
                      </div>
                    </div>
                  ))
                )
              ) : (
                filteredGeneratedClients.length === 0 ? (
                  <div className="text-center py-10">
                    <FileX className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                    <h4 className="text-sm font-bold text-gray-800">
                      Nenhuma fatura gerada encontrada.
                    </h4>
                    <p className="text-xs text-gray-500 mt-1">
                      {countGenerated === 0
                        ? `Ainda não foi gerada nenhuma fatura para este mês.`
                        : 'Nenhum cliente corresponde ao filtro de busca.'}
                    </p>
                  </div>
                ) : (
                  filteredGeneratedClients.map((c) => {
                    const inv = getInvoiceForClient(c);
                    return (
                      <div
                        key={c.id}
                        className="pt-3 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-2xl hover:bg-gray-50 transition"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-gray-900">{c.name}</span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800">
                              Faturado
                            </span>
                            {inv && (
                              <span
                                className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                                  inv.status === 'paid'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : inv.status === 'overdue'
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {inv.status === 'paid'
                                  ? 'Paga'
                                  : inv.status === 'overdue'
                                  ? 'Vencida'
                                  : 'Pendente'}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                            {c.meterNumber && (
                              <span className="font-semibold text-gray-700">
                                Medidor: <strong className="text-emerald-800">{c.meterNumber}</strong>
                              </span>
                            )}
                            {inv && (
                              <>
                                <span className="font-medium text-gray-700">
                                  Fatura: <strong>#{inv.invoiceNumber}</strong>
                                </span>
                                <span className="font-black text-emerald-800">
                                  {formatCurrency(inv.totalToPay)}
                                </span>
                                <span>{formatNumberBr(inv.consumptionKwh)} kWh</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {inv && onOpenInvoiceModal && (
                            <button
                              onClick={() => {
                                setEmissionModalOpen(false);
                                onOpenInvoiceModal(inv);
                              }}
                              className="px-3.5 py-1.5 rounded-xl border border-emerald-600/30 bg-emerald-50 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition flex items-center gap-1 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Ver Fatura</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )
              )}
            </div>

            {/* Rodapé do Modal */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500 shrink-0">
              <span>
                Exibindo {emissionModalTab === 'pending' ? filteredPendingClients.length : filteredGeneratedClients.length} de {activeClientsCount} clientes ativos
              </span>
              <button
                onClick={() => setEmissionModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-gray-200 text-gray-800 font-bold hover:bg-gray-300 transition cursor-pointer"
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
