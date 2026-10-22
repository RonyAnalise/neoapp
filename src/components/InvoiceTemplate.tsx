import React from 'react';
import { Fatura, Cliente, EmpresaConfig } from '../types';
import {
  formatCurrency,
  formatNumberBr,
  formatDateBr,
  formatReferencePeriod,
  calculateDaysBetween,
  MONTH_NAMES_BR,
} from '../lib/calculations';

interface InvoiceTemplateProps {
  fatura: Fatura;
  cliente: Cliente;
  empresa: EmpresaConfig;
  allClientInvoices?: Fatura[]; // for accumulated savings history
}

export const InvoiceTemplate: React.FC<InvoiceTemplateProps> = ({
  fatura,
  cliente,
  empresa,
  allClientInvoices = [],
}) => {
  // Compute accumulated history across valid client invoices
  const validInvoices = allClientInvoices
    .filter((inv) => inv.status !== 'cancelled' && inv.clientId === fatura.clientId)
    .sort((a, b) => {
      if (a.referenceYear !== b.referenceYear) return a.referenceYear - b.referenceYear;
      return a.referenceMonth - b.referenceMonth;
    });

  const totalAccumulatedSavings = validInvoices.reduce((sum, inv) => sum + (inv.savingsAmount || 0), 0) || fatura.savingsAmount;
  const totalMonthsCount = Math.max(1, validInvoices.length);

  const firstInvoice = validInvoices[0] || fatura;
  const periodText =
    validInvoices.length > 1
      ? `${String(firstInvoice.referenceMonth).padStart(2, '0')}/${firstInvoice.referenceYear} A ${String(
          fatura.referenceMonth
        ).padStart(2, '0')}/${fatura.referenceYear}`
      : `${String(fatura.referenceMonth).padStart(2, '0')}/${fatura.referenceYear}`;

  // Monthly consumption mapping for the reference year (January to December)
  const currentYearInvoices = validInvoices.filter((inv) => inv.referenceYear === fatura.referenceYear);
  const monthConsumptionMap: { [key: number]: number } = {};
  currentYearInvoices.forEach((inv) => {
    monthConsumptionMap[inv.referenceMonth] = inv.consumptionKwh;
  });
  // Make sure current invoice is present
  monthConsumptionMap[fatura.referenceMonth] = fatura.consumptionKwh;

  const daysBetweenReadings = calculateDaysBetween(
    fatura.previousReadingDate,
    fatura.currentReadingDate
  );

  const phoneDisplay = empresa.phone || '77-992107440';
  const warningText = empresa.warningPaymentText || `TEM ${empresa.paymentDueDays || 15} DIAS PARA EFETUAR O PAGAMENTO.`;
  const companyTitle = (
    empresa.companyName || 'NEO ENERGIA CARNAÚBANOS (GRUPO DE INVESTIMENTOS CARNAÚBANOS)'
  ).replace(/INVETIMENTOS/gi, 'INVESTIMENTOS');

  return (
    <div
      id="invoice-printable-container"
      className="invoice-card mx-auto bg-[#1b7a3e] p-3 sm:p-5 text-gray-900 rounded-3xl shadow-2xl font-sans print:p-0 print:rounded-none print:shadow-none print:m-0 print:w-[210mm] print:h-[297mm] print:max-w-none"
      style={{
        maxWidth: '820px',
        background: 'linear-gradient(180deg, #1d7b3f 0%, #156231 100%)',
      }}
    >
      {/* Outer White Card with Rounded Corners */}
      <div className="bg-white rounded-[26px] p-4 sm:p-6 shadow-inner relative flex flex-col justify-between h-full print:rounded-none print:shadow-none">
        {/* BLOCO 1 — CABEÇALHO */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-gray-100 pb-3">
          {/* Logo Neo Energia */}
          <div className="flex items-center gap-2">
            <div className="relative flex flex-col items-start">
              {/* Stylized Sun Rays */}
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

          {/* Central Contact (WhatsApp & Phone) */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200">
            {/* WhatsApp Green Icon */}
            <div className="w-6 h-6 rounded-full bg-[#25D366] flex items-center justify-center text-white text-xs font-bold shadow-xs">
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766 0-3.187-2.59-5.771-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.299.144.347.491 1.2.534 1.288.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.087-.179.182-.077.357.101.174.449.742.964 1.201.662.591 1.221.774 1.394.861.174.086.275.072.376-.044.102-.116.433-.506.549-.679.116-.174.231-.145.39-.087.159.058 1.011.477 1.184.564.173.087.289.13.332.202.043.072.043.419-.101.824z" />
              </svg>
            </div>
            <span className="font-bold text-[#156231] text-sm tracking-wide">{phoneDisplay}</span>
          </div>

          {/* Top-Right Notice Box */}
          <div className="flex flex-col items-end">
            <span className="bg-[#1b6b37] text-white text-[11px] font-black px-3 py-0.5 rounded-t-lg tracking-wider">
              ATENÇÃO
            </span>
            <div className="bg-[#e97825] text-white text-xs font-bold px-3 py-2 rounded-lg rounded-tr-none text-center shadow-xs max-w-[210px] leading-tight">
              {warningText}
            </div>
          </div>
        </div>

        {/* BLOCO 2 — DADOS DO BENEFICIÁRIO */}
        <div className="mt-3 border-2 border-[#1b7a3e] rounded-xl p-2 bg-[#fafffb]">
          <span className="text-[11px] font-black text-[#156231] tracking-wide block">
            DADOS BENEFICIÁRIO:
          </span>
          <p className="text-xs sm:text-sm font-bold text-gray-800 text-center tracking-wide uppercase py-0.5">
            {companyTitle}
          </p>
        </div>

        {/* BLOCO 3 & 4 — DADOS DO CLIENTE + MÊS DE REFERÊNCIA & CÓDIGO DO CLIENTE */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 mt-3">
          {/* Dados do Cliente (Left side - 7 cols) */}
          <div className="sm:col-span-7 border-2 border-[#1b7a3e] rounded-2xl p-2.5 bg-white flex flex-col justify-between">
            <span className="text-[11px] font-black text-[#156231] tracking-wide block mb-1">
              DADOS DO CLIENTE:
            </span>
            <div className="space-y-0.5 text-xs text-gray-800">
              <p className="font-extrabold text-sm text-gray-900 uppercase">{cliente.name}</p>
              <p className="font-bold text-gray-700">
                CPF: <span className="font-normal">{cliente.cpfCnpj}</span>
                {cliente.consumerUnit ? ` (${cliente.consumerUnit})` : ''}
              </p>
              <p className="font-medium text-gray-700 uppercase">
                {cliente.address} {cliente.number}
              </p>
              <p className="font-medium text-gray-700 uppercase">{cliente.neighborhood}</p>
              <p className="font-medium text-gray-700 uppercase">
                {cliente.city} {cliente.state}
              </p>
              <p className="font-medium text-gray-700">{cliente.cep}</p>
            </div>
          </div>

          {/* Referência e Código do Cliente (Right side - 5 cols) */}
          <div className="sm:col-span-5 flex flex-col gap-2.5">
            {/* Mês de Referência */}
            <div className="border-2 border-[#1b7a3e] rounded-2xl p-2 text-center bg-white flex flex-col justify-center">
              <span className="text-[10px] font-black text-[#156231] tracking-wider block">
                MÊS DE REFERÊNCIA:
              </span>
              <p className="text-base sm:text-lg font-black text-[#156231] tracking-wide uppercase mt-0.5">
                {formatReferencePeriod(fatura.referenceMonth, fatura.referenceYear)}
              </p>
            </div>

            {/* Código do Cliente na Coelba */}
            <div className="border-2 border-[#1b7a3e] rounded-2xl p-2 text-center bg-white flex flex-col justify-center">
              <span className="text-[10px] font-black text-[#156231] tracking-wider block leading-tight">
                CÓDIGO DO CLIENTE NA SUA REDE DA COELBA
              </span>
              <p className="text-lg sm:text-xl font-black text-gray-900 tracking-wider mt-0.5">
                {cliente.clientCodeCoelba || '7092185421'}
              </p>
            </div>
          </div>
        </div>

        {/* BLOCO 5, 6, 7 — VALOR COMPARATIVO, TOTAL A PAGAR E DESCONTO */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 mt-3">
          {/* Left Column (Coelba comparison + Total to pay) */}
          <div className="sm:col-span-8 flex flex-col gap-2.5">
            {/* Bloco 5: Comparativo Coelba */}
            <div className="border-2 border-[#1b7a3e] rounded-2xl px-4 py-2 bg-white flex items-center justify-start gap-2">
              <span className="text-xs sm:text-sm font-extrabold text-[#156231]">
                NA COELBA VOCÊ PAGARIA:
              </span>
              <span className="text-base sm:text-lg font-black text-gray-900">
                {formatCurrency(fatura.coelbaEstimateAmount, false)}
              </span>
            </div>

            {/* Bloco 6: Total a pagar com desconto */}
            <div className="border-2 border-[#1b7a3e] rounded-2xl px-4 py-3 bg-white flex items-center justify-start gap-2">
              <span className="text-xs sm:text-sm font-extrabold text-[#156231]">
                TOTAL A PAGAR COM DESCONTO:
              </span>
              <span className="text-2xl sm:text-3xl font-black text-[#156231] tracking-tight">
                {formatCurrency(fatura.totalToPay, false)}
              </span>
            </div>
          </div>

          {/* Bloco 7: Desconto Neo Energia (Orange card) */}
          <div className="sm:col-span-4 bg-[#e97825] rounded-2xl p-2.5 text-white flex flex-col justify-between items-center text-center shadow-md">
            <div className="bg-white/90 text-[#e97825] font-black text-[10px] sm:text-[11px] px-3 py-0.5 rounded-full uppercase tracking-wider">
              DESCONTO NEO ENERGIA
            </div>
            <div className="my-1">
              <span className="text-2xl sm:text-3xl font-black tracking-tight drop-shadow-xs">
                {formatCurrency(fatura.savingsAmount, false)}
              </span>
            </div>
            {/* Piggy Bank / Savings graphic */}
            <div className="flex items-center justify-center">
              <div className="w-9 h-9 rounded-full bg-[#1b7a3e] flex items-center justify-center text-white border-2 border-white shadow-xs">
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                  <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7 7-7Z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* BLOCO 8 — SUSTENTABILIDADE */}
        <div className="mt-3 py-1 px-3 bg-gradient-to-r from-emerald-100 via-green-50 to-emerald-100 rounded-xl border border-emerald-300 text-center flex items-center justify-center gap-2">
          <span className="text-base">🌳🌳☀️⚡⚡</span>
          <span className="text-xs sm:text-sm font-black text-[#156231] tracking-wide uppercase">
            PARABÉNS! O PLANETA AGRADECE A SUA ESCOLHA!
          </span>
        </div>

        {/* BLOCO 9 — TRANSPARÊNCIA NO DESCONTO */}
        <div className="mt-3 bg-[#1d7b3f] text-white rounded-2xl p-3 text-center shadow-xs">
          <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-yellow-300 mb-1">
            TRANSPARÊNCIA NO SEU DESCONTO
          </h3>
          <div className="space-y-1 text-[10px] sm:text-[11px] font-semibold leading-relaxed text-emerald-50">
            <p>
              ESTE MÊS FOI {formatNumberBr(fatura.currentReading)} KWH –{' '}
              {formatNumberBr(fatura.previousReading)} KWH DO MÊS PASSADO ={' '}
              {formatNumberBr(fatura.consumptionKwh)} KWH X{' '}
              {formatCurrency(fatura.appliedNeoTariff, false)} ={' '}
              {formatCurrency(fatura.neoAmount, false)} REAIS PARA PAGAR.
            </p>
            <p>
              SE FOSSE NA COELBA, SEGUNDO A ÚLTIMA FATURA PAGOU{' '}
              {formatCurrency(fatura.appliedCoelbaTariff, false, 4)} NO KWH, ENTÃO O SENHOR PAGARIA{' '}
              {formatNumberBr(fatura.consumptionKwh)} KWH X{' '}
              {formatCurrency(fatura.appliedCoelbaTariff, false, 4)} ={' '}
              {formatCurrency(fatura.coelbaEstimateAmount, false)} REAIS.
            </p>
            <p className="text-yellow-200 font-bold">
              ENTÃO TEVE UMA ECONOMIA DE {formatCurrency(fatura.savingsAmount, false)} REAIS ESTE MÊS.
            </p>
          </div>
        </div>

        {/* BLOCO 10 & 11 — HISTÓRICO DE CONSUMO + VENCIMENTO + INFORMAÇÕES ADICIONAIS */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 mt-3">
          {/* Histórico 12 Meses (4 cols) */}
          <div className="sm:col-span-4 border-2 border-[#1b7a3e] rounded-2xl p-2 bg-white">
            <span className="text-[10px] font-black text-[#156231] tracking-wider block text-center mb-1">
              HISTÓRICO DE CONSUMO / ECONOMIA:
            </span>
            <div className="overflow-hidden border border-emerald-200 rounded-lg">
              <table className="w-full text-[10px] text-gray-800 text-center">
                <thead>
                  <tr className="bg-emerald-100/70 text-[#156231] font-black border-b border-emerald-200">
                    <th className="py-0.5 px-1 border-r border-emerald-200">MÊS/ANO</th>
                    <th className="py-0.5 px-1">KWH</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {MONTH_NAMES_BR.map((mName, index) => {
                    const mNum = index + 1;
                    const val = monthConsumptionMap[mNum];
                    const isCurrent = mNum === fatura.referenceMonth;
                    return (
                      <tr
                        key={mName}
                        className={isCurrent ? 'bg-amber-100/80 font-bold' : index % 2 === 0 ? 'bg-gray-50/50' : ''}
                      >
                        <td className="py-0.5 px-1 text-left pl-2 border-r border-gray-100 font-medium">
                          {mName}
                        </td>
                        <td className="py-0.5 px-1 font-bold text-gray-900">
                          {val !== undefined ? formatNumberBr(val) : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Leitura Deste Mês (3 cols) */}
          <div className="sm:col-span-3 border-2 border-[#1b7a3e] rounded-2xl p-2.5 bg-white flex flex-col justify-between text-center">
            <div className="border-b border-emerald-100 pb-1">
              <span className="text-[11px] font-black text-[#156231] block">LEITURA DESTE MÊS</span>
            </div>

            <div className="my-0.5">
              <span className="text-[10px] font-black text-gray-600 block uppercase">LEITURA INICIAL</span>
              <span className="text-[11px] font-bold text-gray-800 block">
                {formatDateBr(fatura.previousReadingDate)}
              </span>
              <span className="text-sm font-black text-gray-900 block mt-0.5">
                {formatNumberBr(fatura.previousReading)} KWH
              </span>
            </div>

            {/* Qtd de Dias Utilizados entre Leitura Anterior e Atual */}
            <div className="border-t border-b border-emerald-100 py-1 my-0.5 bg-emerald-50/70 rounded-md">
              <span className="text-[9px] font-black text-gray-600 block uppercase tracking-wider">
                DIAS UTILIZADOS
              </span>
              <span className="text-xs sm:text-sm font-black text-[#156231] block">
                {daysBetweenReadings !== null ? `${daysBetweenReadings} DIAS` : '-'}
              </span>
            </div>

            <div className="my-0.5">
              <span className="text-[10px] font-black text-gray-600 block uppercase">LEITURA FINAL</span>
              <span className="text-[11px] font-bold text-gray-800 block">
                {formatDateBr(fatura.currentReadingDate)}
              </span>
              <span className="text-sm font-black text-gray-900 block mt-0.5">
                {formatNumberBr(fatura.currentReading)} KWH
              </span>
            </div>
          </div>

          {/* Vencimento e Informações Adicionais (5 cols) */}
          <div className="sm:col-span-5 flex flex-col gap-2.5">
            {/* Data Vencimento */}
            <div className="border-2 border-[#1b7a3e] rounded-2xl p-2 text-center bg-white">
              <span className="text-[10px] font-black text-[#156231] tracking-wider block">
                DATA VENCIMENTO:
              </span>
              <p className="text-xl sm:text-2xl font-black text-[#156231] tracking-wide mt-0.5">
                {formatDateBr(fatura.dueDate)}
              </p>
            </div>

            {/* Informações Adicionais */}
            <div className="border-2 border-[#1b7a3e] rounded-2xl p-2 bg-white flex flex-col justify-between flex-1">
              <span className="text-[10px] font-black text-[#156231] tracking-wider block text-center mb-1">
                INFORMAÇÕES ADICIONAIS
              </span>
              <div className="bg-[#e97825] rounded-xl p-3 text-center my-auto shadow-xs">
                <p className="text-white font-black text-sm sm:text-base leading-tight">
                  PAGAMENTO VIA BOLETO BANCÁRIO.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* BLOCO 12 — RESUMO ACUMULADO DE ECONOMIA (Orange Banner) */}
        <div className="mt-3 bg-[#e97825] rounded-2xl p-2.5 text-white shadow-md">
          <div className="flex items-center justify-between px-2 mb-1.5 border-b border-orange-400/60 pb-1">
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full bg-emerald-800 flex items-center justify-center text-white text-[11px] font-black">
                $
              </div>
              <span className="text-[9px] sm:text-[10px] font-black tracking-wide uppercase">
                RESUMO TOTAL DE SUAS ECONÔMIAS DESDE O SEU PRIMEIRO DIA CONOSCO.
              </span>
            </div>
            <div className="text-xs">📅</div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center items-center">
            <div className="bg-orange-600/50 rounded-xl p-1.5 border border-orange-400/40">
              <span className="text-[9px] font-black uppercase block text-orange-100">MESES E ANO</span>
              <span className="text-xs sm:text-sm font-black text-white">{periodText}</span>
            </div>
            <div className="bg-orange-600/50 rounded-xl p-1.5 border border-orange-400/40">
              <span className="text-[9px] font-black uppercase block text-orange-100">QUANT.</span>
              <span className="text-xs sm:text-sm font-black text-white">{totalMonthsCount} MESES</span>
            </div>
            <div className="bg-orange-600/50 rounded-xl p-1.5 border border-orange-400/40">
              <span className="text-[9px] font-black uppercase block text-orange-100">TODA DA SUA ECONÔMIA</span>
              <span className="text-xs sm:text-sm font-black text-yellow-200">
                R$ = {formatCurrency(totalAccumulatedSavings, false)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Banner Outside Card */}
      <div className="text-center mt-3 text-white">
        <p className="text-sm sm:text-base font-black tracking-wider drop-shadow-md">
          JUNTOS VAMOS TRANSFORMAR O MUNDO!
        </p>
      </div>
    </div>
  );
};
