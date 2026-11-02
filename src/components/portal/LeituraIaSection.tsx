import React, { useState, useMemo, useEffect } from 'react';
import {
  Camera,
  Sparkles,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  FileText,
  DollarSign,
  TrendingDown,
  RefreshCw,
  Clock,
  ShieldCheck,
  Zap,
  Info,
  Calendar,
  Layers,
  ArrowRight,
  RotateCcw,
  Lock,
  CalendarCheck,
  AlertTriangle,
  Download,
} from 'lucide-react';
import { Cliente, EmpresaConfig, EnergyTariffs, Fatura, Leitura } from '../../types';
import {
  formatCurrency,
  formatNumberBr,
  formatDateBr,
  formatReferencePeriod,
  MONTH_NAMES_BR,
} from '../../lib/calculations';
import { downloadMeterPhoto } from '../../lib/photoService';

interface LeituraIaSectionProps {
  linkedClients: Cliente[];
  selectedMeterId: string;
  onSelectMeterId: (id: string) => void;
  faturas: Fatura[];
  leituras: Leitura[];
  tariffs?: EnergyTariffs;
  empresa: EmpresaConfig;
  onIssueInvoice?: (invoiceData: Omit<Fatura, 'id' | 'createdAt'>) => Promise<void>;
  onRegisterReading?: (readingData: Omit<Leitura, 'id' | 'createdAt'>) => Promise<void>;
  onInvoiceCreatedSuccess?: (fatura: Fatura) => void;
  onOpenInvoiceModal?: (fatura: Fatura) => void;
}

// Utilitário para compactar a imagem mantendo excelente nitidez do display
function compressImageForOcr(file: File, maxWidth = 1280, quality = 0.85): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth || height > maxWidth) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxWidth) / height);
            height = maxWidth;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Erro ao inicializar canvas'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const mimeType = 'image/jpeg';
        const base64 = canvas.toDataURL(mimeType, quality);
        resolve({ base64, mimeType });
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

export const LeituraIaSection: React.FC<LeituraIaSectionProps> = ({
  linkedClients,
  selectedMeterId,
  onSelectMeterId,
  faturas,
  leituras,
  tariffs,
  empresa,
  onIssueInvoice,
  onRegisterReading,
  onInvoiceCreatedSuccess,
  onOpenInvoiceModal,
}) => {
  // Cliente ativo para a leitura
  const activeClient = useMemo(() => {
    if (selectedMeterId !== 'all') {
      const found = linkedClients.find((c) => c.id === selectedMeterId);
      if (found) return found;
    }
    return linkedClients[0];
  }, [linkedClients, selectedMeterId]);

  // Faturas deste cliente específico ordenadas da mais recente para a mais antiga
  const clientFaturas = useMemo(() => {
    if (!activeClient) return [];
    return faturas
      .filter((f) => f.clientId === activeClient.id)
      .sort((a, b) => {
        if (b.referenceYear !== a.referenceYear) return b.referenceYear - a.referenceYear;
        return b.referenceMonth - a.referenceMonth;
      });
  }, [faturas, activeClient]);

  // Leituras deste cliente específico
  const clientLeituras = useMemo(() => {
    if (!activeClient) return [];
    return leituras
      .filter((l) => l.clientId === activeClient.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [leituras, activeClient]);

  // Última fatura emitida para este cliente
  const lastFatura = clientFaturas[0];

  // Última leitura registrada
  const previousReadingValue = lastFatura
    ? lastFatura.currentReading
    : clientLeituras[0]?.currentReadingValue || 0;

  const previousReadingDate = lastFatura
    ? lastFatura.currentReadingDate
    : clientLeituras[0]?.currentReadingDate || '';

  // Regra de Emissão no Portal do Cliente:
  // 1. Clientes pelo portal só podem emitir fatura a partir do dia 28 de cada mês.
  // 2. Após emitir a fatura do ciclo, só poderão voltar a emitir no dia 28 do próximo mês.
  // 3. Se a fatura do mês for apagada pelo administrador, o cliente pode gerar a fatura com foto novamente!
  const emissionWindow = useMemo(() => {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' });
    const [yearStr, monthStr, dayStr] = formatter.format(now).split('-');
    const currentYear = parseInt(yearStr, 10);
    const currentMonth = parseInt(monthStr, 10); // 1-12
    const currentDay = parseInt(dayStr, 10); // 1-31

    const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;

    const nextAllowedMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const nextAllowedYear = currentMonth === 12 ? currentYear + 1 : currentYear;

    // Caso 1: A partir do dia 28 (dias 28 a 31)
    // O período de leitura deste mês está aberto para a competência de currentMonth / currentYear.
    if (currentDay >= 28) {
      const activeCurrentCycleInvoice = clientFaturas.find(
        (f) =>
          f.status !== 'cancelled' &&
          f.referenceMonth === currentMonth &&
          f.referenceYear === currentYear
      );

      // Se a fatura deste ciclo NÃO existe (nunca foi gerada ou foi apagada pelo administrador):
      if (!activeCurrentCycleInvoice) {
        return {
          isAllowed: true,
          reason: 'allowed' as const,
          currentDay,
          currentMonth,
          currentYear,
          targetMonth: currentMonth,
          targetYear: currentYear,
          nextAllowedDateStr: `28/${String(currentMonth).padStart(2, '0')}/${currentYear}`,
          message: `Período de leitura aberto! Tire a foto do medidor para emitir sua fatura de ${MONTH_NAMES_BR[currentMonth - 1]}/${currentYear}.`,
        };
      }

      // Se já existe uma fatura emitida para este mês (e não foi apagada):
      const nextAllowedDateStr = `28/${String(nextAllowedMonth).padStart(2, '0')}/${nextAllowedYear}`;
      return {
        isAllowed: false,
        reason: 'already_issued_this_cycle' as const,
        currentDay,
        currentMonth,
        currentYear,
        targetMonth: currentMonth,
        targetYear: currentYear,
        existingInvoice: activeCurrentCycleInvoice,
        nextAllowedDateStr,
        nextAllowedMonth,
        nextAllowedYear,
        message: `Você já emitiu sua fatura de ${MONTH_NAMES_BR[currentMonth - 1]}/${currentYear}. A próxima fatura só poderá ser emitida a partir do dia 28 de ${MONTH_NAMES_BR[nextAllowedMonth - 1]} de ${nextAllowedYear}. Se esta fatura for apagada pelo administrador, a emissão com foto será liberada novamente.`,
      };
    }

    // Caso 2: Antes do dia 28 (dias 1 a 27)
    // O ciclo que abriu no dia 28 passado corresponde à competência de prevMonth / prevYear (ex: Outubro quando hoje é Novembro).
    const activePrevCycleInvoice = clientFaturas.find(
      (f) =>
        f.status !== 'cancelled' &&
        f.referenceMonth === prevMonth &&
        f.referenceYear === prevYear
    );

    // Se a fatura desse mês foi apagada (ou ainda não foi gerada), o cliente pode gerar a fatura com foto novamente!
    if (!activePrevCycleInvoice) {
      return {
        isAllowed: true,
        reason: 'allowed' as const,
        currentDay,
        currentMonth,
        currentYear,
        targetMonth: prevMonth,
        targetYear: prevYear,
        nextAllowedDateStr: `28/${String(prevMonth).padStart(2, '0')}/${prevYear}`,
        message: `A fatura de ${MONTH_NAMES_BR[prevMonth - 1]}/${prevYear} está disponível para emissão (ou foi apagada pelo administrador). Tire a foto do medidor para emitir novamente!`,
      };
    }

    // Se a fatura do ciclo anterior já existe normalmente, o cliente deve aguardar o dia 28 deste mês:
    const daysRemaining = 28 - currentDay;
    const nextAllowedDateStr = `28/${String(currentMonth).padStart(2, '0')}/${currentYear}`;
    return {
      isAllowed: false,
      reason: 'before_day_28' as const,
      currentDay,
      currentMonth,
      currentYear,
      daysRemaining,
      targetMonth: currentMonth,
      targetYear: currentYear,
      existingInvoice: activePrevCycleInvoice,
      nextAllowedDateStr,
      message: `Sua fatura de ${MONTH_NAMES_BR[prevMonth - 1]}/${prevYear} já está registrada. A próxima emissão (${MONTH_NAMES_BR[currentMonth - 1]}/${currentYear}) estará liberada a partir do dia 28 de ${MONTH_NAMES_BR[currentMonth - 1]} (faltam ${daysRemaining} dia${daysRemaining > 1 ? 's' : ''}). Se a fatura do mês for apagada pelo administrador, você poderá gerar novamente com foto.`,
    };
  }, [clientFaturas]);

  const nextMonth = emissionWindow.targetMonth;
  const nextYear = emissionWindow.targetYear;

  // Estados de Imagem e IA
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoFileName, setPhotoFileName] = useState<string>('');
  const [photoMimeType, setPhotoMimeType] = useState<string>('image/jpeg');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Dados extraídos pela IA
  const [identifiedReading, setIdentifiedReading] = useState<number | null>(null);
  const [aiConfidence, setAiConfidence] = useState<'high' | 'medium' | 'low' | null>(null);
  const [aiNotes, setAiNotes] = useState<string | null>(null);
  const [identifiedMeterNumber, setIdentifiedMeterNumber] = useState<string | null>(null);

  // Ajuste manual pelo cliente se necessário
  const [manualReadingInput, setManualReadingInput] = useState<string>('');

  // Status de geração da fatura
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false);
  const [generationSuccess, setGenerationSuccess] = useState<Fatura | null>(null);

  // Se a fatura recém-gerada for apagada no banco pelo administrador, limpa o estado de sucesso
  // para permitir que o cliente gere a fatura com foto novamente
  useEffect(() => {
    if (generationSuccess) {
      const stillExists = clientFaturas.some(
        (f) => f.id === generationSuccess.id && f.status !== 'cancelled'
      );
      if (!stillExists) {
        setGenerationSuccess(null);
        setPhotoBase64(null);
        setPhotoFileName('');
        setIdentifiedReading(null);
        setManualReadingInput('');
      }
    }
  }, [clientFaturas, generationSuccess]);

  // Leitura atual efetiva (manual ou da IA)
  const effectiveCurrentReading = useMemo(() => {
    if (manualReadingInput.trim() !== '') {
      const parsed = parseFloat(manualReadingInput.replace(/\./g, '').replace(',', '.'));
      if (!isNaN(parsed)) return parsed;
    }
    return identifiedReading ?? null;
  }, [manualReadingInput, identifiedReading]);

  // Consumo calculado
  const calculatedConsumption = useMemo(() => {
    if (effectiveCurrentReading === null) return 0;
    return Math.max(0, effectiveCurrentReading - previousReadingValue);
  }, [effectiveCurrentReading, previousReadingValue]);

  // Verificação de inconsistência (se a nova leitura for menor que a anterior)
  const isReadingLowerThanPrevious =
    effectiveCurrentReading !== null && effectiveCurrentReading < previousReadingValue;

  // Tarifas aplicadas
  const appliedNeoTariff = activeClient?.customNeoTariff || tariffs?.neoTariff || 1.0;
  const appliedCoelbaTariff =
    activeClient?.customCoelbaTariff || tariffs?.coelbaReferenceTariff || 1.21;

  // Cálculos financeiros simulados da fatura do mês atual
  const neoAmount = Number((calculatedConsumption * appliedNeoTariff).toFixed(2));
  const coelbaEstimateAmount = Number((calculatedConsumption * appliedCoelbaTariff).toFixed(2));
  const savingsAmount = Number(Math.max(0, coelbaEstimateAmount - neoAmount).toFixed(2));
  const savingsPercentage =
    coelbaEstimateAmount > 0
      ? Number(((savingsAmount / coelbaEstimateAmount) * 100).toFixed(1))
      : 0;

  // Data de vencimento sugerida (padrão da empresa, ex: 10 dias)
  const paymentDueDays = empresa.paymentDueDays || 10;
  const targetDueDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + paymentDueDays);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
  }, [paymentDueDays]);

  // Executa ou reexecuta a análise de IA sobre a foto
  const analyzeImage = async (base64: string, mime: string) => {
    setAnalysisError(null);
    setIsAnalyzing(true);

    try {
      // Envia para o endpoint do servidor com fallback inteligente de modelos
      const res = await fetch('/api/meter/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType: mime,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        if (json.isApiKeyMissing) {
          throw new Error(
            'A chave da API Gemini não está vinculada nesta versão publicada do app. Você pode digitar os dígitos do medidor diretamente no campo abaixo para emitir a fatura normalmente!'
          );
        }
        throw new Error(json.details || json.error || 'Falha ao processar leitura do medidor');
      }

      const { readingValue, meterNumber, confidence, notes } = json.data || {};

      if (typeof readingValue === 'number' && !isNaN(readingValue)) {
        setIdentifiedReading(readingValue);
        setManualReadingInput(String(readingValue));
      } else {
        setAnalysisError(
          notes ||
            'Não conseguimos extrair o número com total certeza. Por favor, confira o visor na foto e digite ou ajuste a leitura no campo abaixo.'
        );
      }

      setAiConfidence(confidence || 'medium');
      setAiNotes(notes || null);
      if (meterNumber) setIdentifiedMeterNumber(meterNumber);
    } catch (err: unknown) {
      console.error('Erro na análise da foto:', err);
      const errMsg =
        err instanceof Error
          ? err.message
          : 'A análise automática encontrou uma instabilidade temporária. Você pode digitar os dígitos do medidor diretamente no campo abaixo ou clicar para tentar novamente.';
      setAnalysisError(errMsg);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Upload e Análise da Foto com a IA
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setGenerationSuccess(null);
    try {
      setPhotoFileName(file.name);
      const { base64, mimeType } = await compressImageForOcr(file);
      setPhotoBase64(base64);
      setPhotoMimeType(mimeType);
      await analyzeImage(base64, mimeType);
    } catch (err: unknown) {
      console.error('Erro ao compactar imagem:', err);
      setAnalysisError('Falha ao processar imagem da foto. Tente selecionar novamente.');
    }
  };

  // Criação da Fatura e Registro da Leitura no Banco de Dados
  const handleConfirmAndCreateInvoice = async () => {
    if (!emissionWindow.isAllowed) {
      alert(emissionWindow.message);
      return;
    }
    if (!photoBase64) {
      alert('É obrigatório tirar a foto do medidor para emitir a fatura.');
      return;
    }
    if (!activeClient || effectiveCurrentReading === null) return;
    if (!onIssueInvoice) {
      alert('Função de emissão de faturas não disponível.');
      return;
    }

    setIsGeneratingInvoice(true);
    try {
      const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
      const nowIso = new Date().toISOString();
      const expiresAtIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const invoiceNum = `NEO-${nextYear}${String(nextMonth).padStart(2, '0')}-${String(
        Math.floor(1000 + Math.random() * 9000)
      )}`;

      const invoicePayload: Omit<Fatura, 'id' | 'createdAt'> = {
        invoiceNumber: invoiceNum,
        clientId: activeClient.id,
        clientName: activeClient.name,
        meterNumber: activeClient.meterNumber || activeClient.consumerUnit || activeClient.clientCodeCoelba,
        consumerUnit: activeClient.consumerUnit || activeClient.clientCodeCoelba,
        referenceMonth: nextMonth,
        referenceYear: nextYear,
        previousReading: previousReadingValue,
        previousReadingDate: previousReadingDate || todayStr,
        currentReading: effectiveCurrentReading,
        currentReadingDate: todayStr,
        consumptionKwh: calculatedConsumption,
        appliedNeoTariff,
        appliedCoelbaTariff,
        neoAmount,
        coelbaEstimateAmount,
        savingsAmount,
        savingsPercentage,
        totalToPay: neoAmount,
        issueDate: todayStr,
        dueDate: targetDueDate,
        status: 'pending',
        notes: `Fatura gerada a partir de foto do medidor enviada pelo cliente no Portal. Leitura identificada por IA: ${effectiveCurrentReading} kWh. Foto guardada por 30 dias com expiração em ${formatDateBr(expiresAtIso.split('T')[0])}.`,
        meterPhotoBase64: photoBase64,
        meterPhotoUploadedAt: nowIso,
        meterPhotoExpiresAt: expiresAtIso,
        aiIdentifiedReading: identifiedReading ?? effectiveCurrentReading,
        aiConfidence: aiConfidence || 'medium',
        historicalCompanyData: empresa,
        historicalClientData: activeClient,
        createdBy: `${activeClient.name} (Portal do Cliente via IA)`,
      };

      // 1. Registra no Firestore via handler do App
      await onIssueInvoice(invoicePayload);

      // 2. Se houver handler de leitura, registra a leitura associada
      if (onRegisterReading) {
        await onRegisterReading({
          clientId: activeClient.id,
          meterId: activeClient.meterNumber || activeClient.consumerUnit || activeClient.clientCodeCoelba || 'Padrao',
          previousReadingDate: previousReadingDate || todayStr,
          previousReadingValue: previousReadingValue,
          currentReadingDate: todayStr,
          currentReadingValue: effectiveCurrentReading,
          calculatedConsumption,
          referenceMonth: nextMonth,
          referenceYear: nextYear,
          status: 'valid',
          meterPhotoBase64: photoBase64,
          meterPhotoUploadedAt: nowIso,
          meterPhotoExpiresAt: expiresAtIso,
          aiIdentifiedReading: identifiedReading ?? effectiveCurrentReading,
          aiConfidence: aiConfidence || 'medium',
          notes: `Leitura registrada pelo cliente com foto e IA`,
          createdBy: `${activeClient.name} (Portal)`,
        }).catch(() => {});
      }

      const simulatedCreated: Fatura = {
        id: `fat-sim-${Date.now()}`,
        createdAt: nowIso,
        ...invoicePayload,
      };

      setGenerationSuccess(simulatedCreated);
      if (onInvoiceCreatedSuccess) {
        onInvoiceCreatedSuccess(simulatedCreated);
      }
    } catch (err: unknown) {
      console.error('Erro ao gerar fatura:', err);
      alert('Ocorreu um erro ao gerar a fatura. Por favor, tente novamente.');
    } finally {
      setIsGeneratingInvoice(false);
    }
  };

  const handleResetForm = () => {
    setPhotoBase64(null);
    setPhotoFileName('');
    setIdentifiedReading(null);
    setManualReadingInput('');
    setAiConfidence(null);
    setAiNotes(null);
    setAnalysisError(null);
    setGenerationSuccess(null);
  };

  if (!activeClient) {
    return (
      <div className="bg-white rounded-2xl p-8 border border-gray-200 text-center text-gray-500">
        Nenhum cliente ou medidor selecionado.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Seletor de Medidor Obrigatório se o cliente possuir mais de 1 cadastro/medidor */}
      {linkedClients.length > 1 && (
        <div className="bg-white rounded-2xl p-5 border-2 border-emerald-500 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-700 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-black text-gray-900 uppercase">
                  Escolha o Medidor para Emitir a Fatura
                </h3>
                <p className="text-xs text-gray-500">
                  Você possui <strong>{linkedClients.length} cadastros de medidores</strong>. Cada relógio gera sua fatura separada.
                </p>
              </div>
            </div>
            <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full uppercase self-start sm:self-auto">
              {linkedClients.length} Medidores Vinculados
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
            {linkedClients.map((c) => {
              const isSelected = activeClient.id === c.id;
              const targetMonth = emissionWindow.targetMonth;
              const targetYear = emissionWindow.targetYear;
              const meterInvoice = faturas.find(
                (f) =>
                  f.clientId === c.id &&
                  f.referenceMonth === targetMonth &&
                  f.referenceYear === targetYear &&
                  f.status !== 'cancelled'
              );

              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onSelectMeterId(c.id);
                    handleResetForm();
                  }}
                  className={`p-3.5 rounded-2xl border-2 text-left transition cursor-pointer flex flex-col justify-between gap-2 relative ${
                    isSelected
                      ? 'bg-emerald-50/90 border-emerald-600 shadow-xs ring-2 ring-emerald-600/20'
                      : 'bg-white border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/20'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Zap className={`w-3.5 h-3.5 ${isSelected ? 'text-emerald-700' : 'text-gray-400'}`} />
                        <span className="text-xs font-black text-gray-900">
                          {c.consumerUnit || c.meterNumber || c.clientCodeCoelba || 'Medidor'}
                        </span>
                      </div>
                      <span className="text-[11px] text-gray-600 font-bold block mt-0.5">
                        Medidor Nº: <strong>{c.meterNumber || c.consumerUnit || c.clientCodeCoelba}</strong>
                      </span>
                    </div>
                    {isSelected ? (
                      <span className="text-[10px] bg-emerald-700 text-white font-black px-2 py-0.5 rounded-full uppercase shrink-0 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Selecionado
                      </span>
                    ) : meterInvoice ? (
                      <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-full uppercase shrink-0">
                        Fatura Emitida
                      </span>
                    ) : (
                      <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded-full uppercase shrink-0">
                        Liberado
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] text-gray-500 pt-1.5 border-t border-gray-100 space-y-0.5">
                    <div className="truncate">
                      Endereço: <strong>{c.address ? `${c.address}, ${c.number}` : c.city}</strong>
                    </div>
                    <div className="text-[10px] text-gray-400">
                      Cód. Coelba: {c.clientCodeCoelba}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Banner Principal com Apresentação da Funcionalidade */}
      <div className="rounded-2xl p-6 bg-gradient-to-r from-[#0c3319] via-[#145a2b] to-[#0c3319] text-white shadow-md relative overflow-hidden">
        <div className="relative z-10 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="bg-yellow-400 text-emerald-950 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 shadow-xs">
              <Sparkles className="w-3 h-3 text-emerald-950" />
              Inteligência Artificial Neo Energia
            </span>
            <span
              className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                emissionWindow.isAllowed
                  ? 'bg-emerald-400 text-emerald-950'
                  : 'bg-amber-400 text-amber-950'
              }`}
            >
              {emissionWindow.isAllowed ? '● Emissão Liberada (Ciclo Dia 28)' : `● Próxima Emissão: ${emissionWindow.nextAllowedDateStr}`}
            </span>
            <span className="text-xs text-emerald-200 font-semibold">
              Foto com Retenção de 30 Dias
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black mt-2">
            Tire uma Foto do seu Medidor e Gere sua Fatura na Hora
          </h2>
          <p className="text-xs sm:text-sm text-emerald-100/90 mt-1.5 leading-relaxed">
            {emissionWindow.isAllowed ? (
              <>
                Aponte a câmera para o visor do seu relógio de energia. Nossa Inteligência Artificial
                identifica automaticamente o consumo atual, compara com a sua última fatura e cria a
                fatura do mês de{' '}
                <strong className="text-yellow-300">
                  {MONTH_NAMES_BR[nextMonth - 1]}/{nextYear}
                </strong>{' '}
                com o cálculo exato da sua economia garantida!
              </>
            ) : (
              <>
                A emissão de faturas pelo Portal do Cliente fica liberada a partir do dia 28 de cada mês.
                Após emitir, o próximo ciclo estará disponível no dia 28 seguinte.
              </>
            )}
          </p>
        </div>
      </div>

      {/* Card Informativo de Status da Regra do Dia 28 */}
      {!emissionWindow.isAllowed && (
        <div
          className={`rounded-2xl p-5 border-2 shadow-sm animate-in fade-in duration-300 ${
            emissionWindow.reason === 'already_issued_this_cycle'
              ? 'bg-blue-50 border-blue-300 text-blue-950'
              : 'bg-amber-50 border-amber-300 text-amber-950'
          }`}
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-xs ${
                  emissionWindow.reason === 'already_issued_this_cycle'
                    ? 'bg-blue-600 text-white'
                    : 'bg-amber-600 text-white'
                }`}
              >
                {emissionWindow.reason === 'already_issued_this_cycle' ? (
                  <CalendarCheck className="w-6 h-6" />
                ) : (
                  <Lock className="w-6 h-6" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                      emissionWindow.reason === 'already_issued_this_cycle'
                        ? 'bg-blue-200 text-blue-900'
                        : 'bg-amber-200 text-amber-900'
                    }`}
                  >
                    {emissionWindow.reason === 'already_issued_this_cycle'
                      ? 'Fatura do Ciclo Já Emitida'
                      : 'Emissão Aberta a Partir do Dia 28'}
                  </span>
                  <span className="text-xs font-bold opacity-75">
                    Próxima Emissão: {emissionWindow.nextAllowedDateStr}
                  </span>
                </div>
                <h3 className="text-base font-black mt-1">
                  {emissionWindow.reason === 'already_issued_this_cycle'
                    ? `Fatura de ${MONTH_NAMES_BR[emissionWindow.currentMonth - 1]}/${emissionWindow.currentYear} já cadastrada`
                    : `Leitura liberada apenas a partir do dia 28`}
                </h3>
                <p className="text-xs mt-0.5 leading-relaxed opacity-90">
                  {emissionWindow.message}
                </p>
              </div>
            </div>

            {emissionWindow.reason === 'already_issued_this_cycle' &&
              emissionWindow.existingInvoice &&
              onOpenInvoiceModal && (
                <button
                  type="button"
                  onClick={() => onOpenInvoiceModal(emissionWindow.existingInvoice!)}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition cursor-pointer shadow-xs shrink-0 self-start sm:self-center"
                >
                  <FileText className="w-4 h-4" />
                  <span>Ver Fatura Emitida (#{emissionWindow.existingInvoice.invoiceNumber})</span>
                </button>
              )}
          </div>
        </div>
      )}

      {/* Alerta de Sucesso após Gerar a Fatura */}
      {generationSuccess && (
        <div className="rounded-2xl p-6 bg-emerald-50 border-2 border-emerald-500 shadow-md animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div>
                <span className="bg-emerald-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Fatura Gerada com Sucesso!
                </span>
                <h3 className="text-lg font-black text-emerald-950 mt-1">
                  Fatura de {formatReferencePeriod(generationSuccess.referenceMonth, generationSuccess.referenceYear)} Emitida
                </h3>
                <p className="text-xs text-emerald-800 mt-0.5">
                  Fatura nº <strong>{generationSuccess.invoiceNumber}</strong> • Valor a pagar:{' '}
                  <strong className="text-emerald-900 font-black">
                    {formatCurrency(generationSuccess.totalToPay)}
                  </strong>{' '}
                  (Você economizou {formatCurrency(generationSuccess.savingsAmount)} nesta fatura!)
                </p>
                <p className="text-[11px] text-emerald-700 mt-1">
                  📸 A foto do medidor foi guardada por <strong>30 dias</strong> para comprovação e será excluída automaticamente após esse prazo.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              {generationSuccess.meterPhotoBase64 && (
                <button
                  type="button"
                  onClick={() =>
                    downloadMeterPhoto(
                      generationSuccess.meterPhotoBase64!,
                      `foto_medidor_${generationSuccess.invoiceNumber}`
                    )
                  }
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-emerald-400 bg-white hover:bg-emerald-50 text-emerald-800 font-bold text-xs transition cursor-pointer shadow-xs"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Baixar Foto do Medidor</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleResetForm}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-800 font-bold text-xs transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Nova Leitura</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grid com 3 Passos: 1. Última Fatura | 2. Foto & IA | 3. Fatura Atual */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* PASSO 1: Histórico da Última Fatura Postada */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gray-100 text-gray-700 font-black flex items-center justify-center text-xs">
                  1
                </div>
                <div>
                  <h3 className="text-sm font-black text-gray-900">Última Fatura Postada</h3>
                  <span className="text-[10px] font-bold text-emerald-800">
                    Medidor: {activeClient.meterNumber || activeClient.consumerUnit || activeClient.clientCodeCoelba}
                  </span>
                </div>
              </div>
              <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-bold">
                Ponto de Partida
              </span>
            </div>

            <div className="mt-4 space-y-3.5">
              {lastFatura ? (
                <>
                  <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                    <span className="text-[11px] font-bold text-gray-500 uppercase block">
                      Referência da Última Fatura:
                    </span>
                    <strong className="text-sm font-black text-gray-900 block mt-0.5">
                      {formatReferencePeriod(lastFatura.referenceMonth, lastFatura.referenceYear)} (Fatura #{lastFatura.invoiceNumber})
                    </strong>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                      <span className="text-[11px] font-bold text-emerald-700 uppercase block">
                        Leitura Anterior:
                      </span>
                      <strong className="text-base font-black text-emerald-950 block mt-0.5">
                        {formatNumberBr(previousReadingValue)} kWh
                      </strong>
                    </div>

                    <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                      <span className="text-[11px] font-bold text-gray-500 uppercase block">
                        Data Registrada:
                      </span>
                      <strong className="text-xs font-black text-gray-800 block mt-1">
                        {previousReadingDate ? formatDateBr(previousReadingDate) : 'Anterior'}
                      </strong>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 text-xs text-gray-600 space-y-1">
                    <div className="flex justify-between">
                      <span>Consumo no mês anterior:</span>
                      <strong className="text-gray-900">{formatNumberBr(lastFatura.consumptionKwh)} kWh</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Valor pago:</span>
                      <strong className="text-emerald-800">{formatCurrency(lastFatura.totalToPay)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Economia obtida:</span>
                      <strong className="text-emerald-700">{formatCurrency(lastFatura.savingsAmount)}</strong>
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-4 rounded-xl bg-gray-50 border border-dashed border-gray-200 text-center">
                  <p className="text-xs text-gray-500">
                    Nenhuma fatura anterior registrada para este cliente. A leitura informada será
                    o ponto inicial do medidor.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 text-[11px] text-gray-400 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 shrink-0 text-gray-400" />
            <span>A nova leitura será comparada com este valor para apurar o consumo.</span>
          </div>
        </div>

        {/* PASSO 2: Captura da Foto do Medidor & Leitura com IA */}
        <div className="bg-white rounded-2xl border-2 border-emerald-500/80 p-5 shadow-xs flex flex-col justify-between relative">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-700 text-white font-black flex items-center justify-center text-xs shadow-xs">
                  2
                </div>
                <h3 className="text-sm font-black text-gray-900">Foto do Medidor & IA</h3>
              </div>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-emerald-700" />
                OCR com Visão IA
              </span>
            </div>

            <div className="mt-4 space-y-3.5">
              {/* Botão para Acionar Câmera ou Selecionar Foto */}
              <label
                className={`block ${
                  !emissionWindow.isAllowed ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                }`}
              >
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoSelect}
                  className="hidden"
                  disabled={!emissionWindow.isAllowed || isAnalyzing || isGeneratingInvoice}
                />
                <div
                  className={`p-5 rounded-2xl border-2 border-dashed transition text-center flex flex-col items-center justify-center gap-2 ${
                    !emissionWindow.isAllowed
                      ? 'border-gray-300 bg-gray-50'
                      : photoBase64
                      ? 'border-emerald-500 bg-emerald-50/50 hover:bg-emerald-50'
                      : 'border-emerald-300 bg-emerald-50/30 hover:bg-emerald-50 hover:border-emerald-500'
                  }`}
                >
                  <div
                    className={`w-12 h-12 rounded-2xl text-white flex items-center justify-center shadow-xs ${
                      !emissionWindow.isAllowed ? 'bg-gray-400' : 'bg-emerald-700'
                    }`}
                  >
                    {!emissionWindow.isAllowed ? <Lock className="w-6 h-6" /> : <Camera className="w-6 h-6" />}
                  </div>
                  <div>
                    <span className="text-xs font-black text-emerald-950 block">
                      {!emissionWindow.isAllowed
                        ? `Emissão Fechada (Abre Dia 28)`
                        : photoBase64
                        ? 'Tirar Outra Foto / Substituir'
                        : 'Tirar Foto do Medidor Agora'}
                    </span>
                    <span className="text-[11px] text-gray-500 block mt-0.5">
                      {!emissionWindow.isAllowed
                        ? `Disponível a partir de ${emissionWindow.nextAllowedDateStr}`
                        : 'Abra a câmera do celular ou selecione da galeria'}
                    </span>
                  </div>
                </div>
              </label>

              {/* Pré-visualização da Foto Capturada */}
              {photoBase64 && (
                <div className="space-y-2">
                  <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-900 max-h-48 flex items-center justify-center shadow-2xs">
                    <img
                      src={photoBase64}
                      alt="Medidor de Energia"
                      className="max-h-48 w-full object-contain"
                    />
                    <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-xs text-white text-[10px] font-bold px-2 py-0.5 rounded-lg flex items-center gap-1">
                      <Camera className="w-3 h-3 text-emerald-400" />
                      Foto Carregada
                    </div>
                  </div>
                  {!isAnalyzing && (
                    <div className="flex items-center justify-between text-xs px-1">
                      <span className="text-gray-500 truncate max-w-[150px] text-[11px]">
                        {photoFileName || 'Foto do medidor'}
                      </span>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            downloadMeterPhoto(
                              photoBase64,
                              `foto_medidor_${activeClient?.name || 'cliente'}`
                            )
                          }
                          className="text-emerald-700 hover:text-emerald-900 text-[11px] font-bold cursor-pointer underline flex items-center gap-1"
                          title="Baixar cópia da foto tirada"
                        >
                          <Download className="w-3 h-3 text-emerald-700" />
                          <span>Baixar Foto</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPhotoBase64(null);
                            setPhotoFileName('');
                            setIdentifiedReading(null);
                            setManualReadingInput('');
                            setAnalysisError(null);
                            setAiNotes(null);
                            setIdentifiedMeterNumber(null);
                          }}
                          className="text-rose-600 hover:text-rose-800 text-[11px] font-bold cursor-pointer underline flex items-center gap-1"
                        >
                          ✕ Remover
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Estado de Carregamento da IA */}
              {isAnalyzing && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-center gap-3 animate-pulse">
                  <RefreshCw className="w-5 h-5 text-amber-600 animate-spin shrink-0" />
                  <div className="text-xs">
                    <strong className="block font-black">Analisando visor do medidor...</strong>
                    <span className="text-[11px] text-amber-700">
                      Nossa Inteligência Artificial está lendo os dígitos em kWh.
                    </span>
                  </div>
                </div>
              )}

              {/* Mensagem de Erro/Aviso na Análise */}
              {analysisError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-bold block">Aviso na leitura:</strong>
                      <span>{analysisError}</span>
                    </div>
                  </div>
                  {photoBase64 && !isAnalyzing && (
                    <button
                      type="button"
                      onClick={() => analyzeImage(photoBase64, photoMimeType)}
                      className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-[11px] transition cursor-pointer shadow-xs"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Tentar Ler Foto com IA Novamente</span>
                    </button>
                  )}
                </div>
              )}

              {/* Campo de Leitura Atual (Bloqueado sem foto | Editável com foto) */}
              <div
                className={`p-4 rounded-2xl transition border-2 space-y-2.5 ${
                  !photoBase64
                    ? 'bg-gray-50 border-gray-200'
                    : 'bg-emerald-50/70 border-emerald-500/80 shadow-xs'
                }`}
              >
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-gray-900 uppercase flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Leitura Atual do Medidor (kWh) *</span>
                  </label>
                  {!photoBase64 ? (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 uppercase flex items-center gap-1 border border-rose-200">
                      <Lock className="w-3 h-3 text-rose-600" />
                      Foto Obrigatória
                    </span>
                  ) : identifiedReading !== null ? (
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase flex items-center gap-1 ${
                        aiConfidence === 'high'
                          ? 'bg-emerald-700 text-white'
                          : 'bg-amber-500 text-white'
                      }`}
                    >
                      {aiConfidence === 'high' ? '✓ IA Identificou (Editável)' : '✓ IA (Editável - Conferir)'}
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 uppercase border border-blue-200">
                      ✏️ Digitação Liberada
                    </span>
                  )}
                </div>

                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    disabled={!emissionWindow.isAllowed || !photoBase64 || isAnalyzing}
                    value={manualReadingInput}
                    onChange={(e) => setManualReadingInput(e.target.value)}
                    placeholder={
                      !emissionWindow.isAllowed
                        ? `Liberado em ${emissionWindow.nextAllowedDateStr}`
                        : !photoBase64
                        ? '📸 Tire a foto do medidor acima para liberar a digitação'
                        : 'Digite ou edite os números do medidor (Ex: 15921)'
                    }
                    className={`w-full px-3.5 py-2.5 text-lg font-black rounded-xl focus:ring-2 focus:ring-emerald-600 focus:outline-hidden placeholder:text-gray-400 placeholder:text-xs placeholder:font-normal transition ${
                      !emissionWindow.isAllowed || !photoBase64 || isAnalyzing
                        ? 'bg-gray-100 text-gray-400 border-2 border-gray-300 cursor-not-allowed select-none'
                        : 'text-emerald-950 bg-white border-2 border-emerald-400'
                    }`}
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-black text-emerald-800 bg-emerald-100 px-2 py-1 rounded-md">
                    kWh
                  </span>
                </div>

                {!photoBase64 ? (
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block font-bold">Bloqueado sem foto:</strong>
                      Tire ou anexe a foto do visor do seu relógio medidor acima para poder digitar ou confirmar a leitura.
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-gray-600 leading-snug">
                    {identifiedReading !== null ? (
                      <span>
                        A IA identificou <strong>{identifiedReading} kWh</strong> na foto. Você pode <strong>editar o número acima</strong> livremente se precisar corrigir!
                      </span>
                    ) : (
                      <span>
                        Foto anexada! <strong>Digite ou edite os números</strong> que aparecem no visor do relógio para calcular o consumo.
                      </span>
                    )}
                  </div>
                )}

                {photoBase64 && identifiedReading !== null && !isAnalyzing && (
                  <button
                    type="button"
                    onClick={() => analyzeImage(photoBase64, photoMimeType)}
                    className="w-full py-1.5 px-3 rounded-lg bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 text-[11px] font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <RotateCcw className="w-3 h-3 text-emerald-700" />
                    <span>Reanalisar Foto com a IA</span>
                  </button>
                )}

                {aiNotes && (
                  <p className="text-[11px] text-emerald-900/90 bg-white/80 p-2 rounded-xl border border-emerald-200 leading-tight">
                    💬 <strong>Observação da IA:</strong> {aiNotes}
                  </p>
                )}
                {identifiedMeterNumber && (
                  <p className="text-[11px] text-gray-700 bg-white/80 px-2.5 py-1.5 rounded-xl border border-emerald-200 font-mono">
                    Nº de série visualizado: <strong>{identifiedMeterNumber}</strong>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Aviso Legal de Retenção de 30 Dias */}
          <div className="mt-4 pt-3 border-t border-gray-100 text-[11px] text-gray-500 flex items-start gap-1.5">
            <Clock className="w-3.5 h-3.5 shrink-0 text-emerald-700 mt-0.5" />
            <span>
              <strong>Retenção de 30 Dias:</strong> A foto ficará guardada no sistema por 30 dias para conferência e será excluída automaticamente após esse prazo.
            </span>
          </div>
        </div>

        {/* PASSO 3: Comparação de Consumo & Geração da Nova Fatura */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gray-100 text-gray-700 font-black flex items-center justify-center text-xs">
                  3
                </div>
                <div>
                  <h3 className="text-sm font-black text-gray-900">
                    Fatura de {MONTH_NAMES_BR[nextMonth - 1]}/{nextYear}
                  </h3>
                  <span className="text-[10px] font-bold text-emerald-800">
                    Medidor: {activeClient.meterNumber || activeClient.consumerUnit || activeClient.clientCodeCoelba}
                  </span>
                </div>
              </div>
              <span className="text-[10px] bg-yellow-100 text-yellow-900 px-2 py-0.5 rounded-full font-bold">
                Cálculo Automático
              </span>
            </div>

            <div className="mt-4 space-y-3.5">
              {/* Comparação da Leitura Atual com a Anterior */}
              <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-100 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500">Leitura Anterior:</span>
                  <strong className="text-gray-800">{formatNumberBr(previousReadingValue)} kWh</strong>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500">Nova Leitura (Foto):</span>
                  <strong className="text-emerald-800">
                    {effectiveCurrentReading !== null
                      ? `${formatNumberBr(effectiveCurrentReading)} kWh`
                      : 'Aguardando foto...'}
                  </strong>
                </div>

                <div className="pt-2 border-t border-gray-200 flex justify-between items-baseline">
                  <span className="text-xs font-black text-gray-900 uppercase">Consumo Apurado:</span>
                  <span className="text-lg font-black text-emerald-800">
                    {formatNumberBr(calculatedConsumption)} kWh
                  </span>
                </div>
              </div>

              {/* Alerta se leitura for menor que anterior */}
              {isReadingLowerThanPrevious && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    A leitura informada é menor que a anterior ({previousReadingValue} kWh). Por favor,
                    confira os números no visor ou informe se houve substituição de medidor.
                  </span>
                </div>
              )}

              {/* Simulação Financeira da Fatura */}
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">
                    Total na Neo Energia ({formatCurrency(appliedNeoTariff)}/kWh):
                  </span>
                  <strong className="text-sm font-black text-emerald-950">
                    {formatCurrency(neoAmount)}
                  </strong>
                </div>

                <div className="flex justify-between items-center text-gray-500">
                  <span>
                    Estimado na Concessionária ({formatCurrency(appliedCoelbaTariff)}/kWh):
                  </span>
                  <span className="line-through">{formatCurrency(coelbaEstimateAmount)}</span>
                </div>

                <div className="pt-2 border-t border-emerald-200/80 flex justify-between items-center">
                  <span className="font-extrabold text-emerald-800 uppercase flex items-center gap-1">
                    <TrendingDown className="w-3.5 h-3.5 text-emerald-600" />
                    Sua Economia no Mês:
                  </span>
                  <strong className="text-sm font-black text-emerald-800">
                    {formatCurrency(savingsAmount)}
                  </strong>
                </div>
              </div>

              {/* Data de Vencimento Prevista */}
              <div className="flex items-center justify-between text-xs text-gray-600 px-1">
                <span>Vencimento Previsto:</span>
                <strong className="text-gray-900">{formatDateBr(targetDueDate)}</strong>
              </div>
            </div>
          </div>

          {/* Botão de Criação da Fatura */}
          <div className="mt-5 pt-3 border-t border-gray-100">
            <button
              type="button"
              disabled={
                !emissionWindow.isAllowed ||
                !photoBase64 ||
                effectiveCurrentReading === null ||
                calculatedConsumption <= 0 ||
                isGeneratingInvoice ||
                isAnalyzing
              }
              onClick={handleConfirmAndCreateInvoice}
              className={`w-full py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition shadow-md cursor-pointer ${
                emissionWindow.isAllowed &&
                photoBase64 &&
                effectiveCurrentReading !== null &&
                calculatedConsumption > 0 &&
                !isGeneratingInvoice
                  ? 'bg-emerald-700 hover:bg-emerald-800 text-white shadow-emerald-700/20'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {isGeneratingInvoice ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Gerando Fatura no Sistema...</span>
                </>
              ) : !emissionWindow.isAllowed ? (
                <>
                  <Lock className="w-4 h-4" />
                  <span>
                    {emissionWindow.reason === 'already_issued_this_cycle'
                      ? `Fatura Já Emitida (Próxima em ${emissionWindow.nextAllowedDateStr})`
                      : `Liberado no Dia 28 (${emissionWindow.nextAllowedDateStr})`}
                  </span>
                </>
              ) : !photoBase64 ? (
                <>
                  <Camera className="w-4 h-4 text-gray-400" />
                  <span>Tire a Foto no Passo 2 Primeiro</span>
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  <span>
                    Confirmar e Gerar Fatura ({MONTH_NAMES_BR[nextMonth - 1]}/{nextYear})
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
