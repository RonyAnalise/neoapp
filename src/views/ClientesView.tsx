import React, { useState } from 'react';
import {
  Users,
  Search,
  Plus,
  Eye,
  Edit2,
  UserCheck,
  UserX,
  Phone,
  Mail,
  MapPin,
  Calendar,
  X,
  Check,
  AlertCircle,
  TrendingUp,
  Receipt,
  FileSpreadsheet,
  Zap,
  Trash2,
  ExternalLink,
  KeyRound,
  Copy,
} from 'lucide-react';
import { Cliente, Fatura, Leitura, EnergyTariffs, TaxaCoelba } from '../types';
import { fetchAddressByCep, formatCep } from '../lib/cepService';
import { formatCurrency, formatNumberBr, formatDateBr, formatReferencePeriod } from '../lib/calculations';
import { logAuditEvent } from '../lib/auditService';
import { useAuth } from '../hooks/useAuth';

interface ClientesViewProps {
  clientes: Cliente[];
  faturas: Fatura[];
  leituras: Leitura[];
  taxasCoelba?: TaxaCoelba[];
  tariffs: EnergyTariffs;
  onSaveCliente: (cliente: Partial<Cliente>, isNew: boolean) => Promise<void>;
  onToggleStatus: (clienteId: string, currentStatus: 'active' | 'inactive') => Promise<void>;
  onDeleteCliente?: (clienteId: string) => Promise<void>;
  onOpenInvoiceModal: (fatura: Fatura) => void;
  onSyncAllSeedInvoices?: () => Promise<void>;
  onOpenPortalForClient?: (clientId: string) => void;
  isSyncing?: boolean;
}

export const ClientesView: React.FC<ClientesViewProps> = ({
  clientes,
  faturas,
  leituras,
  taxasCoelba = [],
  tariffs,
  onSaveCliente,
  onToggleStatus,
  onDeleteCliente,
  onOpenInvoiceModal,
  onSyncAllSeedInvoices,
  onOpenPortalForClient,
  isSyncing,
}) => {
  const { userProfile, isAdmin, clientCreateAuthAccount } = useAuth();
  const [copiedAccessText, setCopiedAccessText] = useState(false);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [cityFilter, setCityFilter] = useState<string>('all');

  // Modals state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [detailCliente, setDetailCliente] = useState<Cliente | null>(null);
  const [clientToDelete, setClientToDelete] = useState<Cliente | null>(null);
  const [deletingCliente, setDeletingCliente] = useState(false);

  // Form state
  const [formData, setFormData] = useState<Partial<Cliente>>({
    name: '',
    cpfCnpj: '',
    phone: '',
    whatsapp: '',
    email: '',
    cep: '',
    address: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: 'BA',
    clientCodeCoelba: '',
    consumerUnit: '',
    customNeoTariff: undefined,
    customCoelbaTariff: undefined,
    status: 'active',
    notes: '',
  });

  const [loadingCep, setLoadingCep] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const itemsPerPage = 8;

  // Extract unique cities for filtering
  const uniqueCities = Array.from(new Set(clientes.map((c) => c.city).filter(Boolean)));

  // Filter clients
  const filteredClientes = clientes.filter((c) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      c.name.toLowerCase().includes(term) ||
      c.cpfCnpj.toLowerCase().includes(term) ||
      c.phone.toLowerCase().includes(term) ||
      c.clientCodeCoelba.toLowerCase().includes(term) ||
      c.city.toLowerCase().includes(term);

    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    const matchesCity = cityFilter === 'all' || c.city === cityFilter;

    return matchesSearch && matchesStatus && matchesCity;
  });

  const totalPages = Math.ceil(filteredClientes.length / itemsPerPage) || 1;
  const paginatedClientes = filteredClientes.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const handleOpenNew = () => {
    setEditingCliente(null);
    setFormData({
      name: '',
      cpfCnpj: '',
      phone: '',
      whatsapp: '',
      email: '',
      cep: '',
      address: '',
      number: '',
      complement: '',
      neighborhood: '',
      city: '',
      state: 'BA',
      clientCodeCoelba: '',
      consumerUnit: '',
      customNeoTariff: undefined,
      customCoelbaTariff: undefined,
      status: 'active',
      notes: '',
    });
    setCepError(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (cliente: Cliente) => {
    setEditingCliente(cliente);
    setFormData({ ...cliente });
    setCepError(null);
    setModalOpen(true);
  };

  const handleCepBlur = async () => {
    if (!formData.cep) return;
    setCepError(null);
    setLoadingCep(true);

    try {
      const data = await fetchAddressByCep(formData.cep);
      if (data) {
        setFormData((prev) => ({
          ...prev,
          address: data.logradouro || prev.address,
          neighborhood: data.bairro || prev.neighborhood,
          city: data.localidade || prev.city,
          state: data.uf || prev.state,
          cep: formatCep(data.cep),
        }));
      }
    } catch (err) {
      setCepError(err instanceof Error ? err.message : 'CEP não localizado');
    } finally {
      setLoadingCep(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim()) {
      alert('Preencha o Nome Completo ou Razão Social do cliente.');
      return;
    }

    setSaving(true);
    try {
      const isNew = !editingCliente;

      // Sanitiza payload: campos de tarifas em branco usam padrão geral sem erro de undefined
      const payload: Partial<Cliente> = { ...formData };
      payload.name = (formData.name || '').trim();
      payload.cpfCnpj = formData.cpfCnpj?.trim() || '';

      const neoVal =
        payload.customNeoTariff !== undefined &&
        payload.customNeoTariff !== null &&
        (payload.customNeoTariff as any) !== ''
          ? Number(payload.customNeoTariff)
          : null;

      if (neoVal !== null && !isNaN(neoVal) && neoVal > 0) {
        payload.customNeoTariff = neoVal;
      } else {
        delete payload.customNeoTariff;
      }

      const coelbaVal =
        payload.customCoelbaTariff !== undefined &&
        payload.customCoelbaTariff !== null &&
        (payload.customCoelbaTariff as any) !== ''
          ? Number(payload.customCoelbaTariff)
          : null;

      if (coelbaVal !== null && !isNaN(coelbaVal) && coelbaVal > 0) {
        payload.customCoelbaTariff = coelbaVal;
      } else {
        delete payload.customCoelbaTariff;
      }

      // Remove quaisquer propriedades que tenham ficado como undefined
      for (const [k, v] of Object.entries(payload)) {
        if (v === undefined) {
          delete (payload as any)[k];
        }
      }

      await onSaveCliente(payload, isNew);

      // Se foi informada senha e email para o portal, provisiona a conta no Auth
      if (payload.email && payload.portalPassword && clientCreateAuthAccount) {
        try {
          await clientCreateAuthAccount(
            payload.name || 'Cliente',
            payload.email,
            payload.portalPassword,
            editingCliente?.id,
            payload.cpfCnpj
          );
        } catch (authErr) {
          console.log('Conta de autenticação criada ou atualizada:', authErr);
        }
      }

      // Prepara objeto seguro para trilha de auditoria
      const auditPayload: Record<string, any> = {};
      for (const [k, v] of Object.entries(payload)) {
        if (v !== undefined) {
          auditPayload[k] = v;
        }
      }

      await logAuditEvent({
        operationType: isNew ? 'create_client' : 'edit_client',
        collectionName: 'clientes',
        relatedDocument: editingCliente?.id || 'new',
        user: userProfile?.name || 'Sistema',
        userEmail: userProfile?.email || '',
        newData: auditPayload,
        previousData: editingCliente || undefined,
      });

      setModalOpen(false);
    } catch (err) {
      alert('Erro ao salvar cliente: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDeleteCliente = async () => {
    if (!clientToDelete || !onDeleteCliente) return;
    setDeletingCliente(true);
    try {
      await onDeleteCliente(clientToDelete.id);
      setClientToDelete(null);
    } catch (err) {
      alert('Erro ao excluir cliente: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setDeletingCliente(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search & Actions Bar */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200/80 shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div className="flex-1 flex flex-col sm:flex-row items-center gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar por nome, CPF/CNPJ, código Coelba..."
              className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-xs text-gray-900 focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as 'all' | 'active' | 'inactive');
                setPage(1);
              }}
              className="rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-900 focus:border-emerald-600 focus:outline-none flex-1 sm:flex-initial"
            >
              <option value="all">Todos os Status</option>
              <option value="active">Apenas Ativos</option>
              <option value="inactive">Apenas Inativos</option>
            </select>

            {uniqueCities.length > 0 && (
              <select
                value={cityFilter}
                onChange={(e) => {
                  setCityFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-900 focus:border-emerald-600 focus:outline-none flex-1 sm:flex-initial"
              >
                <option value="all">Todas as Cidades</option>
                {uniqueCities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onSyncAllSeedInvoices && clientes.length < 38 && (
            <button
              onClick={onSyncAllSeedInvoices}
              disabled={isSyncing}
              className="flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-600 px-4 py-2.5 text-xs font-bold text-white transition shadow-xs cursor-pointer disabled:opacity-50"
              title="Gravar as 38 faturas e clientes identificados das imagens no Firestore"
            >
              <Zap className="w-4 h-4 fill-current text-yellow-200" />
              <span>{isSyncing ? 'Gravando no Banco...' : '⚡ Gravar 38 Faturas no Banco'}</span>
            </button>
          )}

          <button
            onClick={handleOpenNew}
            className="flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 transition shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Cadastrar Novo Cliente</span>
          </button>
        </div>
      </div>

      {/* Clientes Table */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50/80 border-b border-gray-200 text-gray-600 font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Cliente / Razão Social</th>
                <th className="py-3 px-4">CPF / CNPJ</th>
                <th className="py-3 px-4">Medidor / Cód. Coelba</th>
                <th className="py-3 px-4">Cidade / UF</th>
                <th className="py-3 px-4">Telefone</th>
                <th className="py-3 px-4 text-center">Situação</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedClientes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-gray-400">
                    Nenhum cliente encontrado com os critérios selecionados.
                  </td>
                </tr>
              ) : (
                paginatedClientes.map((cli) => {
                  return (
                    <tr key={cli.id} className="hover:bg-gray-50/60 transition">
                      <td className="py-3 px-4 font-bold text-gray-900">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 font-black text-xs flex items-center justify-center">
                            {cli.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p>{cli.name}</p>
                            {cli.consumerUnit && (
                              <p className="text-[10px] text-gray-400 font-normal">{cli.consumerUnit}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-medium text-gray-700">{cli.cpfCnpj}</td>
                      <td className="py-3 px-4 font-mono font-bold text-gray-800">{cli.clientCodeCoelba || '-'}</td>
                      <td className="py-3 px-4 text-gray-700">
                        {cli.city ? `${cli.city}/${cli.state}` : '-'}
                      </td>
                      <td className="py-3 px-4 text-gray-700">{cli.whatsapp || cli.phone || '-'}</td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            cli.status === 'active'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-gray-200 text-gray-600'
                          }`}
                        >
                          {cli.status === 'active' ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setDetailCliente(cli)}
                            className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 hover:text-emerald-700 transition"
                            title="Ver detalhes e histórico"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(cli)}
                            className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 hover:text-blue-700 transition"
                            title="Editar cadastro"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          {onOpenPortalForClient && (
                            <button
                              onClick={() => onOpenPortalForClient(cli.id)}
                              className="p-1.5 rounded-lg border border-yellow-200 bg-yellow-50 text-yellow-800 hover:bg-yellow-100 hover:border-yellow-300 transition cursor-pointer"
                              title="Acessar / Visualizar como Portal do Cliente"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              onClick={() => onToggleStatus(cli.id, cli.status)}
                              className={`p-1.5 rounded-lg border transition ${
                                cli.status === 'active'
                                  ? 'border-rose-200 text-rose-600 hover:bg-rose-50'
                                  : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                              }`}
                              title={cli.status === 'active' ? 'Inativar cliente' : 'Reativar cliente'}
                            >
                              {cli.status === 'active' ? (
                                <UserX className="w-4 h-4" />
                              ) : (
                                <UserCheck className="w-4 h-4" />
                              )}
                            </button>
                          )}
                          {(() => {
                            const clientInvoicesCount = faturas.filter((f) => f.clientId === cli.id).length;
                            const clientReadingsCount = leituras.filter((l) => l.clientId === cli.id).length;
                            const clientTaxasCount = (taxasCoelba || []).filter((t) => t.clientId === cli.id).length;
                            const hasMovimentacao = clientInvoicesCount > 0 || clientReadingsCount > 0 || clientTaxasCount > 0;

                            if (!hasMovimentacao) {
                              return (
                                <button
                                  onClick={() => setClientToDelete(cli)}
                                  className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 hover:border-rose-300 transition cursor-pointer"
                                  title="Excluir cadastro (sem movimentações)"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              );
                            }

                            return (
                              <button
                                disabled
                                className="p-1.5 rounded-lg border border-gray-200 text-gray-300 cursor-not-allowed opacity-40"
                                title={`Cliente possui movimentação vinculada (${clientInvoicesCount} faturas, ${clientReadingsCount} leituras) e não pode ser excluído`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            );
                          })()}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-100 bg-gray-50/50 text-xs text-gray-600">
          <span>
            Mostrando {Math.min(filteredClientes.length, (page - 1) * itemsPerPage + 1)} a{' '}
            {Math.min(filteredClientes.length, page * itemsPerPage)} de {filteredClientes.length} clientes
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2.5 py-1 rounded-lg border border-gray-200 bg-white disabled:opacity-40 text-xs font-semibold"
            >
              Anterior
            </button>
            <span className="px-2 font-bold text-gray-900">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-2.5 py-1 rounded-lg border border-gray-200 bg-white disabled:opacity-40 text-xs font-semibold"
            >
              Próxima
            </button>
          </div>
        </div>
      </div>

      {/* Modal Cadastro / Edição de Cliente */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4 backdrop-blur-xs flex items-center justify-center">
          <div className="w-full max-w-2xl bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-gray-100 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  {editingCliente ? 'Editar Cliente' : 'Cadastrar Novo Cliente'}
                </h3>
                <p className="text-xs text-gray-500">
                  Preencha os dados do consumidor e integração Coelba.
                </p>
              </div>
              <button onClick={() => setModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-bold text-gray-700 mb-1">
                    Nome Completo ou Razão Social *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="ex: GENIVALDO MARTINS DE OLIVEIRA"
                    className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">CPF ou CNPJ (Opcional)</label>
                  <input
                    type="text"
                    value={formData.cpfCnpj || ''}
                    onChange={(e) => setFormData({ ...formData, cpfCnpj: e.target.value })}
                    placeholder="000.000.000-00 (opcional)"
                    className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    Medidor / Código do Cliente na Coelba
                  </label>
                  <input
                    type="text"
                    value={formData.clientCodeCoelba || ''}
                    onChange={(e) => setFormData({ ...formData, clientCodeCoelba: e.target.value })}
                    placeholder="ex: 7092185421"
                    className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900 focus:border-emerald-600 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Identificação / Unidade</label>
                  <input
                    type="text"
                    value={formData.consumerUnit || ''}
                    onChange={(e) => setFormData({ ...formData, consumerUnit: e.target.value })}
                    placeholder="ex: RESTAURANTE ATALIBA REI DO CALDO"
                    className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">WhatsApp</label>
                  <input
                    type="text"
                    value={formData.whatsapp || ''}
                    onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                    placeholder="(77) 99999-9999"
                    className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Telefone Fixo / Outro</label>
                  <input
                    type="text"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="(77) 3241-0000"
                    className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">E-mail</label>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="cliente@email.com"
                    className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* Endereço com Busca de CEP */}
              <div className="pt-2 border-t border-gray-100">
                <span className="font-bold text-gray-800 block mb-2">Endereço da Unidade</span>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-gray-700 mb-1">
                      CEP (busca automática ViaCEP)
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={formData.cep || ''}
                        onChange={(e) => setFormData({ ...formData, cep: e.target.value })}
                        onBlur={handleCepBlur}
                        placeholder="45745-000"
                        className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900 focus:border-emerald-600 focus:outline-none"
                      />
                      {loadingCep && (
                        <span className="absolute right-3 top-3 text-[10px] text-emerald-700 font-bold animate-pulse">
                          Buscando...
                        </span>
                      )}
                    </div>
                    {cepError && <span className="text-[10px] text-rose-600 mt-1 block">{cepError}</span>}
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block font-bold text-gray-700 mb-1">Bairro</label>
                    <input
                      type="text"
                      value={formData.neighborhood || ''}
                      onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })}
                      placeholder="MULTIRÃO"
                      className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900 focus:border-emerald-600 focus:outline-none uppercase"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block font-bold text-gray-700 mb-1">Logradouro / Rua</label>
                    <input
                      type="text"
                      value={formData.address || ''}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="RO. BR. 415"
                      className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900 focus:border-emerald-600 focus:outline-none uppercase"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Número</label>
                    <input
                      type="text"
                      value={formData.number || ''}
                      onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                      placeholder="9997"
                      className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block font-bold text-gray-700 mb-1">Cidade</label>
                    <input
                      type="text"
                      value={formData.city || ''}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      placeholder="IBICARAÍ"
                      className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900 focus:border-emerald-600 focus:outline-none uppercase"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-gray-700 mb-1">UF (Estado)</label>
                    <input
                      type="text"
                      maxLength={2}
                      value={formData.state || 'BA'}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                      placeholder="BA"
                      className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900 focus:border-emerald-600 focus:outline-none uppercase"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Complemento</label>
                    <input
                      type="text"
                      value={formData.complement || ''}
                      onChange={(e) => setFormData({ ...formData, complement: e.target.value })}
                      placeholder="Km 12"
                      className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Tarifas Personalizadas por Cliente */}
              <div className="pt-2 border-t border-gray-100">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2">
                  <span className="font-bold text-gray-800">
                    Tarifas do kWh Deste Cliente (Opcional)
                  </span>
                  <span className="text-[10px] bg-emerald-50 text-emerald-800 font-semibold px-2 py-0.5 rounded border border-emerald-200">
                    Se em branco, usará o padrão geral do app
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
                    <label className="block font-bold text-emerald-950 mb-1">
                      Valor Cobrado do Cliente (R$/kWh Neo Energia)
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      value={formData.customNeoTariff ?? ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          customNeoTariff: e.target.value === '' ? undefined : Number(e.target.value),
                        })
                      }
                      placeholder={`Padrão atual: R$ ${(tariffs?.neoTariff ?? 1.0).toFixed(2)}`}
                      className="w-full rounded-lg border border-emerald-300 p-2 text-gray-900 bg-white font-mono font-bold"
                    />
                    <span className="text-[10px] text-emerald-700 mt-1 block">
                      {formData.customNeoTariff && formData.customNeoTariff > 0
                        ? `Personalizado: R$ ${Number(formData.customNeoTariff).toFixed(2)}/kWh`
                        : `Em branco: usará padrão geral (R$ ${(tariffs?.neoTariff ?? 1.0).toFixed(2)}/kWh)`}
                    </span>
                  </div>

                  <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
                    <label className="block font-bold text-amber-950 mb-1">
                      Valor de Referência (R$/kWh Coelba)
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      value={formData.customCoelbaTariff ?? ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          customCoelbaTariff: e.target.value === '' ? undefined : Number(e.target.value),
                        })
                      }
                      placeholder={`Padrão atual: R$ ${formatCurrency(tariffs?.coelbaReferenceTariff ?? 1.21, false, 4)}`}
                      className="w-full rounded-lg border border-amber-300 p-2 text-gray-900 bg-white font-mono font-bold"
                    />
                    <span className="text-[10px] text-amber-700 mt-1 block">
                      {formData.customCoelbaTariff && formData.customCoelbaTariff > 0
                        ? `Personalizado: R$ ${formatCurrency(formData.customCoelbaTariff, false, 4)}/kWh`
                        : `Em branco: usará padrão geral (R$ ${formatCurrency(tariffs?.coelbaReferenceTariff ?? 1.21, false, 4)}/kWh)`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Acesso do Cliente ao Portal (Login & Senha) */}
              <div className="pt-2 border-t border-gray-100 bg-emerald-50/60 -mx-6 sm:-mx-8 px-6 sm:px-8 py-4 border-b border-emerald-100">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-emerald-800" />
                    <span className="font-black text-emerald-950 text-xs uppercase tracking-wide">
                      Acesso do Cliente ao Portal (Login & Senha)
                    </span>
                  </div>
                  <span className="text-[10px] bg-emerald-200/80 text-emerald-900 font-bold px-2 py-0.5 rounded-full">
                    Portal do Cliente
                  </span>
                </div>
                <p className="text-[11px] text-emerald-800 mb-3">
                  O cliente acessará faturas pagas, boletos disponíveis para download e o acompanhamento de economia usando o e-mail cadastrado e esta senha.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">
                      E-mail de Login do Cliente
                    </label>
                    <input
                      type="text"
                      disabled
                      value={formData.email || '(Preencha o e-mail acima)'}
                      className="w-full rounded-xl border border-gray-200 bg-gray-100 p-2 text-gray-600 font-medium text-xs cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-gray-700 mb-1">
                      Senha de Acesso do Cliente
                    </label>
                    <input
                      type="text"
                      value={formData.portalPassword || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          portalPassword: e.target.value,
                          portalAccessActive: true,
                        })
                      }
                      placeholder="Ex: neo123456 ou senha desejada"
                      className="w-full rounded-xl border border-emerald-300 bg-white p-2 text-gray-900 font-bold text-xs focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                </div>

                {formData.email && formData.portalPassword && (
                  <div className="mt-3 flex items-center justify-between pt-2 border-t border-emerald-200/60">
                    <span className="text-[11px] text-emerald-900 font-semibold">
                      Pronto para envio ao cliente:
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const zapMsg = `Olá, *${formData.name || 'Cliente'}*! Seu acesso ao *Portal do Cliente Neo Energia* está liberado!\n\nLá você pode consultar suas faturas pagas, baixar seus boletos bancários em PDF e acompanhar toda sua economia em dinheiro mês a mês!\n\n🔗 *Acesso:* ${window.location.origin}\n📧 *Login:* ${formData.email}\n🔑 *Senha:* ${formData.portalPassword}\n\nQualquer dúvida estamos à disposição!`;
                        navigator.clipboard.writeText(zapMsg);
                        setCopiedAccessText(true);
                        setTimeout(() => setCopiedAccessText(false), 3000);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-[11px] transition cursor-pointer shadow-2xs"
                    >
                      {copiedAccessText ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedAccessText ? 'Texto Copiado!' : 'Copiar Acesso para WhatsApp'}</span>
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Observações internas</label>
                <textarea
                  rows={2}
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Informações adicionais do cliente..."
                  className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-gray-300 px-4 py-2.5 font-semibold text-gray-700 hover:bg-gray-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-emerald-700 px-5 py-2.5 font-bold text-white hover:bg-emerald-800 transition disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : 'Salvar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Detalhes do Cliente com Histórico e Economia */}
      {detailCliente && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4 backdrop-blur-xs flex items-center justify-center">
          <div className="w-full max-w-4xl bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-gray-100 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-gray-100 pb-3 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-black text-gray-900">{detailCliente.name}</h3>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      detailCliente.status === 'active'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-gray-200 text-gray-700'
                    }`}
                  >
                    {detailCliente.status === 'active' ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  CPF/CNPJ: {detailCliente.cpfCnpj} • Cód. Coelba: {detailCliente.clientCodeCoelba || 'Não informado'}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px]">
                  <span className="font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Tarifa Neo:{' '}
                    {detailCliente.customNeoTariff && detailCliente.customNeoTariff > 0
                      ? `R$ ${detailCliente.customNeoTariff.toFixed(2)}/kWh (Personalizada)`
                      : `R$ ${(tariffs?.neoTariff ?? 1.0).toFixed(2)}/kWh (Padrão Geral)`}
                  </span>
                  <span className="font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    Ref. Coelba:{' '}
                    {detailCliente.customCoelbaTariff && detailCliente.customCoelbaTariff > 0
                      ? `R$ ${formatCurrency(detailCliente.customCoelbaTariff, false, 4)}/kWh (Personalizada)`
                      : `R$ ${formatCurrency(tariffs?.coelbaReferenceTariff ?? 1.21, false, 4)}/kWh (Padrão Geral)`}
                  </span>
                </div>
              </div>
              <button onClick={() => setDetailCliente(null)} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Client Financial Summary Cards */}
            {(() => {
              const clientInvoices = faturas
                .filter((f) => f.clientId === detailCliente.id && f.status !== 'cancelled')
                .sort((a, b) => b.referenceYear - a.referenceYear || b.referenceMonth - a.referenceMonth);

              const totalClientSavings = clientInvoices.reduce((sum, f) => sum + (f.savingsAmount || 0), 0);
              const totalClientKwh = clientInvoices.reduce((sum, f) => sum + (f.consumptionKwh || 0), 0);
              const totalPaid = clientInvoices.filter((f) => f.status === 'paid').length;
              const totalPending = clientInvoices.filter((f) => f.status === 'pending').length;

              return (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-200">
                      <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
                        Economia Acumulada
                      </span>
                      <h4 className="text-xl font-black text-emerald-900 mt-1">
                        {formatCurrency(totalClientSavings)}
                      </h4>
                      <span className="text-[10px] text-emerald-700">{clientInvoices.length} meses faturados</span>
                    </div>

                    <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200">
                      <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">
                        Consumo Acumulado
                      </span>
                      <h4 className="text-xl font-black text-amber-900 mt-1">
                        {formatNumberBr(totalClientKwh)} kWh
                      </h4>
                      <span className="text-[10px] text-amber-700">Média: {clientInvoices.length > 0 ? formatNumberBr(totalClientKwh / clientInvoices.length) : 0} kWh/mês</span>
                    </div>

                    <div className="bg-blue-50 rounded-2xl p-4 border border-blue-200">
                      <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wider block">
                        Faturas Pagas
                      </span>
                      <h4 className="text-xl font-black text-blue-900 mt-1">{totalPaid}</h4>
                      <span className="text-[10px] text-blue-700">Em dia</span>
                    </div>

                    <div className="bg-orange-50 rounded-2xl p-4 border border-orange-200">
                      <span className="text-[10px] font-bold text-orange-800 uppercase tracking-wider block">
                        Faturas Pendentes
                      </span>
                      <h4 className="text-xl font-black text-orange-900 mt-1">{totalPending}</h4>
                      <span className="text-[10px] text-orange-700">Aguardando pagamento</span>
                    </div>
                  </div>

                  {/* Faturas Históricas do Cliente */}
                  <div>
                    <h4 className="text-xs font-bold text-gray-800 mb-2 uppercase tracking-wider">
                      Faturas Emitidas ({clientInvoices.length})
                    </h4>
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold text-[10px]">
                          <tr>
                            <th className="py-2.5 px-3">Fatura</th>
                            <th className="py-2.5 px-3">Competência</th>
                            <th className="py-2.5 px-3">Consumo</th>
                            <th className="py-2.5 px-3">Total a Pagar</th>
                            <th className="py-2.5 px-3">Economia</th>
                            <th className="py-2.5 px-3">Vencimento</th>
                            <th className="py-2.5 px-3 text-center">Status</th>
                            <th className="py-2.5 px-3 text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {clientInvoices.length === 0 ? (
                            <tr>
                              <td colSpan={8} className="py-6 text-center text-gray-400">
                                Nenhuma fatura emitida para este cliente ainda.
                              </td>
                            </tr>
                          ) : (
                            clientInvoices.map((inv) => (
                              <tr key={inv.id} className="hover:bg-gray-50">
                                <td className="py-2 px-3 font-bold text-gray-900">#{inv.invoiceNumber}</td>
                                <td className="py-2 px-3 font-medium">
                                  {formatReferencePeriod(inv.referenceMonth, inv.referenceYear)}
                                </td>
                                <td className="py-2 px-3">{formatNumberBr(inv.consumptionKwh)} kWh</td>
                                <td className="py-2 px-3 font-bold text-emerald-800">
                                  {formatCurrency(inv.totalToPay)}
                                </td>
                                <td className="py-2 px-3 font-bold text-orange-600">
                                  {formatCurrency(inv.savingsAmount)}
                                </td>
                                <td className="py-2 px-3">{formatDateBr(inv.dueDate)}</td>
                                <td className="py-2 px-3 text-center">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      inv.status === 'paid'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : inv.status === 'overdue'
                                        ? 'bg-rose-100 text-rose-800'
                                        : 'bg-amber-100 text-amber-800'
                                    }`}
                                  >
                                    {inv.status === 'paid' ? 'Paga' : inv.status === 'overdue' ? 'Vencida' : 'Pendente'}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-right">
                                  <button
                                    onClick={() => onOpenInvoiceModal(inv)}
                                    className="text-xs font-bold text-emerald-700 hover:underline"
                                  >
                                    Ver Fatura
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setDetailCliente(null)}
                className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão de Cliente sem Movimentação */}
      {clientToDelete && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4 backdrop-blur-xs flex items-center justify-center">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-gray-100">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Excluir Cliente</h3>
                  <p className="text-xs text-gray-500">Apenas cadastros sem movimentação</p>
                </div>
              </div>
              <button
                onClick={() => setClientToDelete(null)}
                className="p-1 text-gray-400 hover:text-gray-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-gray-700 mb-6">
              <p>
                Você está prestes a excluir definitivamente o seguinte cliente:
              </p>
              <div className="rounded-xl bg-gray-50 p-3.5 border border-gray-200 space-y-1">
                <p className="font-bold text-gray-900 text-sm">{clientToDelete.name}</p>
                <p className="text-gray-600">CPF/CNPJ: {clientToDelete.cpfCnpj || 'Não informado'}</p>
                <p className="text-gray-600 font-mono">Código Coelba: {clientToDelete.clientCodeCoelba || '-'}</p>
                <p className="text-gray-600">Cidade: {clientToDelete.city || '-'}</p>
              </div>
              <p className="text-amber-800 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                ⚠️ Este cliente não possui nenhuma fatura ou leitura vinculada. A exclusão removerá o registro permanentemente do banco de dados.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setClientToDelete(null)}
                disabled={deletingCliente}
                className="rounded-xl border border-gray-300 px-4 py-2 font-semibold text-gray-700 hover:bg-gray-50 transition cursor-pointer text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteCliente}
                disabled={deletingCliente}
                className="rounded-xl bg-rose-600 hover:bg-rose-700 px-5 py-2 font-bold text-white transition disabled:opacity-50 flex items-center gap-2 cursor-pointer text-xs shadow-xs"
              >
                {deletingCliente ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Excluindo...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Confirmar Exclusão
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
