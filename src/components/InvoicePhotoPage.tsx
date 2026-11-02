import React from 'react';
import { Download, Camera, Clock, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { Fatura, Cliente, EmpresaConfig } from '../types';
import {
  formatCurrency,
  formatNumberBr,
  formatDateBr,
  formatReferencePeriod,
} from '../lib/calculations';

interface InvoicePhotoPageProps {
  fatura: Fatura;
  cliente: Cliente;
  empresa: EmpresaConfig;
  onDownloadPhoto?: () => void;
}

export const InvoicePhotoPage: React.FC<InvoicePhotoPageProps> = ({
  fatura,
  cliente,
  empresa,
  onDownloadPhoto,
}) => {
  if (!fatura.meterPhotoBase64) return null;

  const phoneDisplay = empresa.phone || '77-992107440';
  const companyTitle = (
    empresa.companyName || 'NEO ENERGIA CARNAÚBANOS (GRUPO DE INVESTIMENTOS CARNAÚBANOS)'
  ).replace(/INVETIMENTOS/gi, 'INVESTIMENTOS');

  const photoUploadedAt = fatura.meterPhotoUploadedAt
    ? new Date(fatura.meterPhotoUploadedAt).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : formatDateBr(fatura.currentReadingDate);

  const expirationDate = fatura.meterPhotoExpiresAt
    ? formatDateBr(fatura.meterPhotoExpiresAt.split('T')[0])
    : '30 dias após emissão';

  return (
    <div
      id="invoice-photo-page-container"
      className="invoice-card mx-auto bg-[#1b7a3e] p-3 sm:p-5 text-gray-900 rounded-3xl shadow-2xl font-sans print:p-0 print:rounded-none print:shadow-none print:m-0 print:w-[210mm] print:h-[297mm] print:max-w-none mt-6 print:mt-0"
      style={{
        maxWidth: '820px',
        background: 'linear-gradient(180deg, #1d7b3f 0%, #156231 100%)',
      }}
    >
      {/* Outer White Card with Rounded Corners matching Page 1 */}
      <div className="bg-white rounded-[26px] p-4 sm:p-6 shadow-inner relative flex flex-col justify-between h-full print:rounded-none print:shadow-none">
        {/* BLOCO 1 — CABEÇALHO DA PÁGINA 2 */}
        <div>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-gray-100 pb-3">
            {/* Logo Neo Energia */}
            <div className="flex items-center gap-2">
              <div className="relative flex flex-col items-start">
                <div className="flex items-center gap-1.5">
                  <div className="w-12 h-8 relative flex items-end justify-center overflow-hidden">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-t from-amber-400 to-yellow-300 absolute -bottom-5" />
                    <div className="absolute top-0 w-12 flex justify-between px-1">
                      <span className="w-1 h-3 bg-amber-400 rotate-[-40deg] rounded-full inline-block" />
                      <span className="w-1 h-3 bg-amber-400 rotate-[-20deg] rounded-full inline-block" />
                      <span className="w-1 h-3.5 bg-amber-400 rounded-full inline-block" />
                      <span className="w-1 h-3 bg-amber-400 rotate-[20deg] rounded-full inline-block" />
                      <span className="w-1 h-3 bg-amber-400 rotate-[40deg] rounded-full inline-block" />
                    </div>
                  </div>
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#156231] font-serif leading-none">
                      Neo <span className="text-[#1e824c]">Energia</span>
                    </h1>
                    <p className="text-[10px] tracking-[0.35em] text-[#2e7d32] font-semibold uppercase mt-0.5 pl-0.5">
                      C a r n a ú b a n o s
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Selo Central: Página 2 - Comprovante de Leitura */}
            <div className="flex flex-col items-center">
              <span className="bg-[#1b6b37] text-white text-[11px] font-black px-3 py-0.5 rounded-full tracking-wider uppercase flex items-center gap-1 shadow-xs">
                <Camera className="w-3.5 h-3.5 text-yellow-300" />
                Página 2 • Comprovante de Leitura
              </span>
              <span className="text-xs font-bold text-gray-700 mt-1">
                Fatura #{fatura.invoiceNumber} • {formatReferencePeriod(fatura.referenceMonth, fatura.referenceYear)}
              </span>
            </div>

            {/* Contato & Botão de Baixar Foto (em tela) */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200">
                <div className="w-5 h-5 rounded-full bg-[#25D366] flex items-center justify-center text-white text-xs font-bold shadow-xs">
                  <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
                    <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766 0-3.187-2.59-5.771-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.299.144.347.491 1.2.534 1.288.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.087-.179.182-.077.357.101.174.449.742.964 1.201.662.591 1.221.774 1.394.861.174.086.275.072.376-.044.102-.116.433-.506.549-.679.116-.174.231-.145.39-.087.159.058 1.011.477 1.184.564.173.087.289.13.332.202.043.072.043.419-.101.824z" />
                  </svg>
                </div>
                <span className="font-bold text-[#156231] text-xs">{phoneDisplay}</span>
              </div>

              {onDownloadPhoto && (
                <button
                  type="button"
                  onClick={onDownloadPhoto}
                  className="no-print flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-xs transition cursor-pointer"
                  title="Baixar foto do medidor enviada pelo cliente"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar Foto</span>
                </button>
              )}
            </div>
          </div>

          {/* DADOS DE IDENTIFICAÇÃO E LEITURA */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2.5">
            {/* Dados do Cliente */}
            <div className="border border-[#1b7a3e] rounded-xl p-2 bg-[#fafffb] text-xs">
              <span className="text-[10px] font-black text-[#156231] uppercase tracking-wide block">
                Cliente e Instalação:
              </span>
              <p className="font-extrabold text-sm text-gray-900 uppercase truncate mt-0.5">
                {cliente.name}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-gray-700 mt-0.5 text-[11px]">
                <span>CPF: <strong>{cliente.cpfCnpj}</strong></span>
                <span className="text-emerald-800">Medidor Nº: <strong>{fatura.meterNumber || cliente.meterNumber || cliente.consumerUnit || cliente.clientCodeCoelba || 'PADRÃO'}</strong></span>
                {(fatura.consumerUnit || cliente.consumerUnit) && (
                  <span>UC: <strong>{fatura.consumerUnit || cliente.consumerUnit}</strong></span>
                )}
              </div>
            </div>

            {/* Dados da Leitura & Consumo Apurado */}
            <div className="border border-[#1b7a3e] rounded-xl p-2 bg-emerald-50/60 text-xs flex flex-col justify-between">
              <span className="text-[10px] font-black text-[#156231] uppercase tracking-wide block">
                Apuração do Consumo (kWh):
              </span>
              <div className="grid grid-cols-3 gap-1.5 text-center mt-1">
                <div className="bg-white p-1 rounded-lg border border-emerald-200">
                  <span className="text-[9px] text-gray-500 uppercase block font-bold">Anterior</span>
                  <span className="text-xs font-black text-gray-800">{formatNumberBr(fatura.previousReading)}</span>
                </div>
                <div className="bg-white p-1 rounded-lg border-2 border-emerald-500">
                  <span className="text-[9px] text-emerald-800 uppercase block font-black">Na Foto</span>
                  <span className="text-xs font-black text-emerald-950">{formatNumberBr(fatura.currentReading)}</span>
                </div>
                <div className="bg-emerald-700 p-1 rounded-lg text-white">
                  <span className="text-[9px] text-emerald-100 uppercase block font-bold">Consumo</span>
                  <span className="text-xs font-black">{formatNumberBr(fatura.consumptionKwh)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ÁREA DA FOTO DO MEDIDOR */}
          <div className="mt-3 border-2 border-emerald-600 rounded-2xl p-2 sm:p-3 bg-gray-50 flex flex-col items-center">
            <div className="w-full flex items-center justify-between pb-1.5 mb-1.5 border-b border-gray-200 text-xs">
              <span className="font-black text-emerald-950 uppercase flex items-center gap-1.5 text-[11px]">
                <Camera className="w-3.5 h-3.5 text-emerald-700" />
                Fotografia Original do Visor do Medidor de Energia
              </span>
              <span className="text-[10px] font-bold text-gray-600">
                Capturada em: <strong>{photoUploadedAt}</strong>
              </span>
            </div>

            <div className="w-full flex items-center justify-center bg-gray-900 rounded-xl p-1.5 overflow-hidden">
              <img
                src={fatura.meterPhotoBase64}
                alt="Foto do Medidor tirada pelo Cliente"
                className="max-h-[140mm] sm:max-h-[155mm] w-auto max-w-full object-contain rounded-lg shadow-md"
              />
            </div>

            {/* Informações da Foto & Botão de Baixar */}
            <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-2 mt-2 pt-2 border-t border-gray-200 text-[11px] text-gray-600">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>
                  Leitura apurada e confirmada na foto:{' '}
                  <strong className="text-emerald-950 font-black">{formatNumberBr(fatura.currentReading)} kWh</strong>
                  {fatura.aiIdentifiedReading && (
                    <span className="text-gray-500 ml-1">
                      (Identificada via IA: {fatura.aiIdentifiedReading} kWh)
                    </span>
                  )}
                </span>
              </div>

              {onDownloadPhoto && (
                <button
                  type="button"
                  onClick={onDownloadPhoto}
                  className="no-print inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold text-xs transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Baixar Esta Foto (JPG)</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* BLOCO DE RETENÇÃO LEGAL E AUTENTICIDADE */}
        <div className="mt-2.5 pt-2 border-t border-gray-200">
          <div className="p-2 rounded-xl bg-emerald-50/70 border border-emerald-200 flex items-start gap-2 text-[10px] text-emerald-950">
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <div className="leading-snug">
              <strong>Comprovação Legal de Leitura:</strong> Esta imagem foi enviada pelo cliente{' '}
              <strong>{cliente.name}</strong> através do Portal do Cliente Neo Energia para fins de cálculo de consumo da fatura #{fatura.invoiceNumber}.
              Conforme a política do sistema, a foto possui retenção de 30 dias (data limite de arquivamento:{' '}
              <strong>{expirationDate}</strong>).
            </div>
          </div>
        </div>
      </div>

      {/* Rodapé da Página 2 fora do Card */}
      <div className="text-center mt-2 text-white">
        <p className="text-xs sm:text-sm font-black tracking-wider drop-shadow-md">
          NEO ENERGIA CARNAÚBANOS • JUNTOS VAMOS TRANSFORMAR O MUNDO!
        </p>
      </div>
    </div>
  );
};
