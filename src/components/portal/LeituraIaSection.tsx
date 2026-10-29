import React, { useState, useMemo } from 'react';
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
} from 'lucide-react';
import { Cliente, EmpresaConfig, EnergyTariffs, Fatura, Leitura } from '../../types';
import {
  formatCurrency,
  formatNumberBr,
  formatDateBr,
  formatReferencePeriod,
  MONTH_NAMES_BR,
} from '../../lib/calculations';

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

  // Determina o próximo mês e ano de faturamento
  const { nextMonth, nextYear } = useMemo(() => {
    if (lastFatura) {
      if (lastFatura.referenceMonth === 12) {
        return { nextMonth: 1, nextYear: lastFatura.referenceYear + 1 };
      }
      return { nextMonth: lastFatura.referenceMonth + 1, nextYear: lastFatura.referenceYear };
    }
    const now = new Date();
    return { nextMonth: now.getMonth() + 1, nextYear: now.getFullYear() };
  }, [lastFatura]);

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

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Falha ao processar leitura do medidor');
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
      setAnalysisError(
        'A análise automática encontrou uma instabilidade temporária. Você pode digitar os dígitos do medidor diretamente no campo abaixo ou clicar para tentar novamente.'
      );
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
          meterId: activeClient.consumerUnit || activeClient.clientCodeCoelba || 'Padrao',
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
      {/* Seletor de Medidor se o cliente possuir mais de 1 UC */}
      {linkedClients.length > 1 && (
        <div className="bg-white rounded-2xl p-4 border border-emerald-200 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-700" />
            <span className="text-xs font-bold text-gray-700 uppercase">
              Selecione o Medidor para Enviar a Foto:
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {linkedClients.map((c) => {
              const isSelected = activeClient.id === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onSelectMeterId(c.id);
                    handleResetForm();
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <span>{c.name}</span>
                  <span className="ml-1 text-[11px] opacity-80">
                    ({c.consumerUnit || c.clientCodeCoelba || 'UC'})
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Banner Principal com Apresentação da Funcionalidade */}
      <div className="rounded-2xl p-6 bg-gradient-to-r from-[#0c3319] via-[#145a2b] to-[#0c3319] text-white shadow-md relative overflow-hidden">
        <div className="relative z-10 max-w-3xl">
          <div className="flex items-center gap-2">
            <span className="bg-yellow-400 text-emerald-950 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 shadow-xs">
              <Sparkles className="w-3 h-3 text-emerald-950" />
              Inteligência Artificial Neo Energia
            </span>
            <span className="text-xs text-emerald-200 font-semibold">
              Foto com Retenção de 30 Dias
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black mt-2">
            Tire uma Foto do seu Medidor e Gere sua Fatura na Hora
          </h2>
          <p className="text-xs sm:text-sm text-emerald-100/90 mt-1.5 leading-relaxed">
            Aponte a câmera para o visor do seu relógio de energia. Nossa Inteligência Artificial
            identifica automaticamente o consumo atual, compara com a sua última fatura e cria a
            fatura do mês de{' '}
            <strong className="text-yellow-300">
              {MONTH_NAMES_BR[nextMonth - 1]}/{nextYear}
            </strong>{' '}
            com o cálculo exato da sua economia garantida!
          </p>
        </div>
      </div>

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
                <h3 className="text-sm font-black text-gray-900">Última Fatura Postada</h3>
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
              <label className="block cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoSelect}
                  className="hidden"
                  disabled={isAnalyzing || isGeneratingInvoice}
                />
                <div
                  className={`p-5 rounded-2xl border-2 border-dashed transition text-center flex flex-col items-center justify-center gap-2 ${
                    photoBase64
                      ? 'border-emerald-500 bg-emerald-50/50 hover:bg-emerald-50'
                      : 'border-emerald-300 bg-emerald-50/30 hover:bg-emerald-50 hover:border-emerald-500'
                  }`}
                >
                  <div className="w-12 h-12 rounded-2xl bg-emerald-700 text-white flex items-center justify-center shadow-xs">
                    <Camera className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-xs font-black text-emerald-950 block">
                      {photoBase64 ? 'Tirar Outra Foto / Substituir' : 'Tirar Foto do Medidor Agora'}
                    </span>
                    <span className="text-[11px] text-gray-500 block mt-0.5">
                      Abra a câmera do celular ou selecione da galeria
                    </span>
                  </div>
                </div>
              </label>

              {/* Pré-visualização da Foto Capturada */}
              {photoBase64 && (
                <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-900 max-h-48 flex items-center justify-center shadow-2xs">
                  <img
                    src={photoBase64}
                    alt="Medidor de Energia"
                    className="max-h-48 w-full object-contain"
                  />
                  <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-xs text-white text-[10px] font-bold px-2 py-0.5 rounded-lg">
                    Foto Capturada
                  </div>
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

              {/* Campo de Leitura Atual (Preenchido por IA ou Digitação Manual) */}
              <div className="p-4 rounded-2xl bg-emerald-50/70 border-2 border-emerald-500/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-gray-900 uppercase flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Leitura Atual do Medidor (kWh) *</span>
                  </label>
                  {identifiedReading !== null ? (
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
                        aiConfidence === 'high'
                          ? 'bg-emerald-700 text-white'
                          : 'bg-amber-500 text-white'
                      }`}
                    >
                      {aiConfidence === 'high' ? '✓ Identificado pela IA' : '✓ IA (Conferir)'}
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 uppercase">
                      Digitação Manual
                    </span>
                  )}
                </div>

                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={manualReadingInput}
                    onChange={(e) => setManualReadingInput(e.target.value)}
                    placeholder="Digite os números do medidor (Ex: 15921)"
                    className="w-full px-3.5 py-2.5 text-lg font-black text-emerald-950 bg-white border-2 border-emerald-400 rounded-xl focus:ring-2 focus:ring-emerald-600 focus:outline-hidden placeholder:text-gray-400 placeholder:text-xs placeholder:font-normal"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-black text-emerald-800 bg-emerald-100 px-2 py-1 rounded-md">
                    kWh
                  </span>
                </div>

                <div className="text-[11px] text-gray-600 leading-snug">
                  {identifiedReading !== null ? (
                    <span>
                      A IA identificou <strong>{identifiedReading} kWh</strong> na fotografia. Você pode confirmar ou corrigir o número acima se necessário.
                    </span>
                  ) : (
                    <span>
                      Digite o valor numérico que aparece no visor do medidor. O cálculo do consumo e economia será atualizado instantaneamente no Passo 3.
                    </span>
                  )}
                </div>

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
                <h3 className="text-sm font-black text-gray-900">
                  Fatura de {MONTH_NAMES_BR[nextMonth - 1]}/{nextYear}
                </h3>
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
                effectiveCurrentReading === null ||
                calculatedConsumption <= 0 ||
                isGeneratingInvoice ||
                isAnalyzing
              }
              onClick={handleConfirmAndCreateInvoice}
              className={`w-full py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition shadow-md cursor-pointer ${
                effectiveCurrentReading !== null && calculatedConsumption > 0 && !isGeneratingInvoice
                  ? 'bg-emerald-700 hover:bg-emerald-800 text-white shadow-emerald-700/20'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {isGeneratingInvoice ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Gerando Fatura no Sistema...</span>
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
