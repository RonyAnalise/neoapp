import { ViaCepResponse } from '../types';

export async function fetchAddressByCep(rawCep: string): Promise<ViaCepResponse | null> {
  const cleanCep = rawCep.replace(/\D/g, '');

  if (cleanCep.length !== 8) {
    throw new Error('CEP deve conter exatamente 8 dígitos numéricos.');
  }

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
    if (!response.ok) {
      throw new Error(`Falha na consulta ao serviço de CEP (HTTP ${response.status}).`);
    }

    const data: ViaCepResponse = await response.json();
    if (data.erro) {
      throw new Error('CEP não encontrado na base dos Correios.');
    }

    return data;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Erro inesperado ao consultar o CEP.');
  }
}

export function formatCep(rawCep: string): string {
  const clean = rawCep.replace(/\D/g, '').slice(0, 8);
  if (clean.length > 5) {
    return `${clean.slice(0, 5)}-${clean.slice(5)}`;
  }
  return clean;
}
