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
  deleteField,
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
  NotificacaoCliente,
  InvoiceStatus,
} from './types';
import {
  notifyInvoiceIssued,
  enableAndSubscribeToPush,
  registerPushServiceWorker,
  getNotificationPermission,
  NotificationPermissionStatus,
} from './lib/notificationService';
import { formatCurrency, formatReferencePeriod } from './lib/calculations';

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
import { PortalClienteView } from './views/PortalClienteView';
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
  const { currentUser, userProfile, loading: authLoading, isAdmin, isClient } = useAuth();

  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [portalOverrideClientId, setPortalOverrideClientId] = useState<string | undefined>(undefined);

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

  // Push Notification State
  const [pushStatus, setPushStatus] = useState<NotificationPermissionStatus>(() =>
    getNotificationPermission()
  );
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [subscribingPush, setSubscribingPush] = useState(false);
  const [pushBannerDismissed, setPushBannerDismissed] = useState(() => {
    try {
      return localStorage.getItem('neo_push_banner_dismissed') === 'true';
    } catch {
      return false;
    }
  });

  const handleGlobalSubscribePush = async () => {
    setSubscribingPush(true);
    try {
      const isAdm = isAdmin || currentUser?.email === 'ronycvcsales@gmail.com';
      const cEmail = currentUser?.email || userProfile?.email || '';
      const matchedFromEmail = clientes.find((c) => {
        const normC = (c.email || '').trim().toLowerCase().replace(/y/g, 'i');
        const normU = cEmail.trim().toLowerCase().replace(/y/g, 'i');
        return normC && normU && normC === normU;
      });
      const cId = userProfile?.clientId || matchedFromEmail?.id || 'device';
      const allLinkedIds = [cId];
      if (matchedFromEmail && !allLinkedIds.includes(matchedFromEmail.id)) {
        allLinkedIds.push(matchedFromEmail.id);
      }
      const res = await enableAndSubscribeToPush(cId, cEmail, allLinkedIds, isAdm);
      if (res.success) {
        setPushSubscribed(true);
        setPushStatus('granted');
      }
    } catch (e) {
      console.warn('Erro ao ativar push:', e);
    } finally {
      setSubscribingPush(false);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    registerPushServiceWorker().catch(() => {});

    if ('Notification' in window && Notification.permission === 'granted') {
      const isAdm = isAdmin || currentUser?.email === 'ronycvcsales@gmail.com';
      const cEmail = currentUser?.email || userProfile?.email || '';
      const matchedFromEmail = clientes.find((c) => {
        const normC = (c.email || '').trim().toLowerCase().replace(/y/g, 'i');
        const normU = cEmail.trim().toLowerCase().replace(/y/g, 'i');
        return normC && normU && normC === normU;
      });
      const cId = userProfile?.clientId || matchedFromEmail?.id || 'device';
      const allLinkedIds = [cId];
      if (matchedFromEmail && !allLinkedIds.includes(matchedFromEmail.id)) {
        allLinkedIds.push(matchedFromEmail.id);
      }
      enableAndSubscribeToPush(cId, cEmail, allLinkedIds, isAdm)
        .then((res) => {
          if (res.success) setPushSubscribed(true);
        })
        .catch(() => {});
    }
  }, [currentUser, userProfile, isAdmin, clientes]);

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

        // 3. Fatura: preserva status de pagamento existente se a fatura já foi paga
        const existingFat = faturas.find((f) => f.id === rec.fatura.id);
        const hasConfirmedPayment = pagamentos.some(
          (p) => (p.invoiceId === rec.fatura.id || p.invoiceId === rec.fatura.invoiceNumber) && p.status === 'confirmed'
        );

        if (existingFat) {
          const isPaid = existingFat.status === 'paid' || hasConfirmedPayment;
          batch.set(
            doc(db, 'faturas', rec.fatura.id),
            {
              ...rec.fatura,
              status: isPaid ? 'paid' : existingFat.status,
              paidAt: existingFat.paidAt || (isPaid ? new Date().toISOString() : undefined),
              paidBy: existingFat.paidBy || (isPaid ? 'Operador' : undefined),
              boletoBase64: isPaid ? null : (existingFat.boletoBase64 !== undefined ? existingFat.boletoBase64 : rec.fatura.boletoBase64),
              boletoFileName: isPaid ? null : (existingFat.boletoFileName !== undefined ? existingFat.boletoFileName : rec.fatura.boletoFileName),
              historicalCompanyData: empresa?.companyName ? empresa : DEFAULT_EMPRESA,
            },
            { merge: true }
          );
        } else {
          batch.set(
            doc(db, 'faturas', rec.fatura.id),
            {
              ...rec.fatura,
              status: hasConfirmedPayment ? 'paid' : rec.fatura.status,
              paidAt: hasConfirmedPayment ? new Date().toISOString() : undefined,
              paidBy: hasConfirmedPayment ? 'Operador' : undefined,
              historicalCompanyData: empresa?.companyName ? empresa : DEFAULT_EMPRESA,
            },
            { merge: true }
          );
        }
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
        const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
        const list: Fatura[] = [];
        snap.forEach((d) => {
          const rawFat = { id: d.id, ...(d.data() as Omit<Fatura, 'id'>) };
          const fat = { ...rawFat };

          // Regra solicitada: quando a data atual for maior que a data de vencimento da fatura,
          // alterar o status para 'overdue' (vencida) automaticamente
          if (fat.status === 'pending' && fat.dueDate && todayStr > fat.dueDate) {
            fat.status = 'overdue';
            updateDoc(doc(db, 'faturas', d.id), {
              status: 'overdue',
              updatedAt: new Date().toISOString(),
            }).catch(() => {});
          }

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

          list.push(fat);
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

  // Reconciliação bi-direcional de integridade entre 'faturas', 'pagamentos' e 'auditoria':
  // Garante que faturas com pagamento confirmado NUNCA apareçam como pendentes e vice-versa.
  useEffect(() => {
    if (!currentUser || faturas.length === 0) return;

    // 1. Mapeia faturas com pagamento confirmado em 'pagamentos' ou no log de auditoria
    const confirmedPaymentInvoiceIds = new Map<string, { date: string; user: string; amount?: number }>();

    pagamentos.forEach((p) => {
      if (p.status === 'confirmed' && p.invoiceId) {
        confirmedPaymentInvoiceIds.set(p.invoiceId, {
          date: p.paymentDate || p.createdAt || new Date().toISOString(),
          user: p.confirmedBy || 'Operador',
          amount: p.amountPaid,
        });
      }
    });

    auditoriaLogs.forEach((log) => {
      if (log.operationType === 'confirm_payment' && log.relatedDocument) {
        if (!confirmedPaymentInvoiceIds.has(log.relatedDocument)) {
          confirmedPaymentInvoiceIds.set(log.relatedDocument, {
            date: log.timestamp || new Date().toISOString(),
            user: log.user || 'Operador',
            amount: (log.newData as any)?.amountPaid,
          });
        }
      }
    });

    // 2. Se a fatura tem pagamento confirmado mas está como 'pending' ou 'overdue' no banco, restaura para 'paid'
    faturas.forEach(async (fat) => {
      const payInfo =
        confirmedPaymentInvoiceIds.get(fat.id) ||
        confirmedPaymentInvoiceIds.get(fat.invoiceNumber);

      if (payInfo && fat.status !== 'paid') {
        try {
          await updateDoc(doc(db, 'faturas', fat.id), {
            status: 'paid',
            paidAt: fat.paidAt || payInfo.date,
            paidBy: fat.paidBy || payInfo.user,
            boletoBase64: null,
            boletoStoragePath: null,
            paymentPendingDeletion: false,
          });
        } catch (err) {
          console.warn('Erro ao restaurar status de fatura paga:', err);
        }
      }

      // 3. Se a fatura está marcada como 'paid' mas ainda NÃO possui doc correspondente em 'pagamentos', cria o registro
      if (fat.status === 'paid') {
        const hasPagamentoDoc = pagamentos.some(
          (p) => (p.invoiceId === fat.id || p.invoiceId === fat.invoiceNumber) && p.status === 'confirmed'
        );
        if (!hasPagamentoDoc) {
          try {
            const payRef = doc(collection(db, 'pagamentos'));
            await setDoc(payRef, {
              invoiceId: fat.id,
              clientId: fat.clientId,
              amountPaid: fat.totalToPay,
              paymentDate: fat.paidAt || new Date().toISOString(),
              confirmationMethod: 'manual',
              confirmedBy: fat.paidBy || 'Operador',
              status: 'confirmed',
              createdAt: fat.paidAt || new Date().toISOString(),
            });
          } catch (err) {
            console.warn('Erro ao criar registro de pagamento na reconciliação:', err);
          }
        }
      }

      // 4. Verificação automática de vencimento de faturas pendentes:
      // Quando a data atual for maior que a data de vencimento, altera o status para 'overdue' (vencida)
      const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
      if (fat.status === 'pending' && fat.dueDate && todayStr > fat.dueDate) {
        try {
          await updateDoc(doc(db, 'faturas', fat.id), {
            status: 'overdue',
            updatedAt: new Date().toISOString(),
          });
        } catch (err) {
          console.warn(`Erro ao atualizar fatura #${fat.invoiceNumber} para vencida:`, err);
        }
      }
    });
  }, [currentUser, faturas, pagamentos, auditoriaLogs]);

  // Handlers for Firestore actions
  const handleSaveCliente = async (clienteData: Partial<Cliente>, isNew: boolean) => {
    // Sanitização completa para o Firestore (remove propriedades 'undefined' que causam erro na SDK)
    const cleanData: Record<string, any> = {};
    for (const [key, val] of Object.entries(clienteData)) {
      if (val !== undefined) {
        cleanData[key] = val;
      }
    }

    // Tratamento de Tarifa Neo: se em branco ou zero, não salva no doc (ou remove se edição) para usar o padrão geral
    const neoNum = cleanData.customNeoTariff !== undefined && cleanData.customNeoTariff !== null && cleanData.customNeoTariff !== ''
      ? Number(cleanData.customNeoTariff)
      : null;

    // Tratamento de Tarifa Coelba: se em branco ou zero, não salva no doc (ou remove se edição) para usar o padrão geral
    const coelbaNum = cleanData.customCoelbaTariff !== undefined && cleanData.customCoelbaTariff !== null && cleanData.customCoelbaTariff !== ''
      ? Number(cleanData.customCoelbaTariff)
      : null;

    if (isNew) {
      delete cleanData.customNeoTariff;
      delete cleanData.customCoelbaTariff;
      if (neoNum !== null && !isNaN(neoNum) && neoNum > 0) {
        cleanData.customNeoTariff = neoNum;
      }
      if (coelbaNum !== null && !isNaN(coelbaNum) && coelbaNum > 0) {
        cleanData.customCoelbaTariff = coelbaNum;
      }

      const newRef = doc(collection(db, 'clientes'));
      await setDoc(newRef, {
        ...cleanData,
        createdAt: new Date().toISOString(),
      });
    } else if (clienteData.id) {
      const docId = clienteData.id;
      delete cleanData.id;

      if (neoNum !== null && !isNaN(neoNum) && neoNum > 0) {
        cleanData.customNeoTariff = neoNum;
      } else {
        cleanData.customNeoTariff = deleteField();
      }

      if (coelbaNum !== null && !isNaN(coelbaNum) && coelbaNum > 0) {
        cleanData.customCoelbaTariff = coelbaNum;
      } else {
        cleanData.customCoelbaTariff = deleteField();
      }

      await updateDoc(doc(db, 'clientes', docId), {
        ...cleanData,
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

  const handleDeleteCliente = async (clienteId: string) => {
    const cli = clientes.find((c) => c.id === clienteId);
    const hasInvoices = faturas.some((f) => f.clientId === clienteId);
    const hasReadings = leituras.some((l) => l.clientId === clienteId);
    const hasTaxas = taxasCoelba.some((t) => t.clientId === clienteId);

    if (hasInvoices || hasReadings || hasTaxas) {
      throw new Error(
        'Este cliente já possui movimentações (faturas, leituras ou taxas vinculadas) e não pode ser excluído.'
      );
    }

    await deleteDoc(doc(db, 'clientes', clienteId));
    await logAuditEvent({
      operationType: 'delete_client',
      collectionName: 'clientes',
      relatedDocument: cli?.name || clienteId,
      user: userProfile?.name || 'Sistema',
      userEmail: userProfile?.email || '',
      previousData: cli || undefined,
      justification: `Exclusão definitiva de cliente sem movimentação: ${cli?.name || clienteId}`,
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
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const initialStatus: InvoiceStatus =
      invoiceData.status === 'paid' || invoiceData.status === 'cancelled'
        ? invoiceData.status
        : invoiceData.dueDate && todayStr > invoiceData.dueDate
        ? 'overdue'
        : (invoiceData.status || 'pending');

    const createdFatura: Fatura = {
      id: newRef.id,
      ...invoiceData,
      status: initialStatus,
      createdAt: new Date().toISOString(),
    };
    await setDoc(newRef, createdFatura);

    // Registra notificação no Firestore para o portal do cliente no celular
    try {
      const matchedClient = clientes.find((c) => c.id === invoiceData.clientId);
      const notifRef = doc(collection(db, 'notificacoes'));
      const notifData: Omit<NotificacaoCliente, 'id'> = {
        clientId: invoiceData.clientId,
        clientEmail: matchedClient?.email || '',
        faturaId: newRef.id,
        invoiceNumber: invoiceData.invoiceNumber,
        referenceMonth: invoiceData.referenceMonth,
        referenceYear: invoiceData.referenceYear,
        totalToPay: invoiceData.totalToPay,
        savingsAmount: invoiceData.savingsAmount,
        title: '⚡ Nova Fatura Lançada — Neo Energia',
        message: `Sua fatura de ${formatReferencePeriod(invoiceData.referenceMonth, invoiceData.referenceYear)} no valor de ${formatCurrency(invoiceData.totalToPay)} foi lançada. Economia calculada de ${formatCurrency(invoiceData.savingsAmount)}!`,
        hasBoleto: !!(invoiceData.boletoBase64 || invoiceData.boletoStoragePath),
        read: false,
        createdAt: new Date().toISOString(),
      };
      await setDoc(notifRef, notifData);

      // Dispara o alerta sonoro, vibratório e notificação nativa do dispositivo
      await notifyInvoiceIssued(createdFatura, matchedClient);
    } catch (err) {
      console.warn('Erro ao salvar ou disparar notificação de fatura:', err);
    }
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

  const handleUpdateInvoice = async (faturaId: string, updatedData: Partial<Fatura>) => {
    const prevFat = faturas.find((f) => f.id === faturaId);
    const finalData: Partial<Fatura> = { ...updatedData };

    if (updatedData.status === 'paid' && prevFat?.status !== 'paid') {
      if (!finalData.paidAt) finalData.paidAt = new Date().toISOString();
      if (!finalData.paidBy) finalData.paidBy = userProfile?.name || 'Operador';
      finalData.boletoBase64 = null;
      finalData.boletoStoragePath = null;
      finalData.boletoFileName = null;
      finalData.boletoUploadedAt = null;
      finalData.paymentPendingDeletion = false;

      // Cria registro em pagamentos se não existir
      const hasPayment = pagamentos.some(
        (p) => (p.invoiceId === faturaId || p.invoiceId === prevFat?.invoiceNumber) && p.status === 'confirmed'
      );
      if (!hasPayment && prevFat) {
        const payRef = doc(collection(db, 'pagamentos'));
        await setDoc(payRef, {
          invoiceId: faturaId,
          clientId: prevFat.clientId,
          amountPaid: updatedData.totalToPay !== undefined ? updatedData.totalToPay : prevFat.totalToPay,
          paymentDate: finalData.paidAt,
          confirmationMethod: 'manual',
          confirmedBy: finalData.paidBy,
          status: 'confirmed',
          createdAt: finalData.paidAt,
        }).catch((e) => console.warn('Erro ao registrar pagamento na edição:', e));
      }
    }

    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const effectiveDueDate = updatedData.dueDate || prevFat?.dueDate;
    if (finalData.status !== 'paid' && finalData.status !== 'cancelled' && effectiveDueDate) {
      if (todayStr > effectiveDueDate) {
        finalData.status = 'overdue';
      }
    }

    await updateDoc(doc(db, 'faturas', faturaId), {
      ...finalData,
      updatedAt: new Date().toISOString(),
    });

    await logAuditEvent({
      operationType: 'edit_invoice',
      collectionName: 'faturas',
      relatedDocument: prevFat?.invoiceNumber || faturaId,
      user: userProfile?.name || 'Operador',
      userEmail: userProfile?.email || '',
      previousData: prevFat || undefined,
      newData: finalData,
      justification: `Edição dos dados da fatura #${prevFat?.invoiceNumber || faturaId}`,
    });
  };

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

  const handleUpdateUser = async (
    uid: string,
    updates: { name: string; role: UserRole; active: boolean }
  ) => {
    const userToUpdate = usuarios.find((u) => u.uid === uid);
    await updateDoc(doc(db, 'users', uid), {
      name: updates.name.trim(),
      role: updates.role,
      active: updates.active,
      updatedAt: new Date().toISOString(),
    });

    if (updates.role === 'admin' && updates.active) {
      await setDoc(
        doc(db, 'admins', uid),
        { active: true, email: userToUpdate?.email || '' },
        { merge: true }
      );
    } else {
      await deleteDoc(doc(db, 'admins', uid)).catch(() => {});
    }

    await logAuditEvent({
      operationType: 'edit_user',
      collectionName: 'users',
      relatedDocument: userToUpdate?.email || uid,
      user: userProfile?.name || 'Administrador',
      userEmail: userProfile?.email || '',
      newData: updates,
      previousData: userToUpdate || undefined,
      justification: `Atualização de cadastro do usuário ${updates.name} (${userToUpdate?.email || uid})`,
    });
  };

  const handleDeleteUser = async (uid: string) => {
    if (uid === currentUser?.uid) {
      throw new Error('Você não pode excluir o seu próprio usuário que está logado no momento.');
    }

    const userToDelete = usuarios.find((u) => u.uid === uid);
    await deleteDoc(doc(db, 'users', uid));
    await deleteDoc(doc(db, 'admins', uid)).catch(() => {});

    await logAuditEvent({
      operationType: 'delete_user',
      collectionName: 'users',
      relatedDocument: userToDelete?.email || uid,
      user: userProfile?.name || 'Administrador',
      userEmail: userProfile?.email || '',
      previousData: userToDelete || undefined,
      justification: `Exclusão definitiva de usuário: ${userToDelete?.name || ''} (${userToDelete?.email || uid})`,
    });
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

  // Se o usuário logado for um Cliente, direciona exclusivamente para o Portal do Cliente
  if (isClient) {
    return (
      <>
        <OfflineIndicator />
        <PortalClienteView
          clientes={clientes}
          faturas={faturas}
          leituras={leituras}
          empresa={empresa}
          tariffs={tariffs}
          taxasCoelba={taxasCoelba}
          onIssueInvoice={handleIssueInvoice}
          onRegisterReading={handleRegisterReading}
          onOpenInvoiceModal={(fat) => setViewingFatura(fat)}
        />
        {viewingFatura && (
          <InvoiceModal
            fatura={viewingFatura}
            cliente={
              clientes.find((c) => c.id === viewingFatura.clientId) ||
              viewingFatura.historicalClientData ||
              null
            }
            empresa={viewingFatura.historicalCompanyData || empresa}
            allClientInvoices={faturas}
            onClose={() => setViewingFatura(null)}
            onOpenBoleto={(fat) => setSelectedBoletoFatura(fat)}
          />
        )}
      </>
    );
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
      portal_cliente: {
        title: 'Portal do Cliente (Área do Consumidor)',
        subtitle: 'Acesso a faturas pagas, download de boletos e acompanhamento de economia',
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

        <main className="flex-1 p-4 sm:p-8 print:p-0 print:m-0">
          {/* Banner de Sincronização e Feedback de Faturas das Imagens */}
          {(clientes.length < 38 || syncStatus !== 'idle') && (
            <div
              className={`mb-6 p-4 rounded-2xl shadow-md border flex flex-col md:flex-row items-center justify-between gap-4 transition-all no-print ${
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
              taxasCoelba={taxasCoelba}
              tariffs={tariffs}
              onSaveCliente={handleSaveCliente}
              onToggleStatus={handleToggleClienteStatus}
              onDeleteCliente={handleDeleteCliente}
              onOpenInvoiceModal={(fat) => setViewingFatura(fat)}
              onSyncAllSeedInvoices={() => syncAllSeedInvoices(true)}
              onOpenPortalForClient={(cId) => {
                setPortalOverrideClientId(cId);
                setActiveTab('portal_cliente');
              }}
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
              onUpdateInvoice={handleUpdateInvoice}
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
            <UsuariosView
              usuarios={usuarios}
              onUpdateUserRole={handleUpdateUserRole}
              onUpdateUser={handleUpdateUser}
              onDeleteUser={handleDeleteUser}
            />
          )}

          {activeTab === 'auditoria' && <AuditoriaView logs={auditoriaLogs} />}

          {activeTab === 'sistema' && <ConfiguracoesSistemaView />}

          {activeTab === 'portal_cliente' && (
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 no-print">
                <div>
                  <span className="text-xs font-black text-emerald-950 uppercase tracking-wide flex items-center gap-2">
                    <span>👁️ Modo de Simulação do Portal do Cliente</span>
                    <span className="bg-yellow-100 text-yellow-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
                      Visão do Administrador
                    </span>
                  </span>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Escolha qual cliente deseja simular para ver as faturas, boletos e economia exatamente como ele vê:
                  </p>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <select
                    value={portalOverrideClientId || (clientes[0]?.id || '')}
                    onChange={(e) => setPortalOverrideClientId(e.target.value)}
                    className="w-full sm:w-72 rounded-xl border border-gray-300 p-2 text-xs font-bold text-gray-900 bg-gray-50 focus:bg-white focus:border-emerald-600 focus:outline-none"
                  >
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} • Medidor: {c.meterNumber || c.consumerUnit || c.clientCodeCoelba}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <PortalClienteView
                clientes={clientes}
                faturas={faturas}
                leituras={leituras}
                empresa={empresa}
                tariffs={tariffs}
                taxasCoelba={taxasCoelba}
                onIssueInvoice={handleIssueInvoice}
                onRegisterReading={handleRegisterReading}
                overrideClientId={portalOverrideClientId || (clientes[0]?.id || undefined)}
                onOpenInvoiceModal={(fat) => setViewingFatura(fat)}
                onBackToAdmin={() => setActiveTab('dashboard')}
              />
            </div>
          )}
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
