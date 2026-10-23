export type UserRole = 'admin' | 'operator' | 'cliente';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  clientId?: string;
  clientCpf?: string;
  createdAt: string;
  lastLoginAt?: string;
}

export type ClientStatus = 'active' | 'inactive';

export interface Cliente {
  id: string;
  name: string;
  cpfCnpj: string;
  phone: string;
  whatsapp: string;
  email: string;
  cep: string;
  address: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  clientCodeCoelba: string;
  consumerUnit?: string;
  meterNumber?: string;
  customNeoTariff?: number;
  customCoelbaTariff?: number;
  status: ClientStatus;
  portalAccessActive?: boolean;
  portalPassword?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface EmpresaConfig {
  id?: string;
  name: string;
  companyName: string;
  cnpj: string;
  logoUrl?: string;
  groupName: string;
  address: string;
  cep: string;
  city: string;
  state: string;
  phone: string;
  whatsapp: string;
  email: string;
  warningPaymentText: string;
  paymentDueDays: number;
  sustainabilityMessage: string;
  transparencyDiscountText: string;
  paymentInstructions: string;
  additionalInfo?: string;
  updatedAt?: string;
}

export interface EnergyTariffs {
  id?: string;
  neoTariff: number; // e.g. 1.00
  coelbaReferenceTariff: number; // e.g. 1.21
  validFrom: string;
  validTo?: string;
  updatedAt?: string;
  updatedBy?: string;
  notes?: string;
}

export type ReadingStatus = 'valid' | 'cancelled' | 'meter_swap';

export interface Leitura {
  id: string;
  clientId: string;
  meterId?: string;
  previousReadingDate: string;
  previousReadingValue: number;
  currentReadingDate: string;
  currentReadingValue: number;
  calculatedConsumption: number;
  referenceMonth: number; // 1-12
  referenceYear: number;
  previousReadingRef?: string;
  invoiceId?: string;
  status: ReadingStatus;
  createdAt: string;
  createdBy: string;
}

export type InvoiceStatus = 'pending' | 'paid' | 'overdue' | 'cancelled';

export interface Fatura {
  id: string;
  invoiceNumber: string;
  clientId: string;
  clientName?: string;
  referenceMonth: number; // 1-12
  referenceYear: number;
  previousReading: number;
  previousReadingDate: string;
  currentReading: number;
  currentReadingDate: string;
  consumptionKwh: number;
  appliedNeoTariff: number;
  appliedCoelbaTariff: number;
  neoAmount: number;
  coelbaEstimateAmount: number;
  savingsAmount: number;
  savingsPercentage: number;
  totalToPay: number;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  notes?: string;
  // Historical snapshot of company and client to reproduce invoice identically
  historicalCompanyData?: EmpresaConfig;
  historicalClientData?: Cliente;
  // Boleto tracking (Firestore Base64 / Storage)
  boletoBase64?: string | null;
  boletoStoragePath?: string | null;
  boletoFileName?: string | null;
  boletoUploadedAt?: string | null;
  paymentPendingDeletion?: boolean;
  paymentDeletionError?: string;
  // Metadata
  createdAt: string;
  createdBy: string;
  paidAt?: string;
  paidBy?: string;
  cancelledAt?: string;
  cancellationReason?: string;
}

export interface Pagamento {
  id: string;
  invoiceId: string;
  clientId: string;
  amountPaid: number;
  paymentDate: string;
  confirmationMethod: 'manual' | 'gateway' | 'integration';
  confirmedBy: string;
  status: 'confirmed' | 'reversed';
  createdAt: string;
  notes?: string;
}

export interface TaxaCoelba {
  id: string;
  clientId: string;
  clientName: string;
  clientCodeCoelba: string;
  data: string; // YYYY-MM-DD
  valor?: number;
  descricao?: string;
  comprovanteBase64: string;
  comprovanteFileName: string;
  comprovanteFileType?: string;
  comprovanteFileSize?: number;
  observacoes?: string;
  status: 'quitada';
  createdAt: string;
  createdBy: string;
}

export interface AuditoriaLog {
  id: string;
  operationType:
    | 'create_client'
    | 'edit_client'
    | 'inactivate_client'
    | 'register_reading'
    | 'issue_invoice'
    | 'edit_invoice'
    | 'cancel_invoice'
    | 'confirm_payment'
    | 'delete_boleto'
    | 'update_tariffs'
    | 'update_company'
    | 'change_permissions'
    | 'meter_swap'
    | 'delete_reading'
    | 'delete_invoice'
    | 'delete_payment'
    | 'delete_client'
    | 'edit_user'
    | 'delete_user'
    | 'register_taxa_coelba'
    | 'delete_taxa_coelba';
  collectionName: string;
  relatedDocument: string;
  user: string;
  userEmail: string;
  timestamp: string;
  previousData?: unknown;
  newData?: unknown;
  justification?: string;
}

export interface ViaCepResponse {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  ibge: string;
  gia: string;
  ddd: string;
  siafi: string;
  erro?: boolean;
}

export interface NotificacaoCliente {
  id: string;
  clientId: string;
  clientEmail?: string;
  faturaId: string;
  invoiceNumber: string;
  referenceMonth: number;
  referenceYear: number;
  totalToPay: number;
  savingsAmount: number;
  title: string;
  message: string;
  hasBoleto?: boolean;
  read: boolean;
  createdAt: string;
}

export interface PushSubscriptionRecord {
  id: string;
  clientId: string;
  clientIds?: string[];
  clientEmail?: string;
  isAdminOrTester?: boolean;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  platform: 'android' | 'ios' | 'desktop';
  userAgent?: string;
  updatedAt: string;
}


