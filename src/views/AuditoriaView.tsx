import React, { useState } from 'react';
import { ClipboardList, Search, Shield, Eye, Calendar, User, FileText } from 'lucide-react';
import { AuditoriaLog } from '../types';
import { formatDateBr } from '../lib/calculations';

interface AuditoriaViewProps {
  logs: AuditoriaLog[];
}

export const AuditoriaView: React.FC<AuditoriaViewProps> = ({ logs }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditoriaLog | null>(null);

  const filteredLogs = logs
    .filter((l) => {
      const term = searchTerm.toLowerCase();
      return (
        l.operationType.toLowerCase().includes(term) ||
        l.user.toLowerCase().includes(term) ||
        l.userEmail.toLowerCase().includes(term) ||
        l.relatedDocument.toLowerCase().includes(term) ||
        (l.justification || '').toLowerCase().includes(term)
      );
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const getBadgeStyle = (op: string) => {
    switch (op) {
      case 'confirm_payment':
      case 'issue_invoice':
        return 'bg-emerald-100 text-emerald-800';
      case 'cancel_invoice':
      case 'delete_boleto':
      case 'delete_reading':
      case 'delete_invoice':
        return 'bg-rose-100 text-rose-800';
      case 'update_tariffs':
      case 'change_permissions':
        return 'bg-amber-100 text-amber-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  const getOpLabel = (op: string) => {
    const map: Record<string, string> = {
      create_client: 'Criação de Cliente',
      edit_client: 'Alteração de Cliente',
      inactivate_client: 'Inativação de Cliente',
      register_reading: 'Registro de Leitura',
      issue_invoice: 'Emissão de Fatura',
      cancel_invoice: 'Cancelamento de Fatura',
      confirm_payment: 'Confirmação de Pagamento',
      delete_boleto: 'Exclusão de Boleto',
      delete_reading: 'Exclusão de Leitura',
      delete_invoice: 'Exclusão de Fatura',
      update_tariffs: 'Alteração de Tarifas',
      update_company: 'Atualização da Empresa',
      change_permissions: 'Permissões de Usuário',
      meter_swap: 'Troca de Medidor',
    };
    return map[op] || op;
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200/80 shadow-xs">
        <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <ClipboardList className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-gray-900">
                Trilha de Auditoria Imutável do Sistema
              </h3>
              <p className="text-xs text-gray-500">
                Registro criptograficamente persistido de todas as operações financeiras, tarifárias e cadastrais.
              </p>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por operação, responsável ou documento..."
            className="w-full sm:w-80 rounded-xl border border-gray-300 p-2 text-xs text-gray-900 focus:border-emerald-600 focus:outline-none"
          />
        </div>

        <div className="border border-gray-200 rounded-2xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-[10px]">
              <tr>
                <th className="py-3 px-4">Data e Hora</th>
                <th className="py-3 px-4">Operação</th>
                <th className="py-3 px-4">Documento Relacionado</th>
                <th className="py-3 px-4">Responsável</th>
                <th className="py-3 px-4">Justificativa</th>
                <th className="py-3 px-4 text-right">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-gray-400">
                    Nenhum registro de auditoria encontrado.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50/60">
                    <td className="py-3 px-4 text-gray-700 whitespace-nowrap font-mono text-[11px]">
                      {new Date(log.timestamp).toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getBadgeStyle(log.operationType)}`}>
                        {getOpLabel(log.operationType)}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono font-medium text-gray-900">
                      {log.collectionName}/{log.relatedDocument}
                    </td>
                    <td className="py-3 px-4 text-gray-800 font-bold">
                      {log.user} <span className="font-normal text-gray-400 text-[10px]">({log.userEmail})</span>
                    </td>
                    <td className="py-3 px-4 text-gray-600 max-w-xs truncate">
                      {log.justification || '-'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="text-xs font-bold text-emerald-700 hover:underline"
                      >
                        Ver Payload
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payload Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4 backdrop-blur-xs flex items-center justify-center">
          <div className="w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl border border-gray-100">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
              <h4 className="text-sm font-bold text-gray-900">
                Payload da Operação: {getOpLabel(selectedLog.operationType)}
              </h4>
              <button onClick={() => setSelectedLog(null)} className="text-gray-400 hover:text-gray-600">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="font-bold text-gray-700 block">Data/Hora:</span>
                <span className="text-gray-600">{new Date(selectedLog.timestamp).toLocaleString('pt-BR')}</span>
              </div>
              <div>
                <span className="font-bold text-gray-700 block">Usuário:</span>
                <span className="text-gray-600">{selectedLog.user} ({selectedLog.userEmail})</span>
              </div>
              {selectedLog.justification && (
                <div>
                  <span className="font-bold text-gray-700 block">Justificativa:</span>
                  <span className="text-gray-600">{selectedLog.justification}</span>
                </div>
              )}
              {selectedLog.newData !== undefined && (
                <div>
                  <span className="font-bold text-gray-700 block mb-1">Dados Registrados:</span>
                  <pre className="p-3 bg-gray-900 text-emerald-400 rounded-xl overflow-x-auto text-[11px] font-mono">
                    {JSON.stringify(selectedLog.newData, null, 2)}
                  </pre>
                </div>
              )}
              {selectedLog.previousData !== undefined && (
                <div>
                  <span className="font-bold text-gray-700 block mb-1">Dados Anteriores:</span>
                  <pre className="p-3 bg-gray-900 text-gray-300 rounded-xl overflow-x-auto text-[11px] font-mono">
                    {JSON.stringify(selectedLog.previousData, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
