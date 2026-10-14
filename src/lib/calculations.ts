/**
 * Centralized business logic and mathematical rules for NeoApp
 */

export interface InvoiceCalculationInput {
  previousReading: number;
  currentReading: number;
  neoTariff: number; // e.g., 1.00
  coelbaTariff: number; // e.g., 1.21
}

export interface InvoiceCalculationResult {
  consumptionKwh: number;
  neoAmount: number;
  coelbaEstimateAmount: number;
  savingsAmount: number;
  savingsPercentage: number;
  totalToPay: number;
}

/**
 * Calculates all invoice financial values.
 * Applies standard 2-decimal monetary rounding to prevent floating-point discrepancies.
 */
export function calculateInvoice(input: InvoiceCalculationInput): InvoiceCalculationResult {
  const { previousReading, currentReading, neoTariff, coelbaTariff } = input;

  if (currentReading < previousReading) {
    throw new Error('A leitura atual não pode ser menor que a leitura anterior.');
  }

  // 1. Consumo = Leitura atual - Leitura anterior
  const rawConsumption = currentReading - previousReading;
  const consumptionKwh = Math.round(rawConsumption * 100) / 100;

  // 2. Valor Neo = Consumo * Tarifa Neo Energia
  const rawNeoAmount = consumptionKwh * neoTariff;
  const neoAmount = Math.round(rawNeoAmount * 100) / 100;

  // 3. Valor Coelba = Consumo * Tarifa Coelba
  const rawCoelbaAmount = consumptionKwh * coelbaTariff;
  const coelbaEstimateAmount = Math.round(rawCoelbaAmount * 100) / 100;

  // 4. Economia = Valor Coelba - Valor Neo
  const rawSavings = coelbaEstimateAmount - neoAmount;
  const savingsAmount = Math.max(0, Math.round(rawSavings * 100) / 100);

  // 5. Percentual de economia = (Economia / Valor Coelba) * 100
  let savingsPercentage = 0;
  if (coelbaEstimateAmount > 0) {
    savingsPercentage = Math.round((savingsAmount / coelbaEstimateAmount) * 10000) / 100;
  }

  // 6. Total a pagar é o valor calculado da Neo Energia
  const totalToPay = neoAmount;

  return {
    consumptionKwh,
    neoAmount,
    coelbaEstimateAmount,
    savingsAmount,
    savingsPercentage,
    totalToPay,
  };
}

/**
 * Formats a monetary value to standard Brazilian Real format: "R$ 1.099,00"
 */
export function formatCurrency(value: number, includeSymbol = true): string {
  const formatted = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);

  if (includeSymbol) return formatted;
  // Strip "R$" and non-breaking space
  return formatted.replace(/^R\$\s?/, '').trim();
}

/**
 * Formats numbers into Brazilian standard with thousands dots: e.g. 40.265 or 1.099
 */
export function formatNumberBr(value: number, maxDecimals = 0): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  }).format(value || 0);
}

/**
 * Formats date into DD/MM/AAAA
 */
export function formatDateBr(dateStringOrTimestamp: string | Date | number): string {
  if (!dateStringOrTimestamp) return '-';
  const date =
    typeof dateStringOrTimestamp === 'string' || typeof dateStringOrTimestamp === 'number'
      ? new Date(dateStringOrTimestamp)
      : dateStringOrTimestamp;

  if (isNaN(date.getTime())) return String(dateStringOrTimestamp);

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  return `${day}/${month}/${year}`;
}

export const MONTH_NAMES_BR = [
  'JANEIRO',
  'FEVEREIRO',
  'MARÇO',
  'ABRIL',
  'MAIO',
  'JUNHO',
  'JULHO',
  'AGOSTO',
  'SETEMBRO',
  'OUTUBRO',
  'NOVEMBRO',
  'DEZEMBRO',
];

export function getMonthName(monthNumber: number): string {
  return MONTH_NAMES_BR[(monthNumber - 1) % 12] || '';
}

export function formatReferencePeriod(month: number, year: number): string {
  return `${getMonthName(month)} / ${year}`;
}
