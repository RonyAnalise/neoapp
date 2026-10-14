import React, { useState } from 'react';
import { Building2, Save, CheckCircle, AlertTriangle } from 'lucide-react';
import { EmpresaConfig } from '../types';
import { logAuditEvent } from '../lib/auditService';
import { useAuth } from '../hooks/useAuth';

interface EmpresaViewProps {
  empresa: EmpresaConfig;
  onSaveEmpresa: (empresaData: EmpresaConfig) => Promise<void>;
}

export const EmpresaView: React.FC<EmpresaViewProps> = ({ empresa, onSaveEmpresa }) => {
  const { userProfile, isAdmin } = useAuth();
  const [formData, setFormData] = useState<EmpresaConfig>({ ...empresa });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      alert('Apenas administradores podem atualizar os dados institucionais da empresa.');
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      await onSaveEmpresa(formData);
      await logAuditEvent({
        operationType: 'update_company',
        collectionName: 'empresa',
        relatedDocument: 'info',
        user: userProfile?.name || 'Administrador',
        userEmail: userProfile?.email || '',
        newData: formData,
        previousData: empresa,
      });

      setMessage('Dados da empresa Neo Energia atualizados com sucesso!');
    } catch (err) {
      alert('Erro ao salvar dados da empresa.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200/80 shadow-xs">
        <div className="flex items-center gap-3 border-b border-gray-100 pb-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-black text-gray-900">
              Dados Cadastrais da Neo Energia
            </h3>
            <p className="text-xs text-gray-500">
              Estas configurações alimentam automaticamente o cabeçalho e os blocos institucionais das faturas emitidas.
            </p>
          </div>
        </div>

        {message && (
          <div className="mb-5 flex items-center gap-2 rounded-xl bg-emerald-50 p-3.5 text-xs font-semibold text-emerald-800 border border-emerald-200">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{message}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-gray-700 mb-1">Nome Fantasia *</label>
              <input
                type="text"
                required
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900"
              />
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">Razão Social do Beneficiário *</label>
              <input
                type="text"
                required
                value={formData.companyName || ''}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900"
              />
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">CNPJ da Empresa</label>
              <input
                type="text"
                value={formData.cnpj || ''}
                onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900"
              />
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">Grupo Empresarial / Descritivo</label>
              <input
                type="text"
                value={formData.groupName || ''}
                onChange={(e) => setFormData({ ...formData, groupName: e.target.value })}
                className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900"
              />
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">Telefone Principal (Exibido na Fatura) *</label>
              <input
                type="text"
                required
                value={formData.phone || ''}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900 font-mono"
              />
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">WhatsApp de Atendimento</label>
              <input
                type="text"
                value={formData.whatsapp || ''}
                onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900 font-mono"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-bold text-gray-700 mb-1">E-mail de Contato</label>
              <input
                type="email"
                value={formData.email || ''}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-bold text-gray-700 mb-1">Texto de Atenção (Caixa Laranja Topo)</label>
              <input
                type="text"
                value={formData.warningPaymentText || ''}
                onChange={(e) => setFormData({ ...formData, warningPaymentText: e.target.value })}
                className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900"
              />
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">Prazo Padrão de Vencimento (Dias)</label>
              <input
                type="number"
                value={formData.paymentDueDays || 15}
                onChange={(e) => setFormData({ ...formData, paymentDueDays: Number(e.target.value) })}
                className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900"
              />
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">Instrução de Pagamento (Quadro Boleto)</label>
              <input
                type="text"
                value={formData.paymentInstructions || ''}
                onChange={(e) => setFormData({ ...formData, paymentInstructions: e.target.value })}
                className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-bold text-gray-700 mb-1">Mensagem Ecológica / Sustentabilidade</label>
              <input
                type="text"
                value={formData.sustainabilityMessage || ''}
                onChange={(e) => setFormData({ ...formData, sustainabilityMessage: e.target.value })}
                className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900"
              />
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-gray-100">
            <button
              type="submit"
              disabled={saving || !isAdmin}
              className="flex items-center gap-2 rounded-xl bg-emerald-700 px-6 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 transition shadow-xs disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Salvando...' : 'Salvar Alterações'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
