import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X, Check, ChevronDown } from 'lucide-react';
import { Cliente } from '../types';

interface SearchableClientSelectProps {
  clientes: Cliente[];
  selectedClientId: string;
  onSelectClient: (clientId: string) => void;
  placeholder?: string;
  required?: boolean;
  filterActiveOnly?: boolean;
  allowAllOption?: boolean;
  allOptionLabel?: string;
  className?: string;
  disabled?: boolean;
}

export const SearchableClientSelect: React.FC<SearchableClientSelectProps> = ({
  clientes,
  selectedClientId,
  onSelectClient,
  placeholder = 'Digite para buscar cliente...',
  required = false,
  filterActiveOnly = false,
  allowAllOption = false,
  allOptionLabel = 'Todos os Clientes',
  className = '',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cliente atualmente selecionado
  const selectedClient = useMemo(() => {
    if (!selectedClientId || selectedClientId === 'all') return null;
    return clientes.find((c) => c.id === selectedClientId) || null;
  }, [clientes, selectedClientId]);

  // Sincroniza o texto exibido quando não estiver editando a busca
  useEffect(() => {
    if (!isOpen) {
      if (selectedClientId === 'all' && allowAllOption) {
        setSearchTerm(allOptionLabel);
      } else if (selectedClient) {
        const meter = selectedClient.meterNumber || selectedClient.consumerUnit || selectedClient.clientCodeCoelba;
        setSearchTerm(`${selectedClient.name}${meter ? ` (Medidor: ${meter})` : ''}`);
      } else {
        setSearchTerm('');
      }
    }
  }, [selectedClient, selectedClientId, isOpen, allowAllOption, allOptionLabel]);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Normalização de texto para busca sem acentos
  const normalize = (val: string | null | undefined) =>
    (val || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  // Clientes filtrados e ordenados em ordem alfabética
  const filteredList = useMemo(() => {
    let list = clientes;
    if (filterActiveOnly) {
      list = list.filter((c) => c.status === 'active');
    }

    const term = normalize(searchTerm);
    const digits = searchTerm.replace(/\D/g, '');

    if (!term || (selectedClient && searchTerm.startsWith(selectedClient.name) && !isOpen)) {
      return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' }));
    }

    return list
      .filter((c) => {
        const name = normalize(c.name);
        const code = normalize(c.clientCodeCoelba);
        const uc = normalize(c.consumerUnit);
        const meter = normalize(c.meterNumber);
        const city = normalize(c.city);
        const address = normalize(c.address);
        const cleanCpf = (c.cpfCnpj || '').replace(/\D/g, '');
        const cleanPhone = (c.phone || c.whatsapp || '').replace(/\D/g, '');

        const matchesText =
          name.includes(term) ||
          code.includes(term) ||
          uc.includes(term) ||
          meter.includes(term) ||
          city.includes(term) ||
          address.includes(term);

        const matchesDigits =
          digits.length >= 2 && (cleanCpf.includes(digits) || cleanPhone.includes(digits));

        return matchesText || matchesDigits;
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' }));
  }, [clientes, searchTerm, filterActiveOnly, selectedClient, isOpen]);

  const handleSelect = (clientId: string) => {
    onSelectClient(clientId);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectClient(allowAllOption ? 'all' : '');
    setSearchTerm('');
    if (inputRef.current) {
      inputRef.current.focus();
    }
    setIsOpen(true);
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Campo de Digitação com Ícone de Busca e Limpeza */}
      <div className="relative flex items-center">
        <Search className="absolute left-3 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          disabled={disabled}
          required={required && !selectedClientId}
          onFocus={() => {
            setIsOpen(true);
            // Ao focar, se houver um cliente já selecionado, limpa o texto temporariamente para facilitar nova digitação
            if (selectedClient) {
              setSearchTerm('');
            }
          }}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setIsOpen(false);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (filteredList.length > 0) {
                handleSelect(filteredList[0].id);
              }
            }
          }}
          placeholder={placeholder}
          className="w-full rounded-xl border border-gray-300 bg-white pl-9 pr-14 py-2 text-xs font-medium text-gray-900 placeholder:text-gray-400 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 focus:outline-none transition shadow-2xs"
        />

        <div className="absolute right-2 flex items-center gap-1">
          {searchTerm && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 rounded-md text-gray-400 hover:text-gray-600 transition cursor-pointer"
              title="Limpar seleção"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 transition cursor-pointer"
            tabIndex={-1}
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Lista Suspensa Flutuante com Autocomplete */}
      {isOpen && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-2xl space-y-0.5 animate-in fade-in zoom-in-95 duration-100">
          {allowAllOption && (
            <button
              type="button"
              onClick={() => handleSelect('all')}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                selectedClientId === 'all'
                  ? 'bg-emerald-50 text-emerald-950 font-black border border-emerald-300'
                  : 'hover:bg-gray-100 text-gray-700'
              }`}
            >
              <span>{allOptionLabel}</span>
              {selectedClientId === 'all' && <Check className="w-4 h-4 text-emerald-700" />}
            </button>
          )}

          {filteredList.length === 0 ? (
            <div className="py-3 px-3 text-center text-xs text-gray-500">
              Nenhum cliente encontrado para "{searchTerm}"
            </div>
          ) : (
            filteredList.map((c) => {
              const isSelected = c.id === selectedClientId;
              const meterDisplay = c.meterNumber || c.consumerUnit || c.clientCodeCoelba;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelect(c.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg transition flex items-center justify-between gap-2 cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-50 text-emerald-950 font-bold border border-emerald-300'
                      : 'hover:bg-gray-50 text-gray-800'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black truncate">{c.name}</p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-gray-500 mt-0.5">
                      {meterDisplay && (
                        <span className="font-mono text-emerald-700 font-semibold">
                          Medidor: {meterDisplay}
                        </span>
                      )}
                      {c.cpfCnpj && <span>CPF: {c.cpfCnpj}</span>}
                      {c.city && <span>• {c.city}</span>}
                    </div>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-emerald-700 shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
