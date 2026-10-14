import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { Cliente, Fatura } from '../types';
import { formatCurrency, formatNumberBr, getMonthName } from '../lib/calculations';
import { ActiveTab } from '../components/Sidebar';

interface DashboardViewProps {
  clientes: Cliente[];
  faturas: Fatura[];
  onNavigate: (tab: ActiveTab) => void;
  onOpenInvoiceModal?: (fatura: Fatura) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  clientes,
  faturas,
  onNavigate,
}) => {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // Filtrar faturas desconsiderando canceladas
  const nonCancelledInvoices = faturas.filter((f) => f.status !== 'cancelled');

  // Detectar a competência mais recente com dados de faturas
  const latestInvoiceWithData = [...nonCancelledInvoices].sort((a, b) => {
    if (a.referenceYear !== b.referenceYear) return b.referenceYear - a.referenceYear;
    return b.referenceMonth - a.referenceMonth;
  })[0];

  const initialYear = latestInvoiceWithData ? latestInvoiceWithData.referenceYear : currentYear;
  const initialMonth = latestInvoiceWithData ? latestInvoiceWithData.referenceMonth : currentMonth;

  const [selectedYear, setSelectedYear] = useState<number>(initialYear);
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>(initialMonth);

  // Auto-ajusta para a competência com faturas caso a seleção inicial esteja vazia
  useEffect(() => {
    if (nonCancelledInvoices.length > 0) {
      const hasDataInCurrentSelection = nonCancelledInvoices.some((f) => {
        if (f.referenceYear !== selectedYear) return false;
        if (selectedMonth === 'all') return true;
        return f.referenceMonth === selectedMonth;
      });

      if (!hasDataInCurrentSelection) {
        const latest = [...nonCancelledInvoices].sort((a, b) => {
          if (a.referenceYear !== b.referenceYear) return b.referenceYear - a.referenceYear;
          return b.referenceMonth - a.referenceMonth;
        })[0];
        if (latest) {
          setSelectedYear(latest.referenceYear);
          setSelectedMonth(latest.referenceMonth);
        }
      }
    }
  }, [faturas.length, selectedYear, selectedMonth]);

  // Contagem de clientes ativos
  const activeClientsCount = clientes.filter((c) => c.status === 'active').length;

  // Faturas da competência selecionada
  const isAllMonths = selectedMonth === 'all';
  const monthInvoices = nonCancelledInvoices.filter((f) => {
    if (f.referenceYear !== selectedYear) return false;
    if (isAllMonths) return true;
    return f.referenceMonth === selectedMonth;
  });

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
    const paid = invs.filter((f) => f.status === 'paid').reduce((sum, f) => sum + (f.totalToPay || 0), 0);
    return {
      month: getMonthName(mNum).slice(0, 3),
      fullName: getMonthName(mNum),
      mNum,
      kwh,
      savings,
      billed,
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

      {/* Grid de KPIs Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Clientes */}
        <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Clientes Ativos</p>
            <h3 className="text-2xl font-black text-gray-900 mt-1">{activeClientsCount}</h3>
            <span className="text-[11px] text-gray-500 font-medium">
              {clientes.length} cadastrados no total
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* Consumo do Mês */}
        <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              {isAllMonths ? 'Consumo Anual' : `Consumo (${getMonthName(selectedMonth).slice(0, 3)})`}
            </p>
            <h3 className="text-2xl font-black text-emerald-700 mt-1">
              {formatNumberBr(totalConsumptionMonth)} <span className="text-xs font-bold">kWh</span>
            </h3>
            <span className="text-[11px] text-gray-500 font-medium">
              Acumulado: {formatNumberBr(totalAccumulatedConsumption)} kWh
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
            <Zap className="w-6 h-6" />
          </div>
        </div>

        {/* Faturado no Mês */}
        <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              {isAllMonths ? 'Faturado no Ano' : 'Total Faturado'}
            </p>
            <h3 className="text-2xl font-black text-gray-900 mt-1">
              {formatCurrency(totalInvoicedMonth)}
            </h3>
            <span className="text-[11px] text-emerald-600 font-bold block mt-0.5">
              Recebido: {formatCurrency(totalReceivedMonth)}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        {/* Economia do Mês */}
        <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Economia Gerada</p>
            <h3 className="text-2xl font-black text-[#e97825] mt-1">
              {formatCurrency(totalSavingsMonth)}
            </h3>
            <span className="text-[11px] text-orange-600 font-bold block mt-0.5">
              Total Acumulado: {formatCurrency(totalAccumulatedSavings)}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-700 flex items-center justify-center">
            <TrendingUp className="w-6 h-6" />
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
    </div>
  );
};
