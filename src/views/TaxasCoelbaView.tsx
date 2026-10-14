import React, { useState, useRef, useEffect } from 'react';
import {
  FileCheck2,
  Plus,
  Search,
  Calendar,
  DollarSign,
  Download,
  Eye,
  Trash2,
  UploadCloud,
  CheckCircle2,
  X,
  AlertCircle,
  FileImage,
  ZoomIn,
  ZoomOut,
  RotateCw,
  RefreshCw,
  User,
  Hash,
} from 'lucide-react';
import { Cliente, TaxaCoelba } from '../types';
import { formatCurrency, formatDateBr } from '../lib/calculations';
import { ConfirmationModal } from '../components/ConfirmationModal';

interface TaxasCoelbaViewProps {
  taxas: TaxaCoelba[];
  clientes: Cliente[];
  onSaveTaxa: (taxa: Omit<TaxaCoelba, 'id' | 'createdAt' | 'status' | 'createdBy'>) => Promise<void>;
  onDeleteTaxa: (id: string) => Promise<void>;
}

// Utilitário para compactar imagem mantendo excelente legibilidade de comprovantes
function compressImage(file: File, maxWidth = 1600, quality = 0.85): Promise<{ base64: string; size: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth || height > maxWidth) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxWidth) / height);
            height = maxWidth;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Falha ao processar canvas'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const base64 = canvas.toDataURL(mimeType, quality);
        const head = base64.split(',')[0];
        const bytes = Math.round(((base64.length - head.length) * 3) / 4);
        resolve({ base64, size: bytes });
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

export const TaxasCoelbaView: React.FC<TaxasCoelbaViewProps> = ({
  taxas,
  clientes,
  onSaveTaxa,
  onDeleteTaxa,
}) => {
  // Filtros & Busca
  const [searchTerm, setSearchTerm] = useState('');
  const [periodFilter, setPeriodFilter] = useState<'all' | 'current_month' | 'current_year'>('all');

  // Modais
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [viewingTaxa, setViewingTaxa] = useState<TaxaCoelba | null>(null);
  const [deletingTaxa, setDeletingTaxa] = useState<TaxaCoelba | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form de Cadastro
  const [selectedClientId, setSelectedClientId] = useState('');
  const [clientSearchInput, setClientSearchInput] = useState('');
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [codeCoelbaInput, setCodeCoelbaInput] = useState('');
  const [dataTaxa, setDataTaxa] = useState(() => new Date().toISOString().split('T')[0]);
  const [valorInput, setValorInput] = useState<string>('');
  const [descricaoInput, setDescricaoInput] = useState('');
  const [observacoesInput, setObservacoesInput] = useState('');

  // Imagem / Comprovante
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState('');
  const [imageSizeFormatted, setImageSizeFormatted] = useState('');
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Lightbox Zoom & Rotação
  const [zoomLevel, setZoomLevel] = useState(1);
  const [rotation, setRotation] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const clientSelectorRef = useRef<HTMLDivElement>(null);

  // Fechar dropdown de clientes ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (clientSelectorRef.current && !clientSelectorRef.current.contains(event.target as Node)) {
        setIsClientDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Clientes ativos ordenados por nome
  const activeClientes = [...clientes].sort((a, b) => a.name.localeCompare(b.name));

  // Clientes filtrados na busca do dropdown
  const filteredClientOptions = activeClientes.filter((c) => {
    const q = clientSearchInput.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.clientCodeCoelba || '').toLowerCase().includes(q) ||
      (c.cpfCnpj || '').replace(/\D/g, '').includes(q.replace(/\D/g, ''))
    );
  });

  // Handler: Selecionar cliente na lista -> atualiza código Coelba automaticamente
  const handleSelectClient = (client: Cliente) => {
    setSelectedClientId(client.id);
    setClientSearchInput(client.name);
    setCodeCoelbaInput(client.clientCodeCoelba || '');
    setIsClientDropdownOpen(false);
    setFormError(null);
  };

  // Handler: Buscar por código da Coelba -> se encontrar, preenche o nome automaticamente
  const handleCodeCoelbaChange = (code: string) => {
    setCodeCoelbaInput(code);
    const trimmedCode = code.trim();
    if (!trimmedCode) return;

    // Procura correspondência exata ou que inicie com o código
    const found = clientes.find(
      (c) =>
        (c.clientCodeCoelba || '').trim().toLowerCase() === trimmedCode.toLowerCase()
    );

    if (found) {
      setSelectedClientId(found.id);
      setClientSearchInput(found.name);
      setFormError(null);
    }
  };

  // Reset do formulário ao abrir
  const handleOpenCreateModal = () => {
    setSelectedClientId('');
    setClientSearchInput('');
    setCodeCoelbaInput('');
    setDataTaxa(new Date().toISOString().split('T')[0]);
    setValorInput('');
    setDescricaoInput('Taxa de Iluminação / Disponibilidade');
    setObservacoesInput('');
    setImageFile(null);
    setImageBase64(null);
    setImageFileName('');
    setImageSizeFormatted('');
    setFormError(null);
    setIsCreateModalOpen(true);
  };

  // Processamento de upload de imagem
  const handleImageSelect = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setFormError('Por favor selecione um arquivo de imagem válido (PNG, JPG, JPEG ou WebP).');
      return;
    }
    try {
      setIsProcessingImage(true);
      setFormError(null);
      const { base64, size } = await compressImage(file, 1600, 0.85);
      setImageFile(file);
      setImageBase64(base64);
      setImageFileName(file.name);
      setImageSizeFormatted(
        size < 1024 * 1024
          ? `${(size / 1024).toFixed(1)} KB`
          : `${(size / (1024 * 1024)).toFixed(2)} MB`
      );
    } catch (err) {
      console.error('Erro ao compactar imagem:', err);
      setFormError('Não foi possível carregar o comprovante. Tente outra imagem.');
    } finally {
      setIsProcessingImage(false);
    }
  };

  // Drag and Drop
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageSelect(e.dataTransfer.files[0]);
    }
  };

  // Suporte a colar print (Ctrl+V)
  const handlePaste = (e: React.ClipboardEvent) => {
    if (e.clipboardData.files && e.clipboardData.files[0]) {
      const file = e.clipboardData.files[0];
      if (file.type.startsWith('image/')) {
        handleImageSelect(file);
      }
    }
  };

  // Submissão do cadastro
  const handleSubmitTaxa = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const client = clientes.find((c) => c.id === selectedClientId);
    if (!client && !clientSearchInput.trim()) {
      setFormError('Por favor, informe ou selecione o cliente.');
      return;
    }

    const finalClientName = client ? client.name : clientSearchInput.trim();
    const finalCodeCoelba = codeCoelbaInput.trim() || client?.clientCodeCoelba || 'N/A';

    if (!dataTaxa) {
      setFormError('Por favor, informe a data da taxa quitada.');
      return;
    }

    if (!imageBase64) {
      setFormError('É obrigatório anexar a imagem do comprovante da taxa quitada.');
      return;
    }

    const parsedValor = valorInput ? parseFloat(valorInput.replace(',', '.')) : undefined;

    try {
      setIsSaving(true);
      await onSaveTaxa({
        clientId: client?.id || 'manual',
        clientName: finalClientName,
        clientCodeCoelba: finalCodeCoelba,
        data: dataTaxa,
        valor: isNaN(parsedValor as number) ? undefined : parsedValor,
        descricao: descricaoInput.trim() || 'Taxa Quitada Coelba',
        observacoes: observacoesInput.trim() || undefined,
        comprovanteBase64: imageBase64,
        comprovanteFileName: imageFileName || `Comprovante_${finalClientName.replace(/\s+/g, '_')}_${dataTaxa}.jpg`,
        comprovanteFileType: imageFile?.type || 'image/jpeg',
        comprovanteFileSize: imageBase64.length,
      });

      setIsCreateModalOpen(false);
    } catch (err) {
      console.error('Erro ao salvar taxa quitada:', err);
      setFormError(
        'Erro ao registrar taxa no banco de dados: ' +
          (err instanceof Error ? err.message : String(err))
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Download do comprovante
  const handleDownloadImage = (taxa: TaxaCoelba) => {
    try {
      const link = document.createElement('a');
      link.href = taxa.comprovanteBase64;
      const sanitizedName = taxa.clientName.replace(/[^a-zA-Z0-9_-]/g, '_');
      link.download = taxa.comprovanteFileName || `Taxa_Quitada_${sanitizedName}_${taxa.data}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Erro ao baixar comprovante:', err);
      alert('Não foi possível iniciar o download da imagem.');
    }
  };

  // Confirmação de exclusão
  const handleConfirmDelete = async () => {
    if (!deletingTaxa) return;
    try {
      setIsDeleting(true);
      await onDeleteTaxa(deletingTaxa.id);
      setDeletingTaxa(null);
    } catch (err) {
      alert('Erro ao excluir registro de taxa: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtragem das taxas cadastradas
  const currentDate = new Date();
  const currentMonthStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
  const currentYearStr = `${currentDate.getFullYear()}`;

  const filteredTaxas = taxas
    .filter((item) => {
      // Filtro de período
      if (periodFilter === 'current_month') {
        if (!item.data.startsWith(currentMonthStr)) return false;
      } else if (periodFilter === 'current_year') {
        if (!item.data.startsWith(currentYearStr)) return false;
      }

      // Filtro de busca textual
      const q = searchTerm.toLowerCase();
      if (!q) return true;

      return (
        item.clientName.toLowerCase().includes(q) ||
        (item.clientCodeCoelba || '').toLowerCase().includes(q) ||
        (item.descricao || '').toLowerCase().includes(q) ||
        (item.observacoes || '').toLowerCase().includes(q) ||
        item.data.includes(q) ||
        formatDateBr(item.data).includes(q)
      );
    })
    .sort((a, b) => b.data.localeCompare(a.data));

  // Métricas
  const totalQuitadasCount = taxas.length;
  const totalQuitadasValor = taxas.reduce((sum, t) => sum + (t.valor || 0), 0);
  const uniqueClientsCount = new Set(taxas.map((t) => t.clientId || t.clientName)).size;
  const latestTaxa = taxas.length > 0 ? [...taxas].sort((a, b) => b.data.localeCompare(a.data))[0] : null;

  return (
    <div className="space-y-6">
      {/* Top Banner / Título e Ações */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-3xl border border-gray-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-green-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/20">
              <FileCheck2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                Taxas Quitadas
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 uppercase tracking-wider">
                  Coelba
                </span>
              </h1>
              <p className="text-xs text-gray-500 font-medium mt-0.5">
                Registro oficial e visualização de comprovantes de taxas quitadas da concessionária
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white font-bold text-sm shadow-md shadow-emerald-600/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
        >
          <Plus className="w-5 h-5 stroke-[2.5]" />
          <span>Cadastrar Taxa</span>
        </button>
      </div>

      {/* Cards de Métricas Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Quitadas */}
        <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">
              Taxas Quitadas
            </span>
            <h3 className="text-2xl font-black text-gray-900 mt-1">{totalQuitadasCount}</h3>
            <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1 mt-0.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Comprovantes anexados
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <FileCheck2 className="w-6 h-6" />
          </div>
        </div>

        {/* Total em Valor */}
        <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">
              Total Quitado
            </span>
            <h3 className="text-2xl font-black text-emerald-700 mt-1">
              {formatCurrency(totalQuitadasValor)}
            </h3>
            <span className="text-[11px] font-bold text-gray-500 mt-0.5 block">
              Soma das taxas informadas
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        {/* Clientes Atendidos */}
        <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">
              Clientes com Taxas
            </span>
            <h3 className="text-2xl font-black text-gray-900 mt-1">{uniqueClientsCount}</h3>
            <span className="text-[11px] font-bold text-gray-500 mt-0.5 block">
              Consumidores registrados
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center">
            <User className="w-6 h-6" />
          </div>
        </div>

        {/* Último Registro */}
        <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">
              Último Comprovante
            </span>
            <h3 className="text-base font-black text-gray-900 mt-1 truncate max-w-[150px]">
              {latestTaxa ? formatDateBr(latestTaxa.data) : 'Nenhum'}
            </h3>
            <span className="text-[11px] font-medium text-gray-500 truncate max-w-[150px] block mt-0.5">
              {latestTaxa ? latestTaxa.clientName : 'Aguardando cadastro'}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center">
            <Calendar className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Barra de Filtros e Pesquisa */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200/80 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Campo de Busca Rápida */}
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por cliente, código Coelba, data..."
            className="w-full rounded-xl border border-gray-300 bg-gray-50/70 pl-10 pr-10 py-2.5 text-xs text-gray-900 placeholder-gray-400 focus:bg-white focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm font-bold"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filtros de Período */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="flex items-center bg-gray-100 p-1 rounded-xl w-full sm:w-auto text-xs font-bold">
            <button
              onClick={() => setPeriodFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex-1 sm:flex-initial ${
                periodFilter === 'all'
                  ? 'bg-white text-emerald-900 shadow-xs font-black'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Todas ({taxas.length})
            </button>
            <button
              onClick={() => setPeriodFilter('current_month')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex-1 sm:flex-initial ${
                periodFilter === 'current_month'
                  ? 'bg-white text-emerald-900 shadow-xs font-black'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Este Mês
            </button>
            <button
              onClick={() => setPeriodFilter('current_year')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex-1 sm:flex-initial ${
                periodFilter === 'current_year'
                  ? 'bg-white text-emerald-900 shadow-xs font-black'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Este Ano
            </button>
          </div>
        </div>
      </div>

      {/* Listagem de Taxas Quitadas (Tabela Rica) */}
      <div className="bg-white rounded-3xl border border-gray-200/80 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
              Listagem de Taxas Quitadas
            </h2>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
              {filteredTaxas.length} {filteredTaxas.length === 1 ? 'registro' : 'registros'}
            </span>
          </div>
          {searchTerm && (
            <span className="text-xs text-gray-500">
              Filtrado por: <strong className="text-gray-900 font-semibold">"{searchTerm}"</strong>
            </span>
          )}
        </div>

        {filteredTaxas.length === 0 ? (
          <div className="py-16 text-center px-4">
            <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
              <FileCheck2 className="w-8 h-8 opacity-60" />
            </div>
            <h3 className="text-base font-bold text-gray-900">Nenhuma taxa quitada encontrada</h3>
            <p className="text-xs text-gray-500 max-w-md mx-auto mt-1">
              {searchTerm || periodFilter !== 'all'
                ? 'Nenhum resultado corresponde aos filtros aplicados. Tente limpar os filtros de busca.'
                : 'Ainda não foram cadastradas taxas quitadas da Coelba. Clique em "+ Cadastrar Taxa" para anexar o primeiro comprovante.'}
            </p>
            {searchTerm || periodFilter !== 'all' ? (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setPeriodFilter('all');
                }}
                className="mt-4 px-4 py-2 rounded-xl text-xs font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 transition cursor-pointer"
              >
                Limpar filtros de busca
              </button>
            ) : (
              <button
                onClick={handleOpenCreateModal}
                className="mt-4 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition cursor-pointer inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> Cadastrar Primeira Taxa
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50/80 text-gray-500 uppercase tracking-wider font-semibold border-b border-gray-100">
                <tr>
                  <th className="py-3.5 px-6">Data</th>
                  <th className="py-3.5 px-6">Cliente</th>
                  <th className="py-3.5 px-6">Código Coelba</th>
                  <th className="py-3.5 px-6">Descrição / Detalhe</th>
                  <th className="py-3.5 px-6">Valor</th>
                  <th className="py-3.5 px-6">Comprovante</th>
                  <th className="py-3.5 px-6 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {filteredTaxas.map((taxa) => (
                  <tr key={taxa.id} className="hover:bg-gray-50/80 transition-colors">
                    {/* Data */}
                    <td className="py-4 px-6 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <span className="font-bold text-gray-900">{formatDateBr(taxa.data)}</span>
                      </div>
                    </td>

                    {/* Cliente */}
                    <td className="py-4 px-6">
                      <div className="font-bold text-gray-900 text-sm flex items-center gap-2">
                        <span>{taxa.clientName}</span>
                      </div>
                      {taxa.observacoes && (
                        <p className="text-[11px] text-gray-500 truncate max-w-xs mt-0.5">
                          {taxa.observacoes}
                        </p>
                      )}
                    </td>

                    {/* Código Coelba */}
                    <td className="py-4 px-6 whitespace-nowrap">
                      <span className="font-mono text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                        {taxa.clientCodeCoelba || 'N/A'}
                      </span>
                    </td>

                    {/* Descrição */}
                    <td className="py-4 px-6">
                      <span className="text-gray-800 font-medium">{taxa.descricao || 'Taxa Coelba'}</span>
                    </td>

                    {/* Valor e Badge Quitada */}
                    <td className="py-4 px-6 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {taxa.valor ? (
                          <span className="font-black text-gray-900">{formatCurrency(taxa.valor)}</span>
                        ) : (
                          <span className="text-gray-400 italic">Não informado</span>
                        )}
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 uppercase">
                          <CheckCircle2 className="w-3 h-3" /> Quitada
                        </span>
                      </div>
                    </td>

                    {/* Comprovante Thumbnail */}
                    <td className="py-4 px-6 whitespace-nowrap">
                      <button
                        onClick={() => {
                          setViewingTaxa(taxa);
                          setZoomLevel(1);
                          setRotation(0);
                        }}
                        className="group flex items-center gap-2.5 p-1.5 pr-3 rounded-xl bg-gray-50 hover:bg-emerald-50 border border-gray-200 hover:border-emerald-300 transition text-left cursor-pointer"
                        title="Clique para visualizar imagem em tela cheia"
                      >
                        <div className="w-10 h-10 rounded-lg overflow-hidden border border-gray-200 bg-white shrink-0 relative flex items-center justify-center">
                          <img
                            src={taxa.comprovanteBase64}
                            alt="Comprovante"
                            className="w-full h-full object-cover group-hover:scale-110 transition duration-200"
                          />
                        </div>
                        <div className="text-[11px] overflow-hidden">
                          <span className="font-bold text-gray-800 group-hover:text-emerald-900 block truncate max-w-[120px]">
                            {taxa.comprovanteFileName || 'comprovante.jpg'}
                          </span>
                          <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                            <Eye className="w-3 h-3" /> Ver print
                          </span>
                        </div>
                      </button>
                    </td>

                    {/* Ações */}
                    <td className="py-4 px-6 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {/* Visualizar */}
                        <button
                          onClick={() => {
                            setViewingTaxa(taxa);
                            setZoomLevel(1);
                            setRotation(0);
                          }}
                          className="p-2 rounded-xl text-gray-600 hover:text-emerald-700 hover:bg-emerald-50 transition cursor-pointer"
                          title="Visualizar Comprovante"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {/* Download */}
                        <button
                          onClick={() => handleDownloadImage(taxa)}
                          className="p-2 rounded-xl text-gray-600 hover:text-blue-700 hover:bg-blue-50 transition cursor-pointer"
                          title="Baixar Imagem"
                        >
                          <Download className="w-4 h-4" />
                        </button>

                        {/* Excluir */}
                        <button
                          onClick={() => setDeletingTaxa(taxa)}
                          className="p-2 rounded-xl text-gray-400 hover:text-red-700 hover:bg-red-50 transition cursor-pointer"
                          title="Excluir Registro"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL DE CADASTRO ("Cadastrar Taxa Quitada") */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-gray-100 overflow-hidden my-8 animate-in fade-in duration-200">
            {/* Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-emerald-800 to-green-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                  <FileCheck2 className="w-5 h-5 text-emerald-200" />
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-tight">Cadastrar Taxa Quitada</h3>
                  <p className="text-xs text-emerald-200">
                    Vincule o cliente, informe a data e anexe a imagem do comprovante
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmitTaxa} className="p-6 space-y-5" onPaste={handlePaste}>
              {formError && (
                <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Seção 1: Cliente e Código Coelba (Busca Bidirecional) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Nome do Cliente com Autocomplete / Busca */}
                <div className="relative" ref={clientSelectorRef}>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 flex items-center justify-between">
                    <span>1. Nome do Cliente *</span>
                    <span className="text-[10px] text-emerald-600 font-semibold">
                      Preenche o código automático
                    </span>
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={clientSearchInput}
                      onChange={(e) => {
                        setClientSearchInput(e.target.value);
                        setIsClientDropdownOpen(true);
                      }}
                      onFocus={() => setIsClientDropdownOpen(true)}
                      placeholder="Escolher ou buscar cliente..."
                      className="w-full rounded-xl border border-gray-300 bg-gray-50/70 pl-10 pr-10 py-2.5 text-xs text-gray-900 font-medium placeholder-gray-400 focus:bg-white focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                    />
                    {clientSearchInput && (
                      <button
                        type="button"
                        onClick={() => {
                          setClientSearchInput('');
                          setSelectedClientId('');
                          setCodeCoelbaInput('');
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm font-bold"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Dropdown Lista de Clientes */}
                  {isClientDropdownOpen && (
                    <div className="absolute z-30 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-2xl bg-white border border-gray-200 shadow-xl divide-y divide-gray-100">
                      {filteredClientOptions.length === 0 ? (
                        <div className="p-3 text-xs text-gray-500 text-center">
                          Nenhum cliente encontrado com esse nome.
                        </div>
                      ) : (
                        filteredClientOptions.map((c) => (
                          <div
                            key={c.id}
                            onClick={() => handleSelectClient(c)}
                            className={`p-2.5 px-3.5 hover:bg-emerald-50 transition cursor-pointer flex items-center justify-between ${
                              selectedClientId === c.id ? 'bg-emerald-50/80 font-bold text-emerald-900' : ''
                            }`}
                          >
                            <div>
                              <div className="text-xs font-bold text-gray-900">{c.name}</div>
                              <div className="text-[10px] text-gray-500 font-mono">
                                Cód. Coelba: {c.clientCodeCoelba || 'Sem código'}
                              </div>
                            </div>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                              Selecionar
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* 2. Código da Coelba (Busca e Preenchimento Automático) */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 flex items-center justify-between">
                    <span>2. Código da Coelba</span>
                    <span className="text-[10px] text-blue-600 font-semibold">
                      Busca o nome se digitar aqui
                    </span>
                  </label>
                  <div className="relative">
                    <Hash className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={codeCoelbaInput}
                      onChange={(e) => handleCodeCoelbaChange(e.target.value)}
                      placeholder="Ex: 7023456789"
                      className="w-full rounded-xl border border-gray-300 bg-gray-50/70 pl-10 pr-3 py-2.5 text-xs text-gray-900 font-mono font-bold placeholder-gray-400 focus:bg-white focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                    />
                  </div>
                </div>
              </div>

              {/* Seção 2: Data, Valor e Descrição */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Data */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">
                    Data da Quitação *
                  </label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="date"
                      value={dataTaxa}
                      onChange={(e) => setDataTaxa(e.target.value)}
                      required
                      className="w-full rounded-xl border border-gray-300 bg-gray-50/70 pl-10 pr-3 py-2.5 text-xs text-gray-900 font-semibold focus:bg-white focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                    />
                  </div>
                </div>

                {/* Valor R$ */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">
                    Valor Pago (R$)
                  </label>
                  <div className="relative">
                    <span className="text-xs font-bold text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2">
                      R$
                    </span>
                    <input
                      type="text"
                      value={valorInput}
                      onChange={(e) => setValorInput(e.target.value)}
                      placeholder="0,00"
                      className="w-full rounded-xl border border-gray-300 bg-gray-50/70 pl-10 pr-3 py-2.5 text-xs text-gray-900 font-bold focus:bg-white focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                    />
                  </div>
                </div>

                {/* Descrição */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">
                    Tipo / Descrição
                  </label>
                  <input
                    type="text"
                    value={descricaoInput}
                    onChange={(e) => setDescricaoInput(e.target.value)}
                    placeholder="Ex: Taxa Iluminação / Religação"
                    className="w-full rounded-xl border border-gray-300 bg-gray-50/70 px-3.5 py-2.5 text-xs text-gray-900 font-medium focus:bg-white focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                  />
                </div>
              </div>

              {/* Seção 3: Anexo do Comprovante (Imagem) */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5 flex items-center justify-between">
                  <span>Anexar Comprovante (Imagem) *</span>
                  <span className="text-[10px] text-gray-400 font-normal">
                    Formatos: PNG, JPG, JPEG, WebP • Aceita Ctrl+V
                  </span>
                </label>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleImageSelect(e.target.files[0]);
                    }
                  }}
                  accept="image/*"
                  className="hidden"
                />

                {!imageBase64 ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    className="border-2 border-dashed border-gray-300 hover:border-emerald-500 rounded-2xl p-6 text-center cursor-pointer transition bg-gray-50/50 hover:bg-emerald-50/30 group"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-white shadow-xs border border-gray-200 text-gray-400 group-hover:text-emerald-600 group-hover:border-emerald-300 flex items-center justify-center mx-auto mb-2 transition">
                      {isProcessingImage ? (
                        <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
                      ) : (
                        <UploadCloud className="w-6 h-6" />
                      )}
                    </div>
                    <span className="text-xs font-bold text-gray-800 group-hover:text-emerald-900 block">
                      {isProcessingImage ? 'Otimizando comprovante...' : 'Clique para selecionar a imagem do comprovante'}
                    </span>
                    <span className="text-[11px] text-gray-400 mt-1 block">
                      ou arraste a foto aqui (ou pressione <strong>Ctrl+V</strong> se tiver copiado o print)
                    </span>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-2xl border border-emerald-200 bg-emerald-50/50 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-16 h-16 rounded-xl overflow-hidden border border-emerald-300 bg-white shrink-0 shadow-xs relative">
                        <img
                          src={imageBase64}
                          alt="Pré-visualização"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span className="text-xs font-bold text-gray-900 truncate max-w-xs block">
                            {imageFileName || 'Comprovante anexado'}
                          </span>
                        </div>
                        <span className="text-[11px] text-gray-500 font-medium block mt-0.5">
                          Tamanho otimizado: <strong>{imageSizeFormatted}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 transition cursor-pointer"
                      >
                        Trocar Imagem
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setImageFile(null);
                          setImageBase64(null);
                          setImageFileName('');
                        }}
                        className="p-1.5 rounded-xl text-red-600 hover:bg-red-50 transition cursor-pointer"
                        title="Remover anexo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Observações Opcionais */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Observações Adicionais (Opcional)
                </label>
                <textarea
                  value={observacoesInput}
                  onChange={(e) => setObservacoesInput(e.target.value)}
                  placeholder="Informações adicionais sobre o pagamento ou número de protocolo..."
                  rows={2}
                  className="w-full rounded-xl border border-gray-300 bg-gray-50/70 px-3.5 py-2.5 text-xs text-gray-900 placeholder-gray-400 focus:bg-white focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                />
              </div>

              {/* Footer e Botões */}
              <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 text-xs font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving || isProcessingImage}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white text-xs font-bold shadow-md shadow-emerald-600/25 transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Salvando no banco...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Salvar Taxa Quitada</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LIGHTBOX / VISUALIZADOR DA IMAGEM EM TELA CHEIA */}
      {viewingTaxa && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-md p-4 sm:p-6 animate-in fade-in duration-200">
          {/* Top Bar da Imagem */}
          <div className="flex items-center justify-between text-white pb-4 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <FileImage className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Comprovante: {viewingTaxa.clientName}</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-mono">
                    Cód: {viewingTaxa.clientCodeCoelba}
                  </span>
                </h3>
                <p className="text-[11px] text-gray-400">
                  Data: {formatDateBr(viewingTaxa.data)}{' '}
                  {viewingTaxa.valor ? `• Valor: ${formatCurrency(viewingTaxa.valor)}` : ''} •{' '}
                  {viewingTaxa.descricao || 'Taxa Coelba'}
                </p>
              </div>
            </div>

            {/* Controles de Zoom, Rotação, Download e Fechar */}
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center bg-white/10 rounded-xl p-1 gap-1">
                <button
                  onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-gray-300 hover:text-white transition cursor-pointer"
                  title="Diminuir Zoom"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-[11px] font-mono px-2 text-gray-300">
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button
                  onClick={() => setZoomLevel((z) => Math.min(3, z + 0.25))}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-gray-300 hover:text-white transition cursor-pointer"
                  title="Aumentar Zoom"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-gray-300 hover:text-white transition cursor-pointer"
                  title="Girar 90 graus"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
              </div>

              {/* Botão de Download */}
              <button
                onClick={() => handleDownloadImage(viewingTaxa)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition cursor-pointer shadow-md"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Baixar Imagem</span>
              </button>

              {/* Botão Fechar */}
              <button
                onClick={() => setViewingTaxa(null)}
                className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer ml-2"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Área Central de Visualização da Imagem */}
          <div className="flex-1 overflow-auto flex items-center justify-center p-4">
            <div
              className="transition-transform duration-200 ease-out select-none"
              style={{
                transform: `scale(${zoomLevel}) rotate(${rotation}deg)`,
                maxWidth: '90vw',
                maxHeight: '80vh',
              }}
            >
              <img
                src={viewingTaxa.comprovanteBase64}
                alt={`Comprovante ${viewingTaxa.clientName}`}
                className="rounded-xl shadow-2xl max-w-full max-h-[78vh] object-contain mx-auto border border-white/10"
              />
            </div>
          </div>

          {/* Barra inferior com instruções */}
          <div className="text-center text-[11px] text-gray-400 py-2 border-t border-white/10 shrink-0">
            Dica: Utilize os botões no topo para dar zoom, girar a orientação da imagem ou fazer o download do comprovante original.
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO */}
      {deletingTaxa && (
        <ConfirmationModal
          isOpen={!!deletingTaxa}
          title="Excluir Taxa Quitada"
          message={`Tem certeza que deseja remover o registro de taxa quitada do cliente "${deletingTaxa.clientName}" referente à data ${formatDateBr(deletingTaxa.data)}? O comprovante anexado também será excluído do banco.`}
          confirmLabel={isDeleting ? 'Excluindo...' : 'Sim, Excluir Registro'}
          cancelLabel="Cancelar"
          confirmVariant="danger"
          loading={isDeleting}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeletingTaxa(null)}
        />
      )}
    </div>
  );
};
