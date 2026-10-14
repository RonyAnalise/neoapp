import React, { useState } from 'react';
import { Zap, History, Plus, Save, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { EnergyTariffs } from '../types';
import { formatCurrency, formatDateBr } from '../lib/calculations';
import { logAuditEvent } from '../lib/auditService';
import { useAuth } from '../hooks/useAuth';

interface ConfiguracoesEnergiaViewProps {
  tariffs: EnergyTariffs;
  tariffHistory: EnergyTariffs[];
  onSaveTariffs: (newTariff: EnergyTariffs) => Promise<void>;
}

export const ConfiguracoesEnergiaView: React.FC<ConfiguracoesEnergiaViewProps> = ({
  tariffs,
  tariffHistory,
  onSaveTariffs,
}) => {
  const { userProfile, isAdmin } = useAuth();
  const [neoTariff, setNeoTariff] = useState(tariffs.neoTariff || 1.0);
  const [coelbaTariff, setCoelbaTariff] = useState(tariffs.coelbaReferenceTariff || 1.21);
  const [validFrom, setValidFrom] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      alert('Apenas administradores podem redefinir tarifas de energia.');
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const newTariffObj: EnergyTariffs = {
        neoTariff: Number(neoTariff),
        coelbaReferenceTariff: Number(coelbaTariff),
        validFrom,
        updatedAt: new Date().toISOString(),
        updatedBy: userProfile?.name || 'Administrador',
        notes: notes || 'Atualização tarifária vigente',
      };

      await onSaveTariffs(newTariffObj);

      await logAuditEvent({
        operationType: 'update_tariffs',
        collectionName: 'configuracoes',
        relatedDocument: 'tarifas',
        user: userProfile?.name || 'Administrador',
        userEmail: userProfile?.email || '',
        newData: newTariffObj,
        previousData: tariffs,
      });

      setMessage('Tarifas vigentes atualizadas com sucesso! Faturas anteriores foram preservadas.');
      setNotes('');
    } catch (err) {
      alert('Erro ao atualizar tarifas.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Current Active Tariffs Card */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200/80 shadow-xs">
        <div className="flex items-center gap-3 border-b border-gray-100 pb-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
            <Zap className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-black text-gray-900">
              Configurações Tarifárias e Parâmetros de Cálculo
            </h3>
            <p className="text-xs text-gray-500">
              Defina a tarifa do kWh da Neo Energia e a tarifa de referência da Coelba.
            </p>
          </div>
        </div>

        <div className="mb-5 rounded-2xl bg-emerald-50/70 border border-emerald-200 p-4 text-xs text-emerald-900 leading-relaxed">
          <strong>Aviso Regulatório:</strong> A comparação com a Coelba representa uma estimativa baseada
          nas tarifas e regras de cálculo cadastradas pelo administrador, sem substituir ou vincular
          obrigatoriamente uma conta oficial da concessionária local. Novas tarifas aplicam-se somente às
          próximas emissões.
        </div>

        {message && (
          <div className="mb-5 flex items-center gap-2 rounded-xl bg-emerald-50 p-3.5 text-xs font-semibold text-emerald-800 border border-emerald-200">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{message}</span>
          </div>
        )}

        <form onSubmit={handleUpdate} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/30 p-4">
              <label className="block font-black text-emerald-950 mb-1">
                Tarifa kWh Neo Energia (R$/kWh) *
              </label>
              <input
                type="number"
                step="0.0001"
                required
                value={neoTariff}
                onChange={(e) => setNeoTariff(Number(e.target.value))}
                className="w-full rounded-xl border border-emerald-300 p-2.5 text-lg font-black text-emerald-900 bg-white"
              />
              <span className="text-[11px] text-gray-500 mt-1 block">
                Valor faturado ao cliente: {formatCurrency(neoTariff)} por kWh
              </span>
            </div>

            <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/30 p-4">
              <label className="block font-black text-amber-950 mb-1">
                Tarifa de Referência Coelba (R$/kWh) *
              </label>
              <input
                type="number"
                step="0.0001"
                required
                value={coelbaTariff}
                onChange={(e) => setCoelbaTariff(Number(e.target.value))}
                className="w-full rounded-xl border border-amber-300 p-2.5 text-lg font-black text-gray-900 bg-white"
              />
              <span className="text-[11px] text-gray-500 mt-1 block">
                Valor comparativo de mercado: {formatCurrency(coelbaTariff)} por kWh
              </span>
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">Data Inicial de Validade *</label>
              <input
                type="date"
                required
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900"
              />
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">Observações da Vigência</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ex: Reajuste contratual 2026"
                className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900"
              />
            </div>
          </div>

          <div className="flex justify-end pt-3 border-t border-gray-100">
            <button
              type="submit"
              disabled={saving || !isAdmin}
              className="flex items-center gap-2 rounded-xl bg-emerald-700 px-6 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 transition shadow-xs disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Atualizando...' : 'Publicar Nova Tarifa Vigente'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Tariff History Table */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center gap-2">
          <History className="w-4 h-4 text-emerald-700" />
          <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
            Histórico de Vigência das Tarifas
          </h4>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-[10px]">
              <tr>
                <th className="py-2.5 px-4">Tarifa Neo Energia</th>
                <th className="py-2.5 px-4">Referência Coelba</th>
                <th className="py-2.5 px-4">Economia / kWh</th>
                <th className="py-2.5 px-4">Válido A Partir De</th>
                <th className="py-2.5 px-4">Responsável</th>
                <th className="py-2.5 px-4">Observação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tariffHistory.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400">
                    Tarifa inicial em vigência desde {formatDateBr(tariffs.validFrom || new Date().toISOString())}.
                  </td>
                </tr>
              ) : (
                tariffHistory.map((th, index) => (
                  <tr key={th.id || index} className="hover:bg-gray-50/60">
                    <td className="py-2.5 px-4 font-black text-emerald-800">
                      {formatCurrency(th.neoTariff)}/kWh
                    </td>
                    <td className="py-2.5 px-4 font-bold text-gray-800">
                      {formatCurrency(th.coelbaReferenceTariff)}/kWh
                    </td>
                    <td className="py-2.5 px-4 font-bold text-orange-600">
                      {formatCurrency(th.coelbaReferenceTariff - th.neoTariff)}/kWh
                    </td>
                    <td className="py-2.5 px-4 text-gray-700">{formatDateBr(th.validFrom)}</td>
                    <td className="py-2.5 px-4 text-gray-600">{th.updatedBy || 'Administrador'}</td>
                    <td className="py-2.5 px-4 text-gray-500">{th.notes || '-'}</td>
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
