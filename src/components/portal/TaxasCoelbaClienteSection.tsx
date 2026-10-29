import React, { useState, useMemo } from 'react';
import {
  FileCheck2,
  Search,
  Calendar,
  DollarSign,
  Download,
  Eye,
  CheckCircle2,
  X,
  FileImage,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Building,
  ShieldCheck,
  Info,
  Layers,
} from 'lucide-react';
import { Cliente, EmpresaConfig, TaxaCoelba } from '../../types';
import { formatCurrency, formatDateBr } from '../../lib/calculations';

interface TaxasCoelbaClienteSectionProps {
  linkedClients: Cliente[];
  selectedMeterId: string;
  onSelectMeterId: (id: string) => void;
  taxasCoelba?: TaxaCoelba[];
  empresa: EmpresaConfig;
}

export const TaxasCoelbaClienteSection: React.FC<TaxasCoelbaClienteSectionProps> = ({
  linkedClients,
  selectedMeterId,
  onSelectMeterId,
  taxasCoelba = [],
  empresa,
}) => {
  // Busca e Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [periodFilter, setPeriodFilter] = useState<'all' | 'current_year' | 'current_month'>('all');
  const [viewingTaxa, setViewingTaxa] = useState<TaxaCoelba | null>(null);

  // Estados do visualizador de imagem (Zoom e Rotação)
  const [zoomLevel, setZoomLevel] = useState(1);
  const [rotation, setRotation] = useState(0);

  // Códigos e IDs dos clientes vinculados
  const activeClient = useMemo(() => {
    if (selectedMeterId !== 'all') {
      return linkedClients.find((c) => c.id === selectedMeterId) || linkedClients[0];
    }
    return null;
  }, [linkedClients, selectedMeterId]);

  // Filtra as taxas da Coelba pertencentes a este cliente ou medidores vinculados
  const clientTaxas = useMemo(() => {
    const linkedCodes = linkedClients.map((c) => (c.clientCodeCoelba || '').trim()).filter(Boolean);
    const linkedUnits = linkedClients.map((c) => (c.consumerUnit || '').trim()).filter(Boolean);
    const linkedIds = activeClient ? [activeClient.id] : linkedClients.map((c) => c.id);

    return taxasCoelba
      .filter((t) => {
        // Se um medidor específico está selecionado
        if (activeClient) {
          const matchId = t.clientId === activeClient.id;
          const matchCode =
            activeClient.clientCodeCoelba &&
            t.clientCodeCoelba &&
            t.clientCodeCoelba.trim() === activeClient.clientCodeCoelba.trim();
          return matchId || matchCode;
        }

        // Se 'all' está selecionado, busca por todos os medidores vinculados ao cliente
        const matchId = linkedIds.includes(t.clientId);
        const matchCode =
          t.clientCodeCoelba && linkedCodes.includes(t.clientCodeCoelba.trim());
        return matchId || matchCode;
      })
      .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
  }, [taxasCoelba, linkedClients, activeClient]);

  // Aplica filtros de texto e período
  const filteredTaxas = useMemo(() => {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;

    return clientTaxas.filter((taxa) => {
      // Filtro de período
      if (periodFilter === 'current_year') {
        const taxaYear = new Date(taxa.data).getFullYear();
        if (taxaYear !== curYear) return false;
      } else if (periodFilter === 'current_month') {
        const d = new Date(taxa.data);
        if (d.getFullYear() !== curYear || d.getMonth() + 1 !== curMonth) return false;
      }

      // Filtro de busca textual
      if (searchTerm.trim() !== '') {
        const term = searchTerm.toLowerCase();
        const descMatch = (taxa.descricao || '').toLowerCase().includes(term);
        const codeMatch = (taxa.clientCodeCoelba || '').toLowerCase().includes(term);
        const cliMatch = (taxa.clientName || '').toLowerCase().includes(term);
        return descMatch || codeMatch || cliMatch;
      }

      return true;
    });
  }, [clientTaxas, periodFilter, searchTerm]);

  // Total acumulado de taxas pagas pela Neo para este cliente
  const totalPaidByNeo = useMemo(() => {
    return clientTaxas.reduce((acc, t) => acc + (t.valor || 0), 0);
  }, [clientTaxas]);

  // Total do ano vigente
  const currentYearTotal = useMemo(() => {
    const curYear = new Date().getFullYear();
    return clientTaxas
      .filter((t) => new Date(t.data).getFullYear() === curYear)
      .reduce((acc, t) => acc + (t.valor || 0), 0);
  }, [clientTaxas]);

  // Download do comprovante
  const handleDownloadComprovante = (taxa: TaxaCoelba) => {
    if (!taxa.comprovanteBase64) return;
    const link = document.createElement('a');
    link.href = taxa.comprovanteBase64;
    link.download =
      taxa.comprovanteFileName ||
      `Comprovante_Coelba_${taxa.data}_${taxa.clientCodeCoelba || 'Taxa'}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenViewer = (taxa: TaxaCoelba) => {
    setViewingTaxa(taxa);
    setZoomLevel(1);
    setRotation(0);
  };

  return (
    <div className="space-y-6">
      {/* Seletor de Medidor se houver mais de uma UC */}
      {linkedClients.length > 1 && (
        <div className="bg-white rounded-2xl p-4 border border-emerald-200 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-700" />
            <span className="text-xs font-bold text-gray-700 uppercase">
              Filtrar Taxas por Medidor:
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onSelectMeterId('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                selectedMeterId === 'all'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <span>Todos os Medidores ({clientTaxas.length})</span>
            </button>
            {linkedClients.map((c) => {
              const isSelected = selectedMeterId === c.id;
              const count = taxasCoelba.filter(
                (t) =>
                  t.clientId === c.id ||
                  (c.clientCodeCoelba && t.clientCodeCoelba === c.clientCodeCoelba)
              ).length;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelectMeterId(c.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <span>{c.name}</span>
                  <span className="ml-1 text-[11px] opacity-80">({count})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Banner Superior Institucional */}
      <div className="rounded-2xl p-6 bg-gradient-to-r from-[#0c3319] via-[#145a2b] to-[#0c3319] text-white shadow-md relative overflow-hidden">
        <div className="relative z-10 max-w-3xl">
          <div className="flex items-center gap-2">
            <span className="bg-yellow-400 text-emerald-950 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 shadow-xs">
              <ShieldCheck className="w-3 h-3 text-emerald-950" />
              Transparência Total Neo Energia
            </span>
            <span className="text-xs text-emerald-200 font-semibold">
              Concessionária Coelba
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black mt-2">
            Histórico de Taxas da Coelba Quitadas pela Neo Energia
          </h2>
          <p className="text-xs sm:text-sm text-emerald-100/90 mt-1.5 leading-relaxed">
            Para sua total comodidade e economia, a {empresa.companyName || 'Neo Energia Carnaúbanos'}{' '}
            realiza o pagamento e quitação direta das taxas obrigatórias da concessionária Coelba
            (como CIP - Iluminação Pública, taxas de disponibilidade e demanda) referentes ao consumo
            da sua unidade consumidora. Abaixo estão todos os comprovantes oficiais autenticados.
          </p>
        </div>
      </div>

      {/* Cards de Resumo Financeiro das Taxas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase">
              Total Pago pela Neo Energia
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-sm">
              R$
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-800 mt-2">
            {formatCurrency(totalPaidByNeo)}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            Valor acumulado de taxas da concessionária quitadas pela Neo para este cliente.
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase">
              Quitado no Ano Vigente ({new Date().getFullYear()})
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-gray-900 mt-2">
            {formatCurrency(currentYearTotal)}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            Total quitado pela Neo durante o ano atual.
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase">
              Comprovantes Autenticados
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
              <FileCheck2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-gray-900 mt-2">
            {clientTaxas.length} Recibos
          </div>
          <p className="text-[11px] text-emerald-700 font-semibold mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            100% quitados com autenticação bancária
          </p>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por descrição da taxa ou código Coelba..."
            className="w-full pl-9 pr-4 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPeriodFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              periodFilter === 'all'
                ? 'bg-emerald-700 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Todas ({clientTaxas.length})
          </button>
          <button
            type="button"
            onClick={() => setPeriodFilter('current_year')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              periodFilter === 'current_year'
                ? 'bg-emerald-700 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Ano Atual
          </button>
          <button
            type="button"
            onClick={() => setPeriodFilter('current_month')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              periodFilter === 'current_month'
                ? 'bg-emerald-700 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Mês Atual
          </button>
        </div>
      </div>

      {/* Listagem de Comprovantes de Taxas Coelba */}
      {filteredTaxas.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 border border-gray-200 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-3">
            <FileCheck2 className="w-7 h-7" />
          </div>
          <h3 className="text-base font-black text-gray-800">Nenhuma taxa encontrada</h3>
          <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
            Assim que a administração da Neo Energia realizar o upload e quitação de novas taxas da
            Coelba para sua unidade consumidora, elas ficarão disponíveis aqui com seus comprovantes.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTaxas.map((taxa) => (
            <div
              key={taxa.id}
              className="bg-white rounded-2xl border border-gray-200 hover:border-emerald-300 p-4 shadow-2xs hover:shadow-md transition flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span className="text-[11px] font-black text-gray-500 uppercase tracking-wide">
                      {formatDateBr(taxa.data)}
                    </span>
                  </div>
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full uppercase flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Quitada pela Neo
                  </span>
                </div>

                <h4 className="text-sm font-black text-gray-900 mt-2 line-clamp-2">
                  {taxa.descricao || 'Taxa da Concessionária Coelba'}
                </h4>

                <div className="mt-3 p-3 rounded-xl bg-gray-50 border border-gray-100 space-y-1.5 text-xs">
                  <div className="flex justify-between items-baseline">
                    <span className="text-gray-500 font-medium">Valor Quitado:</span>
                    <span className="text-base font-black text-emerald-800">
                      {formatCurrency(taxa.valor || 0)}
                    </span>
                  </div>
                  {taxa.clientCodeCoelba && (
                    <div className="flex justify-between text-[11px]">
                      <span className="text-gray-500">Código Coelba:</span>
                      <strong className="text-gray-800">{taxa.clientCodeCoelba}</strong>
                    </div>
                  )}
                  {taxa.clientName && (
                    <div className="flex justify-between text-[11px]">
                      <span className="text-gray-500">Unidade:</span>
                      <span className="text-gray-700 truncate max-w-[160px]">{taxa.clientName}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Botões de Ação para o Comprovante */}
              <div className="mt-4 pt-3 border-t border-gray-100 flex gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenViewer(taxa)}
                  className="flex-1 py-2 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Ver Comprovante</span>
                </button>
                {taxa.comprovanteBase64 && (
                  <button
                    type="button"
                    onClick={() => handleDownloadComprovante(taxa)}
                    title="Baixar Comprovante"
                    className="p-2 rounded-xl border border-gray-300 hover:bg-gray-50 text-gray-700 transition cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Visualizador de Imagem / Comprovante */}
      {viewingTaxa && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
            {/* Header do Modal */}
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <div>
                <div className="flex items-center gap-2">
                  <span className="bg-emerald-700 text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                    Comprovante Coelba Quitado
                  </span>
                  <span className="text-xs text-gray-500">{formatDateBr(viewingTaxa.data)}</span>
                </div>
                <h3 className="text-base font-black text-gray-900 mt-1">
                  {viewingTaxa.descricao || 'Comprovante da Concessionária'} •{' '}
                  <span className="text-emerald-800">{formatCurrency(viewingTaxa.valor || 0)}</span>
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setViewingTaxa(null)}
                className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Imagem do Comprovante com Zoom e Rotação */}
            <div className="flex-1 overflow-auto bg-gray-950 p-4 flex items-center justify-center min-h-[350px]">
              {viewingTaxa.comprovanteBase64 ? (
                <div
                  className="transition-transform duration-200"
                  style={{
                    transform: `scale(${zoomLevel}) rotate(${rotation}deg)`,
                  }}
                >
                  <img
                    src={viewingTaxa.comprovanteBase64}
                    alt={viewingTaxa.descricao}
                    className="max-h-[60vh] max-w-full rounded-lg shadow-lg object-contain"
                  />
                </div>
              ) : (
                <div className="text-center text-gray-400 p-8">
                  <FileImage className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-semibold">Comprovante em arquivo não anexado</p>
                </div>
              )}
            </div>

            {/* Controles de Zoom, Rotação e Download */}
            <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.min(2.5, z + 0.25))}
                  className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-100 text-gray-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
                  title="Ampliar Imagem"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.max(0.75, z - 0.25))}
                  className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-100 text-gray-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
                  title="Reduzir Imagem"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-100 text-gray-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
                  title="Girar Imagem"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                {viewingTaxa.comprovanteBase64 && (
                  <button
                    type="button"
                    onClick={() => handleDownloadComprovante(viewingTaxa)}
                    className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                  >
                    <Download className="w-4 h-4" />
                    <span>Baixar Comprovante</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setViewingTaxa(null)}
                  className="px-4 py-2 rounded-xl border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 font-bold text-xs transition cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
