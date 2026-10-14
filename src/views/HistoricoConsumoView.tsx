import React, { useState } from 'react';
import { History, TrendingUp, Zap, Calendar, Search, Filter } from 'lucide-react';
import { Cliente, Fatura, Leitura } from '../types';
import {
  formatCurrency,
  formatNumberBr,
  formatReferencePeriod,
  getMonthName,
} from '../lib/calculations';

interface HistoricoConsumoViewProps {
  clientes: Cliente[];
  faturas: Fatura[];
  leituras: Leitura[];
  onOpenInvoiceModal: (fatura: Fatura) => void;
}

export const HistoricoConsumoView: React.FC<HistoricoConsumoViewProps> = ({
  clientes,
  faturas,
  leituras,
  onOpenInvoiceModal,
}) => {
  const currentYear = new Date().getFullYear();
  const [selectedClientId, setSelectedClientId] = useState('all');
  const [selectedYear, setSelectedYear] = useState(currentYear);

  // Filter invoices for historic presentation
  const validInvoices = faturas
    .filter((f) => {
      const matchClient = selectedClientId === 'all' || f.clientId === selectedClientId;
      const matchYear = f.referenceYear === selectedYear;
      return matchClient && matchYear && f.status !== 'cancelled';
    })
    .sort((a, b) => b.referenceMonth - a.referenceMonth);

  // Aggregate monthly values for bar charts
  const monthlyData = Array.from({ length: 12 }, (_, i) => {
    const mNum = i + 1;
    const invs = validInvoices.filter((f) => f.referenceMonth === mNum);
    const consumption = invs.reduce((sum, f) => sum + (f.consumptionKwh || 0), 0);
    const savings = invs.reduce((sum, f) => sum + (f.savingsAmount || 0), 0);
    const neoAmount = invs.reduce((sum, f) => sum + (f.neoAmount || 0), 0);
    const coelbaAmount = invs.reduce((sum, f) => sum + (f.coelbaEstimateAmount || 0), 0);

    return {
      monthNumber: mNum,
      monthName: getMonthName(mNum),
      consumption,
      savings,
      neoAmount,
      coelbaAmount,
    };
  });

  const maxConsumption = Math.max(...monthlyData.map((m) => m.consumption), 100);
  const totalYearConsumption = monthlyData.reduce((acc, m) => acc + m.consumption, 0);
  const totalYearSavings = monthlyData.reduce((acc, m) => acc + m.savings, 0);

  return (
    <div className="space-y-6">
      {/* Filter Header */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-700">Cliente:</span>
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="rounded-xl border border-gray-300 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-900 focus:border-emerald-600 focus:outline-none"
            >
              <option value="all">Visão Consolidada (Todos os Clientes)</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.clientCodeCoelba ? `(${c.clientCodeCoelba})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-700">Ano:</span>
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
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-bold">
          <span className="text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
            Consumo no Ano: {formatNumberBr(totalYearConsumption)} kWh
          </span>
          <span className="text-[#e97825] bg-orange-50 px-3 py-1.5 rounded-xl border border-orange-200">
            Economia no Ano: {formatCurrency(totalYearSavings)}
          </span>
        </div>
      </div>

      {/* Visual Chart of Monthly Evolution */}
      <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-xs">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
          <div>
            <h4 className="text-sm font-bold text-gray-900">Gráfico de Evolução do Consumo</h4>
            <p className="text-xs text-gray-500">
              {selectedClientId === 'all'
                ? 'Consumo mensal acumulado de todos os clientes'
                : clientes.find((c) => c.id === selectedClientId)?.name}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-2 items-end h-52 pt-6 px-2">
          {monthlyData.map((m) => {
            const heightPercent = maxConsumption > 0 ? (m.consumption / maxConsumption) * 100 : 0;
            return (
              <div key={m.monthNumber} className="flex flex-col items-center gap-1.5 h-full justify-end group">
                <div className="opacity-0 group-hover:opacity-100 text-[10px] font-bold text-gray-700 transition">
                  {m.consumption > 0 ? formatNumberBr(m.consumption) : ''}
                </div>
                <div
                  style={{ height: `${Math.max(6, heightPercent)}%` }}
                  className={`w-full rounded-t-xl transition-all ${
                    m.consumption > 0 ? 'bg-[#1b7a3e] group-hover:bg-emerald-600' : 'bg-gray-100'
                  }`}
                />
                <span className="text-[10px] font-bold text-gray-500 group-hover:text-emerald-800">
                  {m.monthName.slice(0, 3)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detailed Historic Table */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Mês/Ano</th>
                <th className="py-3 px-4">Cliente</th>
                <th className="py-3 px-4">Leitura Anterior</th>
                <th className="py-3 px-4">Leitura Atual</th>
                <th className="py-3 px-4">Consumo (kWh)</th>
                <th className="py-3 px-4">Valor Neo (R$)</th>
                <th className="py-3 px-4">Ref. Coelba (R$)</th>
                <th className="py-3 px-4">Economia (R$)</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Fatura</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {validInvoices.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-gray-400">
                    Nenhum registro histórico de consumo para o período selecionado.
                  </td>
                </tr>
              ) : (
                validInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50/60 transition">
                    <td className="py-3 px-4 font-bold text-gray-900">
                      {formatReferencePeriod(inv.referenceMonth, inv.referenceYear)}
                    </td>
                    <td className="py-3 px-4 font-medium text-gray-800">{inv.clientName}</td>
                    <td className="py-3 px-4 text-gray-600">{formatNumberBr(inv.previousReading)}</td>
                    <td className="py-3 px-4 font-bold text-gray-900">
                      {formatNumberBr(inv.currentReading)}
                    </td>
                    <td className="py-3 px-4 font-black text-emerald-800">
                      {formatNumberBr(inv.consumptionKwh)} kWh
                    </td>
                    <td className="py-3 px-4 font-bold text-gray-900">
                      {formatCurrency(inv.neoAmount)}
                    </td>
                    <td className="py-3 px-4 text-gray-600">
                      {formatCurrency(inv.coelbaEstimateAmount)}
                    </td>
                    <td className="py-3 px-4 font-black text-[#e97825]">
                      {formatCurrency(inv.savingsAmount)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          inv.status === 'paid'
                            ? 'bg-emerald-100 text-emerald-800'
                            : inv.status === 'overdue'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {inv.status === 'paid' ? 'Paga' : inv.status === 'overdue' ? 'Vencida' : 'Pendente'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => onOpenInvoiceModal(inv)}
                        className="text-xs font-bold text-emerald-700 hover:underline"
                      >
                        Visualizar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
