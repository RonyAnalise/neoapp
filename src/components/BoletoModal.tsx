import React, { useState } from 'react';
import { X, Upload, FileText, Trash2, Download, AlertCircle, CheckCircle, ExternalLink } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { Fatura } from '../types';
import { downloadBoletoFile, openBoletoInNewTab } from '../lib/boletoService';
import { logAuditEvent } from '../lib/auditService';
import { useAuth } from '../hooks/useAuth';

interface BoletoModalProps {
  fatura: Fatura | null;
  isOpen: boolean;
  onClose: () => void;
  onBoletoUpdated: (updatedFatura: Partial<Fatura>) => void;
}

// Limite seguro: 720 KB de PDF resulta em ~960 KB de Base64, respeitando o limite rígido de 1 MB do Firestore (Caminho 2)
const MAX_BOLETO_SIZE_BYTES = 720 * 1024;

export const BoletoModal: React.FC<BoletoModalProps> = ({
  fatura,
  isOpen,
  onClose,
  onBoletoUpdated,
}) => {
  const { userProfile } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!isOpen || !fatura) return null;

  const hasBoleto = !!(fatura.boletoBase64 || fatura.boletoStoragePath);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setSuccess(null);
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (selected.type !== 'application/pdf' && !selected.name.toLowerCase().endsWith('.pdf')) {
      setError('Apenas arquivos no formato PDF são permitidos para boletos bancários.');
      return;
    }

    if (selected.size > MAX_BOLETO_SIZE_BYTES) {
      const sizeKb = (selected.size / 1024).toFixed(0);
      setError(
        `O arquivo tem ${sizeKb} KB. No salvamento direto no banco (Caminho 2), o limite máximo é de 720 KB por documento (a conversão em texto Base64 consome o restante do limite de 1 MB do Firestore). Boletos bancários oficiais emitidos pelo banco têm em média de 40 KB a 250 KB.`
      );
      return;
    }

    setFile(selected);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const reader = new FileReader();

      reader.onload = async () => {
        try {
          const base64Data = reader.result as string;

          if (!base64Data) {
            throw new Error('Não foi possível ler os dados do arquivo.');
          }

          // Gravação direta no documento da fatura no Firestore (Caminho 2)
          const faturaRef = doc(db, 'faturas', fatura.id);
          const updates: Partial<Fatura> = {
            boletoBase64: base64Data,
            boletoFileName: file.name,
            boletoUploadedAt: new Date().toISOString(),
            boletoStoragePath: null,
            paymentPendingDeletion: false,
          };

          await updateDoc(faturaRef, updates);
          onBoletoUpdated(updates);

          await logAuditEvent({
            operationType: 'issue_invoice',
            collectionName: 'faturas',
            relatedDocument: fatura.id,
            user: userProfile?.name || 'Operador',
            userEmail: userProfile?.email || '',
            newData: {
              invoiceNumber: fatura.invoiceNumber,
              action: 'upload_boleto_caminho2',
              fileName: file.name,
              sizeBytes: file.size,
            },
          });

          setSuccess('Boleto bancário gravado com sucesso no banco de dados!');
          setFile(null);
        } catch (err: unknown) {
          console.error('Erro ao salvar boleto no Firestore:', err);
          setError(
            'Falha ao salvar boleto no banco: ' +
              (err instanceof Error ? err.message : String(err))
          );
        } finally {
          setUploading(false);
        }
      };

      reader.onerror = () => {
        setError('Falha ao processar o arquivo PDF selecionado.');
        setUploading(false);
      };

      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Erro ao ler arquivo:', err);
      setError('Falha inesperada ao preparar arquivo para gravação.');
      setUploading(false);
    }
  };

  const handleDownload = () => {
    if (fatura.boletoBase64) {
      try {
        const fileName = fatura.boletoFileName || `Boleto_Fatura_${fatura.invoiceNumber}.pdf`;
        downloadBoletoFile(fatura.boletoBase64, fileName);
      } catch (err) {
        setError('Não foi possível baixar o boleto bancário.');
      }
      return;
    }
  };

  const handleView = () => {
    if (fatura.boletoBase64) {
      try {
        openBoletoInNewTab(fatura.boletoBase64);
      } catch (err) {
        setError('Não foi possível abrir a visualização do boleto.');
      }
    }
  };

  const handleRemoveBoleto = async () => {
    if (!hasBoleto) return;
    if (!confirm('Deseja realmente excluir o boleto desta fatura do banco de dados?')) return;

    try {
      const faturaRef = doc(db, 'faturas', fatura.id);
      const updates = {
        boletoBase64: null,
        boletoFileName: null,
        boletoUploadedAt: null,
        boletoStoragePath: null,
        paymentPendingDeletion: false,
      };

      await updateDoc(faturaRef, updates);

      // Limpa do storage se houver resquício
      if (fatura.boletoStoragePath) {
        try {
          const storageRef = ref(storage, fatura.boletoStoragePath);
          await deleteObject(storageRef).catch(() => {});
        } catch {}
      }

      await logAuditEvent({
        operationType: 'delete_boleto',
        collectionName: 'faturas',
        relatedDocument: fatura.id,
        user: userProfile?.name || 'Operador',
        userEmail: userProfile?.email || '',
        newData: {
          invoiceNumber: fatura.invoiceNumber,
          action: 'manual_delete_boleto',
        },
      });

      onBoletoUpdated(updates);
      setSuccess('Boleto bancário apagado do Firebase com sucesso.');
    } catch (err) {
      setError('Erro ao remover o boleto do banco de dados.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-gray-100">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center font-bold">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Boleto Bancário (PDF)</h3>
              <p className="text-xs text-gray-500">Fatura #{fatura.invoiceNumber}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800 border border-emerald-200">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Existing Attached Boleto */}
        {hasBoleto ? (
          <div className="mt-5 rounded-2xl border-2 border-orange-200 bg-orange-50/60 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <FileText className="w-8 h-8 text-orange-600 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-gray-900">{fatura.boletoFileName || 'boleto.pdf'}</p>
                  <p className="text-[11px] text-gray-500">
                    Salvo no Firebase em{' '}
                    {fatura.boletoUploadedAt ? new Date(fatura.boletoUploadedAt).toLocaleString('pt-BR') : '-'}
                  </p>
                  <span className="inline-block mt-1 text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">
                    Armazenado no Firestore (Caminho 2)
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  onClick={handleView}
                  className="rounded-lg border border-orange-300 bg-white px-2.5 py-1.5 text-xs font-bold text-orange-800 hover:bg-orange-50 transition flex items-center gap-1 cursor-pointer"
                  title="Visualizar em nova aba"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Ver</span>
                </button>
                <button
                  onClick={handleDownload}
                  className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-700 transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  title="Baixar arquivo PDF"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar</span>
                </button>
                <button
                  onClick={handleRemoveBoleto}
                  className="rounded-lg border border-rose-200 bg-white p-1.5 text-xs text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                  title="Excluir boleto do banco de dados"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-5">
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-2xl p-6 hover:border-emerald-600 bg-gray-50 cursor-pointer transition">
              <Upload className="w-8 h-8 text-gray-400 mb-2" />
              <span className="text-xs font-bold text-gray-700">Clique para selecionar o Boleto em PDF</span>
              <span className="text-[11px] text-gray-500 mt-1">
                Formato PDF de até 720 KB (Caminho 2: gravação direta no banco)
              </span>
              <input type="file" accept="application/pdf" onChange={handleFileChange} className="hidden" />
            </label>

            {file && (
              <div className="mt-3 flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                <div className="flex items-center gap-2 text-xs font-medium text-emerald-900">
                  <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="truncate max-w-[200px]">
                    {file.name} ({(file.size / 1024).toFixed(0)} KB)
                  </span>
                </div>
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50 transition cursor-pointer shadow-xs"
                >
                  {uploading ? 'Gravando no Banco...' : 'Salvar no Banco'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Security Rule Alert Reminder */}
        <div className="mt-5 rounded-xl bg-amber-50 p-3 border border-amber-200 text-[11px] text-amber-900 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <span>
            <strong>Regra de Negócio:</strong> Ao confirmar o pagamento desta fatura (mudança de status para <strong>PAGO</strong>), o arquivo do boleto bancário é <strong>automaticamente e permanentemente apagado do Firebase</strong>.
          </span>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
