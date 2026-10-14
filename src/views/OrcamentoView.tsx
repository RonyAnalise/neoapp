import React, { useState, useRef, useEffect } from 'react';
import html2canvas from 'html2canvas';
import {
  Calculator,
  Printer,
  Download,
  Share2,
  Copy,
  Check,
  Zap,
  Sparkles,
  Phone,
  FileText,
  CheckCircle2,
  Image as ImageIcon,
  X,
  TrendingDown,
  Percent,
  RefreshCw,
} from 'lucide-react';
import { Cliente, EmpresaConfig, EnergyTariffs, Fatura } from '../types';
import {
  formatCurrency,
  formatNumberBr,
  formatDateBr,
  formatReferencePeriod,
  MONTH_NAMES_BR,
} from '../lib/calculations';
import { generateInvoicePdf } from '../lib/pdfService';

interface OrcamentoViewProps {
  empresa: EmpresaConfig;
  tariffs?: EnergyTariffs;
  clientes?: Cliente[];
}

export const OrcamentoView: React.FC<OrcamentoViewProps> = ({
  empresa,
  tariffs,
  clientes = [],
}) => {
  const invoicePrintRef = useRef<HTMLDivElement>(null);

  // Valores padrão baseados nas tarifas do sistema ou padrões usuais
  const defaultNeoTariff = tariffs?.neoTariff || 1.0;
  const defaultCoelbaTariff = tariffs?.coelbaReferenceTariff || 1.21;

  // Estados dos inputs de cálculo
  const [consumptionKwh, setConsumptionKwh] = useState<number>(500);
  const [coelbaTariff, setCoelbaTariff] = useState<number>(defaultCoelbaTariff);
  const [coelbaTotal, setCoelbaTotal] = useState<number>(
    Math.round(500 * defaultCoelbaTariff * 100) / 100
  );
  const [neoTariff, setNeoTariff] = useState<number>(defaultNeoTariff);
  const [neoTotal, setNeoTotal] = useState<number>(
    Math.round(500 * defaultNeoTariff * 100) / 100
  );

  // Dados opcionais do cliente / prospect para o modelo da fatura
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [clientName, setClientName] = useState<string>('CLIENTE INTERESSADO');
  const [clientCpf, setClientCpf] = useState<string>('000.000.000-00');
  const [clientCity, setClientCity] = useState<string>(empresa.city || 'ITABUNA');
  const [clientState, setClientState] = useState<string>(empresa.state || 'BA');
  const [clientCodeCoelba, setClientCodeCoelba] = useState<string>('7092185421');
  const [meterNumber, setMeterNumber] = useState<string>('09218542');
  const [phoneForZap, setPhoneForZap] = useState<string>('');

  // Datas simuladas
  const now = new Date();
  const [refMonth, setRefMonth] = useState<number>(now.getMonth() + 1);
  const [refYear, setRefYear] = useState<number>(now.getFullYear());
  const dueDateStr = new Date(now.getTime() + 15 * 86400000).toISOString().split('T')[0];

  // Estados de ações
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false);
  const [imageCapturedUrl, setImageCapturedUrl] = useState<string | null>(null);
  const [copiedSuccess, setCopiedSuccess] = useState(false);
  const [lastActionStatus, setLastActionStatus] = useState<string>('');

  // Ao alterar o consumo, sincroniza totais mantendo as tarifas unitárias
  const handleConsumptionChange = (newKwh: number) => {
    const val = Math.max(0, newKwh);
    setConsumptionKwh(val);
    setCoelbaTotal(Math.round(val * coelbaTariff * 100) / 100);
    setNeoTotal(Math.round(val * neoTariff * 100) / 100);
  };

  // Ao alterar o Valor Total Coelba, atualiza a tarifa unitária
  const handleCoelbaTotalChange = (newTotal: number) => {
    const val = Math.max(0, newTotal);
    setCoelbaTotal(val);
    if (consumptionKwh > 0) {
      setCoelbaTariff(Math.round((val / consumptionKwh) * 10000) / 10000);
    }
  };

  // Ao alterar a Tarifa Unitária Coelba, atualiza o valor total
  const handleCoelbaTariffChange = (newTariff: number) => {
    const val = Math.max(0, newTariff);
    setCoelbaTariff(val);
    setCoelbaTotal(Math.round(consumptionKwh * val * 100) / 100);
  };

  // Ao alterar o Valor Total Neo, atualiza a tarifa unitária
  const handleNeoTotalChange = (newTotal: number) => {
    const val = Math.max(0, newTotal);
    setNeoTotal(val);
    if (consumptionKwh > 0) {
      setNeoTariff(Math.round((val / consumptionKwh) * 10000) / 10000);
    }
  };

  // Ao alterar a Tarifa Unitária Neo, atualiza o valor total
  const handleNeoTariffChange = (newTariff: number) => {
    const val = Math.max(0, newTariff);
    setNeoTariff(val);
    setNeoTotal(Math.round(consumptionKwh * val * 100) / 100);
  };

  // Selecionar cliente pré-cadastrado
  const handleSelectClient = (clientId: string) => {
    setSelectedClientId(clientId);
    if (!clientId) return;
    const c = clientes.find((cli) => cli.id === clientId);
    if (c) {
      setClientName(c.name || 'CLIENTE');
      setClientCpf(c.cpfCnpj || '000.000.000-00');
      setClientCity(c.city || empresa.city || 'ITABUNA');
      setClientState(c.state || empresa.state || 'BA');
      setClientCodeCoelba(c.clientCodeCoelba || '7092185421');
      setMeterNumber(c.meterNumber || c.consumerUnit || '09218542');
      if (c.phone || c.whatsapp) {
        setPhoneForZap(c.whatsapp || c.phone || '');
      }
      if (c.customNeoTariff) {
        handleNeoTariffChange(c.customNeoTariff);
      }
      if (c.customCoelbaTariff) {
        handleCoelbaTariffChange(c.customCoelbaTariff);
      }
    }
  };

  // Cálculos de economia
  const savingsAmount = Math.max(0, Math.round((coelbaTotal - neoTotal) * 100) / 100);
  const savingsPercentage =
    coelbaTotal > 0 ? Math.round((savingsAmount / coelbaTotal) * 1000) / 10 : 0;
  const annualSavings = Math.round(savingsAmount * 12 * 100) / 100;

  // Montagem de objeto simulado para a fatura de exemplo
  const simulatedInvoice: Fatura = {
    id: 'simulacao_orcamento',
    invoiceNumber: meterNumber || 'ORÇAMENTO',
    clientId: selectedClientId || 'simulado',
    clientName,
    referenceMonth: refMonth,
    referenceYear: refYear,
    previousReading: 10000,
    previousReadingDate: new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0],
    currentReading: 10000 + consumptionKwh,
    currentReadingDate: now.toISOString().split('T')[0],
    consumptionKwh,
    appliedNeoTariff: neoTariff,
    appliedCoelbaTariff: coelbaTariff,
    neoAmount: neoTotal,
    coelbaEstimateAmount: coelbaTotal,
    savingsAmount,
    savingsPercentage,
    totalToPay: neoTotal,
    issueDate: now.toISOString().split('T')[0],
    dueDate: dueDateStr,
    status: 'pending',
    createdAt: now.toISOString(),
    createdBy: 'Simulador',
  };

  // Texto formatado para envio no WhatsApp
  const generateWhatsAppMessage = () => {
    return (
      `*PROPOSTA / SIMULAÇÃO DE ECONOMIA — NEO ENERGIA SOLAR*\n\n` +
      `Olá, *${clientName}*! Preparamos a simulação da sua fatura de energia solar:\n` +
      `📋 _Orçamento referente à fatura da Coelba apresentada pelo cliente._\n\n` +
      `⚡ *Consumo Estimado:* ${formatNumberBr(consumptionKwh)} kWh\n` +
      `❌ *Na Coelba você pagaria:* ${formatCurrency(coelbaTotal)}\n` +
      `✅ *Na Neo Energia você paga:* ${formatCurrency(neoTotal)}\n\n` +
      `💰 *SUA ECONOMIA MENSAL:* ${formatCurrency(savingsAmount)} (*${formatNumberBr(savingsPercentage, 1)}% de desconto real!*)\n` +
      `🌟 *Economia Anual Estimada:* ${formatCurrency(annualSavings)}\n\n` +
      `📄 *Segue anexo o print da sua fatura de exemplo.*\n` +
      `Sem taxas de instalação ou custos extras! Vamos economizar juntos?`
    );
  };

  // 1. Ação: Imprimir via Navegador
  const handlePrint = () => {
    window.print();
  };

  // 2. Ação: Baixar em PDF
  const handleDownloadPdf = async () => {
    if (!invoicePrintRef.current) return;
    setIsGeneratingPdf(true);
    try {
      await generateInvoicePdf(invoicePrintRef.current, `Orcamento_${clientName.replace(/\s+/g, '_')}`);
      setLastActionStatus('PDF gerado e baixado com sucesso!');
      setTimeout(() => setLastActionStatus(''), 4000);
    } catch (err) {
      alert('Erro ao gerar PDF: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // 3. Ação: Captura a imagem em alta resolução usando html2canvas
  const captureInvoiceImage = async (): Promise<{ blob: Blob; dataUrl: string } | null> => {
    if (!invoicePrintRef.current) return null;
    setIsGeneratingImage(true);
    try {
      const canvas = await html2canvas(invoicePrintRef.current, {
        scale: 2, // 2x alta resolução
        useCORS: true,
        logging: false,
        backgroundColor: '#059669',
        windowWidth: 1100,
      });

      const dataUrl = canvas.toDataURL('image/png');
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png')
      );

      if (!blob) throw new Error('Não foi possível gerar a imagem.');
      setImageCapturedUrl(dataUrl);
      return { blob, dataUrl };
    } catch (err) {
      console.error('Erro ao capturar print da fatura:', err);
      alert('Erro ao gerar imagem print da fatura.');
      return null;
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // 4. Ação: Baixar apenas a imagem PNG (print)
  const handleDownloadImage = async () => {
    const result = await captureInvoiceImage();
    if (!result) return;
    const a = document.createElement('a');
    a.href = result.dataUrl;
    a.download = `Print_Fatura_Orcamento_${clientName.replace(/\s+/g, '_')}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setLastActionStatus('Imagem print da fatura baixada com sucesso!');
    setTimeout(() => setLastActionStatus(''), 4000);
  };

  // 5. Ação: Enviar por Zap (abre modal para digitar número e disparar)
  const handleOpenWhatsappModal = async () => {
    setWhatsappModalOpen(true);
    // Já prepara o print da fatura em background
    if (!imageCapturedUrl) {
      captureInvoiceImage();
    }
  };

  // Disparo do WhatsApp com o print e texto
  const handleSendWhatsapp = async () => {
    const cleanPhone = phoneForZap.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 10) {
      alert('Por favor, informe um número de WhatsApp válido com DDD (ex: 73999998888).');
      return;
    }

    // 1. Gera ou recupera o print da imagem
    let dataUrl = imageCapturedUrl;
    let blob: Blob | null = null;
    if (!dataUrl) {
      const res = await captureInvoiceImage();
      if (res) {
        dataUrl = res.dataUrl;
        blob = res.blob;
      }
    }

    // 2. Baixa a imagem do print automaticamente para facilitar anexo
    if (dataUrl) {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `Fatura_Exemplo_${clientName.replace(/\s+/g, '_')}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Tenta copiar a imagem para a área de transferência do usuário para colar com Ctrl+V
      if (navigator.clipboard && window.ClipboardItem && blob) {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob }),
          ]);
          setCopiedSuccess(true);
        } catch (e) {
          console.warn('Clipboard write image not allowed or failed:', e);
        }
      }
    }

    // 3. Monta link do WhatsApp com mensagem pronta
    const formattedPhone = cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone;
    const msg = generateWhatsAppMessage();
    const zapUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(msg)}`;

    window.open(zapUrl, '_blank');
    setLastActionStatus('Print gerado e WhatsApp aberto!');
    setTimeout(() => setLastActionStatus(''), 5000);
  };

  const copyTextToClipboard = () => {
    navigator.clipboard.writeText(generateWhatsAppMessage());
    setCopiedSuccess(true);
    setTimeout(() => setCopiedSuccess(false), 3000);
  };

  const companyTitle = (
    empresa.companyName || 'NEO ENERGIA CARNAÚBANOS (GRUPO DE INVESTIMENTOS CARNAÚBANOS)'
  ).replace(/INVETIMENTOS/gi, 'INVESTIMENTOS');
  const phoneDisplay = empresa.phone || empresa.whatsapp || '77-992107440';
  const warningText =
    empresa.warningPaymentText ||
    `TEM ${empresa.paymentDueDays || 15} DIAS PARA EFETUAR O PAGAMENTO.`;

  return (
    <div className="space-y-6">
      {/* Top Banner de Apresentação */}
      <div className="bg-gradient-to-r from-emerald-900 via-green-900 to-emerald-950 text-white rounded-2xl p-5 sm:p-6 shadow-sm border border-emerald-700 no-print">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-400 to-yellow-300 text-emerald-950 flex items-center justify-center shadow-md shrink-0">
              <Calculator className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Simulador de Orçamento & Proposta
                </h2>
                <span className="bg-amber-400 text-emerald-950 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                  Vendas
                </span>
              </div>
              <p className="text-xs sm:text-sm text-emerald-200/90 mt-0.5">
                Informe o consumo, o valor da Coelba e o valor Neo Energia para gerar na hora a fatura
                de exemplo com destaque da economia em <strong>R$</strong> e em{' '}
                <strong>percentual (%)</strong>.
              </p>
            </div>
          </div>

          {/* Botões de Ação Principais */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={handleOpenWhatsappModal}
              className="flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-black px-4 py-2.5 text-xs transition shadow-sm cursor-pointer"
            >
              <Phone className="w-4 h-4 fill-emerald-950" />
              <span>Enviar por Zap (Imagem Print)</span>
            </button>
            <button
              onClick={handleDownloadImage}
              disabled={isGeneratingImage}
              className="flex items-center gap-1.5 rounded-xl border border-emerald-600 bg-emerald-950/60 hover:bg-emerald-800 text-white font-bold px-3.5 py-2.5 text-xs transition cursor-pointer"
              title="Baixar imagem print da fatura"
            >
              <ImageIcon className="w-4 h-4 text-emerald-300" />
              <span>{isGeneratingImage ? 'Gerando Print...' : 'Baixar Imagem'}</span>
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className="flex items-center gap-1.5 rounded-xl border border-emerald-600 bg-emerald-950/60 hover:bg-emerald-800 text-white font-bold px-3.5 py-2.5 text-xs transition cursor-pointer"
              title="Baixar em formato PDF"
            >
              <Download className="w-4 h-4 text-emerald-300" />
              <span>{isGeneratingPdf ? 'Gerando PDF...' : 'Baixar PDF'}</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-xl bg-white text-emerald-950 hover:bg-emerald-50 font-bold px-3.5 py-2.5 text-xs transition shadow-xs cursor-pointer"
              title="Imprimir proposta"
            >
              <Printer className="w-4 h-4 text-emerald-800" />
              <span>Imprimir</span>
            </button>
          </div>
        </div>

        {lastActionStatus && (
          <div className="mt-3 py-1.5 px-3 rounded-lg bg-emerald-800/80 border border-emerald-500 text-xs text-emerald-200 font-semibold flex items-center gap-2 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{lastActionStatus}</span>
          </div>
        )}
      </div>

      {/* Grid: Formulário de Entrada (Esquerda) e Cards de Métricas (Direita) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 no-print">
        {/* Formulário de Cálculo do Orçamento (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl p-5 sm:p-6 border border-gray-200/80 shadow-xs space-y-5">
          <div className="border-b border-gray-100 pb-3">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <span>Parâmetros de Cálculo da Energia</span>
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                Ajuste em tempo real
              </span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Digite o consumo em kWh e os valores totais ou tarifas da Coelba e da Neo Energia.
            </p>
          </div>

          {/* Atalhos rápidos de consumo */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">
              1. Consumo de Energia (kWh)
            </label>
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {[250, 400, 500, 750, 1000, 1500, 2500].map((kwh) => (
                <button
                  key={kwh}
                  type="button"
                  onClick={() => handleConsumptionChange(kwh)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    consumptionKwh === kwh
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  }`}
                >
                  {kwh} kWh
                </button>
              ))}
            </div>
            <div className="relative">
              <input
                type="number"
                min="1"
                step="1"
                value={consumptionKwh || ''}
                onChange={(e) => handleConsumptionChange(Number(e.target.value))}
                className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2.5 text-sm font-black text-gray-900 focus:bg-white focus:border-emerald-600 focus:outline-none"
                placeholder="Ex: 500"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400 pointer-events-none">
                kWh / mês
              </span>
            </div>
          </div>

          {/* Bloco Comparativo de Valores: Coelba vs Neo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 2. Coelba */}
            <div className="bg-rose-50/50 border border-rose-200 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-rose-900 uppercase">
                  2. Valor Coelba (Atual)
                </span>
                <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded">
                  Sem Desconto
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-600 mb-1">
                  Valor Total Coelba (R$)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-500">
                    R$
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={coelbaTotal || ''}
                    onChange={(e) => handleCoelbaTotalChange(Number(e.target.value))}
                    className="w-full rounded-lg border border-rose-300 bg-white pl-9 pr-3 py-2 text-sm font-black text-gray-900 focus:border-rose-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-600 mb-1">
                  Tarifa Unitária Coelba (R$/kWh)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-500">
                    R$
                  </span>
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={coelbaTariff || ''}
                    onChange={(e) => handleCoelbaTariffChange(Number(e.target.value))}
                    className="w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 py-1.5 text-xs font-bold text-gray-700 focus:border-rose-600 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* 3. Neo Energia */}
            <div className="bg-emerald-50/50 border border-emerald-300 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-emerald-900 uppercase">
                  3. Valor Neo Energia
                </span>
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                  Com Desconto
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-600 mb-1">
                  Valor Total Neo (R$)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-500">
                    R$
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={neoTotal || ''}
                    onChange={(e) => handleNeoTotalChange(Number(e.target.value))}
                    className="w-full rounded-lg border border-emerald-400 bg-white pl-9 pr-3 py-2 text-sm font-black text-emerald-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-600 mb-1">
                  Tarifa Unitária Neo (R$/kWh)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-500">
                    R$
                  </span>
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={neoTariff || ''}
                    onChange={(e) => handleNeoTariffChange(Number(e.target.value))}
                    className="w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 py-1.5 text-xs font-bold text-gray-700 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Dados do Cliente / Prospect para a Proposta */}
          <div className="border-t border-gray-100 pt-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-700">
                4. Personalizar Dados do Cliente na Fatura:
              </span>
              {clientes.length > 0 && (
                <select
                  value={selectedClientId}
                  onChange={(e) => handleSelectClient(e.target.value)}
                  className="rounded-lg border border-gray-300 bg-gray-50 px-2 py-1 text-xs text-gray-700 font-semibold focus:outline-none"
                >
                  <option value="">-- Puxar cliente cadastrado --</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.clientCodeCoelba || c.meterNumber || 'sem cód'})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-gray-600 mb-0.5">
                  Nome do Cliente
                </label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value.toUpperCase())}
                  className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-xs font-bold text-gray-900 focus:bg-white focus:outline-none"
                  placeholder="Nome do cliente"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-600 mb-0.5">
                  WhatsApp / Celular
                </label>
                <input
                  type="text"
                  value={phoneForZap}
                  onChange={(e) => setPhoneForZap(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-900 focus:bg-white focus:outline-none"
                  placeholder="(73) 99999-9999"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-600 mb-0.5">
                  Cód. Cliente Coelba
                </label>
                <input
                  type="text"
                  value={clientCodeCoelba}
                  onChange={(e) => setClientCodeCoelba(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-xs font-mono text-gray-900 focus:bg-white focus:outline-none"
                  placeholder="Ex: 7092185421"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-600 mb-0.5">
                  Cidade / Estado
                </label>
                <input
                  type="text"
                  value={clientCity}
                  onChange={(e) => setClientCity(e.target.value.toUpperCase())}
                  className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-xs text-gray-900 focus:bg-white focus:outline-none"
                  placeholder="Ex: ITABUNA - BA"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Painel de Resultados & Comparativo de Economia (5 cols) */}
        <div className="lg:col-span-5 flex flex-col justify-between gap-4">
          {/* Card Gigante de Destaque da Economia */}
          <div className="bg-gradient-to-br from-[#e97825] to-[#c75d10] text-white rounded-2xl p-6 shadow-md border border-orange-400 flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center justify-between">
                <span className="bg-white/20 text-white text-[11px] font-black px-3 py-1 rounded-full uppercase tracking-wider backdrop-blur-xs">
                  ECONOMIA GARANTIDA
                </span>
                <span className="text-xl">💰</span>
              </div>

              <div className="mt-4">
                <span className="text-xs uppercase font-extrabold text-orange-100 tracking-wider block">
                  Economia Mensal em Reais
                </span>
                <div className="text-4xl sm:text-5xl font-black tracking-tight text-white mt-1 drop-shadow-sm">
                  {formatCurrency(savingsAmount)}
                </div>
              </div>

              {/* Destaque em Percentual (Requisito fundamental do usuário) */}
              <div className="mt-4 bg-white/15 rounded-xl p-3 border border-white/30 backdrop-blur-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-orange-100 uppercase block">
                      Economia em Percentual:
                    </span>
                    <span className="text-2xl sm:text-3xl font-black text-yellow-300 drop-shadow-xs">
                      {formatNumberBr(savingsPercentage, 1)}%
                    </span>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-white text-[#e97825] flex items-center justify-center font-black text-lg shadow-sm">
                    %
                  </div>
                </div>
                <p className="text-[11px] text-orange-100 mt-1 font-medium">
                  Desconto líquido direto na fatura mensal em comparação à concessionária!
                </p>
              </div>
            </div>

            {/* Comparativo Anual e Resumo */}
            <div className="mt-5 pt-4 border-t border-orange-400/60 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-orange-100">
                <span>Economia Projetada em 1 Ano:</span>
                <span className="text-base font-black text-white">
                  {formatCurrency(annualSavings)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs font-semibold text-orange-100">
                <span>Total Coelba no Ano:</span>
                <span>{formatCurrency(coelbaTotal * 12)}</span>
              </div>
              <div className="flex items-center justify-between text-xs font-semibold text-orange-100">
                <span>Total Neo no Ano:</span>
                <span className="text-yellow-200 font-bold">{formatCurrency(neoTotal * 12)}</span>
              </div>
            </div>

            {/* Botão de Disparo Rápido para o WhatsApp */}
            <button
              onClick={handleOpenWhatsappModal}
              className="mt-4 w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black py-3 px-4 text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition cursor-pointer"
            >
              <Phone className="w-4 h-4 fill-white" />
              <span>Enviar Orçamento no Zap com Print da Fatura</span>
            </button>
          </div>
        </div>
      </div>

      {/* Seção da Fatura de Exemplo Renderizada (Identidade visual oficial) */}
      <div className="bg-gray-100 p-3 sm:p-6 rounded-2xl border border-gray-300 shadow-inner">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 no-print">
          <div>
            <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
              <span>Fatura de Exemplo do Orçamento</span>
              <span className="bg-emerald-700 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                Visualização Real
              </span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Esta fatura reproduz exatamente o layout oficial gerado pelo sistema para os clientes.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenWhatsappModal}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 transition cursor-pointer shadow-xs"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Enviar via Zap</span>
            </button>
            <button
              onClick={handleDownloadImage}
              disabled={isGeneratingImage}
              className="flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3.5 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50 transition cursor-pointer shadow-xs"
            >
              <ImageIcon className="w-3.5 h-3.5 text-gray-600" />
              <span>Print em Imagem</span>
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className="flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3.5 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50 transition cursor-pointer shadow-xs"
            >
              <Download className="w-3.5 h-3.5 text-gray-600" />
              <span>Baixar PDF</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3.5 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50 transition cursor-pointer shadow-xs"
            >
              <Printer className="w-3.5 h-3.5 text-gray-600" />
              <span>Imprimir</span>
            </button>
          </div>
        </div>

        {/* CONTAINER DA FATURA PARA CAPTURA (html2canvas) E IMPRESSÃO */}
        <div className="overflow-x-auto flex justify-center py-2">
          <div
            ref={invoicePrintRef}
            id="orcamento-invoice-container"
            className="invoice-card bg-[#1b7a3e] p-3 sm:p-5 text-gray-900 rounded-3xl shadow-2xl font-sans w-full"
            style={{
              maxWidth: '820px',
              minHeight: '1120px',
              background: 'linear-gradient(180deg, #1d7b3f 0%, #156231 100%)',
            }}
          >
            {/* Outer White Card with Rounded Corners */}
            <div className="bg-white rounded-[26px] p-4 sm:p-6 shadow-inner relative flex flex-col justify-between h-full">
              {/* Selo Superior de Orçamento / Proposta */}
              <div className="mb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-emerald-100 pb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="bg-emerald-800 text-white text-[10px] font-black px-2.5 py-0.5 rounded-md uppercase tracking-wider">
                    SIMULAÇÃO DE ORÇAMENTO
                  </span>
                  <span className="text-[11px] font-bold text-emerald-800">
                    Proposta Comercial Neo Energia
                  </span>
                  <span className="text-[10px] bg-amber-50 text-amber-900 font-semibold px-2 py-0.5 rounded border border-amber-300">
                    Orçamento referente à fatura da Coelba apresentada pelo cliente
                  </span>
                </div>
                <span className="text-[11px] font-bold text-gray-400">
                  Validade: 15 dias • Emissão: {formatDateBr(now)}
                </span>
              </div>

              {/* BLOCO 1 — CABEÇALHO */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-gray-100 pb-3">
                {/* Logo Neo Energia */}
                <div className="flex items-center gap-2">
                  <div className="relative flex flex-col items-start">
                    <div className="flex items-center gap-1.5">
                      <div className="w-12 h-8 relative flex items-end justify-center overflow-hidden">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-t from-amber-400 to-yellow-300 absolute -bottom-5" />
                        <div className="absolute top-0 w-12 flex justify-between px-1">
                          <span className="w-1 h-3 bg-amber-400 rotate-[-40deg] rounded-full inline-block" />
                          <span className="w-1 h-3 bg-amber-400 rotate-[-20deg] rounded-full inline-block" />
                          <span className="w-1 h-3.5 bg-amber-400 rounded-full inline-block" />
                          <span className="w-1 h-3 bg-amber-400 rotate-[20deg] rounded-full inline-block" />
                          <span className="w-1 h-3 bg-amber-400 rotate-[40deg] rounded-full inline-block" />
                        </div>
                      </div>
                      <div>
                        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#156231] font-serif leading-none">
                          Neo <span className="text-[#1e824c]">Energia</span>
                        </h1>
                        <p className="text-[10px] tracking-[0.35em] text-[#2e7d32] font-semibold uppercase mt-0.5 pl-0.5">
                          C a r n a ú b a n o s
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Central Contact (WhatsApp & Phone) */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200">
                  <div className="w-6 h-6 rounded-full bg-[#25D366] flex items-center justify-center text-white text-xs font-bold shadow-xs">
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766 0-3.187-2.59-5.771-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.299.144.347.491 1.2.534 1.288.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.087-.179.182-.077.357.101.174.449.742.964 1.201.662.591 1.221.774 1.394.861.174.086.275.072.376-.044.102-.116.433-.506.549-.679.116-.174.231-.145.39-.087.159.058 1.011.477 1.184.564.173.087.289.13.332.202.043.072.043.419-.101.824z" />
                    </svg>
                  </div>
                  <span className="font-bold text-[#156231] text-sm tracking-wide">{phoneDisplay}</span>
                </div>

                {/* Top-Right Notice Box */}
                <div className="flex flex-col items-end">
                  <span className="bg-[#1b6b37] text-white text-[11px] font-black px-3 py-0.5 rounded-t-lg tracking-wider">
                    ATENÇÃO
                  </span>
                  <div className="bg-[#e97825] text-white text-xs font-bold px-3 py-2 rounded-lg rounded-tr-none text-center shadow-xs max-w-[210px] leading-tight">
                    {warningText}
                  </div>
                </div>
              </div>

              {/* BLOCO 2 — DADOS DO BENEFICIÁRIO */}
              <div className="mt-3 border-2 border-[#1b7a3e] rounded-xl p-2 bg-[#fafffb]">
                <span className="text-[11px] font-black text-[#156231] tracking-wide block">
                  DADOS BENEFICIÁRIO:
                </span>
                <p className="text-xs sm:text-sm font-bold text-gray-800 text-center tracking-wide uppercase py-0.5">
                  {companyTitle}
                </p>
              </div>

              {/* BLOCO 3 & 4 — DADOS DO CLIENTE + MÊS DE REFERÊNCIA & CÓDIGO DO CLIENTE */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 mt-3">
                {/* Dados do Cliente */}
                <div className="sm:col-span-7 border-2 border-[#1b7a3e] rounded-2xl p-2.5 bg-white flex flex-col justify-between">
                  <span className="text-[11px] font-black text-[#156231] tracking-wide block mb-1">
                    DADOS DO CLIENTE (ORÇAMENTO):
                  </span>
                  <div className="space-y-0.5 text-xs text-gray-800">
                    <p className="font-extrabold text-sm text-gray-900 uppercase">{clientName}</p>
                    <p className="font-bold text-gray-700">
                      CPF/CNPJ: <span className="font-normal font-mono">{clientCpf}</span>
                    </p>
                    <p className="font-medium text-gray-700 uppercase">
                      MEDIDOR / UC: <span className="font-mono font-bold">{meterNumber}</span>
                    </p>
                    <p className="font-medium text-gray-700 uppercase">
                      {clientCity} - {clientState}
                    </p>
                    <p className="font-medium text-gray-700">TELEFONE: {phoneForZap || '-'}</p>
                  </div>
                </div>

                {/* Referência e Código do Cliente */}
                <div className="sm:col-span-5 flex flex-col gap-2.5">
                  <div className="border-2 border-[#1b7a3e] rounded-2xl p-2 text-center bg-white flex flex-col justify-center">
                    <span className="text-[10px] font-black text-[#156231] tracking-wider block">
                      MÊS DE REFERÊNCIA:
                    </span>
                    <p className="text-base sm:text-lg font-black text-[#156231] tracking-wide uppercase mt-0.5">
                      {formatReferencePeriod(refMonth, refYear)}
                    </p>
                  </div>

                  <div className="border-2 border-[#1b7a3e] rounded-2xl p-2 text-center bg-white flex flex-col justify-center">
                    <span className="text-[10px] font-black text-[#156231] tracking-wider block leading-tight">
                      CÓDIGO DO CLIENTE NA SUA REDE DA COELBA
                    </span>
                    <p className="text-lg sm:text-xl font-black text-gray-900 tracking-wider mt-0.5 font-mono">
                      {clientCodeCoelba}
                    </p>
                  </div>
                </div>
              </div>

              {/* BLOCO 5, 6, 7 — COMPARATIVO COELBA, TOTAL A PAGAR E DESCONTO COM PERCENTUAL */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 mt-3">
                <div className="sm:col-span-8 flex flex-col gap-2.5">
                  {/* Bloco 5: Comparativo Coelba */}
                  <div className="border-2 border-[#1b7a3e] rounded-2xl px-4 py-2 bg-white flex items-center justify-between">
                    <span className="text-xs sm:text-sm font-extrabold text-[#156231]">
                      NA COELBA VOCÊ PAGARIA:
                    </span>
                    <span className="text-base sm:text-lg font-black text-gray-900">
                      {formatCurrency(coelbaTotal, false)}
                    </span>
                  </div>

                  {/* Bloco 6: Total a pagar com desconto */}
                  <div className="border-2 border-[#1b7a3e] rounded-2xl px-4 py-3 bg-white flex items-center justify-between">
                    <span className="text-xs sm:text-sm font-extrabold text-[#156231]">
                      TOTAL A PAGAR COM DESCONTO:
                    </span>
                    <span className="text-2xl sm:text-3xl font-black text-[#156231] tracking-tight">
                      {formatCurrency(neoTotal, false)}
                    </span>
                  </div>
                </div>

                {/* Bloco 7: Desconto Neo Energia com Valor E Percentual */}
                <div className="sm:col-span-4 bg-[#e97825] rounded-2xl p-2.5 text-white flex flex-col justify-between items-center text-center shadow-md">
                  <div className="bg-white/90 text-[#e97825] font-black text-[10px] sm:text-[11px] px-3 py-0.5 rounded-full uppercase tracking-wider">
                    DESCONTO NEO ENERGIA
                  </div>
                  <div className="my-1">
                    <span className="text-2xl sm:text-3xl font-black tracking-tight drop-shadow-xs">
                      {formatCurrency(savingsAmount, false)}
                    </span>
                    {/* Badge do percentual em destaque solicitado pelo usuário */}
                    <div className="mt-1 bg-white text-[#c75d10] font-black text-xs px-2.5 py-0.5 rounded-full inline-block shadow-xs">
                      {formatNumberBr(savingsPercentage, 1)}% DE ECONOMIA REAL
                    </div>
                  </div>
                  <div className="flex items-center justify-center">
                    <div className="w-8 h-8 rounded-full bg-[#1b7a3e] flex items-center justify-center text-white border-2 border-white shadow-xs">
                      <Zap className="w-4 h-4 fill-yellow-300 text-yellow-300" />
                    </div>
                  </div>
                </div>
              </div>

              {/* BLOCO 8 — SUSTENTABILIDADE */}
              <div className="mt-3 py-1 px-3 bg-gradient-to-r from-emerald-100 via-green-50 to-emerald-100 rounded-xl border border-emerald-300 text-center flex items-center justify-center gap-2">
                <span className="text-base">🌳🌳☀️⚡⚡</span>
                <span className="text-xs sm:text-sm font-black text-[#156231] tracking-wide uppercase">
                  PARABÉNS! O PLANETA AGRADECE A SUA ESCOLHA!
                </span>
              </div>

              {/* BLOCO 9 — TRANSPARÊNCIA NO DESCONTO (com Valor e Percentual detalhados) */}
              <div className="mt-3 bg-[#1d7b3f] text-white rounded-2xl p-3 text-center shadow-xs">
                <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-yellow-300 mb-1">
                  TRANSPARÊNCIA NO SEU DESCONTO
                </h3>
                <div className="space-y-1 text-[10px] sm:text-[11px] font-semibold leading-relaxed text-emerald-50">
                  <p>
                    ESTE MÊS FOI {formatNumberBr(simulatedInvoice.currentReading)} KWH –{' '}
                    {formatNumberBr(simulatedInvoice.previousReading)} KWH DO MÊS PASSADO ={' '}
                    {formatNumberBr(consumptionKwh)} KWH X {formatCurrency(neoTariff, false)} ={' '}
                    {formatCurrency(neoTotal, false)} REAIS PARA PAGAR.
                  </p>
                  <p>
                    SE FOSSE NA COELBA, SEGUNDO A CONCESSIONÁRIA PAGARIA {formatCurrency(coelbaTariff, false)} NO KWH,
                    ENTÃO O SENHOR PAGARIA {formatNumberBr(consumptionKwh)} KWH X{' '}
                    {formatCurrency(coelbaTariff, false)} = {formatCurrency(coelbaTotal, false)} REAIS.
                  </p>
                  <p className="text-yellow-200 font-bold text-xs">
                    ENTÃO TEVE UMA ECONOMIA DE {formatCurrency(savingsAmount, false)} REAIS ESTE MÊS (
                    {formatNumberBr(savingsPercentage, 1)}% DE DESCONTO GARANTIDO)!
                  </p>
                  <p className="text-emerald-200 font-semibold text-[10px]">
                    ESTIMATIVA DE ECONOMIA EM 12 MESES: {formatCurrency(annualSavings, true)}
                  </p>
                </div>
              </div>

              {/* BLOCO 10 & 11 — HISTÓRICO DE CONSUMO + LEITURA + VENCIMENTO */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 mt-3">
                {/* Histórico 12 Meses */}
                <div className="sm:col-span-4 border-2 border-[#1b7a3e] rounded-2xl p-2 bg-white">
                  <span className="text-[10px] font-black text-[#156231] tracking-wider block text-center mb-1">
                    HISTÓRICO DE CONSUMO (SIMULADO):
                  </span>
                  <div className="overflow-hidden border border-emerald-200 rounded-lg">
                    <table className="w-full text-[10px] text-gray-800 text-center">
                      <thead>
                        <tr className="bg-emerald-100/70 text-[#156231] font-black border-b border-emerald-200">
                          <th className="py-0.5 px-1 border-r border-emerald-200">MÊS/ANO</th>
                          <th className="py-0.5 px-1">KWH</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {MONTH_NAMES_BR.map((mName, index) => {
                          const mNum = index + 1;
                          const isCurrent = mNum === refMonth;
                          return (
                            <tr
                              key={mName}
                              className={isCurrent ? 'bg-amber-100/80 font-bold' : index % 2 === 0 ? 'bg-gray-50/50' : ''}
                            >
                              <td className="py-0.5 px-1 text-left pl-2 border-r border-gray-100 font-medium">
                                {mName}
                              </td>
                              <td className="py-0.5 px-1 font-bold text-gray-900">
                                {isCurrent ? formatNumberBr(consumptionKwh) : formatNumberBr(Math.round(consumptionKwh * (0.95 + (index % 3) * 0.05)))}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Leitura Deste Mês */}
                <div className="sm:col-span-3 border-2 border-[#1b7a3e] rounded-2xl p-2.5 bg-white flex flex-col justify-between text-center">
                  <div className="border-b border-emerald-100 pb-1">
                    <span className="text-[11px] font-black text-[#156231] block">LEITURA DESTE MÊS</span>
                  </div>

                  <div className="my-1">
                    <span className="text-[10px] font-black text-gray-600 block uppercase">LEITURA INICIAL</span>
                    <span className="text-[11px] font-bold text-gray-800 block">
                      {formatDateBr(simulatedInvoice.previousReadingDate)}
                    </span>
                    <span className="text-sm font-black text-gray-900 block mt-0.5">
                      {formatNumberBr(simulatedInvoice.previousReading)} KWH
                    </span>
                  </div>

                  <div className="border-t border-emerald-100 pt-1">
                    <span className="text-[10px] font-black text-gray-600 block uppercase">LEITURA FINAL</span>
                    <span className="text-[11px] font-bold text-gray-800 block">
                      {formatDateBr(simulatedInvoice.currentReadingDate)}
                    </span>
                    <span className="text-sm font-black text-gray-900 block mt-0.5">
                      {formatNumberBr(simulatedInvoice.currentReading)} KWH
                    </span>
                  </div>
                </div>

                {/* Vencimento e Informações Adicionais */}
                <div className="sm:col-span-5 flex flex-col gap-2.5">
                  <div className="border-2 border-[#1b7a3e] rounded-2xl p-2 text-center bg-white">
                    <span className="text-[10px] font-black text-[#156231] tracking-wider block">
                      DATA VENCIMENTO:
                    </span>
                    <p className="text-xl sm:text-2xl font-black text-[#156231] tracking-wide mt-0.5">
                      {formatDateBr(simulatedInvoice.dueDate)}
                    </p>
                  </div>

                  <div className="border-2 border-[#1b7a3e] rounded-2xl p-2 bg-white flex flex-col justify-between flex-1">
                    <span className="text-[10px] font-black text-[#156231] tracking-wider block text-center mb-1">
                      INFORMAÇÕES ADICIONAIS
                    </span>
                    <div className="bg-[#e97825] rounded-xl p-3 text-center my-auto shadow-xs space-y-1">
                      <p className="text-white font-black text-sm leading-tight">
                        PAGAMENTO VIA BOLETO BANCÁRIO OU PIX.
                      </p>
                      <p className="text-orange-100 text-[10px] font-bold uppercase tracking-tight">
                        Orçamento referente à fatura da Coelba apresentada pelo cliente.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* BLOCO 12 — RESUMO ACUMULADO DE ECONOMIA */}
              <div className="mt-3 bg-[#e97825] rounded-2xl p-2.5 text-white shadow-md">
                <div className="flex items-center justify-between px-2 mb-1.5 border-b border-orange-400/60 pb-1">
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-800 flex items-center justify-center text-white text-[11px] font-black">
                      $
                    </div>
                    <span className="text-[9px] sm:text-[10px] font-black tracking-wide uppercase">
                      RESUMO DA SUA ECONOMIA GARANTIDA COM A NEO ENERGIA
                    </span>
                  </div>
                  <div className="text-xs">📅</div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center items-center">
                  <div className="bg-orange-600/50 rounded-xl p-1.5 border border-orange-400/40">
                    <span className="text-[9px] font-black uppercase block text-orange-100">MESES E ANO</span>
                    <span className="text-xs sm:text-sm font-black text-white">
                      {String(refMonth).padStart(2, '0')}/{refYear}
                    </span>
                  </div>
                  <div className="bg-orange-600/50 rounded-xl p-1.5 border border-orange-400/40">
                    <span className="text-[9px] font-black uppercase block text-orange-100">DESCONTO REAL</span>
                    <span className="text-xs sm:text-sm font-black text-white">
                      {formatNumberBr(savingsPercentage, 1)}% OFF
                    </span>
                  </div>
                  <div className="bg-orange-600/50 rounded-xl p-1.5 border border-orange-400/40">
                    <span className="text-[9px] font-black uppercase block text-orange-100">ECONOMIA ESTIMADA</span>
                    <span className="text-xs sm:text-sm font-black text-yellow-200">
                      R$ = {formatCurrency(savingsAmount, false)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Rodapé Externo da Fatura */}
            <div className="text-center mt-3 text-white">
              <p className="text-sm sm:text-base font-black tracking-wider drop-shadow-md">
                JUNTOS VAMOS TRANSFORMAR O MUNDO!
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL DE ENVIO VIA WHATSAPP COM PRINT DA IMAGEM */}
      {whatsappModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 p-3 sm:p-4 backdrop-blur-xs flex items-center justify-center">
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-5 sm:p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-[#25D366] text-white flex items-center justify-center shadow-xs">
                  <Phone className="w-5 h-5 fill-white" />
                </div>
                <div>
                  <h3 className="text-base font-black text-gray-900">
                    Enviar Orçamento via WhatsApp
                  </h3>
                  <p className="text-xs text-gray-500">
                    Disparo direto com mensagem formatada e imagem print da fatura
                  </p>
                </div>
              </div>
              <button
                onClick={() => setWhatsappModalOpen(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Campo do Telefone */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Número do WhatsApp do Cliente (com DDD):
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">
                  🇧🇷 +55
                </span>
                <input
                  type="tel"
                  value={phoneForZap}
                  onChange={(e) => setPhoneForZap(e.target.value)}
                  placeholder="(73) 99999-9999"
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 pl-20 pr-4 py-2.5 text-sm font-black text-gray-900 focus:bg-white focus:border-emerald-600 focus:outline-none"
                  autoFocus
                />
              </div>
              <p className="text-[11px] text-gray-500 mt-1">
                Basta digitar com DDD, ex: <strong>73999998888</strong> ou <strong>(73) 99999-8888</strong>.
              </p>
            </div>

            {/* Resumo da Proposta */}
            <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-200 text-xs space-y-1.5">
              <div className="flex justify-between font-bold text-emerald-950">
                <span>Cliente:</span>
                <span>{clientName}</span>
              </div>
              <div className="p-1.5 rounded-lg bg-emerald-100/90 border border-emerald-300 text-[11px] text-emerald-950 font-semibold italic">
                "Orçamento referente à fatura da Coelba apresentada pelo cliente."
              </div>
              <div className="flex justify-between text-gray-700">
                <span>Consumo:</span>
                <span className="font-bold">{formatNumberBr(consumptionKwh)} kWh</span>
              </div>
              <div className="flex justify-between text-gray-700">
                <span>Total Coelba vs Neo:</span>
                <span>{formatCurrency(coelbaTotal)} ➜ <strong className="text-emerald-800">{formatCurrency(neoTotal)}</strong></span>
              </div>
              <div className="flex justify-between font-black text-[#e97825] border-t border-emerald-200/80 pt-1">
                <span>Economia Mensal Garantida:</span>
                <span>{formatCurrency(savingsAmount)} ({formatNumberBr(savingsPercentage, 1)}% OFF)</span>
              </div>
            </div>

            {/* Instruções do Print da Imagem */}
            <div className="bg-amber-50 rounded-xl p-3 border border-amber-200 text-xs text-amber-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-amber-950">
                <ImageIcon className="w-4 h-4 text-amber-600" />
                <span>Como funciona o print da fatura:</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                Ao clicar em enviar, a imagem do print é <strong>gerada em alta qualidade</strong>, 
                copiada para a sua área de transferência e baixada no seu aparelho. No WhatsApp Web ou App,
                basta dar <strong>Ctrl + V</strong> (Colar) para enviar o print junto com a proposta!
              </p>
            </div>

            {/* Ações do Modal */}
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={copyTextToClipboard}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 px-3.5 py-2.5 text-xs font-bold text-gray-700 transition cursor-pointer"
                title="Copiar texto da mensagem"
              >
                {copiedSuccess ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                <span>{copiedSuccess ? 'Texto Copiado!' : 'Copiar Texto'}</span>
              </button>

              <button
                onClick={handleSendWhatsapp}
                disabled={isGeneratingImage}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-white font-black px-4 py-2.5 text-xs sm:text-sm transition shadow-md cursor-pointer disabled:opacity-50"
              >
                <Phone className="w-4 h-4 fill-white" />
                <span>{isGeneratingImage ? 'Gerando Print...' : 'Gerar Print e Abrir WhatsApp ➜'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
