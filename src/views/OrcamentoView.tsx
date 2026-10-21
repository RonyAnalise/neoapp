import React, { useState, useRef, useEffect } from 'react';
import html2canvas from 'html2canvas';
import * as htmlToImage from 'html-to-image';
import {
  Calculator,
  Printer,
  Copy,
  Check,
  Zap,
  Sparkles,
  Phone,
  FileText,
  CheckCircle2,
  X,
  TrendingDown,
  Percent,
  RefreshCw,
  Download,
  Image as ImageIcon,
  Search,
} from 'lucide-react';
import { Cliente, EmpresaConfig, EnergyTariffs, Fatura } from '../types';
import {
  formatCurrency,
  formatNumberBr,
  formatDateBr,
  formatReferencePeriod,
  calculateDaysBetween,
  MONTH_NAMES_BR,
} from '../lib/calculations';

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
//a
  // Datas simuladas
  const now = new Date();
  const [refMonth, setRefMonth] = useState<number>(now.getMonth() + 1);
  const [refYear, setRefYear] = useState<number>(now.getFullYear());
  const dueDateStr = new Date(now.getTime() + 15 * 86400000).toISOString().split('T')[0];

  // Estados de ações
  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false);
  const [copiedSuccess, setCopiedSuccess] = useState(false);
  const [copiedImageSuccess, setCopiedImageSuccess] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [lastActionStatus, setLastActionStatus] = useState<string>('');

  // Estados da busca interativa de cliente
  const [clientSearch, setClientSearch] = useState<string>('');
  const [isClientSearchOpen, setIsClientSearchOpen] = useState(false);
  const clientSearchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (clientSearchRef.current && !clientSearchRef.current.contains(event.target as Node)) {
        setIsClientSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  // Ao alterar a Tarifa Unitária Coelba (até 4 casas decimais), atualiza o valor total
  const handleCoelbaTariffChange = (newTariff: number) => {
    const val = Math.max(0, Math.round(newTariff * 10000) / 10000);
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
    if (!clientId) {
      setClientSearch('');
      return;
    }
    const c = clientes.find((cli) => cli.id === clientId);
    if (c) {
      setClientSearch(c.name || '');
      setClientName(c.name || 'CLIENTE');
      setClientCpf(c.cpfCnpj || '000.000.000-00');
      setClientCity(c.city || empresa.city || 'ITABUNA');
      setClientState(c.state || empresa.state || 'BA');
      setClientCodeCoelba(c.clientCodeCoelba || '7092185421');
      setMeterNumber(c.meterNumber || c.consumerUnit || '09218542');
      if (c.phone || c.whatsapp) {
        setPhoneForZap(c.whatsapp || c.phone || '');
      }
      if (c.customNeoTariff && c.customNeoTariff > 0) {
        handleNeoTariffChange(c.customNeoTariff);
      } else {
        handleNeoTariffChange(defaultNeoTariff);
      }
      if (c.customCoelbaTariff && c.customCoelbaTariff > 0) {
        handleCoelbaTariffChange(c.customCoelbaTariff);
      } else {
        handleCoelbaTariffChange(defaultCoelbaTariff);
      }
    }
  };

  // Cálculos de economia
  const savingsAmount = Math.max(0, Math.round((coelbaTotal - neoTotal) * 100) / 100);
  const savingsPercentage =
    coelbaTotal > 0 ? Math.round((savingsAmount / coelbaTotal) * 1000) / 10 : 0;
  const annualSavings = Math.round(savingsAmount * 12 * 100) / 100;
  const annualNeoTotal = Math.round(neoTotal * 12 * 100) / 100;
  const kwhDifference = Math.max(0, Math.round((coelbaTariff - neoTariff) * 10000) / 10000);

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
      `*PROPOSTA / SIMULAÇÃO DE ORÇAMENTO — NEO ENERGIA SOLAR*\n\n` +
      `Olá, *${clientName}*! Preparamos a simulação da sua fatura de energia solar:\n` +
      `📋 _Orçamento referente à fatura da Coelba apresentada pelo cliente._\n\n` +
      `⚡ *Consumo Estimado:* ${formatNumberBr(consumptionKwh)} kWh\n` +
      `• *Tarifa Coelba:* ${formatCurrency(coelbaTariff, true, 4)} por kWh\n` +
      `• *Tarifa Neo Energia:* ${formatCurrency(neoTariff)} por kWh\n\n` +
      `🔥 *DIFERENÇA NO VALOR DO KWH: VOCÊ PAGA ${formatCurrency(kwhDifference, true, 4)} A MENOS POR KWH!* 🔥\n` +
      `Você pagará *${formatCurrency(kwhDifference, true, 4)} a menos por kWh* consumido com a Neo Energia em relação à Coelba!\n\n` +
      `📄 *Segue em anexo a imagem do orçamento oficial da sua fatura.*\n` +
      `Sem taxas de instalação ou custos extras! Vamos economizar juntos?`
    );
  };

  // 1. Ação: Imprimir via Navegador (Garante que comece do topo da página e caiba em 1 folha A4)
  const handlePrint = () => {
    window.scrollTo(0, 0);
    const scrollContainer = document.querySelector('.overflow-y-auto');
    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
    }
    setTimeout(() => {
      window.print();
    }, 150);
  };

  // 2. Ação: Enviar por Zap (abre modal para digitar número e disparar)
  const handleOpenWhatsappModal = () => {
    setWhatsappModalOpen(true);
  };

  // Função utilitária para download confiável de Blob no PC e Celular
  const downloadBlobFile = (blob: Blob, fileName: string) => {
    try {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.rel = 'noopener noreferrer';
      link.target = '_blank';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (document.body.contains(link)) {
          document.body.removeChild(link);
        }
        URL.revokeObjectURL(url);
      }, 5000);
    } catch (e) {
      console.error('Download blob error:', e);
    }
  };

  // Captura o elemento visual da fatura (#orcamento-invoice-container) gerando imagem em alta resolução
  const captureInvoiceBlob = async (): Promise<Blob | null> => {
    if (!invoicePrintRef.current) return null;

    // Estratégia 1: html-to-image toPng com skipFonts: true (Evita SecurityError de fontes externas e suporta Tailwind v4)
    try {
      const dataUrl = await htmlToImage.toPng(invoicePrintRef.current, {
        quality: 0.95,
        pixelRatio: 2,
        backgroundColor: '#1b7a3e',
        skipFonts: true,
        cacheBust: false,
      });
      if (dataUrl && dataUrl.startsWith('data:image')) {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        if (blob && blob.size > 0) return blob;
      }
    } catch (err) {
      console.warn('htmlToImage.toPng falhou, tentando toBlob...', err);
    }

    // Estratégia 2: html-to-image toBlob direto com skipFonts: true
    try {
      const blob = await htmlToImage.toBlob(invoicePrintRef.current, {
        quality: 0.95,
        pixelRatio: 2,
        backgroundColor: '#1b7a3e',
        skipFonts: true,
        cacheBust: false,
      });
      if (blob && blob.size > 0) return blob;
    } catch (err) {
      console.warn('htmlToImage.toBlob falhou, tentando html2canvas...', err);
    }

    // Estratégia 3: html2canvas fallback
    try {
      const canvas = await html2canvas(invoicePrintRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#1b7a3e',
      });
      return new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 0.95));
    } catch (err) {
      console.error('Falha em todas as estratégias de captura:', err);
      return null;
    }
  };

  // Copia a imagem renderizada para a Área de Transferência e faz download automático
  const copyImageToClipboard = async () => {
    try {
      setGeneratingImage(true);
      const blob = await captureInvoiceBlob();
      if (!blob) throw new Error('Não foi possível gerar a imagem da fatura.');

      const fileName = `Orcamento_NeoEnergia_${(clientName || 'Cliente').replace(/\s+/g, '_')}.png`;

      // 1. Sempre dispara o download do arquivo de imagem (Salva no Celular e PC)
      downloadBlobFile(blob, fileName);

      // 2. Tenta copiar para o Clipboard (Ctrl+V)
      let copied = false;
      const pngBlob = blob.type === 'image/png' ? blob : blob.slice(0, blob.size, 'image/png');
      if (navigator.clipboard && window.ClipboardItem) {
        try {
          const item = new ClipboardItem({ 'image/png': pngBlob });
          await navigator.clipboard.write([item]);
          copied = true;
        } catch (clipErr) {
          console.warn('Não foi possível copiar diretamente para a área de transferência:', clipErr);
        }
      }

      if (copied) {
        setCopiedImageSuccess(true);
        setLastActionStatus('✅ Imagem da fatura copiada e baixada! Cole com Ctrl+V no WhatsApp.');
        setTimeout(() => setCopiedImageSuccess(false), 4000);
      } else {
        setLastActionStatus('✅ Imagem do orçamento baixada no seu aparelho!');
      }
    } catch (err) {
      console.error('Erro ao processar imagem:', err);
      setLastActionStatus('Aviso: Falha ao gerar imagem da fatura.');
    } finally {
      setGeneratingImage(false);
      setTimeout(() => setLastActionStatus(''), 5000);
    }
  };

  // Baixa o arquivo PNG da imagem da fatura
  const downloadInvoiceImage = async () => {
    try {
      setGeneratingImage(true);
      const blob = await captureInvoiceBlob();
      if (!blob) throw new Error('Falha ao renderizar a imagem.');
      const fileName = `Orcamento_NeoEnergia_${(clientName || 'Cliente').replace(/\s+/g, '_')}.png`;
      downloadBlobFile(blob, fileName);
      setLastActionStatus('✅ Imagem do orçamento salva nos downloads/galeria do seu dispositivo!');
    } catch (err) {
      console.error('Erro ao baixar imagem:', err);
      setLastActionStatus('Erro ao gerar arquivo de imagem.');
    } finally {
      setGeneratingImage(false);
      setTimeout(() => setLastActionStatus(''), 4000);
    }
  };

  // Disparo do WhatsApp com imagem e texto da proposta
  const handleSendWhatsapp = async () => {
    const cleanPhone = phoneForZap.replace(/\D/g, '');
    const formattedPhone =
      cleanPhone.length >= 10
        ? cleanPhone.length <= 11
          ? `55${cleanPhone}`
          : cleanPhone
        : '';
    const msg = generateWhatsAppMessage();
    const zapUrl = formattedPhone
      ? `https://wa.me/${formattedPhone}?text=${encodeURIComponent(msg)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;

    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const fileName = `Orcamento_NeoEnergia_${(clientName || 'Cliente').replace(/\s+/g, '_')}.png`;

    setGeneratingImage(true);
    try {
      const blob = await captureInvoiceBlob();

      if (blob) {
        // Baixa o arquivo para salvar no celular (galeria/downloads) e no computador
        downloadBlobFile(blob, fileName);

        // No celular: suporte a Web Share API para enviar a imagem diretamente ao WhatsApp
        if (navigator.share) {
          try {
            const file = new File([blob], fileName, { type: 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
              await navigator.share({
                files: [file],
                text: msg,
                title: 'Orçamento Neo Energia',
              });
              setLastActionStatus('✅ Orçamento e imagem compartilhados com sucesso!');
              setWhatsappModalOpen(false);
              return;
            }
          } catch (shareErr: unknown) {
            if (shareErr instanceof Error && shareErr.name === 'AbortError') {
              return;
            }
            console.log('Share fallback:', shareErr);
          }
        }

        // No Desktop: copia para o Clipboard para envio rápido via Ctrl+V
        if (!isMobile && navigator.clipboard && window.ClipboardItem) {
          try {
            const item = new ClipboardItem({ 'image/png': blob });
            await navigator.clipboard.write([item]);
          } catch (clipErr) {
            console.warn('Clipboard write error:', clipErr);
          }
        }
      }

      // Abre o WhatsApp garantidamente com link seguro para celular e desktop
      const openZapLink = () => {
        try {
          const a = document.createElement('a');
          a.href = zapUrl;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            if (document.body.contains(a)) document.body.removeChild(a);
          }, 1000);
        } catch {
          window.open(zapUrl, '_blank');
        }
      };

      openZapLink();

      setLastActionStatus(
        isMobile
          ? '📸 Imagem salva no aparelho e WhatsApp aberto!'
          : '📸 Imagem copiada e baixada! Ao abrir o WhatsApp, tecle Ctrl+V para colar a imagem.'
      );
      setWhatsappModalOpen(false);
    } catch (err: unknown) {
      try {
        const a = document.createElement('a');
        a.href = zapUrl;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          if (document.body.contains(a)) document.body.removeChild(a);
        }, 1000);
      } catch {
        window.open(zapUrl, '_blank');
      }
      setLastActionStatus('WhatsApp aberto com a proposta de orçamento!');
    } finally {
      setGeneratingImage(false);
      setTimeout(() => setLastActionStatus(''), 7000);
    }
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
      {lastActionStatus && (
        <div className="py-2.5 px-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-bold flex items-center justify-between no-print shadow-xs animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{lastActionStatus}</span>
          </div>
          <button
            onClick={() => setLastActionStatus('')}
            className="text-emerald-500 hover:text-emerald-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

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
                    onChange={(e) => {
                      const val = e.target.value;
                      handleCoelbaTariffChange(val === '' ? defaultCoelbaTariff : Number(val));
                    }}
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
                    onChange={(e) => {
                      const val = e.target.value;
                      handleNeoTariffChange(val === '' ? defaultNeoTariff : Number(val));
                    }}
                    className="w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 py-1.5 text-xs font-bold text-gray-700 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Dados do Cliente / Prospect para a Proposta */}
          <div className="border-t border-gray-100 pt-3 space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-700">
                  4. Personalizar Dados do Cliente na Fatura:
                </span>
                {selectedClientId && (
                  <button
                    type="button"
                    onClick={() => handleSelectClient('')}
                    className="text-[11px] font-bold text-rose-600 hover:text-rose-800 transition cursor-pointer"
                  >
                    Desvincular cliente
                  </button>
                )}
              </div>

              {/* Campo de Busca Interativo com Autocomplete (não sai da tela) */}
              <div className="relative w-full" ref={clientSearchRef}>
                <div className="relative flex items-center">
                  <Search className="absolute left-3 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={clientSearch}
                    onFocus={() => setIsClientSearchOpen(true)}
                    onChange={(e) => {
                      setClientSearch(e.target.value);
                      setIsClientSearchOpen(true);
                    }}
                    placeholder="🔍 Digite para buscar cliente cadastrado..."
                    className="w-full rounded-xl border border-gray-300 bg-gray-50 pl-9 pr-8 py-2 text-xs font-bold text-gray-900 focus:bg-white focus:border-emerald-600 focus:outline-none transition shadow-2xs"
                  />
                  {clientSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setClientSearch('');
                        handleSelectClient('');
                        setIsClientSearchOpen(false);
                      }}
                      className="absolute right-2.5 p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
                      title="Limpar busca"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Lista suspensa contida (max-w-full com overflow-y-auto para não sair da tela) */}
                {isClientSearchOpen && (
                  <div className="absolute left-0 right-0 z-40 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-2xl space-y-1">
                    {clientes.filter((c) => {
                      if (!clientSearch.trim()) return true;
                      const term = clientSearch.toLowerCase();
                      const name = (c.name || '').toLowerCase();
                      const uc = (c.consumerUnit || '').toLowerCase();
                      const code = (c.clientCodeCoelba || '').toLowerCase();
                      const meter = (c.meterNumber || '').toLowerCase();
                      return name.includes(term) || uc.includes(term) || code.includes(term) || meter.includes(term);
                    }).length === 0 ? (
                      <div className="py-3 px-3 text-center text-xs text-gray-500">
                        Nenhum cliente encontrado para "{clientSearch}"
                      </div>
                    ) : (
                      clientes
                        .filter((c) => {
                          if (!clientSearch.trim()) return true;
                          const term = clientSearch.toLowerCase();
                          const name = (c.name || '').toLowerCase();
                          const uc = (c.consumerUnit || '').toLowerCase();
                          const code = (c.clientCodeCoelba || '').toLowerCase();
                          const meter = (c.meterNumber || '').toLowerCase();
                          return name.includes(term) || uc.includes(term) || code.includes(term) || meter.includes(term);
                        })
                        .slice(0, 15)
                        .map((c) => {
                          const isSelected = c.id === selectedClientId;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                handleSelectClient(c.id);
                                setIsClientSearchOpen(false);
                              }}
                              className={`w-full text-left p-2 rounded-lg transition flex items-center justify-between gap-2 cursor-pointer ${
                                isSelected
                                  ? 'bg-emerald-50 text-emerald-950 font-bold border border-emerald-300'
                                  : 'hover:bg-gray-100 text-gray-800'
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-black truncate">{c.name}</p>
                                <p className="text-[10px] text-gray-500 truncate">
                                  {c.consumerUnit || c.city || ''}{' '}
                                  {c.clientCodeCoelba ? `• Cód: ${c.clientCodeCoelba}` : ''}
                                  {c.customCoelbaTariff
                                    ? ` • Coelba: R$ ${formatCurrency(c.customCoelbaTariff, false, 4)}`
                                    : ''}
                                </p>
                              </div>
                              {isSelected && (
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                              )}
                            </button>
                          );
                        })
                    )}
                  </div>
                )}
              </div>
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
                  Valor da Economia (Neste Mês)
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
                <span>Tarifa Coelba:</span>
                <span className="text-base font-black text-white">
                  {formatCurrency(coelbaTariff, true, 4)}/kWh
                </span>
              </div>
              <div className="flex items-center justify-between text-xs font-semibold text-orange-100">
                <span>Diferença no valor do kWh:</span>
                <span className="text-yellow-300 font-black">{formatNumberBr(savingsPercentage, 1)}% a menos</span>
              </div>
              <div className="flex items-center justify-between text-xs font-semibold text-orange-100">
                <span>Tarifa Neo Energia:</span>
                <span className="text-yellow-200 font-bold">{formatCurrency(neoTariff)}/kWh</span>
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
      <div className="bg-gray-100 p-3 sm:p-6 rounded-2xl border border-gray-300 shadow-inner print:p-0 print:m-0 print:border-none print:bg-transparent print:shadow-none print:rounded-none">
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
              className="flex items-center gap-1.5 rounded-xl bg-[#25D366] hover:bg-[#20ba59] px-4 py-2 text-xs font-bold text-white transition cursor-pointer shadow-xs"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Enviar via Zap</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 px-4 py-2 text-xs font-bold text-white transition cursor-pointer shadow-xs"
              title="Imprimir orçamento em folha A4"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir Orçamento</span>
            </button>
          </div>
        </div>

        {/* CONTAINER DA FATURA PARA CAPTURA (html2canvas) E IMPRESSÃO */}
        <div className="overflow-x-auto flex justify-center py-2 print:p-0 print:m-0 print:overflow-visible print:block">
          <div
            ref={invoicePrintRef}
            id="orcamento-invoice-container"
            className="invoice-card bg-[#1b7a3e] p-3 sm:p-5 text-gray-900 rounded-3xl shadow-2xl font-sans w-full print:p-0 print:rounded-none print:shadow-none print:m-0 print:w-[210mm] print:h-[297mm] print:max-w-none"
            style={{
              maxWidth: '820px',
              background: 'linear-gradient(180deg, #1d7b3f 0%, #156231 100%)',
            }}
          >
            {/* Outer White Card with Rounded Corners */}
            <div className="bg-white rounded-[26px] p-4 sm:p-6 shadow-inner relative flex flex-col justify-between h-full print:rounded-none print:shadow-none">
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
                  {/* Bloco 6: Total a pagar com desconto */}
                  <div className="border-2 border-[#1b7a3e] rounded-2xl px-4 py-3 bg-white flex items-center justify-between">
                    <div>
                      <span className="text-xs sm:text-sm font-extrabold text-[#156231] block">
                        TOTAL A PAGAR COM DESCONTO:
                      </span>
                      <span className="text-[11px] font-black text-[#1b7a3e]">
                        VOCÊ PAGA {formatCurrency(kwhDifference, true, 4)} A MENOS POR KWH ENTRE A NEO ENERGIA E A COELBA!
                      </span>
                    </div>
                    <span className="text-2xl sm:text-3xl font-black text-[#156231] tracking-tight">
                      {formatCurrency(neoTotal, false)}
                    </span>
                  </div>
                </div>

                {/* Bloco 7: Desconto Neo Energia — Valor da Economia em Reais */}
                <div className="sm:col-span-4 bg-[#e97825] rounded-2xl p-2.5 text-white flex flex-col justify-between items-center text-center shadow-md">
                  <div className="bg-white/90 text-[#e97825] font-black text-[10px] sm:text-[11px] px-3 py-0.5 rounded-full uppercase tracking-wider">
                    VALOR DA ECONOMIA
                  </div>
                  <div className="my-1.5">
                    <span className="text-2xl sm:text-3xl font-black tracking-tight drop-shadow-xs text-white">
                      {formatCurrency(savingsAmount, false)}
                    </span>
                    <span className="block text-[10px] font-bold text-orange-100 uppercase mt-0.5">
                      ECONOMIA NESTE MÊS
                    </span>
                  </div>
                  <div className="flex items-center justify-center">
                    <div className="w-7 h-7 rounded-full bg-[#1b7a3e] flex items-center justify-center text-white border-2 border-white shadow-xs">
                      <Zap className="w-3.5 h-3.5 fill-yellow-300 text-yellow-300" />
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

              {/* BLOCO 9 — TRANSPARÊNCIA NO DESCONTO (com Porcentagem de diferença no kWh) */}
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
                    SE FOSSE NA COELBA, SEGUNDO A CONCESSIONÁRIA PAGARIA {formatCurrency(coelbaTariff, false, 4)} NO KWH,
                    ENTÃO O SENHOR PAGARIA {formatNumberBr(consumptionKwh)} KWH X{' '}
                    {formatCurrency(coelbaTariff, false, 4)} = {formatCurrency(coelbaTotal, false)} REAIS.
                  </p>
                  <p className="text-yellow-300 font-black text-xs sm:text-sm pt-0.5">
                    DIFERENÇA NO VALOR DO KWH: VOCÊ PAGA {formatCurrency(kwhDifference, true, 4)} A MENOS POR KWH ENTRE A NEO ENERGIA E A COELBA!
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

                  <div className="my-0.5">
                    <span className="text-[10px] font-black text-gray-600 block uppercase">LEITURA INICIAL</span>
                    <span className="text-[11px] font-bold text-gray-800 block">
                      {formatDateBr(simulatedInvoice.previousReadingDate)}
                    </span>
                    <span className="text-sm font-black text-gray-900 block mt-0.5">
                      {formatNumberBr(simulatedInvoice.previousReading)} KWH
                    </span>
                  </div>

                  {/* Qtd de Dias Utilizados entre Leitura Anterior e Atual */}
                  <div className="border-t border-b border-emerald-100 py-1 my-0.5 bg-emerald-50/70 rounded-md">
                    <span className="text-[9px] font-black text-gray-600 block uppercase tracking-wider">
                      DIAS UTILIZADOS
                    </span>
                    <span className="text-xs sm:text-sm font-black text-[#156231] block">
                      {calculateDaysBetween(simulatedInvoice.previousReadingDate, simulatedInvoice.currentReadingDate) !== null
                        ? `${calculateDaysBetween(simulatedInvoice.previousReadingDate, simulatedInvoice.currentReadingDate)} DIAS`
                        : '-'}
                    </span>
                  </div>

                  <div className="my-0.5">
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

              {/* BLOCO 12 — RESUMO DA ECONOMIA GARANTIDA */}
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
                    <span className="text-[9px] font-black uppercase block text-orange-100">MÊS E ANO</span>
                    <span className="text-xs sm:text-sm font-black text-white">
                      {String(refMonth).padStart(2, '0')}/{refYear}
                    </span>
                  </div>
                  <div className="bg-orange-600/50 rounded-xl p-1.5 border border-orange-400/40">
                    <span className="text-[9px] font-black uppercase block text-orange-100">VALOR ANUAL ECONOMIZADO</span>
                    <span className="text-xs sm:text-sm font-black text-white">
                      R$ = {formatCurrency(annualSavings, false)}
                    </span>
                  </div>
                  <div className="bg-orange-600/50 rounded-xl p-1.5 border border-orange-400/40">
                    <span className="text-[9px] font-black uppercase block text-orange-100">VALOR DA ECONOMIA</span>
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
                <span>Diferença no valor do kWh:</span>
                <span className="text-emerald-800 font-black">{formatCurrency(kwhDifference, true, 4)} a menos</span>
              </div>
            </div>

            {/* Dica de Envio com Imagem */}
            <div className="rounded-xl bg-emerald-50/80 border border-emerald-200 p-2.5 text-[11px] text-emerald-950 flex items-start gap-2">
              <ImageIcon className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <span>
                <strong>Envio com Imagem da Fatura:</strong> A imagem em alta definição da impressão é gerada automaticamente. No celular ela vai anexada diretamente no WhatsApp; no computador ela é copiada para você colar com <strong>Ctrl+V</strong> no chat!
              </span>
            </div>

            {/* Ações do Modal */}
            <div className="space-y-2 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={copyTextToClipboard}
                  disabled={generatingImage}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 px-3 py-2 text-xs font-bold text-gray-700 transition cursor-pointer"
                  title="Copiar texto da mensagem"
                >
                  {copiedSuccess ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedSuccess ? 'Texto Copiado!' : 'Copiar Texto'}</span>
                </button>

                <button
                  type="button"
                  onClick={copyImageToClipboard}
                  disabled={generatingImage}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 px-3 py-2 text-xs font-bold text-gray-700 transition cursor-pointer"
                  title="Copiar imagem para colar no WhatsApp Web com Ctrl+V"
                >
                  {copiedImageSuccess ? <Check className="w-4 h-4 text-emerald-600" /> : <ImageIcon className="w-4 h-4 text-emerald-600" />}
                  <span>{copiedImageSuccess ? 'Imagem Copiada!' : 'Copiar Imagem (Ctrl+V)'}</span>
                </button>

                <button
                  type="button"
                  onClick={downloadInvoiceImage}
                  disabled={generatingImage}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 px-3 py-2 text-xs font-bold text-gray-700 transition cursor-pointer"
                  title="Baixar arquivo de imagem PNG do orçamento"
                >
                  <Download className="w-4 h-4 text-blue-600" />
                  <span>Baixar PNG</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleSendWhatsapp}
                disabled={generatingImage}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-white font-black px-4 py-3 text-xs sm:text-sm transition shadow-md cursor-pointer disabled:opacity-60"
              >
                {generatingImage ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Gerando Imagem da Fatura...</span>
                  </>
                ) : (
                  <>
                    <Phone className="w-4 h-4 fill-white" />
                    <span>Disparar WhatsApp com Imagem da Fatura ➜</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
