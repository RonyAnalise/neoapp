import React, { useState } from 'react';
import { Download, Printer, Search, X } from 'lucide-react';
import { Cliente, EmpresaConfig, Fatura, Leitura, Pagamento } from '../types';
import {
  formatCurrency,
  formatNumberBr,
  formatDateBr,
  formatReferencePeriod,
  getMonthName,
} from '../lib/calculations';

interface RelatoriosViewProps {
  clientes: Cliente[];
  faturas: Fatura[];
  leituras: Leitura[];
  pagamentos: Pagamento[];
  empresa?: EmpresaConfig;
}

export const RelatoriosView: React.FC<RelatoriosViewProps> = ({
  clientes,
  faturas,
  leituras: _leituras,
  pagamentos: _pagamentos,
  empresa,
}) => {
  const currentYear = new Date().getFullYear();

  const [reportType, setReportType] = useState<
    | 'faturas_geral'
    | 'faturas_pendentes'
    | 'faturas_pagas'
    | 'consumo_cliente'
    | 'comparativo_coelba'
    | 'clientes_status'
  >('faturas_geral');

  const [filterYear, setFilterYear] = useState(currentYear);
  const [filterMonth, setFilterMonth] = useState<number | 'all'>('all');
  const [filterCity, setFilterCity] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Helper para obter CPF / CNPJ do cliente
  const getClientCpfCnpj = (f: Fatura): string => {
    if (f.historicalClientData?.cpfCnpj) return f.historicalClientData.cpfCnpj;
    const c = clientes.find((cli) => cli.id === f.clientId);
    return c?.cpfCnpj || '-';
  };

  // Helper para obter Código do Cliente Coelba
  const getClientCodeCoelba = (f: Fatura): string => {
    if (f.historicalClientData?.clientCodeCoelba) return f.historicalClientData.clientCodeCoelba;
    const c = clientes.find((cli) => cli.id === f.clientId);
    return c?.clientCodeCoelba || '-';
  };

  // Helper para obter Cidade do cliente
  const getClientCity = (f: Fatura): string => {
    if (f.historicalClientData?.city) return f.historicalClientData.city;
    const c = clientes.find((cli) => cli.id === f.clientId);
    return c?.city || '-';
  };

  // Lista de cidades únicas cadastradas para filtro
  const uniqueCities = Array.from(
    new Set(
      [
        ...clientes.map((c) => c.city?.trim()),
        ...faturas.map((f) => f.historicalClientData?.city?.trim()),
      ].filter((city): city is string => Boolean(city && city.length > 0))
    )
  ).sort((a, b) => a.localeCompare(b));

  // Normalização para busca por texto e dígitos
  const cleanTerm = searchTerm.trim().toLowerCase();
  const termDigits = cleanTerm.replace(/\D/g, '');

  const matchesInvoiceSearch = (f: Fatura): boolean => {
    if (!cleanTerm) return true;
    const c = clientes.find((cli) => cli.id === f.clientId);

    const clientName = (f.clientName || c?.name || '').toLowerCase();
    const cpfCnpj = (f.historicalClientData?.cpfCnpj || c?.cpfCnpj || '').toLowerCase();
    const cpfCnpjDigits = cpfCnpj.replace(/\D/g, '');

    const clientCode = (f.historicalClientData?.clientCodeCoelba || c?.clientCodeCoelba || '').toLowerCase();
    const clientCodeDigits = clientCode.replace(/\D/g, '');

    const meter = (f.historicalClientData?.meterNumber || c?.meterNumber || f.invoiceNumber || '').toLowerCase();
    const meterDigits = meter.replace(/\D/g, '');

    const invoiceNum = (f.invoiceNumber || '').toLowerCase();

    return (
      clientName.includes(cleanTerm) ||
      cpfCnpj.includes(cleanTerm) ||
      (termDigits.length >= 3 && cpfCnpjDigits.includes(termDigits)) ||
      clientCode.includes(cleanTerm) ||
      (termDigits.length >= 3 && clientCodeDigits.includes(termDigits)) ||
      meter.includes(cleanTerm) ||
      (termDigits.length >= 3 && meterDigits.includes(termDigits)) ||
      invoiceNum.includes(cleanTerm)
    );
  };

  const matchesClientSearch = (c: Cliente): boolean => {
    if (!cleanTerm) return true;
    const name = (c.name || '').toLowerCase();
    const cpfCnpj = (c.cpfCnpj || '').toLowerCase();
    const cpfCnpjDigits = cpfCnpj.replace(/\D/g, '');
    const clientCode = (c.clientCodeCoelba || '').toLowerCase();
    const clientCodeDigits = clientCode.replace(/\D/g, '');
    const meter = (c.meterNumber || '').toLowerCase();
    const meterDigits = meter.replace(/\D/g, '');

    return (
      name.includes(cleanTerm) ||
      cpfCnpj.includes(cleanTerm) ||
      (termDigits.length >= 3 && cpfCnpjDigits.includes(termDigits)) ||
      clientCode.includes(cleanTerm) ||
      (termDigits.length >= 3 && clientCodeDigits.includes(termDigits)) ||
      meter.includes(cleanTerm) ||
      (termDigits.length >= 3 && meterDigits.includes(termDigits))
    );
  };

  // 1. REGRA: Faturas canceladas NUNCA entram no relatório
  const relevantInvoices = faturas.filter((f) => {
    if (f.status === 'cancelled') return false;

    const matchYear = f.referenceYear === filterYear;
    const matchMonth = filterMonth === 'all' || f.referenceMonth === filterMonth;
    if (!matchYear || !matchMonth) return false;

    if (filterCity !== 'all') {
      const city = getClientCity(f);
      if (city.toLowerCase() !== filterCity.toLowerCase()) return false;
    }

    if (reportType === 'faturas_pendentes') {
      if (f.status !== 'pending' && f.status !== 'overdue') return false;
    }
    if (reportType === 'faturas_pagas') {
      if (f.status !== 'paid') return false;
    }

    return matchesInvoiceSearch(f);
  });

  const relevantClients = clientes.filter((c) => {
    if (filterCity !== 'all') {
      const city = c.city || '';
      if (city.toLowerCase() !== filterCity.toLowerCase()) return false;
    }
    return matchesClientSearch(c);
  });

  // Totais consolidados da listagem
  const totalCount = relevantInvoices.length;
  const totalConsumo = relevantInvoices.reduce((s, f) => s + (f.consumptionKwh || 0), 0);
  const totalNeo = relevantInvoices.reduce((s, f) => s + (f.totalToPay || 0), 0);
  const totalCoelba = relevantInvoices.reduce((s, f) => s + (f.coelbaEstimateAmount || 0), 0);
  const totalEconomia = relevantInvoices.reduce((s, f) => s + (f.savingsAmount || 0), 0);

  const getReportTitle = (type: typeof reportType): string => {
    switch (type) {
      case 'faturas_geral':
        return 'Relatório de Faturas Emitidas (Geral)';
      case 'faturas_pendentes':
        return 'Relatório de Faturas Pendentes / Vencidas';
      case 'faturas_pagas':
        return 'Relatório de Faturas Pagas (Recebimentos)';
      case 'comparativo_coelba':
        return 'Relatório Comparativo Neo Energia vs Coelba';
      case 'consumo_cliente':
        return 'Relatório de Consumo e Economia por Cliente';
      case 'clientes_status':
        return 'Relatório de Cadastro de Clientes';
      default:
        return 'Relatório Financeiro';
    }
  };

  const exportCsv = () => {
    let headers: string[] = [];
    let rows: (string | number)[][] = [];

    if (reportType === 'clientes_status') {
      headers = ['ID', 'Nome', 'CPF/CNPJ', 'Cidade', 'Telefone', 'Cód Coelba', 'Medidor', 'Situação'];
      rows = relevantClients.map((c) => [
        c.id,
        `"${c.name}"`,
        c.cpfCnpj,
        `"${c.city || '-'}"`,
        c.phone || c.whatsapp || '',
        c.clientCodeCoelba || '',
        c.meterNumber || '',
        c.status === 'active' ? 'Ativo' : 'Inativo',
      ]);
      rows.push([
        'TOTAL',
        `"${relevantClients.length} clientes"`,
        '',
        '',
        `"${relevantClients.filter((c) => c.status === 'active').length} Ativos / ${relevantClients.filter((c) => c.status === 'inactive').length} Inativos"`,
        '',
        '',
        '',
      ]);
    } else {
      headers = [
        'Fatura',
        'Cliente',
        'CPF_CNPJ',
        'Cod_Coelba',
        'Cidade',
        'Competencia',
        'Consumo_kWh',
        'Valor_Neo_R$',
        'Economia_R$',
        'Vencimento',
        'Status',
      ];
      rows = relevantInvoices.map((f) => [
        f.invoiceNumber,
        `"${f.clientName || ''}"`,
        `"${getClientCpfCnpj(f)}"`,
        `"${getClientCodeCoelba(f)}"`,
        `"${getClientCity(f)}"`,
        `${f.referenceMonth}/${f.referenceYear}`,
        f.consumptionKwh,
        f.totalToPay,
        f.savingsAmount,
        f.dueDate,
        f.status === 'paid' ? 'Paga' : f.status === 'overdue' ? 'Vencida' : 'Pendente',
      ]);
      // Linha de total no final do CSV
      rows.push([
        'TOTAL GERAL',
        `"${totalCount} faturas"`,
        '',
        '',
        '',
        '',
        totalConsumo,
        totalNeo,
        totalEconomia,
        '',
        '',
      ]);
    }

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(';'), ...rows.map((e) => e.join(';'))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Relatorio_${reportType}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  const companyDisplayName =
    empresa?.name || empresa?.companyName || 'NEO ENERGIA SOLAR';

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Barra de Configuração, Filtros e Busca (oculta na impressão) */}
      <div className="no-print bg-white rounded-2xl p-4 sm:p-5 border border-gray-200/80 shadow-xs flex flex-col gap-4">
        {/* Linha de Busca Textual */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome, CPF/CNPJ ou código do cliente..."
              className="w-full rounded-xl border border-gray-300 bg-gray-50/70 pl-10 pr-10 py-2.5 text-xs text-gray-900 placeholder-gray-400 focus:bg-white focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 focus:outline-none transition shadow-2xs"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition p-0.5 rounded cursor-pointer"
                title="Limpar busca"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {searchTerm && (
            <div className="flex items-center gap-1.5 self-start sm:self-center">
              <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 flex items-center gap-2 whitespace-nowrap">
                <span>
                  {reportType === 'clientes_status' ? relevantClients.length : relevantInvoices.length}{' '}
                  {reportType === 'clientes_status'
                    ? relevantClients.length === 1
                      ? 'cliente'
                      : 'clientes'
                    : relevantInvoices.length === 1
                    ? 'fatura'
                    : 'faturas'}
                </span>
                <button
                  onClick={() => setSearchTerm('')}
                  className="hover:text-emerald-950 font-bold ml-1 text-sm leading-none cursor-pointer"
                  title="Remover filtro de busca"
                >
                  ×
                </button>
              </span>
            </div>
          )}
        </div>

        {/* Linha de Filtros de Competência, Tipo e Exportação */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 pt-2 border-t border-gray-100">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-700">Tipo de Relatório:</span>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value as any)}
                className="rounded-xl border border-gray-300 bg-gray-50 px-3 py-1.5 text-xs font-bold text-gray-900 focus:border-emerald-600 focus:outline-none"
              >
                <option value="faturas_geral">Faturas Emitidas (Geral)</option>
                <option value="faturas_pendentes">Faturas Pendentes / Vencidas</option>
                <option value="faturas_pagas">Faturas Pagas (Recebimentos)</option>
                <option value="comparativo_coelba">Comparativo Neo Energia vs Coelba</option>
                <option value="consumo_cliente">Consumo e Economia por Cliente</option>
                <option value="clientes_status">Listagem de Clientes (Ativos/Inativos)</option>
              </select>
            </div>

            {reportType !== 'clientes_status' && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-700">Mês:</span>
                  <select
                    value={filterMonth}
                    onChange={(e) =>
                      setFilterMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))
                    }
                    className="rounded-xl border border-gray-300 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-900"
                  >
                    <option value="all">Ano Completo</option>
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {getMonthName(i + 1)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-700">Ano:</span>
                  <select
                    value={filterYear}
                    onChange={(e) => setFilterYear(Number(e.target.value))}
                    className="rounded-xl border border-gray-300 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-900"
                  >
                    {[currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {uniqueCities.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-700">Cidade:</span>
                <select
                  value={filterCity}
                  onChange={(e) => setFilterCity(e.target.value)}
                  className="rounded-xl border border-gray-300 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-900"
                >
                  <option value="all">Todas as Cidades</option>
                  {uniqueCities.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 self-end lg:self-auto">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 transition shadow-xs cursor-pointer"
            >
              <Printer className="w-4 h-4 text-gray-600" />
              <span>Imprimir Relatório</span>
            </button>
            <button
              onClick={exportCsv}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 transition shadow-xs cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Exportar CSV</span>
            </button>
          </div>
        </div>
      </div>

      {/* Cabeçalho do Relatório para Impressão e Visualização */}
      <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-xs print:border-b-2 print:border-gray-800 print:shadow-none print:p-0 print:rounded-none">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              {empresa?.logoUrl && (
                <img
                  src={empresa.logoUrl}
                  alt={companyDisplayName}
                  className="h-10 w-auto object-contain max-w-[120px]"
                />
              )}
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-gray-900 uppercase tracking-tight">
                  {companyDisplayName}
                </h1>
                {empresa?.companyName && empresa.companyName !== empresa.name && (
                  <p className="text-xs text-gray-500 font-medium">{empresa.companyName}</p>
                )}
                {empresa?.cnpj && (
                  <p className="text-xs text-gray-600 font-mono">CNPJ: {empresa.cnpj}</p>
                )}
              </div>
            </div>
          </div>

          <div className="sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 w-full sm:w-auto">
            <h2 className="text-sm sm:text-base font-bold text-emerald-900 uppercase tracking-wide">
              {getReportTitle(reportType)}
            </h2>
            {reportType !== 'clientes_status' && (
              <p className="text-xs text-gray-600 font-semibold mt-0.5">
                Competência:{' '}
                {filterMonth === 'all'
                  ? `Ano ${filterYear}`
                  : `${getMonthName(filterMonth)} / ${filterYear}`}
              </p>
            )}
            {filterCity !== 'all' && (
              <p className="text-xs text-emerald-800 font-semibold mt-0.5">
                Cidade: {filterCity}
              </p>
            )}
            {searchTerm && (
              <p className="text-xs text-emerald-800 font-semibold mt-0.5">
                Busca: "{searchTerm}"
              </p>
            )}
            <p className="text-[11px] text-gray-400 print:text-gray-600 mt-0.5">
              Emitido em: {new Date().toLocaleDateString('pt-BR')} às{' '}
              {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
      </div>

      {/* Summary KPI Pills (hidden on print or compact) */}
      {reportType !== 'clientes_status' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 print:grid-cols-4">
          <div className="bg-white rounded-2xl p-4 border border-gray-200 print:p-2 print:border-gray-300">
            <span className="text-[10px] font-bold text-gray-500 uppercase block">Faturas</span>
            <h4 className="text-lg sm:text-xl font-black text-gray-900 mt-0.5">{totalCount}</h4>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-gray-200 print:p-2 print:border-gray-300">
            <span className="text-[10px] font-bold text-gray-500 uppercase block">Total Consumo</span>
            <h4 className="text-lg sm:text-xl font-black text-emerald-800 mt-0.5">
              {formatNumberBr(totalConsumo)} kWh
            </h4>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-gray-200 print:p-2 print:border-gray-300">
            <span className="text-[10px] font-bold text-gray-500 uppercase block">Total Neo Energia</span>
            <h4 className="text-lg sm:text-xl font-black text-emerald-700 mt-0.5">
              {formatCurrency(totalNeo)}
            </h4>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-gray-200 print:p-2 print:border-gray-300">
            <span className="text-[10px] font-bold text-gray-500 uppercase block">Economia Total</span>
            <h4 className="text-lg sm:text-xl font-black text-orange-600 mt-0.5">
              {formatCurrency(totalEconomia)}
            </h4>
          </div>
        </div>
      )}

      {/* Report Data Table */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden print:border print:border-gray-300 print:shadow-none print:rounded-none">
        {reportType === 'clientes_status' ? (
          <div className="overflow-x-auto lg:overflow-x-visible">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-[10px] tracking-wider print:bg-gray-100">
                <tr>
                  <th className="py-2.5 px-3">Nome do Cliente</th>
                  <th className="py-2.5 px-2">CPF / CNPJ</th>
                  <th className="py-2.5 px-2">Cód. Coelba</th>
                  <th className="py-2.5 px-2">Medidor</th>
                  <th className="py-2.5 px-2">Cidade</th>
                  <th className="py-2.5 px-2">Telefone</th>
                  <th className="py-2.5 px-3 text-center">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {relevantClients.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-400">
                      {searchTerm
                        ? `Nenhum cliente encontrado para a busca "${searchTerm}".`
                        : 'Nenhum cliente cadastrado com os filtros selecionados.'}
                    </td>
                  </tr>
                ) : (
                  relevantClients.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50/60 print:hover:bg-transparent">
                      <td className="py-2 px-3 font-bold text-gray-900">{c.name}</td>
                      <td className="py-2 px-2 font-mono font-medium">{c.cpfCnpj}</td>
                      <td className="py-2 px-2 font-mono font-semibold text-emerald-800">
                        {c.clientCodeCoelba || '-'}
                      </td>
                      <td className="py-2 px-2 font-mono text-gray-600">
                        {c.meterNumber || '-'}
                      </td>
                      <td className="py-2 px-2 text-gray-700">
                        {c.city ? `${c.city}${c.state ? ` - ${c.state}` : ''}` : '-'}
                      </td>
                      <td className="py-2 px-2">{c.whatsapp || c.phone || '-'}</td>
                      <td className="py-2 px-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            c.status === 'active'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-gray-200 text-gray-600'
                          }`}
                        >
                          {c.status === 'active' ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="bg-gray-100 font-bold border-t-2 border-gray-300 text-gray-900 print:bg-gray-50">
                <tr>
                  <td className="py-2.5 px-3 font-black uppercase" colSpan={3}>
                    TOTAL DE CLIENTES: {relevantClients.length}
                  </td>
                  <td className="py-2.5 px-2" colSpan={4}>
                    {relevantClients.filter((c) => c.status === 'active').length} Ativos /{' '}
                    {relevantClients.filter((c) => c.status === 'inactive').length} Inativos
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto lg:overflow-x-visible">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-[10px] tracking-wider print:bg-gray-100">
                <tr>
                  <th className="py-2.5 px-3">Cliente</th>
                  <th className="py-2.5 px-2">Cód. Coelba</th>
                  <th className="py-2.5 px-2">Cidade</th>
                  <th className="py-2.5 px-2 text-center">Competência</th>
                  <th className="py-2.5 px-2 text-right">Consumo</th>
                  <th className="py-2.5 px-2 text-right">Neo Energia</th>
                  <th className="py-2.5 px-2 text-right">Economia</th>
                  <th className="py-2.5 px-2 text-center">Vencimento</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {relevantInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-gray-400">
                      {searchTerm
                        ? `Nenhum registro encontrado para a busca "${searchTerm}" com os filtros atuais.`
                        : 'Nenhum registro encontrado para este relatório (faturas canceladas são excluídas).'}
                    </td>
                  </tr>
                ) : (
                  relevantInvoices.map((f) => (
                    <tr key={f.id} className="hover:bg-gray-50/60 print:hover:bg-transparent">
                      <td className="py-2 px-3 font-bold text-gray-900">
                        {f.clientName}
                      </td>
                      <td className="py-2 px-2 font-mono font-semibold text-emerald-800 whitespace-nowrap">
                        {getClientCodeCoelba(f)}
                      </td>
                      <td className="py-2 px-2 text-gray-700 whitespace-nowrap">
                        {getClientCity(f)}
                      </td>
                      <td className="py-2 px-2 text-center font-medium whitespace-nowrap">
                        {formatReferencePeriod(f.referenceMonth, f.referenceYear)}
                      </td>
                      <td className="py-2 px-2 text-right whitespace-nowrap">
                        {formatNumberBr(f.consumptionKwh)} kWh
                      </td>
                      <td className="py-2 px-2 text-right font-bold text-emerald-800 whitespace-nowrap">
                        {formatCurrency(f.totalToPay)}
                      </td>
                      <td className="py-2 px-2 text-right font-bold text-orange-600 whitespace-nowrap">
                        {formatCurrency(f.savingsAmount)}
                      </td>
                      <td className="py-2 px-2 text-center text-gray-600 whitespace-nowrap">
                        {formatDateBr(f.dueDate)}
                      </td>
                      <td className="py-2 px-3 text-center whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            f.status === 'paid'
                              ? 'bg-emerald-100 text-emerald-800'
                              : f.status === 'overdue'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {f.status === 'paid'
                            ? 'Paga'
                            : f.status === 'overdue'
                            ? 'Vencida'
                            : 'Pendente'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>

              {/* Total no final da listagem */}
              {relevantInvoices.length > 0 && (
                <tfoot className="bg-gray-100 font-bold border-t-2 border-gray-300 text-gray-900 print:bg-gray-50">
                  <tr>
                    <td className="py-2.5 px-3 font-black uppercase text-gray-900" colSpan={4}>
                      TOTAL GERAL ({totalCount} {totalCount === 1 ? 'fatura' : 'faturas'})
                    </td>
                    <td className="py-2.5 px-2 text-right font-black text-gray-900 whitespace-nowrap">
                      {formatNumberBr(totalConsumo)} kWh
                    </td>
                    <td className="py-2.5 px-2 text-right font-black text-emerald-800 whitespace-nowrap">
                      {formatCurrency(totalNeo)}
                    </td>
                    <td className="py-2.5 px-2 text-right font-black text-orange-600 whitespace-nowrap">
                      {formatCurrency(totalEconomia)}
                    </td>
                    <td className="py-2.5 px-2 text-center text-gray-400" colSpan={2}>
                      -
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
