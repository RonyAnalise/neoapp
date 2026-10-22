import React, { useState, useMemo } from 'react';
import {
  Zap,
  TrendingDown,
  DollarSign,
  Download,
  FileText,
  Calendar,
  CheckCircle2,
  Clock,
  Building,
  User,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  LogOut,
  ChevronDown,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Copy,
  Check,
  Filter,
  Sparkles,
  Layers,
  Receipt,
  FileCheck2,
} from 'lucide-react';
import { Cliente, EmpresaConfig, Fatura, Leitura } from '../types';
import {
  formatCurrency,
  formatNumberBr,
  formatDateBr,
  formatReferencePeriod,
  MONTH_NAMES_BR,
} from '../lib/calculations';
import { downloadBoletoFile, openBoletoInNewTab } from '../lib/boletoService';
import { useAuth } from '../hooks/useAuth';

interface PortalClienteViewProps {
  clientes: Cliente[];
  faturas: Fatura[];
  leituras: Leitura[];
  empresa: EmpresaConfig;
  onOpenInvoiceModal: (fatura: Fatura) => void;
  overrideClientId?: string;
  onBackToAdmin?: () => void;
}

export const PortalClienteView: React.FC<PortalClienteViewProps> = ({
  clientes,
  faturas,
  leituras,
  empresa,
  onOpenInvoiceModal,
  overrideClientId,
  onBackToAdmin,
}) => {
  const { currentUser, userProfile, logout, isAdmin, isOperator } = useAuth();
  const [activeTab, setActiveTab] = useState<'faturas' | 'economia' | 'cadastro'>('faturas');
  const [faturaFilter, setFaturaFilter] = useState<'todas' | 'pendentes' | 'pagas'>('todas');
  const [copiedPixId, setCopiedPixId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // 1. Identifica todos os medidores/clientes vinculados ao mesmo e-mail ou CPF
  const userEmail = (userProfile?.email || currentUser?.email || '').trim().toLowerCase();
  const userCpf = (userProfile?.clientCpf || '').replace(/\D/g, '');

  const linkedClients = useMemo(() => {
    // Se o operador/admin está simulando visualização de um cliente específico
    if (overrideClientId) {
      const selected = clientes.find((c) => c.id === overrideClientId);
      if (selected) {
        const selEmail = (selected.email || '').trim().toLowerCase();
        const selCpf = (selected.cpfCnpj || '').replace(/\D/g, '');
        return clientes.filter((c) => {
          const cEmail = (c.email || '').trim().toLowerCase();
          const cCpf = (c.cpfCnpj || '').replace(/\D/g, '');
          return (
            c.id === selected.id ||
            (selEmail && cEmail && cEmail === selEmail) ||
            (selCpf && cCpf && cCpf === selCpf)
          );
        });
      }
    }

    // Busca pelos dados do usuário autenticado
    const matches = clientes.filter((c) => {
      const cEmail = (c.email || '').trim().toLowerCase();
      const cCpf = (c.cpfCnpj || '').replace(/\D/g, '');
      const idMatch = userProfile?.clientId && c.id === userProfile.clientId;
      const emailMatch = userEmail && cEmail && cEmail === userEmail;
      const cpfMatch = userCpf && cCpf && cCpf === userCpf;
      return idMatch || emailMatch || cpfMatch;
    });

    if (matches.length > 0) return matches;

    // Se nenhum match direto for encontrado (ex: admin visualizando sem override), exibe o primeiro cliente como exemplo
    return clientes.slice(0, 1);
  }, [clientes, userEmail, userCpf, userProfile, overrideClientId]);

  // Estado do medidor selecionado ('all' para todos consolidados, ou ID específico)
  const [selectedMeterId, setSelectedMeterId] = useState<string>('all');

  // Cliente principal de referência para dados de cabeçalho
  const primaryClient = linkedClients[0] || {
    id: 'exemplo',
    name: 'Cliente Neo Energia',
    cpfCnpj: '000.000.000-00',
    email: userEmail || 'cliente@exemplo.com',
    phone: '',
    whatsapp: '',
    city: empresa.city || 'Ibicaraí',
    state: empresa.state || 'BA',
    address: 'Endereço do Consumidor',
    number: '',
    neighborhood: '',
    cep: '',
    clientCodeCoelba: '7092185421',
    status: 'active',
    createdAt: new Date().toISOString(),
  };

  // IDs dos clientes ativos no filtro de medidores
  const activeClientIds = useMemo(() => {
    if (selectedMeterId === 'all') {
      return linkedClients.map((c) => c.id);
    }
    return [selectedMeterId];
  }, [selectedMeterId, linkedClients]);

  // Faturas filtradas pelos medidores selecionados
  const clientFaturas = useMemo(() => {
    return faturas
      .filter((f) => activeClientIds.includes(f.clientId))
      .sort((a, b) => {
        // Ordena por ano decrescente e mês decrescente
        if (b.referenceYear !== a.referenceYear) {
          return b.referenceYear - a.referenceYear;
        }
        return b.referenceMonth - a.referenceMonth;
      });
  }, [faturas, activeClientIds]);

  // Faturas separadas por status
  const pendingFaturas = useMemo(() => {
    return clientFaturas.filter((f) => f.status === 'pending' || f.status === 'overdue');
  }, [clientFaturas]);

  const paidFaturas = useMemo(() => {
    return clientFaturas.filter((f) => f.status === 'paid');
  }, [clientFaturas]);

  const displayFaturas = useMemo(() => {
    if (faturaFilter === 'pendentes') return pendingFaturas;
    if (faturaFilter === 'pagas') return paidFaturas;
    return clientFaturas;
  }, [faturaFilter, pendingFaturas, paidFaturas, clientFaturas]);

  // 2. Cálculos de Economia em Dinheiro (Mensal e Anual)
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // Economia no mês mais recente disponível
  const latestFatura = clientFaturas[0];
  const savingsThisMonth = latestFatura ? latestFatura.savingsAmount : 0;
  const neoTotalMonth = latestFatura ? latestFatura.totalToPay : 0;
  const coelbaTotalMonth = latestFatura ? latestFatura.coelbaEstimateAmount : 0;

  // Economia acumulada no ano corrente (em dinheiro R$)
  const annualSavingsTotal = useMemo(() => {
    return clientFaturas
      .filter((f) => f.referenceYear === currentYear)
      .reduce((acc, f) => acc + (f.savingsAmount || 0), 0);
  }, [clientFaturas, currentYear]);

  // Economia acumulada de todos os tempos (em dinheiro R$)
  const allTimeSavingsTotal = useMemo(() => {
    return clientFaturas.reduce((acc, f) => acc + (f.savingsAmount || 0), 0);
  }, [clientFaturas]);

  // Consumo anual em kWh
  const annualKwhTotal = useMemo(() => {
    return clientFaturas
      .filter((f) => f.referenceYear === currentYear)
      .reduce((acc, f) => acc + (f.consumptionKwh || 0), 0);
  }, [clientFaturas, currentYear]);

  // Total pago com Neo Energia no ano
  const annualNeoPaidTotal = useMemo(() => {
    return clientFaturas
      .filter((f) => f.referenceYear === currentYear)
      .reduce((acc, f) => acc + (f.totalToPay || 0), 0);
  }, [clientFaturas, currentYear]);

  // Total que pagaria na Coelba no ano
  const annualCoelbaEstimateTotal = useMemo(() => {
    return clientFaturas
      .filter((f) => f.referenceYear === currentYear)
      .reduce((acc, f) => acc + (f.coelbaEstimateAmount || 0), 0);
  }, [clientFaturas, currentYear]);

  // Download do boleto bancário (disponível exclusivamente se tiver arquivo anexado)
  const handleDownloadBoleto = (fat: Fatura) => {
    setDownloadError(null);
    try {
      if (fat.boletoBase64) {
        const fileName =
          fat.boletoFileName ||
          `Boleto_NeoEnergia_${String(fat.referenceMonth).padStart(2, '0')}_${fat.referenceYear}.pdf`;
        downloadBoletoFile(fat.boletoBase64, fileName);
      } else {
        // Se não tiver boleto em PDF anexado (ou após ser excluído), não baixa nada e orienta a ver a fatura
        setDownloadError(
          'Esta fatura não possui boleto bancário anexado para download. Você pode visualizar a fatura oficial.'
        );
        setTimeout(() => setDownloadError(null), 5000);
      }
    } catch (err) {
      console.error('Erro ao baixar boleto:', err);
      setDownloadError('Não foi possível fazer o download do boleto bancário no momento.');
      setTimeout(() => setDownloadError(null), 5000);
    }
  };

  const handleCopyPix = (fat: Fatura) => {
    const pixCode =
      empresa.paymentInstructions ||
      `Chave PIX: ${empresa.cnpj || '52.184.920/0001-44'} - Neo Energia Carnaúbanos • Fatura: ${fat.invoiceNumber}`;
    navigator.clipboard.writeText(pixCode);
    setCopiedPixId(fat.id);
    setTimeout(() => setCopiedPixId(null), 3000);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-900">
      {/* Top Header do Portal */}
      <header className="bg-gradient-to-r from-[#0c3319] via-[#145a2b] to-[#0c3319] text-white shadow-lg border-b border-emerald-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            {/* Logo & Título */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-green-400 flex items-center justify-center text-white shadow-md">
                <Zap className="w-7 h-7 fill-current text-yellow-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-black tracking-tight">
                    Portal do <span className="text-emerald-300">Cliente</span>
                  </h1>
                  <span className="bg-emerald-800/90 text-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-600">
                    Neo Energia Solar
                  </span>
                </div>
                <p className="text-xs text-emerald-100 font-medium">
                  Olá, <strong>{primaryClient.name}</strong> • CPF: {primaryClient.cpfCnpj}
                </p>
              </div>
            </div>

            {/* Ações Topo: Voltar ao Admin (se aplicável) e Logout */}
            <div className="flex items-center gap-2 self-end sm:self-auto">
              {(isAdmin || isOperator) && onBackToAdmin && (
                <button
                  type="button"
                  onClick={onBackToAdmin}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white transition border border-white/20 cursor-pointer"
                  title="Retornar para o painel de gestão da empresa"
                >
                  <Building className="w-3.5 h-3.5 text-yellow-300" />
                  <span>Voltar à Gestão</span>
                </button>
              )}

              <button
                type="button"
                onClick={logout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-xs font-bold text-white transition cursor-pointer shadow-xs"
                title="Sair do portal"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sair</span>
              </button>
            </div>
          </div>

          {/* BARRA DE SELEÇÃO DE MEDIDORES / UCs (Requisito fundamental do usuário) */}
          <div className="mt-4 pt-3 border-t border-emerald-700/60 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-300 shrink-0" />
              <span className="text-xs font-extrabold uppercase tracking-wide text-emerald-100">
                Escolha o Medidor para Acompanhar:
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              {/* Opção Consolidada: Todos os Medidores */}
              <button
                type="button"
                onClick={() => setSelectedMeterId('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  selectedMeterId === 'all'
                    ? 'bg-yellow-400 text-emerald-950 shadow-md font-black ring-2 ring-white/50'
                    : 'bg-emerald-800/80 hover:bg-emerald-800 text-emerald-100 border border-emerald-700'
                }`}
              >
                <span>⚡ Todos os Medidores</span>
                <span className="text-[10px] bg-black/15 px-1.5 py-0.2 rounded-full">
                  {linkedClients.length} UCs
                </span>
              </button>

              {/* Botões individuais para cada medidor cadastrado */}
              {linkedClients.map((client) => {
                const isSelected = selectedMeterId === client.id;
                const meterDisplay = client.meterNumber || client.consumerUnit || client.clientCodeCoelba;
                return (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => setSelectedMeterId(client.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-yellow-400 text-emerald-950 shadow-md font-black ring-2 ring-white/50'
                        : 'bg-emerald-800/80 hover:bg-emerald-800 text-emerald-100 border border-emerald-700'
                    }`}
                  >
                    <span>Medidor {meterDisplay}</span>
                    {client.address && (
                      <span className="text-[10px] opacity-75 max-w-[120px] truncate hidden sm:inline">
                        • {client.address}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </header>

      {/* Navegação Principal em Abas */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex gap-2 sm:gap-6 overflow-x-auto py-2">
            <button
              type="button"
              onClick={() => setActiveTab('faturas')}
              className={`flex items-center gap-2 py-2 px-3 sm:px-4 rounded-xl text-xs sm:text-sm font-black transition cursor-pointer shrink-0 ${
                activeTab === 'faturas'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <Receipt className="w-4 h-4" />
              <span>Minhas Faturas & Boletos</span>
              {pendingFaturas.length > 0 && (
                <span className="bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full">
                  {pendingFaturas.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('economia')}
              className={`flex items-center gap-2 py-2 px-3 sm:px-4 rounded-xl text-xs sm:text-sm font-black transition cursor-pointer shrink-0 ${
                activeTab === 'economia'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <DollarSign className="w-4 h-4 text-yellow-500" />
              <span>Minha Economia em Dinheiro (R$)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('cadastro')}
              className={`flex items-center gap-2 py-2 px-3 sm:px-4 rounded-xl text-xs sm:text-sm font-black transition cursor-pointer shrink-0 ${
                activeTab === 'cadastro'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <User className="w-4 h-4" />
              <span>Meus Dados Cadastrais</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Conteúdo Principal */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex-1 w-full space-y-6">
        {downloadError && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{downloadError}</span>
          </div>
        )}

        {/* 1. ABA DE FATURAS E BOLETOS */}
        {activeTab === 'faturas' && (
          <div className="space-y-6">
            {/* Banner de Boletos / Faturas Pendentes com Ação Rápida */}
            {pendingFaturas.length > 0 && (() => {
              const pendingFat = pendingFaturas[0];
              const hasBoleto = !!(pendingFat.boletoBase64 || pendingFat.boletoStoragePath);

              return (
                <div
                  className={`rounded-2xl p-5 text-white shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                    hasBoleto
                      ? 'bg-gradient-to-r from-amber-500 to-[#e97825]'
                      : 'bg-gradient-to-r from-emerald-800 to-[#0c3319]'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="bg-white/20 text-white text-[11px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                        {hasBoleto ? 'BOLETO DISPONÍVEL PARA DOWNLOAD' : 'FATURA EM ABERTO'}
                      </span>
                      <span className="text-xs">⚡</span>
                    </div>
                    <h3 className="text-xl sm:text-2xl font-black mt-2">
                      Fatura de {formatReferencePeriod(pendingFat.referenceMonth, pendingFat.referenceYear)}
                    </h3>
                    <p className="text-xs text-amber-100 mt-1">
                      Vencimento em: <strong>{formatDateBr(pendingFat.dueDate)}</strong> • Total a pagar:{' '}
                      <strong className="text-yellow-200 text-sm">
                        {formatCurrency(pendingFat.totalToPay)}
                      </strong>{' '}
                      (Você já economizou {formatCurrency(pendingFat.savingsAmount)} nesta fatura!)
                    </p>
                    {!hasBoleto && (
                      <p className="text-[11px] text-emerald-200/90 mt-1">
                        * Boleto bancário ainda não anexado. Visualize a fatura oficial para conferir o demonstrativo e dados de pagamento.
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                    {hasBoleto && (
                      <button
                        type="button"
                        onClick={() => handleDownloadBoleto(pendingFat)}
                        className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white text-emerald-950 font-black text-xs uppercase tracking-wider hover:bg-emerald-50 transition shadow cursor-pointer"
                      >
                        <Download className="w-4 h-4 text-emerald-700" />
                        <span>Baixar Boleto (PDF)</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onOpenInvoiceModal(pendingFat)}
                      className={`flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl font-bold text-xs transition cursor-pointer ${
                        !hasBoleto
                          ? 'bg-yellow-400 hover:bg-yellow-300 text-emerald-950 font-black shadow-md'
                          : 'bg-emerald-900/40 hover:bg-emerald-900/60 text-white border border-white/30'
                      }`}
                    >
                      <FileText className="w-4 h-4" />
                      <span>Visualizar Fatura</span>
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Filtros da Lista de Faturas */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-500" />
                <span className="text-xs font-bold text-gray-700 uppercase">
                  Filtrar Faturas:
                </span>
                <span className="text-xs text-gray-500">
                  ({displayFaturas.length} faturas encontradas)
                </span>
              </div>

              <div className="flex items-center gap-1.5 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setFaturaFilter('todas')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex-1 sm:flex-initial ${
                    faturaFilter === 'todas'
                      ? 'bg-emerald-700 text-white shadow-xs font-black'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Todas ({clientFaturas.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFaturaFilter('pendentes')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex-1 sm:flex-initial ${
                    faturaFilter === 'pendentes'
                      ? 'bg-amber-600 text-white shadow-xs font-black'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Abertas / Boletos ({pendingFaturas.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFaturaFilter('pagas')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex-1 sm:flex-initial ${
                    faturaFilter === 'pagas'
                      ? 'bg-emerald-600 text-white shadow-xs font-black'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Pagas ({paidFaturas.length})
                </button>
              </div>
            </div>

            {/* Listagem de Faturas em Cards Responsivos */}
            {displayFaturas.length === 0 ? (
              <div className="bg-white rounded-2xl p-10 text-center border border-gray-200 shadow-xs space-y-3">
                <FileText className="w-12 h-12 text-gray-400 mx-auto" />
                <h4 className="text-base font-bold text-gray-800">
                  Nenhuma fatura encontrada neste filtro
                </h4>
                <p className="text-xs text-gray-500 max-w-md mx-auto">
                  Assim que novas faturas forem geradas pela cooperativa Neo Energia, elas aparecerão automaticamente aqui para download e acompanhamento.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {displayFaturas.map((fat) => {
                  const isPaid = fat.status === 'paid';
                  const isOverdue = fat.status === 'overdue';
                  const hasBoleto = !!(fat.boletoBase64 || fat.boletoStoragePath);
                  const matchedClient = clientes.find((c) => c.id === fat.clientId);

                  return (
                    <div
                      key={fat.id}
                      className={`bg-white rounded-2xl border transition-all p-5 shadow-xs flex flex-col justify-between ${
                        isPaid
                          ? 'border-emerald-200 hover:border-emerald-400'
                          : isOverdue
                          ? 'border-rose-300 ring-1 ring-rose-200'
                          : 'border-amber-300 ring-1 ring-amber-100'
                      }`}
                    >
                      <div>
                        {/* Status Tag e Mês */}
                        <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-3">
                          <div>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                              MÊS DE REFERÊNCIA
                            </span>
                            <h4 className="text-base font-black text-gray-900">
                              {formatReferencePeriod(fat.referenceMonth, fat.referenceYear)}
                            </h4>
                          </div>

                          {isPaid ? (
                            <span className="flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[11px] font-black px-2.5 py-1 rounded-full border border-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              PAGA
                            </span>
                          ) : isOverdue ? (
                            <span className="flex items-center gap-1 bg-rose-100 text-rose-800 text-[11px] font-black px-2.5 py-1 rounded-full border border-rose-200">
                              <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                              VENCIDA
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 bg-amber-100 text-amber-900 text-[11px] font-black px-2.5 py-1 rounded-full border border-amber-200">
                              <Clock className="w-3.5 h-3.5 text-amber-600" />
                              EM ABERTO
                            </span>
                          )}
                        </div>

                        {/* Dados da Fatura */}
                        <div className="space-y-2 text-xs text-gray-700">
                          {matchedClient && (
                            <div className="flex justify-between items-center text-[11px] bg-gray-50 p-1.5 rounded-lg border border-gray-100">
                              <span className="font-semibold text-gray-500">Medidor:</span>
                              <span className="font-bold text-gray-900">
                                {matchedClient.meterNumber || matchedClient.consumerUnit || matchedClient.clientCodeCoelba}
                              </span>
                            </div>
                          )}

                          <div className="flex justify-between items-center">
                            <span className="text-gray-500">Consumo no Mês:</span>
                            <span className="font-extrabold text-gray-900">
                              {formatNumberBr(fat.consumptionKwh)} kWh
                            </span>
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="text-gray-500">Vencimento:</span>
                            <span className="font-bold text-gray-900">{formatDateBr(fat.dueDate)}</span>
                          </div>

                          <div className="flex justify-between items-center text-emerald-800 bg-emerald-50/70 p-1.5 rounded-lg border border-emerald-200">
                            <span className="font-bold">Economia Garantida:</span>
                            <span className="font-black text-xs">
                              {formatCurrency(fat.savingsAmount)}
                            </span>
                          </div>

                          <div className="pt-2 border-t border-gray-100 flex justify-between items-baseline">
                            <span className="text-xs font-extrabold text-gray-700 uppercase">
                              Total a Pagar:
                            </span>
                            <span className="text-xl font-black text-emerald-800 tracking-tight">
                              {formatCurrency(fat.totalToPay)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Botões de Ação para o Cliente */}
                      <div className="mt-4 pt-3 border-t border-gray-100 space-y-2">
                        {/* Download do boleto: SÓ disponível se tiver boleto feito upload na fatura */}
                        {hasBoleto ? (
                          <button
                            type="button"
                            onClick={() => handleDownloadBoleto(fat)}
                            className="w-full flex items-center justify-center gap-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-black py-2.5 px-3 text-xs shadow-xs transition cursor-pointer"
                            title="Baixar Boleto Bancário (PDF)"
                          >
                            <Download className="w-4 h-4" />
                            <span>Baixar Boleto Bancário (PDF)</span>
                          </button>
                        ) : (
                          <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-gray-500 text-[11px] font-medium">
                            <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span>
                              {isPaid
                                ? 'Boleto excluído após pagamento'
                                : 'Boleto não anexado (consulte a fatura)'}
                            </span>
                          </div>
                        )}

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenInvoiceModal(fat)}
                            className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 px-3 text-xs font-bold transition cursor-pointer ${
                              !hasBoleto
                                ? 'bg-emerald-700 hover:bg-emerald-800 text-white font-black shadow-xs'
                                : 'border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 shadow-2xs'
                            }`}
                          >
                            <FileText className={`w-3.5 h-3.5 ${!hasBoleto ? 'text-white' : 'text-emerald-700'}`} />
                            <span>Ver Fatura Oficial</span>
                          </button>

                          {!isPaid && (
                            <button
                              type="button"
                              onClick={() => handleCopyPix(fat)}
                              className="flex items-center justify-center gap-1 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 py-2 px-2.5 text-xs font-bold text-gray-700 transition cursor-pointer"
                              title="Copiar dados para pagamento via PIX"
                            >
                              {copiedPixId === fat.id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5 text-gray-500" />
                              )}
                              <span>{copiedPixId === fat.id ? 'Copiado!' : 'PIX'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 2. ABA DE ECONOMIA EM DINHEIRO (ANUAL E MENSAL) */}
        {activeTab === 'economia' && (
          <div className="space-y-6">
            {/* Banner Superior com Cards Gigantes de Economia em Reais */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Economia no Mês */}
              <div className="bg-gradient-to-br from-emerald-700 to-green-600 rounded-2xl p-5 text-white shadow-md flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider bg-white/20 px-2.5 py-0.5 rounded-full">
                      ECONOMIA NO MÊS
                    </span>
                    <DollarSign className="w-5 h-5 text-yellow-300" />
                  </div>
                  <div className="text-3xl sm:text-4xl font-black mt-3 text-yellow-200">
                    {formatCurrency(savingsThisMonth)}
                  </div>
                  <p className="text-[11px] text-emerald-100 mt-1">
                    Dinheiro líquido economizado na fatura mais recente em relação à Coelba.
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-white/20 text-[10px] text-emerald-100">
                  Neo: {formatCurrency(neoTotalMonth)} vs Coelba: {formatCurrency(coelbaTotalMonth)}
                </div>
              </div>

              {/* Card 2: Economia no Ano (Requisito fundamental do usuário) */}
              <div className="bg-gradient-to-br from-[#e97825] to-[#c75d10] rounded-2xl p-5 text-white shadow-md flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider bg-white/20 px-2.5 py-0.5 rounded-full">
                      ECONOMIA ANUAL ({currentYear})
                    </span>
                    <Calendar className="w-5 h-5 text-yellow-200" />
                  </div>
                  <div className="text-3xl sm:text-4xl font-black mt-3 text-yellow-200">
                    {formatCurrency(annualSavingsTotal)}
                  </div>
                  <p className="text-[11px] text-orange-100 mt-1">
                    Total em dinheiro (R$) economizado acumulado em 1 ano com a Neo Energia.
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-white/20 text-[10px] text-orange-100">
                  Consumo anual: {formatNumberBr(annualKwhTotal)} kWh
                </div>
              </div>

              {/* Card 3: Economia Acumulada Total */}
              <div className="bg-gradient-to-br from-teal-800 to-emerald-900 rounded-2xl p-5 text-white shadow-md flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider bg-white/20 px-2.5 py-0.5 rounded-full">
                      ECONOMIA TOTAL ACUMULADA
                    </span>
                    <Sparkles className="w-5 h-5 text-yellow-300" />
                  </div>
                  <div className="text-3xl sm:text-4xl font-black mt-3 text-emerald-200">
                    {formatCurrency(allTimeSavingsTotal)}
                  </div>
                  <p className="text-[11px] text-emerald-100 mt-1">
                    Total absoluto que você deixou de pagar à concessionária desde que aderiu.
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-white/20 text-[10px] text-emerald-100">
                  {clientFaturas.length} faturas contabilizadas
                </div>
              </div>

              {/* Card 4: Comparativo Anual Coelba vs Neo */}
              <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-xs flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-500 bg-gray-100 px-2.5 py-0.5 rounded-full">
                    BALANÇO EM DINHEIRO NO ANO
                  </span>
                  <div className="space-y-2 mt-3 text-xs">
                    <div className="flex justify-between items-center text-gray-600">
                      <span>Na Coelba você pagaria:</span>
                      <span className="font-bold text-rose-700">
                        {formatCurrency(annualCoelbaEstimateTotal)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-gray-600">
                      <span>Na Neo Energia você pagou:</span>
                      <span className="font-bold text-emerald-800">
                        {formatCurrency(annualNeoPaidTotal)}
                      </span>
                    </div>
                    <div className="pt-2 border-t border-gray-100 flex justify-between items-baseline font-black">
                      <span className="text-emerald-900 text-xs uppercase">Sua Economia:</span>
                      <span className="text-lg text-emerald-700">
                        {formatCurrency(annualSavingsTotal)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-gray-100 text-[10px] text-gray-500">
                  Valores exatos calculados em moeda corrente (R$)
                </div>
              </div>
            </div>

            {/* Tabela Detalhada de Evolução Mês a Mês */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
              <div className="p-4 sm:p-5 border-b border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-black text-gray-900">
                    Demonstrativo Detalhado de Economia Mês a Mês
                  </h3>
                  <p className="text-xs text-gray-500">
                    Acompanhamento de consumo em kWh, valor na concessionária, valor na Neo Energia e economia em dinheiro.
                  </p>
                </div>
                <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                  Valores reais calculados
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 uppercase font-black text-[10px]">
                    <tr>
                      <th className="py-3 px-4">Mês / Ano</th>
                      <th className="py-3 px-4">Medidor</th>
                      <th className="py-3 px-4 text-center">Consumo</th>
                      <th className="py-3 px-4 text-right">Se Fosse na Coelba</th>
                      <th className="py-3 px-4 text-right">Com a Neo Energia</th>
                      <th className="py-3 px-4 text-right text-emerald-800 bg-emerald-50/60 font-black">
                        Economia Gerada (R$)
                      </th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-center">Fatura</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                    {clientFaturas.map((fat) => {
                      const client = clientes.find((c) => c.id === fat.clientId);
                      const isPaid = fat.status === 'paid';

                      return (
                        <tr key={fat.id} className="hover:bg-gray-50/80 transition">
                          <td className="py-3.5 px-4 font-black text-gray-900 whitespace-nowrap">
                            {formatReferencePeriod(fat.referenceMonth, fat.referenceYear)}
                          </td>
                          <td className="py-3.5 px-4 text-gray-600 whitespace-nowrap">
                            {client?.meterNumber || client?.consumerUnit || 'Medidor Padrão'}
                          </td>
                          <td className="py-3.5 px-4 text-center font-bold text-gray-900 whitespace-nowrap">
                            {formatNumberBr(fat.consumptionKwh)} kWh
                          </td>
                          <td className="py-3.5 px-4 text-right text-rose-700 font-bold whitespace-nowrap">
                            {formatCurrency(fat.coelbaEstimateAmount)}
                          </td>
                          <td className="py-3.5 px-4 text-right text-gray-900 font-black whitespace-nowrap">
                            {formatCurrency(fat.totalToPay)}
                          </td>
                          <td className="py-3.5 px-4 text-right font-black text-emerald-800 bg-emerald-50/40 text-sm whitespace-nowrap">
                            + {formatCurrency(fat.savingsAmount)}
                          </td>
                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            {isPaid ? (
                              <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Paga
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                <Clock className="w-3 h-3 text-amber-600" />
                                Em aberto
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => onOpenInvoiceModal(fat)}
                              className="text-emerald-700 hover:text-emerald-900 font-bold hover:underline cursor-pointer inline-flex items-center gap-1"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>Ver</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 3. ABA DE MEUS DADOS CADASTRAIS */}
        {activeTab === 'cadastro' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-6">
              <div className="border-b border-gray-100 pb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-gray-900">
                      Dados Cadastrais do Cliente
                    </h3>
                    <p className="text-xs text-gray-500">
                      Informações registradas no contrato de energia com a Neo Energia.
                    </p>
                  </div>
                </div>

                <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 flex items-center gap-1">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Cadastro Ativo
                </span>
              </div>

              {/* Grid com Dados do Cliente */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100">
                  <span className="text-gray-400 font-bold block text-[10px] uppercase">
                    Nome Completo / Razão Social
                  </span>
                  <span className="font-black text-sm text-gray-900 block mt-0.5">
                    {primaryClient.name}
                  </span>
                </div>

                <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100">
                  <span className="text-gray-400 font-bold block text-[10px] uppercase">
                    CPF ou CNPJ
                  </span>
                  <span className="font-mono font-bold text-sm text-gray-900 block mt-0.5">
                    {primaryClient.cpfCnpj || '-'}
                  </span>
                </div>

                <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100">
                  <span className="text-gray-400 font-bold block text-[10px] uppercase">
                    E-mail de Login & Acesso
                  </span>
                  <span className="font-semibold text-gray-900 block mt-0.5 truncate">
                    {primaryClient.email || userEmail || '-'}
                  </span>
                </div>

                <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100">
                  <span className="text-gray-400 font-bold block text-[10px] uppercase">
                    Telefone / WhatsApp
                  </span>
                  <span className="font-semibold text-gray-900 block mt-0.5">
                    {primaryClient.phone || primaryClient.whatsapp || '-'}
                  </span>
                </div>

                <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100">
                  <span className="text-gray-400 font-bold block text-[10px] uppercase">
                    Cidade / Estado
                  </span>
                  <span className="font-semibold text-gray-900 block mt-0.5">
                    {primaryClient.city || '-'} - {primaryClient.state || 'BA'}
                  </span>
                </div>

                <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100">
                  <span className="text-gray-400 font-bold block text-[10px] uppercase">
                    Endereço Completo
                  </span>
                  <span className="font-semibold text-gray-900 block mt-0.5">
                    {primaryClient.address}
                    {primaryClient.number ? `, Nº ${primaryClient.number}` : ''}
                    {primaryClient.neighborhood ? ` - ${primaryClient.neighborhood}` : ''}
                  </span>
                </div>
              </div>

              {/* Lista de Medidores Vinculados ao Cliente */}
              <div className="pt-4 border-t border-gray-100 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black text-gray-900 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-700" />
                    <span>Medidores & Unidades Consumidoras Vinculadas ({linkedClients.length})</span>
                  </h4>
                  <span className="text-[11px] text-gray-500 font-medium">
                    Todos os medidores associados ao mesmo CPF/E-mail
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {linkedClients.map((c, idx) => (
                    <div
                      key={c.id}
                      className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-3.5 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-black text-emerald-950 uppercase">
                          Medidor #{idx + 1}
                        </span>
                        <span className="bg-emerald-200/80 text-emerald-900 font-bold text-[10px] px-2 py-0.5 rounded-md">
                          Código Coelba: {c.clientCodeCoelba}
                        </span>
                      </div>
                      <div className="flex justify-between text-gray-700">
                        <span>Número do Medidor / UC:</span>
                        <span className="font-mono font-bold text-gray-900">
                          {c.meterNumber || c.consumerUnit || c.clientCodeCoelba}
                        </span>
                      </div>
                      <div className="flex justify-between text-gray-700">
                        <span>Endereço de Instalação:</span>
                        <span className="font-medium text-gray-900 truncate max-w-[200px]">
                          {c.address}, {c.neighborhood}
                        </span>
                      </div>
                      <div className="flex justify-between text-gray-700 border-t border-emerald-200 pt-1">
                        <span>Tarifa Neo Contratada:</span>
                        <span className="font-black text-emerald-800">
                          {c.customNeoTariff ? `R$ ${formatCurrency(c.customNeoTariff, false)}/kWh` : 'Tarifa Padrão'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Canal de Atendimento & Alteração Cadastral */}
              <div className="pt-4 border-t border-gray-100 rounded-xl bg-gray-50 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-black text-gray-900">
                    Precisa alterar algum dado cadastral ou adicionar novo medidor?
                  </h4>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Fale diretamente com a equipe de atendimento da Neo Energia pelo WhatsApp oficial.
                  </p>
                </div>
                <a
                  href={`https://wa.me/55${(empresa.whatsapp || empresa.phone || '77992107440').replace(/\D/g, '')}?text=${encodeURIComponent(
                    `Olá, gostaria de atualizar meus dados cadastrais no Portal do Cliente da Neo Energia (Cliente: ${primaryClient.name}).`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-white font-bold text-xs transition shadow-xs cursor-pointer shrink-0"
                >
                  <Phone className="w-3.5 h-3.5 fill-white" />
                  <span>Falar no WhatsApp da Neo</span>
                </a>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Rodapé Institucional do Portal */}
      <footer className="bg-white border-t border-gray-200 py-4 text-center text-xs text-gray-500">
        <div className="max-w-7xl mx-auto px-4">
          <p className="font-bold text-gray-700">
            {empresa.companyName || 'NEO ENERGIA CARNAÚBANOS (GRUPO DE INVESTIMENTOS CARNAÚBANOS)'}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            CNPJ: {empresa.cnpj || '52.184.920/0001-44'} • Atendimento: {empresa.phone || empresa.whatsapp || '77-992107440'} • Ibacaraí - BA
          </p>
        </div>
      </footer>
    </div>
  );
};
