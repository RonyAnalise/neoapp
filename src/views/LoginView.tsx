import React, { useState } from 'react';
import { Zap, Mail, Lock, ArrowRight, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export const LoginView: React.FC = () => {
  const { signInWithEmail, resetPassword } = useAuth();
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
        await resetPassword(email.trim());
        setMessage('E-mail de recuperação enviado! Verifique sua caixa de entrada.');
        setIsForgotPassword(false);
      } else {
        if (!email.trim()) throw new Error('Informe seu e-mail de acesso.');
        if (!password) throw new Error('Informe sua senha.');
        await signInWithEmail(email.trim(), password);
      }
    } catch (err: unknown) {
      const errObj = err as { code?: string; message?: string };
      const errStr = err instanceof Error ? err.message : String(err);

      if (errObj.code === 'auth/invalid-credential' || errObj.code === 'auth/wrong-password') {
        setError('E-mail ou senha incorretos. Verifique suas credenciais.');
      } else if (errObj.code === 'auth/user-not-found') {
        setError('Usuário não localizado. Verifique os dados digitados.');
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
        <div className="text-center mb-7">
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
            <label className="block text-xs font-bold text-gray-700 mb-1.5">
              E-mail de Acesso
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu.email@exemplo.com"
                className="w-full rounded-xl border border-gray-300 pl-10 pr-3 py-2.5 text-xs text-gray-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 focus:outline-none font-medium transition"
              />
            </div>
          </div>

          {!isForgotPassword && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-gray-700">Senha</label>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setMessage(null);
                    setIsForgotPassword(true);
                  }}
                  className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
                >
                  Esqueceu a senha?
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-gray-300 pl-10 pr-10 py-2.5 text-xs text-gray-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 focus:outline-none transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 p-0.5 focus:outline-none cursor-pointer"
                  title={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 py-3 text-xs font-bold text-white hover:bg-emerald-800 active:scale-[0.99] transition shadow-md disabled:opacity-50 cursor-pointer mt-2"
          >
            <span>
              {loading
                ? 'Processando...'
                : isForgotPassword
                ? 'Enviar Link de Redefinição'
                : 'Acessar o Painel'}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {isForgotPassword && (
          <div className="mt-5 text-center text-xs">
            <button
              onClick={() => {
                setError(null);
                setMessage(null);
                setIsForgotPassword(false);
              }}
              className="font-bold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
            >
              ← Voltar para o formulário de login
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
