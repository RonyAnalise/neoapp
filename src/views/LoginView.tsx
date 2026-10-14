import React, { useState } from 'react';
import { Zap, Mail, Lock, ArrowRight, AlertCircle, CheckCircle, ShieldCheck } from 'lucide-react';
import { useAuth, BOOTSTRAP_ADMIN_EMAIL } from '../hooks/useAuth';

export const LoginView: React.FC = () => {
  const { signInWithEmail, resetPassword } = useAuth();
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState(BOOTSTRAP_ADMIN_EMAIL);
  const [password, setPassword] = useState('Admin@2026');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      if (isForgotPassword) {
        if (!email.trim()) throw new Error('Informe seu e-mail para recuperação.');
        await resetPassword(email);
        setMessage('E-mail de recuperação enviado! Verifique sua caixa de entrada.');
        setIsForgotPassword(false);
      } else {
        if (!email.trim()) throw new Error('Informe seu e-mail.');
        if (!password) throw new Error('Informe sua senha.');
        await signInWithEmail(email, password);
      }
    } catch (err: unknown) {
      const errObj = err as { code?: string; message?: string };
      const errStr = err instanceof Error ? err.message : String(err);

      if (errObj.code === 'auth/invalid-credential' || errObj.code === 'auth/wrong-password') {
        setError('E-mail ou senha incorretos. Verifique suas credenciais.');
      } else if (errObj.code === 'auth/user-not-found') {
        setError('Usuário não localizado. Solicite seu cadastro ao Administrador.');
      } else if (errObj.code === 'auth/too-many-requests') {
        setError('Muitas tentativas sem sucesso. Aguarde alguns instantes ou redefina sua senha.');
      } else {
        setError(errStr);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0c3319] via-[#145a2b] to-[#0c3319] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 sm:p-8 border border-emerald-100">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-700 to-green-500 text-white shadow-lg mb-3">
            <Zap className="h-9 w-9 fill-current text-yellow-300" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">
            Neo<span className="text-emerald-700">App</span>
          </h1>
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mt-1">
            Gestão de Energia & Faturas • Neo Energia
          </p>
        </div>

        {/* Informative Admin Notice */}
        <div className="mb-5 rounded-2xl bg-emerald-50 border border-emerald-200 p-3.5 flex items-start gap-2.5 text-xs text-emerald-900">
          <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">Acesso Restrito do Administrador</p>
            <p className="text-[11px] text-emerald-800 leading-relaxed">
              Login com e-mail e senha. Novos operadores e outros administradores são cadastrados
              exclusivamente pelo administrador dentro do painel.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700 border border-rose-200">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {message && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 border border-emerald-200">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{message}</span>
          </div>
        )}

        {/* Email & Password Login Form */}
        <form onSubmit={handleEmailAuth} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">E-mail de Acesso</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu.email@neoenergia.com.br"
                className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2.5 text-xs text-gray-900 focus:border-emerald-600 focus:outline-none font-medium"
              />
            </div>
          </div>

          {!isForgotPassword && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-gray-700">Senha</label>
                <button
                  type="button"
                  onClick={() => setIsForgotPassword(true)}
                  className="text-[11px] font-semibold text-emerald-700 hover:underline"
                >
                  Esqueceu a senha?
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2.5 text-xs text-gray-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 py-3 text-xs font-bold text-white hover:bg-emerald-800 transition shadow-md disabled:opacity-50 cursor-pointer"
          >
            <span>
              {isForgotPassword ? 'Enviar Link de Redefinição' : 'Acessar o Painel NeoApp'}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-5 text-center text-xs text-gray-500">
          {isForgotPassword ? (
            <button
              onClick={() => setIsForgotPassword(false)}
              className="font-bold text-emerald-700 hover:underline"
            >
              Voltar para o formulário de login
            </button>
          ) : (
            <p className="text-[11px]">
              Senha padrão inicial do Administrador: <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono font-bold text-emerald-800">Admin@2026</code>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
