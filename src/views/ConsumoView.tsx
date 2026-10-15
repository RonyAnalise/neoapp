import React, { useState } from 'react';
import {
  Gauge,
  Plus,
  RefreshCw,
  Search,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  Calendar,
  Zap,
  ArrowRight,
  TrendingUp,
  Trash2,
} from 'lucide-react';
import { Cliente, Leitura, EnergyTariffs, Fatura } from '../types';
import {
  formatNumberBr,
  formatDateBr,
  formatReferencePeriod,
  getMonthName,
  calculateInvoice,
  formatCurrency,
  calculateDaysBetween,
} from '../lib/calculations';
import { logAuditEvent } from '../lib/auditService';
import { useAuth } from '../hooks/useAuth';

interface ConsumoViewProps {
  clientes: Cliente[];
  leituras: Leitura[];
  faturas?: Fatura[];
  tariffs: EnergyTariffs;
  onRegisterReading: (reading: Omit<Leitura, 'id' | 'createdAt'>) => Promise<void>;
  onDeleteReading?: (readingId: string) => Promise<void>;
  onNavigateToInvoice: (prefillClientId: string) => void;
}

export const ConsumoView: React.FC<ConsumoViewProps> = ({
  clientes,
  leituras,
  faturas = [],
  tariffs,
  onRegisterReading,
  onDeleteReading,
  onNavigateToInvoice,
}) => {
  const { userProfile, isAdmin } = useAuth();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [modalOpen, setModalOpen] = useState(false);
  const [meterSwapModalOpen, setMeterSwapModalOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [filterClientId, setFilterClientId] = useState('all');

  // Reading form state
  const [referenceMonth, setReferenceMonth] = useState(currentMonth);
  const [referenceYear, setReferenceYear] = useState(currentYear);
  const [initialReadingDate, setInitialReadingDate] = useState(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [initialReadingValue, setInitialReadingValue] = useState<number | ''>('');
  const [currentReadingDate, setCurrentReadingDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [currentReadingValue, setCurrentReadingValue] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Meter swap state
  const [oldMeterFinalReading, setOldMeterFinalReading] = useState<number | ''>('');
  const [newMeterInitialReading, setNewMeterInitialReading] = useState<number | ''>('');
  const [swapDate, setSwapDate] = useState(new Date().toISOString().split('T')[0]);
  const [swapJustification, setSwapJustification] = useState('');

  // Find the last valid reading for the selected client
  const clientReadings = leituras
    .filter((l) => l.clientId === selectedClientId && l.status === 'valid')
    .sort((a, b) => {
      if (a.referenceYear !== b.referenceYear) return b.referenceYear - a.referenceYear;
      return b.referenceMonth - a.referenceMonth;
    });

  const lastReading = clientReadings[0];
  const isFirstReadingForClient = !lastReading;

  // Selected client object
  const selectedClient = clientes.find((c) => c.id === selectedClientId);

  // Effective previous reading
  const effectivePreviousReading = isFirstReadingForClient
    ? Number(initialReadingValue) || 0
    : lastReading.currentReadingValue;

  const effectivePreviousDate = isFirstReadingForClient
    ? initialReadingDate
    : lastReading.currentReadingDate;

  // Computed consumption preview
  const currVal = typeof currentReadingValue === 'number' ? currentReadingValue : 0;
  const calculatedConsumption =
    currentReadingValue !== '' && currVal >= effectivePreviousReading
      ? currVal - effectivePreviousReading
      : 0;

  // Effective tariffs: client custom or app default
  const effectiveNeo =
    selectedClient?.customNeoTariff && selectedClient.customNeoTariff > 0
      ? selectedClient.customNeoTariff
      : tariffs.neoTariff;

  const effectiveCoelba =
    selectedClient?.customCoelbaTariff && selectedClient.customCoelbaTariff > 0
      ? selectedClient.customCoelbaTariff
      : tariffs.coelbaReferenceTariff;

  // Financial preview based on active tariffs
  const calcPreview =
    calculatedConsumption > 0
      ? calculateInvoice({
          previousReading: effectivePreviousReading,
          currentReading: currVal,
          neoTariff: effectiveNeo,
          coelbaTariff: effectiveCoelba,
        })
      : null;

  const handleOpenRegister = (clientId?: string) => {
    setError(null);
    if (clientId) {
      setSelectedClientId(clientId);
    } else if (clientes.length > 0 && !selectedClientId) {
      setSelectedClientId(clientes[0].id);
    }
    setCurrentReadingValue('');
    setInitialReadingValue('');
    setModalOpen(true);
  };

  const handleSaveReading = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedClientId) {
      setError('Selecione um cliente.');
      return;
    }

    if (isFirstReadingForClient && (initialReadingValue === '' || Number(initialReadingValue) < 0)) {
      setError('Por se tratar da primeira leitura do medidor, é obrigatório informar a leitura inicial.');
      return;
    }

    if (currentReadingValue === '' || Number(currentReadingValue) < 0) {
      setError('Informe o valor da leitura atual.');
      return;
    }

    if (Number(currentReadingValue) < effectivePreviousReading) {
      setError(
        `A leitura atual (${currentReadingValue} kWh) não pode ser inferior à leitura anterior (${effectivePreviousReading} kWh). Caso tenha ocorrido troca de medidor, utilize a opção "Troca de Medidor".`
      );
      return;
    }

    // Check for duplicate reading in same period
    const duplicate = leituras.find(
      (l) =>
        l.clientId === selectedClientId &&
        l.referenceMonth === referenceMonth &&
        l.referenceYear === referenceYear &&
        l.status === 'valid'
    );

    if (duplicate) {
      setError(
        `Já existe uma leitura registrada para este cliente no mês ${referenceMonth}/${referenceYear}. Não é permitida duplicidade.`
      );
      return;
    }

    setSaving(true);
    try {
      const consumption = Number(currentReadingValue) - effectivePreviousReading;

      await onRegisterReading({
        clientId: selectedClientId,
        previousReadingDate: effectivePreviousDate,
        previousReadingValue: effectivePreviousReading,
        currentReadingDate,
        currentReadingValue: Number(currentReadingValue),
        calculatedConsumption: consumption,
        referenceMonth,
        referenceYear,
        status: 'valid',
        createdBy: userProfile?.name || 'Operador',
      });

      await logAuditEvent({
        operationType: 'register_reading',
        collectionName: 'leituras',
        relatedDocument: selectedClientId,
        user: userProfile?.name || 'Operador',
        userEmail: userProfile?.email || '',
        newData: {
          clientId: selectedClientId,
          consumption,
          currentReadingValue,
          referencePeriod: `${referenceMonth}/${referenceYear}`,
        },
      });

      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao registrar leitura.');
    } finally {
      setSaving(false);
    }
  };

  const handleExecuteMeterSwap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientId || oldMeterFinalReading === '' || newMeterInitialReading === '') {
      alert('Preencha os valores do medidor anterior e do novo medidor.');
      return;
    }

    try {
      await onRegisterReading({
        clientId: selectedClientId,
        previousReadingDate: swapDate,
        previousReadingValue: Number(oldMeterFinalReading),
        currentReadingDate: swapDate,
        currentReadingValue: Number(newMeterInitialReading),
        calculatedConsumption: 0,
        referenceMonth,
        referenceYear,
        status: 'meter_swap',
        createdBy: userProfile?.name || 'Operador',
      });

      await logAuditEvent({
        operationType: 'meter_swap',
        collectionName: 'leituras',
        relatedDocument: selectedClientId,
        user: userProfile?.name || 'Operador',
        userEmail: userProfile?.email || '',
        justification: swapJustification || 'Substituição de equipamento/medidor',
      });

      alert('Troca de medidor registrada com sucesso. A nova referência será utilizada a partir de agora.');
      setMeterSwapModalOpen(false);
    } catch (err) {
      alert('Erro ao registrar troca de medidor.');
    }
  };

  // State for deleting a consumption reading
  const [readingToDelete, setReadingToDelete] = useState<Leitura | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleConfirmDeleteReading = async () => {
    if (!readingToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      if (onDeleteReading) {
        await onDeleteReading(readingToDelete.id);
      }
      const client = clientes.find((c) => c.id === readingToDelete.clientId);
      await logAuditEvent({
        operationType: 'delete_reading',
        collectionName: 'leituras',
        relatedDocument: readingToDelete.id,
        user: userProfile?.name || 'Operador',
        userEmail: userProfile?.email || '',
        justification: `Exclusão do lançamento de consumo de ${readingToDelete.calculatedConsumption} kWh do cliente ${client?.name || readingToDelete.clientId} (Ref: ${formatReferencePeriod(readingToDelete.referenceMonth, readingToDelete.referenceYear)})`,
      });
      setReadingToDelete(null);
    } catch (err: any) {
      console.error('Erro ao excluir consumo:', err);
      setDeleteError(err?.message || 'Falha ao excluir o lançamento de consumo.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Filter readings list
  const filteredReadings = leituras
    .filter((l) => filterClientId === 'all' || l.clientId === filterClientId)
    .sort((a, b) => {
      if (a.referenceYear !== b.referenceYear) return b.referenceYear - a.referenceYear;
      return b.referenceMonth - a.referenceMonth;
    });

  return (
    <div className="space-y-6">
      {/* Informative Header Callout: The Core Rule */}
      <div className="bg-gradient-to-r from-emerald-800 to-green-700 text-white rounded-2xl p-5 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-xs flex items-center justify-center shrink-0">
            <Gauge className="w-6 h-6 text-yellow-300" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-black">
              Regra de Leituras Acumuladas Automáticas
            </h3>
            <p className="text-xs text-emerald-100 max-w-2xl mt-0.5 leading-relaxed">
              A leitura inicial é cadastrada <strong>uma única vez</strong> na adesão do cliente. Nos meses
              seguintes, o sistema recupera a última leitura registrada automaticamente, exigindo apenas a
              nova leitura do medidor.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setMeterSwapModalOpen(true)}
            className="rounded-xl border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-bold text-white hover:bg-white/20 transition cursor-pointer"
          >
            Troca de Medidor
          </button>
          <button
            onClick={() => handleOpenRegister()}
            className="rounded-xl bg-yellow-400 px-4 py-2 text-xs font-black text-emerald-950 hover:bg-yellow-300 transition shadow-md cursor-pointer flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Lançar Leitura</span>
          </button>
        </div>
      </div>

      {/* Filter and Client Quick List */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <span className="text-xs font-bold text-gray-700">Filtrar por Cliente:</span>
          <select
            value={filterClientId}
            onChange={(e) => setFilterClientId(e.target.value)}
            className="rounded-xl border border-gray-300 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-900 focus:border-emerald-600 focus:outline-none flex-1 sm:w-72"
          >
            <option value="all">Todos os Clientes</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.clientCodeCoelba ? `(${c.clientCodeCoelba})` : ''}
              </option>
            ))}
          </select>
        </div>

        <span className="text-xs text-gray-500 font-medium">
          {filteredReadings.length} leituras registradas no histórico
        </span>
      </div>

      {/* Leituras Table */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Cliente</th>
                <th className="py-3 px-4">Competência</th>
                <th className="py-3 px-4">Leitura Anterior</th>
                <th className="py-3 px-4">Leitura Atual</th>
                <th className="py-3 px-4">Consumo Calculado</th>
                <th className="py-3 px-4">Data do Registro</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredReadings.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-400">
                    Nenhuma leitura encontrada. Clique em "Lançar Leitura" para iniciar.
                  </td>
                </tr>
              ) : (
                filteredReadings.map((lei) => {
                  const client = clientes.find((c) => c.id === lei.clientId);
                  return (
                    <tr key={lei.id} className="hover:bg-gray-50/60 transition">
                      <td className="py-3 px-4 font-bold text-gray-900">
                        {client?.name || 'Cliente'}
                        {client?.clientCodeCoelba && (
                          <span className="block text-[10px] text-gray-500 font-normal">
                            Medidor: {client.clientCodeCoelba}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-semibold text-gray-800">
                        {formatReferencePeriod(lei.referenceMonth, lei.referenceYear)}
                      </td>
                      <td className="py-3 px-4 text-gray-700">
                        <span className="font-bold">{formatNumberBr(lei.previousReadingValue)} kWh</span>
                        <span className="block text-[10px] text-gray-400">
                          {formatDateBr(lei.previousReadingDate)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-900">
                        <span className="font-black text-emerald-800">
                          {formatNumberBr(lei.currentReadingValue)} kWh
                        </span>
                        <span className="block text-[10px] text-gray-400">
                          {formatDateBr(lei.currentReadingDate)}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-block px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 font-black border border-emerald-200">
                          {formatNumberBr(lei.calculatedConsumption)} kWh
                        </span>
                        {calculateDaysBetween(lei.previousReadingDate, lei.currentReadingDate) !== null && (
                          <span className="block text-[10px] text-gray-500 font-medium mt-0.5">
                            {calculateDaysBetween(lei.previousReadingDate, lei.currentReadingDate)} dias
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-500">{formatDateBr(lei.createdAt)}</td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            lei.status === 'valid'
                              ? 'bg-emerald-100 text-emerald-800'
                              : lei.status === 'meter_swap'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-rose-100 text-rose-800 line-through'
                          }`}
                        >
                          {lei.status === 'valid'
                            ? 'Válida'
                            : lei.status === 'meter_swap'
                            ? 'Troca Medidor'
                            : 'Cancelada'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onNavigateToInvoice(lei.clientId)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50 transition cursor-pointer"
                            title="Gerar Fatura para este cliente"
                          >
                            <span>Faturar</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setDeleteError(null);
                              setReadingToDelete(lei);
                            }}
                            className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title="Apagar este lançamento de consumo"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Lançar Leitura */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4 backdrop-blur-xs flex items-center justify-center">
          <div className="w-full max-w-xl bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-gray-100">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-black">
                  <Gauge className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Registrar Leitura do Medidor</h3>
                  <p className="text-xs text-gray-500">Cálculo automático de consumo em kWh</p>
                </div>
              </div>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                ✕
              </button>
            </div>

            {error && (
              <div className="mb-4 flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSaveReading} className="space-y-4 text-xs">
              {/* Select Client */}
              <div>
                <label className="block font-bold text-gray-700 mb-1">Cliente Consumidor *</label>
                <select
                  required
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900 focus:border-emerald-600 focus:outline-none"
                >
                  <option value="" disabled>
                    Selecione um cliente
                  </option>
                  {clientes
                    .filter((c) => c.status === 'active')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.cpfCnpj ? `• ${c.cpfCnpj}` : ''} {c.clientCodeCoelba ? `(Medidor: ${c.clientCodeCoelba})` : ''}
                      </option>
                    ))}
                </select>
              </div>

              {/* Reference Period */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Mês de Referência *</label>
                  <select
                    value={referenceMonth}
                    onChange={(e) => setReferenceMonth(Number(e.target.value))}
                    className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900 focus:border-emerald-600 focus:outline-none"
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {getMonthName(i + 1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Ano de Referência *</label>
                  <input
                    type="number"
                    value={referenceYear}
                    onChange={(e) => setReferenceYear(Number(e.target.value))}
                    className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* Leitura Anterior (Automática ou Primeira) */}
              <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-gray-800">
                    {isFirstReadingForClient ? 'Primeira Leitura (Adesão)' : 'Leitura Anterior (Recuperada)'}
                  </span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">
                    {isFirstReadingForClient ? 'Cadastro Único' : 'Automática'}
                  </span>
                </div>

                {isFirstReadingForClient ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                        Data da Leitura Inicial
                      </label>
                      <input
                        type="date"
                        required
                        value={initialReadingDate}
                        onChange={(e) => setInitialReadingDate(e.target.value)}
                        className="w-full rounded-xl border border-gray-300 p-2 text-gray-900 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                        Valor Inicial (kWh) *
                      </label>
                      <input
                        type="number"
                        step="any"
                        required
                        value={initialReadingValue}
                        onChange={(e) =>
                          setInitialReadingValue(e.target.value === '' ? '' : Number(e.target.value))
                        }
                        placeholder="ex: 40265"
                        className="w-full rounded-xl border border-gray-300 p-2 text-gray-900 bg-white font-mono font-bold"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <span className="text-gray-500 block">Data da leitura:</span>
                      <span className="font-bold text-gray-900">
                        {formatDateBr(lastReading.currentReadingDate)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-gray-500 block">Valor registrado:</span>
                      <span className="font-black text-emerald-800 text-sm font-mono">
                        {formatNumberBr(lastReading.currentReadingValue)} kWh
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Leitura Atual */}
              <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/40 p-3.5">
                <span className="font-bold text-emerald-950 block mb-2">Nova Leitura Atual</span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                      Data da Leitura Atual *
                    </label>
                    <input
                      type="date"
                      required
                      value={currentReadingDate}
                      onChange={(e) => setCurrentReadingDate(e.target.value)}
                      className="w-full rounded-xl border border-gray-300 p-2 text-gray-900 bg-white focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                      Leitura Atual (kWh) *
                    </label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={currentReadingValue}
                      onChange={(e) =>
                        setCurrentReadingValue(e.target.value === '' ? '' : Number(e.target.value))
                      }
                      placeholder="ex: 41364"
                      className="w-full rounded-xl border border-gray-300 p-2 text-gray-900 bg-white font-mono font-black text-emerald-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Real-time Consumption & Financial Preview */}
              {calculatedConsumption > 0 && calcPreview && (
                <div className="rounded-2xl border border-emerald-300 bg-emerald-100/60 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-900">Consumo Apurado:</span>
                    <span className="text-base font-black text-emerald-950">
                      {formatNumberBr(calculatedConsumption)} kWh
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-emerald-200 text-center">
                    <div>
                      <span className="text-[10px] text-gray-600 uppercase block">Valor Neo</span>
                      <span className="font-black text-emerald-800">
                        {formatCurrency(calcPreview.neoAmount)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-600 uppercase block">Ref. Coelba</span>
                      <span className="font-bold text-gray-700">
                        {formatCurrency(calcPreview.coelbaEstimateAmount)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-orange-700 uppercase block font-bold">
                        Economia
                      </span>
                      <span className="font-black text-orange-600">
                        {formatCurrency(calcPreview.savingsAmount)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-gray-300 px-4 py-2 font-semibold text-gray-700 hover:bg-gray-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-emerald-700 px-5 py-2 font-bold text-white hover:bg-emerald-800 transition disabled:opacity-50"
                >
                  {saving ? 'Registrando...' : 'Confirmar Leitura'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Troca de Medidor */}
      {meterSwapModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4 backdrop-blur-xs flex items-center justify-center">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-gray-100">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
              <h3 className="text-base font-bold text-gray-900">Substituição de Medidor</h3>
              <button
                onClick={() => setMeterSwapModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleExecuteMeterSwap} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Cliente</label>
                <select
                  required
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 p-2 text-gray-900"
                >
                  <option value="" disabled>
                    Selecione o cliente
                  </option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Data da Substituição</label>
                <input
                  type="date"
                  required
                  value={swapDate}
                  onChange={(e) => setSwapDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 p-2"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Leitura Final do Medidor Antigo (kWh)
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={oldMeterFinalReading}
                  onChange={(e) =>
                    setOldMeterFinalReading(e.target.value === '' ? '' : Number(e.target.value))
                  }
                  className="w-full rounded-xl border border-gray-300 p-2"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Leitura Inicial do Novo Medidor (kWh)
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={newMeterInitialReading}
                  onChange={(e) =>
                    setNewMeterInitialReading(e.target.value === '' ? '' : Number(e.target.value))
                  }
                  className="w-full rounded-xl border border-gray-300 p-2"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Justificativa da Troca</label>
                <textarea
                  rows={2}
                  required
                  value={swapJustification}
                  onChange={(e) => setSwapJustification(e.target.value)}
                  placeholder="Motivo técnico ou OS da substituição..."
                  className="w-full rounded-xl border border-gray-300 p-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMeterSwapModalOpen(false)}
                  className="rounded-xl border border-gray-300 px-4 py-2"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-700 px-4 py-2 font-bold text-white hover:bg-emerald-800"
                >
                  Registrar Troca
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Confirmar Exclusão de Consumo */}
      {readingToDelete && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4 backdrop-blur-xs flex items-center justify-center">
          <div className="w-full max-w-lg bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-base sm:text-lg font-black text-gray-900">
                  Apagar Consumo Lançado?
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Esta ação removerá este registro de leitura/consumo do banco de dados.
                </p>
              </div>
              <button
                onClick={() => {
                  if (!isDeleting) {
                    setReadingToDelete(null);
                    setDeleteError(null);
                  }
                }}
                disabled={isDeleting}
                className="text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {deleteError && (
              <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
                {deleteError}
              </div>
            )}

            {/* Reading Details Box */}
            <div className="mt-4 rounded-2xl bg-gray-50 border border-gray-200/80 p-4 space-y-2.5 text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-gray-200">
                <span className="text-gray-500 font-medium">Cliente:</span>
                <span className="font-bold text-gray-900 text-right">
                  {clientes.find((c) => c.id === readingToDelete.clientId)?.name || 'Cliente'}
                </span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-gray-200">
                <span className="text-gray-500 font-medium">Competência:</span>
                <span className="font-bold text-emerald-800">
                  {formatReferencePeriod(readingToDelete.referenceMonth, readingToDelete.referenceYear)}
                </span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-gray-200">
                <span className="text-gray-500 font-medium">Consumo Calculado:</span>
                <span className="font-black text-emerald-700 text-sm">
                  {formatNumberBr(readingToDelete.calculatedConsumption)} kWh
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                <div className="bg-white p-2.5 rounded-xl border border-gray-200">
                  <span className="text-gray-400 block text-[10px]">Leitura Anterior:</span>
                  <span className="font-bold text-gray-800">
                    {formatNumberBr(readingToDelete.previousReadingValue)} kWh
                  </span>
                  <span className="block text-gray-400 text-[10px]">
                    {formatDateBr(readingToDelete.previousReadingDate)}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-gray-200">
                  <span className="text-gray-400 block text-[10px]">Leitura Atual:</span>
                  <span className="font-bold text-gray-800">
                    {formatNumberBr(readingToDelete.currentReadingValue)} kWh
                  </span>
                  <span className="block text-gray-400 text-[10px]">
                    {formatDateBr(readingToDelete.currentReadingDate)}
                  </span>
                </div>
              </div>
            </div>

            {/* Check if an invoice exists for this competence */}
            {(() => {
              const linkedInvoice = faturas?.find(
                (f) =>
                  f.clientId === readingToDelete.clientId &&
                  f.referenceMonth === readingToDelete.referenceMonth &&
                  f.referenceYear === readingToDelete.referenceYear &&
                  f.status !== 'cancelled'
              );
              if (linkedInvoice) {
                return (
                  <div className="mt-3.5 p-3 rounded-xl bg-amber-50 border border-amber-200/90 flex items-start gap-2 text-xs text-amber-800">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-bold">Aviso de Fatura Existente:</strong>
                      <p className="mt-0.5 text-[11px] text-amber-700 leading-relaxed">
                        Existe uma fatura emitida (Nº {linkedInvoice.invoiceNumber || linkedInvoice.id.slice(-6)}) para esta competência. Ao apagar esta leitura, a fatura permanecerá no sistema, mas o histórico do medidor retornará à leitura anterior.
                      </p>
                    </div>
                  </div>
                );
              }
              return null;
            })()}

            <p className="mt-3 text-[11px] text-gray-500 leading-relaxed">
              💡 <strong>Impacto:</strong> A exclusão restabelece automaticamente a leitura anterior válida como ponto de partida para os próximos lançamentos de consumo deste medidor.
            </p>

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setReadingToDelete(null);
                  setDeleteError(null);
                }}
                disabled={isDeleting}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-50 transition cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteReading}
                disabled={isDeleting}
                className="rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-rose-700 transition shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Apagando...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Sim, Apagar Consumo</span>
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
