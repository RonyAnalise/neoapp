import React, { useEffect, useState, useRef } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  addDoc,
  getDoc,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { db, storage } from './lib/firebase';
import { handleFirestoreError, OperationType } from './lib/firestoreErrors';
import { logAuditEvent } from './lib/auditService';
import { AuthProvider, useAuth } from './hooks/useAuth';
import {
  Cliente,
  Fatura,
  Leitura,
  Pagamento,
  EmpresaConfig,
  EnergyTariffs,
  UserProfile,
  AuditoriaLog,
  UserRole,
  TaxaCoelba,
} from './types';

// Components & Views
import { Sidebar, ActiveTab } from './components/Sidebar';
import { Header } from './components/Header';
import { OfflineIndicator } from './components/OfflineIndicator';
import { InvoiceModal } from './components/InvoiceModal';
import { BoletoModal } from './components/BoletoModal';
import { LoginView } from './views/LoginView';
import { DashboardView } from './views/DashboardView';
import { ClientesView } from './views/ClientesView';
import { ConsumoView } from './views/ConsumoView';
import { FaturasView } from './views/FaturasView';
import { PagamentosView } from './views/PagamentosView';
import { TaxasCoelbaView } from './views/TaxasCoelbaView';
import { HistoricoConsumoView } from './views/HistoricoConsumoView';
import { RelatoriosView } from './views/RelatoriosView';
import { OrcamentoView } from './views/OrcamentoView';
import { EmpresaView } from './views/EmpresaView';
import { ConfiguracoesEnergiaView } from './views/ConfiguracoesEnergiaView';
import { UsuariosView } from './views/UsuariosView';
import { AuditoriaView } from './views/AuditoriaView';
import { ConfiguracoesSistemaView } from './views/ConfiguracoesSistemaView';
import { SEED_RECORDS } from './data/seedInvoicesData';

const DEFAULT_EMPRESA: EmpresaConfig = {
  name: 'Neo Energia',
  companyName: 'NEO ENERGIA CARNAÚBANOS (GRUPO DE INVESTIMENTOS CARNAÚBANOS)',
  cnpj: '52.184.920/0001-44',
  groupName: 'GRUPO DE INVESTIMENTOS CARNAÚBANOS',
  address: 'Rodovia BA-415, KM 12',
  cep: '45745-000',
  city: 'Ibicaraí',
  state: 'BA',
  phone: '77-992107440',
  whatsapp: '77-992107440',
  email: 'contato@neoenergia.com.br',
  warningPaymentText: 'TEM 15 DIAS PARA EFETUAR O PAGAMENTO.',
  paymentDueDays: 15,
  sustainabilityMessage: 'PARABÉNS! O PLANETA AGRADECE A SUA ESCOLHA!',
  transparencyDiscountText:
    'ESTE MÊS FOI 41364 KWH – 40265 KWH DO MÊS PASSADO = 1099 KWH X 1,00 = 1.099,00 REAIS PARA PAGAR. SE FOSSE NA COELBA, SEGUNDO A ÚLTIMA FATURA PAGOU 1,21 NO KWH, ENTÃO O SENHOR PAGARIA 1099 KWH X 1,21 = 1.329,79 REAIS. ENTÃO TEVE UMA ECONOMIA DE 230,79 REAIS ESTE MÊS.',
  paymentInstructions: 'PAGAMENTO VIA BOLETO BANCÁRIO.',
  additionalInfo: 'Pagamento via boleto bancário emitido pela cooperativa.',
};

const DEFAULT_TARIFFS: EnergyTariffs = {
  neoTariff: 1.0,
  coelbaReferenceTariff: 1.21,
  validFrom: '2024-01-01',
  notes: 'Tarifa inicial padrão',
};

function MainApp() {
  const { currentUser, userProfile, loading: authLoading, isAdmin } = useAuth();

  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Firestore collections states
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [faturas, setFaturas] = useState<Fatura[]>([]);
  const [leituras, setLeituras] = useState<Leitura[]>([]);
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [taxasCoelba, setTaxasCoelba] = useState<TaxaCoelba[]>([]);
  const [empresa, setEmpresa] = useState<EmpresaConfig>(DEFAULT_EMPRESA);
  const [tariffs, setTariffs] = useState<EnergyTariffs>(DEFAULT_TARIFFS);
  const [tariffHistory, setTariffHistory] = useState<EnergyTariffs[]>([]);
  const [usuarios, setUsuarios] = useState<UserProfile[]>([]);
  const [auditoriaLogs, setAuditoriaLogs] = useState<AuditoriaLog[]>([]);

  // Modals state
  const [viewingFatura, setViewingFatura] = useState<Fatura | null>(null);
  const [selectedBoletoFatura, setSelectedBoletoFatura] = useState<Fatura | null>(null);
  const [prefillClientId, setPrefillClientId] = useState<string | undefined>(undefined);

  // Synchronization of 38 invoices state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState<string>('');
  const autoSyncAttemptedRef = useRef(false);

  const syncAllSeedInvoices = async (force = false) => {
    if (isSyncing && !force) return;
    try {
      setIsSyncing(true);
      setSyncStatus('syncing');
      setSyncMessage('Cadastrando 38 clientes, consumos e faturas das imagens no Firestore...');

      const batch = writeBatch(db);
      for (const rec of SEED_RECORDS) {
        // 1. Cliente
        batch.set(doc(db, 'clientes', rec.cliente.id), rec.cliente, { merge: true });

        // 2. Leitura
        batch.set(doc(db, 'leituras', rec.leitura.id), rec.leitura, { merge: true });

        // 3. Fatura
        batch.set(
          doc(db, 'faturas', rec.fatura.id),
          {
            ...rec.fatura,
            historicalCompanyData: empresa?.companyName ? empresa : DEFAULT_EMPRESA,
          },
          { merge: true }
        );
      }

      await batch.commit();
      setSyncStatus('success');
      setSyncMessage('✅ Sucesso! Todas as 38 faturas, medidores e clientes foram gravados no banco de dados!');
      setTimeout(() => {
        setSyncStatus('idle');
      }, 7000);
    } catch (err: unknown) {
      const errObj = err as { message?: string };
      console.error('Erro ao cadastrar faturas no Firestore:', err);
      setSyncStatus('error');
      setSyncMessage(`Erro ao gravar no banco: ${errObj?.message || 'Verifique permissões'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Firestore real-time subscribers
  useEffect(() => {
    if (!currentUser) return;

    // 1. Clientes Listener
    const unsubClientes = onSnapshot(
      collection(db, 'clientes'),
      (snap) => {
        const list: Cliente[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<Cliente, 'id'>) }));
        setClientes(list);

        // Se o banco ainda não possui os 38 clientes cadastrados, inicia a sincronização automática
        if (list.length < 35 && !autoSyncAttemptedRef.current) {
          autoSyncAttemptedRef.current = true;
          syncAllSeedInvoices();
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'clientes')
    );

    // 2. Faturas Listener
    const unsubFaturas = onSnapshot(
      collection(db, 'faturas'),
      (snap) => {
        const list: Fatura[] = [];
        snap.forEach((d) => {
          const fat = { id: d.id, ...(d.data() as Omit<Fatura, 'id'>) };
          list.push(fat);

          // Regra de integridade: ao mudar o status para 'paid', o boleto é garantidamente apagado do Firebase
          if (fat.status === 'paid' && (fat.boletoBase64 || fat.boletoStoragePath)) {
            updateDoc(doc(db, 'faturas', d.id), {
              boletoBase64: null,
              boletoStoragePath: null,
              boletoFileName: null,
              boletoUploadedAt: null,
              paymentPendingDeletion: false,
            }).catch(() => {});
          }
        });
        setFaturas(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'faturas')
    );

    // 3. Leituras Listener
    const unsubLeituras = onSnapshot(
      collection(db, 'leituras'),
      (snap) => {
        const list: Leitura[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<Leitura, 'id'>) }));
        setLeituras(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'leituras')
    );

    // 4. Pagamentos Listener
    const unsubPagamentos = onSnapshot(
      collection(db, 'pagamentos'),
      (snap) => {
        const list: Pagamento[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<Pagamento, 'id'>) }));
        setPagamentos(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'pagamentos')
    );

    // 5. Empresa Listener
    const unsubEmpresa = onSnapshot(
      doc(db, 'empresa', 'info'),
      (snap) => {
        if (snap.exists()) {
          const rawEmpresa = snap.data() as EmpresaConfig;
          if (rawEmpresa.companyName && rawEmpresa.companyName.includes('INVETIMENTOS')) {
            const corrected: EmpresaConfig = {
              ...rawEmpresa,
              companyName: rawEmpresa.companyName.replace(/INVETIMENTOS/gi, 'INVESTIMENTOS'),
            };
            setEmpresa(corrected);
            setDoc(doc(db, 'empresa', 'info'), corrected, { merge: true }).catch(() => {});
          } else {
            setEmpresa(rawEmpresa);
          }
        } else {
          setDoc(doc(db, 'empresa', 'info'), DEFAULT_EMPRESA);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'empresa/info')
    );

    // 6. Configurações Tarifas Listener
    const unsubConfig = onSnapshot(
      doc(db, 'configuracoes', 'tarifas'),
      (snap) => {
        if (snap.exists()) {
          setTariffs(snap.data() as EnergyTariffs);
        } else {
          setDoc(doc(db, 'configuracoes', 'tarifas'), DEFAULT_TARIFFS);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'configuracoes/tarifas')
    );

    // 7. Histórico Tarifas Listener
    const unsubTariffHist = onSnapshot(
      collection(db, 'historico_tarifas'),
      (snap) => {
        const list: EnergyTariffs[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as EnergyTariffs) }));
        setTariffHistory(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'historico_tarifas')
    );

    // 8. Users Listener
    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const list: UserProfile[] = [];
        snap.forEach((d) => list.push({ ...(d.data() as UserProfile) }));
        setUsuarios(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'users')
    );

    // 9. Auditoria Listener
    const unsubAuditoria = onSnapshot(
      collection(db, 'auditoria'),
      (snap) => {
        const list: AuditoriaLog[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<AuditoriaLog, 'id'>) }));
        setAuditoriaLogs(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'auditoria')
    );

    // 10. Taxas Coelba Listener
    const unsubTaxas = onSnapshot(
      collection(db, 'taxas_coelba'),
      (snap) => {
        const list: TaxaCoelba[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<TaxaCoelba, 'id'>) }));
        setTaxasCoelba(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'taxas_coelba')
    );

    return () => {
      unsubClientes();
      unsubFaturas();
      unsubLeituras();
      unsubPagamentos();
      unsubTaxas();
      unsubEmpresa();
      unsubConfig();
      unsubTariffHist();
      unsubUsers();
      unsubAuditoria();
    };
  }, [currentUser]);

  // Garante que o banco seja sincronizado com os 38 clientes caso ainda não esteja completo
  useEffect(() => {
    if (!currentUser || autoSyncAttemptedRef.current) return;
    if (clientes.length > 0 && clientes.length < 35) {
      autoSyncAttemptedRef.current = true;
      syncAllSeedInvoices();
    }
  }, [currentUser, clientes.length]);

  // Handlers for Firestore actions
  const handleSaveCliente = async (clienteData: Partial<Cliente>, isNew: boolean) => {
    if (isNew) {
      const newRef = doc(collection(db, 'clientes'));
      await setDoc(newRef, {
        ...clienteData,
        createdAt: new Date().toISOString(),
      });
    } else if (clienteData.id) {
      await updateDoc(doc(db, 'clientes', clienteData.id), {
        ...clienteData,
        updatedAt: new Date().toISOString(),
      });
    }
  };

  const handleToggleClienteStatus = async (clienteId: string, currentStatus: 'active' | 'inactive') => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    await updateDoc(doc(db, 'clientes', clienteId), {
      status: newStatus,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleRegisterReading = async (readingData: Omit<Leitura, 'id' | 'createdAt'>) => {
    const newRef = doc(collection(db, 'leituras'));
    await setDoc(newRef, {
      ...readingData,
      createdAt: new Date().toISOString(),
    });
  };

  const handleDeleteReading = async (readingId: string) => {
    await deleteDoc(doc(db, 'leituras', readingId));
  };

  const handleIssueInvoice = async (invoiceData: Omit<Fatura, 'id' | 'createdAt'>) => {
    const newRef = doc(collection(db, 'faturas'));
    await setDoc(newRef, {
      ...invoiceData,
      createdAt: new Date().toISOString(),
    });
  };

  const handleDeleteInvoice = async (faturaId: string) => {
    const fat = faturas.find((f) => f.id === faturaId);
    if (fat?.boletoStoragePath) {
      try {
        const fileRef = ref(storage, fat.boletoStoragePath);
        await deleteObject(fileRef).catch(() => {});
      } catch (e) {
        console.warn('Erro ao excluir arquivo de storage:', e);
      }
    }

    // Regra: se apagar uma fatura paga (ou com pagamento), apagar também o pagamento confirmado
    const linkedPayments = pagamentos.filter((p) => p.invoiceId === faturaId);
    for (const payment of linkedPayments) {
      try {
        await deleteDoc(doc(db, 'pagamentos', payment.id));
        await logAuditEvent({
          operationType: 'delete_payment',
          collectionName: 'pagamentos',
          relatedDocument: payment.id,
          user: userProfile?.name || 'Operador',
          userEmail: userProfile?.email || '',
          justification: `Pagamento excluído automaticamente devido à exclusão da fatura #${fat?.invoiceNumber || faturaId}`,
        });
      } catch (e) {
        console.warn('Erro ao excluir pagamento vinculado à fatura:', e);
      }
    }

    await deleteDoc(doc(db, 'faturas', faturaId));
    await logAuditEvent({
      operationType: 'delete_invoice',
      collectionName: 'faturas',
      relatedDocument: fat?.invoiceNumber || faturaId,
      user: userProfile?.name || 'Operador',
      userEmail: userProfile?.email || '',
      justification: `Fatura #${fat?.invoiceNumber || faturaId} excluída do banco de dados`,
    });
  };

  // Limpeza de testes: faturas de outubro foram testes e não devem existir no sistema
  const cleanedInvoicesRef = useRef(false);
  useEffect(() => {
    if (!currentUser || cleanedInvoicesRef.current || faturas.length === 0) return;

    const cleanupInvoices = async () => {
      try {
        // Faturas a serem excluídas: apenas as de outubro (mês 10), pois foram apenas testes
        const invoicesToDelete = faturas.filter((f) => f.referenceMonth === 10);

        if (invoicesToDelete.length > 0) {
          cleanedInvoicesRef.current = true;
          for (const fat of invoicesToDelete) {
            if (fat.boletoStoragePath) {
              const fileRef = ref(storage, fat.boletoStoragePath);
              await deleteObject(fileRef).catch(() => {});
            }
            await deleteDoc(doc(db, 'faturas', fat.id)).catch(() => {});
          }
        } else {
          cleanedInvoicesRef.current = true;
        }

        // Também limpa leituras de teste de outubro (mês 10) para o medidor permanecer na leitura de setembro
        const testReadings = leituras.filter((l) => l.referenceMonth === 10);
        for (const l of testReadings) {
          await deleteDoc(doc(db, 'leituras', l.id)).catch(() => {});
        }
      } catch (err) {
        console.warn('Erro ao limpar faturas de teste:', err);
      }
    };

    cleanupInvoices();
  }, [currentUser, faturas, leituras]);

  // Confirm payment with mandatory automatic deletion of boleto PDF from Firebase Storage
  const handleConfirmPayment = async (faturaId: string, amount: number) => {
    const fat = faturas.find((f) => f.id === faturaId);
    if (!fat) return;

    // 1. Delete PDF from Storage if attached
    if (fat.boletoStoragePath) {
      try {
        const fileRef = ref(storage, fat.boletoStoragePath);
        await deleteObject(fileRef).catch((e) =>
          console.warn('File already deleted or missing from storage:', e)
        );
      } catch (e) {
        console.error('Falha na exclusão do boleto:', e);
        // Mark pending technical retry if deletion failed
        await updateDoc(doc(db, 'faturas', faturaId), {
          paymentPendingDeletion: true,
          paymentDeletionError: String(e),
        });
      }
    }

    // 2. Mark invoice as paid and completely wipe boleto from database
    await updateDoc(doc(db, 'faturas', faturaId), {
      status: 'paid',
      paidAt: new Date().toISOString(),
      paidBy: userProfile?.name || 'Operador',
      boletoBase64: null,
      boletoStoragePath: null,
      boletoFileName: null,
      boletoUploadedAt: null,
      paymentPendingDeletion: false,
    });

    // 3. Register payment record in pagamentos collection
    const payRef = doc(collection(db, 'pagamentos'));
    await setDoc(payRef, {
      invoiceId: faturaId,
      clientId: fat.clientId,
      amountPaid: amount,
      paymentDate: new Date().toISOString(),
      confirmationMethod: 'manual',
      confirmedBy: userProfile?.name || 'Operador',
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    });
  };

  const handleCancelInvoice = async (faturaId: string, reason: string) => {
    await updateDoc(doc(db, 'faturas', faturaId), {
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
      cancellationReason: reason,
    });
  };

  const handleSaveEmpresa = async (empresaData: EmpresaConfig) => {
    await setDoc(doc(db, 'empresa', 'info'), {
      ...empresaData,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleSaveTariffs = async (newTariffs: EnergyTariffs) => {
    await setDoc(doc(db, 'configuracoes', 'tarifas'), newTariffs);
    // Add to historic collection
    const histRef = doc(collection(db, 'historico_tarifas'));
    await setDoc(histRef, {
      ...newTariffs,
      createdAt: new Date().toISOString(),
    });
  };

  const handleUpdateUserRole = async (uid: string, newRole: UserRole, active: boolean) => {
    await updateDoc(doc(db, 'users', uid), {
      role: newRole,
      active,
    });
    // Sync admins index
    if (newRole === 'admin') {
      await setDoc(doc(db, 'admins', uid), { active: true }, { merge: true });
    } else {
      await updateDoc(doc(db, 'admins', uid), { active: false }).catch(() => {});
    }
  };

  const handleSaveTaxa = async (taxaData: Omit<TaxaCoelba, 'id' | 'createdAt' | 'status' | 'createdBy'>) => {
    try {
      const id = 'taxa_' + Date.now();
      const now = new Date().toISOString();
      const newTaxa: TaxaCoelba = {
        ...taxaData,
        id,
        status: 'quitada',
        createdAt: now,
        createdBy: currentUser?.email || 'operador',
      };
      await setDoc(doc(db, 'taxas_coelba', id), newTaxa);
      await logAuditEvent({
        operationType: 'register_taxa_coelba',
        collectionName: 'taxas_coelba',
        relatedDocument: id,
        user: currentUser?.displayName || currentUser?.email || 'operador',
        userEmail: currentUser?.email || '',
        newData: { clientName: taxaData.clientName, data: taxaData.data, valor: taxaData.valor },
        justification: `Cadastro de taxa quitada Coelba para o cliente ${taxaData.clientName}`,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'taxas_coelba');
    }
  };

  const handleDeleteTaxa = async (id: string) => {
    try {
      const prev = taxasCoelba.find((t) => t.id === id);
      await deleteDoc(doc(db, 'taxas_coelba', id));
      await logAuditEvent({
        operationType: 'delete_taxa_coelba',
        collectionName: 'taxas_coelba',
        relatedDocument: id,
        user: currentUser?.displayName || currentUser?.email || 'operador',
        userEmail: currentUser?.email || '',
        previousData: prev || { id },
        justification: `Exclusão do registro de taxa quitada ID ${id}`,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `taxas_coelba/${id}`);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0f3d20] flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3 text-white">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-green-400 flex items-center justify-center animate-pulse">
            <span className="font-black text-xl">N</span>
          </div>
          <span className="text-sm font-bold tracking-wider text-emerald-200">
            Carregando NeoApp...
          </span>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginView />;
  }

  const getPageTitle = (tab: ActiveTab) => {
    const titles: Record<ActiveTab, { title: string; subtitle: string }> = {
      dashboard: {
        title: 'Painel Geral de Energia',
        subtitle: 'Visão executiva de clientes, consumo em kWh e economia gerada',
      },
      clientes: {
        title: 'Cadastro & Gestão de Clientes',
        subtitle: 'Consulta com ViaCEP, dados da Coelba e histórico acumulado',
      },
      consumo: {
        title: 'Leituras do Medidor & Consumo',
        subtitle: 'Leitura inicial única com recuperação automática nos meses seguintes',
      },
      faturas: {
        title: 'Faturas & Emissão de Boletos',
        subtitle: 'Geração com fidelidade visual, anexo de PDF e baixa com expurgo seguro',
      },
      pagamentos: {
        title: 'Acompanhamento de Pagamentos',
        subtitle: 'Baixas de boletos e conciliação financeira',
      },
      taxas_coelba: {
        title: 'Taxas Quitadas',
        subtitle: 'Listagem e comprovantes de taxas quitadas da concessionária Coelba',
      },
      historico: {
        title: 'Histórico de Consumo & Economia',
        subtitle: 'Evolução mensal detalhada e comparativo com a Coelba',
      },
      relatorios: {
        title: 'Relatórios & Exportações',
        subtitle: 'Filtros avançados e download de planilhas CSV para auditoria',
      },
      orcamento: {
        title: 'Orçamento & Simulação Comercial',
        subtitle: 'Simulador em tempo real com comparativo Coelba vs Neo, envio via WhatsApp e print da fatura',
      },
      empresa: {
        title: 'Dados da Empresa Neo Energia',
        subtitle: 'Informações institucionais e parâmetros fixos da fatura',
      },
      tarifas: {
        title: 'Configurações Tarifárias de Energia',
        subtitle: 'Tarifa do kWh Neo Energia e referência da concessionária Coelba',
      },
      usuarios: {
        title: 'Usuários & Permissões (RBAC)',
        subtitle: 'Gerenciamento de acessos de Administradores e Operadores',
      },
      auditoria: {
        title: 'Trilha de Auditoria do Sistema',
        subtitle: 'Registro imutável de todas as ações financeiras e cadastrais',
      },
      sistema: {
        title: 'Configurações do Sistema & Testes',
        subtitle: 'Validador das 10 regras de negócio, PWA e publicação',
      },
    };
    return titles[tab] || { title: 'NeoApp', subtitle: '' };
  };

  const headerInfo = getPageTitle(activeTab);

  // Selected fatura's corresponding client for modal
  const viewingCliente = viewingFatura
    ? clientes.find((c) => c.id === viewingFatura.clientId) || viewingFatura.historicalClientData || null
    : null;

  return (
    <div className="flex min-h-screen lg:h-screen lg:overflow-hidden bg-gray-100/90 font-sans antialiased text-gray-900">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        mobileOpen={mobileMenuOpen}
        setMobileOpen={setMobileMenuOpen}
      />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col min-w-0 lg:h-screen lg:overflow-y-auto">
        <Header
          title={headerInfo.title}
          subtitle={headerInfo.subtitle}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />

        <main className="flex-1 p-4 sm:p-8">
          {/* Banner de Sincronização e Feedback de Faturas das Imagens */}
          {(clientes.length < 38 || syncStatus !== 'idle') && (
            <div
              className={`mb-6 p-4 rounded-2xl shadow-md border flex flex-col md:flex-row items-center justify-between gap-4 transition-all ${
                syncStatus === 'error'
                  ? 'bg-rose-900 border-rose-700 text-white'
                  : syncStatus === 'success'
                  ? 'bg-emerald-800 border-emerald-600 text-white'
                  : 'bg-gradient-to-r from-emerald-800 via-green-800 to-teal-900 border-emerald-600 text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl shrink-0 font-bold">
                  {syncStatus === 'syncing' ? '⏳' : syncStatus === 'success' ? '✅' : syncStatus === 'error' ? '⚠️' : '⚡'}
                </div>
                <div>
                  <h4 className="font-bold text-sm md:text-base flex items-center gap-2">
                    {syncStatus === 'syncing'
                      ? 'Gravando faturas e clientes no banco de dados...'
                      : syncStatus === 'success'
                      ? 'Sincronização Concluída!'
                      : syncStatus === 'error'
                      ? 'Atenção na Sincronização'
                      : '38 Faturas e Medidores Prontos para Cadastro'}
                    <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-white/20">
                      {clientes.length} de 38 cadastrados
                    </span>
                  </h4>
                  <p className="text-xs text-emerald-100/90 mt-0.5">
                    {syncMessage ||
                      `Todos os 38 medidores e faturas de Setembro/2026 foram identificados das imagens. Clique no botão ao lado para cadastrar todos no Firestore.`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => syncAllSeedInvoices(true)}
                disabled={isSyncing}
                className="shrink-0 bg-white text-emerald-950 hover:bg-emerald-50 px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider shadow transition cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                {isSyncing ? (
                  <>
                    <span className="w-4 h-4 border-2 border-emerald-900 border-t-transparent rounded-full animate-spin" />
                    Gravando no Banco...
                  </>
                ) : (
                  '⚡ Gravar Todas as 38 no Banco Agora'
                )}
              </button>
            </div>
          )}

          {activeTab === 'dashboard' && (
            <DashboardView
              clientes={clientes}
              faturas={faturas}
              onNavigate={setActiveTab}
              onOpenInvoiceModal={(fat) => setViewingFatura(fat)}
            />
          )}

          {activeTab === 'clientes' && (
            <ClientesView
              clientes={clientes}
              faturas={faturas}
              leituras={leituras}
              tariffs={tariffs}
              onSaveCliente={handleSaveCliente}
              onToggleStatus={handleToggleClienteStatus}
              onOpenInvoiceModal={(fat) => setViewingFatura(fat)}
              onSyncAllSeedInvoices={() => syncAllSeedInvoices(true)}
              isSyncing={isSyncing}
            />
          )}

          {activeTab === 'consumo' && (
            <ConsumoView
              clientes={clientes}
              leituras={leituras}
              faturas={faturas}
              tariffs={tariffs}
              onRegisterReading={handleRegisterReading}
              onDeleteReading={handleDeleteReading}
              onNavigateToInvoice={(cId) => {
                setPrefillClientId(cId);
                setActiveTab('faturas');
              }}
            />
          )}

          {activeTab === 'faturas' && (
            <FaturasView
              faturas={faturas}
              clientes={clientes}
              leituras={leituras}
              empresa={empresa}
              tariffs={tariffs}
              prefillClientId={prefillClientId}
              onIssueInvoice={handleIssueInvoice}
              onConfirmPayment={handleConfirmPayment}
              onCancelInvoice={handleCancelInvoice}
              onDeleteInvoice={handleDeleteInvoice}
              onOpenInvoiceModal={(fat) => setViewingFatura(fat)}
              onSyncAllSeedInvoices={() => syncAllSeedInvoices(true)}
              isSyncing={isSyncing}
            />
          )}

          {activeTab === 'pagamentos' && (
            <PagamentosView
              pagamentos={pagamentos}
              faturas={faturas}
              clientes={clientes}
              onConfirmPayment={handleConfirmPayment}
              onOpenInvoiceModal={(fat) => setViewingFatura(fat)}
            />
          )}

          {activeTab === 'taxas_coelba' && (
            <TaxasCoelbaView
              taxas={taxasCoelba}
              clientes={clientes}
              onSaveTaxa={handleSaveTaxa}
              onDeleteTaxa={handleDeleteTaxa}
            />
          )}

          {activeTab === 'historico' && (
            <HistoricoConsumoView
              clientes={clientes}
              faturas={faturas}
              leituras={leituras}
              onOpenInvoiceModal={(fat) => setViewingFatura(fat)}
            />
          )}

          {activeTab === 'relatorios' && (
            <RelatoriosView
              clientes={clientes}
              faturas={faturas}
              leituras={leituras}
              pagamentos={pagamentos}
              empresa={empresa}
            />
          )}

          {activeTab === 'orcamento' && (
            <OrcamentoView
              empresa={empresa}
              tariffs={tariffs}
              clientes={clientes}
            />
          )}

          {activeTab === 'empresa' && (
            <EmpresaView empresa={empresa} onSaveEmpresa={handleSaveEmpresa} />
          )}

          {activeTab === 'tarifas' && (
            <ConfiguracoesEnergiaView
              tariffs={tariffs}
              tariffHistory={tariffHistory}
              onSaveTariffs={handleSaveTariffs}
            />
          )}

          {activeTab === 'usuarios' && (
            <UsuariosView usuarios={usuarios} onUpdateUserRole={handleUpdateUserRole} />
          )}

          {activeTab === 'auditoria' && <AuditoriaView logs={auditoriaLogs} />}

          {activeTab === 'sistema' && <ConfiguracoesSistemaView />}
        </main>
      </div>

      {/* Floating Offline Warning */}
      <OfflineIndicator />

      {/* High Fidelity Visual Invoice Viewer / PDF Modal */}
      {viewingFatura && (
        <InvoiceModal
          fatura={viewingFatura}
          cliente={viewingCliente as any}
          empresa={viewingFatura.historicalCompanyData || empresa}
          allClientInvoices={faturas}
          onClose={() => setViewingFatura(null)}
          onOpenBoleto={(fat) => setSelectedBoletoFatura(fat)}
        />
      )}

      {/* Boleto Manager Modal */}
      {selectedBoletoFatura && (
        <BoletoModal
          fatura={selectedBoletoFatura}
          isOpen={!!selectedBoletoFatura}
          onClose={() => setSelectedBoletoFatura(null)}
          onBoletoUpdated={(updatedFields) => {
            setSelectedBoletoFatura((prev) => (prev ? { ...prev, ...updatedFields } : null));
          }}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
