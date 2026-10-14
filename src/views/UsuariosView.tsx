import React, { useState } from 'react';
import {
  ShieldCheck,
  UserPlus,
  Search,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  Shield,
  User,
  X,
  Lock,
  Mail,
} from 'lucide-react';
import { UserProfile, UserRole } from '../types';
import { formatDateBr } from '../lib/calculations';
import { logAuditEvent } from '../lib/auditService';
import { useAuth } from '../hooks/useAuth';

interface UsuariosViewProps {
  usuarios: UserProfile[];
  onUpdateUserRole: (uid: string, newRole: UserRole, active: boolean) => Promise<void>;
}

export const UsuariosView: React.FC<UsuariosViewProps> = ({ usuarios, onUpdateUserRole }) => {
  const { userProfile, isAdmin, adminCreateUser } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [savingUid, setSavingUid] = useState<string | null>(null);

  // New user modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('operator');
  const [creating, setCreating] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalSuccess, setModalSuccess] = useState<string | null>(null);

  const filtered = usuarios.filter((u) => {
    const term = searchTerm.toLowerCase();
    return u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term);
  });

  const handleRoleChange = async (uid: string, roleToSet: UserRole, active: boolean) => {
    if (!isAdmin) {
      alert('Apenas administradores podem modificar papéis de acesso.');
      return;
    }

    setSavingUid(uid);
    try {
      await onUpdateUserRole(uid, roleToSet, active);
      await logAuditEvent({
        operationType: 'change_permissions',
        collectionName: 'users',
        relatedDocument: uid,
        user: userProfile?.name || 'Administrador',
        userEmail: userProfile?.email || '',
        newData: { uid, newRole: roleToSet, active },
      });
    } catch (err) {
      alert('Erro ao alterar permissão do usuário.');
    } finally {
      setSavingUid(null);
    }
  };

  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    setModalSuccess(null);

    if (!newName.trim() || !newEmail.trim() || !newPassword) {
      setModalError('Preencha todos os campos obrigatórios.');
      return;
    }

    if (newPassword.length < 6) {
      setModalError('A senha inicial deve conter no mínimo 6 caracteres.');
      return;
    }

    setCreating(true);
    try {
      await adminCreateUser(newName, newEmail, newPassword, newRole);

      await logAuditEvent({
        operationType: 'change_permissions',
        collectionName: 'users',
        relatedDocument: newEmail,
        user: userProfile?.name || 'Administrador',
        userEmail: userProfile?.email || '',
        newData: {
          name: newName,
          email: newEmail,
          role: newRole,
        },
        justification: `Novo usuário ${newRole === 'admin' ? 'Administrador' : 'Operador'} cadastrado pela gestão`,
      });

      setModalSuccess(`Usuário ${newName} cadastrado com sucesso!`);
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      setNewRole('operator');
      setTimeout(() => {
        setCreateModalOpen(false);
        setModalSuccess(null);
      }, 1500);
    } catch (err: unknown) {
      const errObj = err as { code?: string; message?: string };
      if (errObj.code === 'auth/email-already-in-use') {
        setModalError('Este e-mail já está cadastrado no sistema.');
      } else {
        setModalError(err instanceof Error ? err.message : 'Falha ao cadastrar usuário.');
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200/80 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-gray-100 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-gray-900">
                Gestão de Usuários e Permissões (RBAC)
              </h3>
              <p className="text-xs text-gray-500">
                Os operadores e novos administradores são cadastrados e gerenciados exclusivamente por você.
              </p>
            </div>
          </div>

          {isAdmin && (
            <button
              onClick={() => {
                setModalError(null);
                setModalSuccess(null);
                setCreateModalOpen(true);
              }}
              className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 transition shadow-xs cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Cadastrar Novo Usuário</span>
            </button>
          )}
        </div>

        <div className="mb-4">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome ou e-mail..."
            className="w-full sm:w-80 rounded-xl border border-gray-300 p-2 text-xs text-gray-900 focus:border-emerald-600 focus:outline-none"
          />
        </div>

        <div className="border border-gray-200 rounded-2xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-[10px]">
              <tr>
                <th className="py-3 px-4">Nome do Usuário</th>
                <th className="py-3 px-4">E-mail</th>
                <th className="py-3 px-4">Perfil de Acesso</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4">Cadastrado em</th>
                <th className="py-3 px-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400">
                    Nenhum usuário localizado.
                  </td>
                </tr>
              ) : (
                filtered.map((u) => {
                  const isCurrentSelf = u.uid === userProfile?.uid;
                  return (
                    <tr key={u.uid} className="hover:bg-gray-50/60">
                      <td className="py-3 px-4 font-bold text-gray-900">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-xs">
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                          <span>{u.name}</span>
                          {isCurrentSelf && (
                            <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-bold">
                              Você
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-gray-700 font-mono text-[11px]">{u.email}</td>
                      <td className="py-3 px-4">
                        <select
                          disabled={!isAdmin || isCurrentSelf || savingUid === u.uid}
                          value={u.role}
                          onChange={(e) =>
                            handleRoleChange(u.uid, e.target.value as UserRole, u.active)
                          }
                          className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-800 focus:border-emerald-600 focus:outline-none"
                        >
                          <option value="admin">Administrador</option>
                          <option value="operator">Operador</option>
                        </select>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          disabled={!isAdmin || isCurrentSelf || savingUid === u.uid}
                          onClick={() => handleRoleChange(u.uid, u.role, !u.active)}
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold transition cursor-pointer ${
                            u.active
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-rose-100 hover:text-rose-800'
                              : 'bg-rose-100 text-rose-800 hover:bg-emerald-100 hover:text-emerald-800'
                          }`}
                        >
                          {u.active ? 'Ativo' : 'Bloqueado'}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-gray-500">{formatDateBr(u.createdAt)}</td>
                      <td className="py-3 px-4 text-right">
                        {savingUid === u.uid && (
                          <span className="text-[10px] text-emerald-700 font-bold animate-pulse">
                            Atualizando...
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Cadastrar Novo Usuário (Admin ou Operador) */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4 backdrop-blur-xs flex items-center justify-center">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-gray-100">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Novo Usuário do Sistema</h3>
                  <p className="text-xs text-gray-500">Cadastre um operador ou outro administrador</p>
                </div>
              </div>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <div className="mb-4 flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            {modalSuccess && (
              <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800 border border-emerald-200">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{modalSuccess}</span>
              </div>
            )}

            <form onSubmit={handleCreateUserSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Nome Completo *</label>
                <div className="relative">
                  <User className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="ex: Carlos Silva"
                    className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2.5 text-gray-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">E-mail Corporativo *</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                  <input
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="carlos@neoenergia.com.br"
                    className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2.5 text-gray-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Senha Inicial *</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2.5 text-gray-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
                <span className="text-[10px] text-gray-500 mt-1 block">
                  O usuário utilizará este e-mail e senha para acessar o painel.
                </span>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Perfil de Acesso *</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                  className="w-full rounded-xl border border-gray-300 p-2.5 text-gray-900 font-bold focus:border-emerald-600 focus:outline-none"
                >
                  <option value="operator">Operador (lançar leituras, faturas, consultar clientes)</option>
                  <option value="admin">Administrador (acesso irrestrito e gerenciamento de usuários)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="rounded-xl border border-gray-300 px-4 py-2 font-semibold text-gray-700 hover:bg-gray-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-xl bg-emerald-700 px-5 py-2 font-bold text-white hover:bg-emerald-800 transition disabled:opacity-50"
                >
                  {creating ? 'Cadastrando...' : 'Cadastrar Usuário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
