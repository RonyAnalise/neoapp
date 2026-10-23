import { Fatura, Cliente } from '../types';
import { formatCurrency, formatReferencePeriod } from './calculations';

export type NotificationPermissionStatus = 'granted' | 'denied' | 'default' | 'unsupported';

// Event emitter listener type for in-app toasts
type NotificationListener = (payload: InAppNotificationPayload) => void;

export interface InAppNotificationPayload {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  faturaId?: string;
  hasBoleto?: boolean;
  totalToPay?: number;
  savingsAmount?: number;
  clientName?: string;
}

const listeners: Set<NotificationListener> = new Set();

export function subscribeToInAppNotifications(listener: NotificationListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitInAppNotification(payload: InAppNotificationPayload) {
  listeners.forEach((listener) => {
    try {
      listener(payload);
    } catch (e) {
      console.warn('Erro ao notificar subscriber:', e);
    }
  });
}

/**
 * Verifica se a API de Notificações é suportada pelo navegador do celular/desktop
 */
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * Obtém o status atual de permissão de notificação
 */
export function getNotificationPermission(): NotificationPermissionStatus {
  if (!isNotificationSupported()) {
    return 'unsupported';
  }
  return Notification.permission as NotificationPermissionStatus;
}

/**
 * Solicita autorização ao usuário para enviar notificações no celular/navegador
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNotificationSupported()) {
    return false;
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      // Salva preferência localmente
      try {
        localStorage.setItem('neo_client_notifications_enabled', 'true');
      } catch {}
      return true;
    }
    return false;
  } catch (err) {
    console.error('Erro ao solicitar permissão de notificações:', err);
    return false;
  }
}

/**
 * Toca um som suave e profissional de notificação via Web Audio API (sem dependência de arquivo externo)
 */
export function playNotificationSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // 3 notas harmônicas ascendentes (C5 -> E5 -> G5)
    const notes = [
      { freq: 523.25, start: 0, duration: 0.12 },
      { freq: 659.25, start: 0.09, duration: 0.14 },
      { freq: 783.99, start: 0.18, duration: 0.35 },
    ];

    notes.forEach(({ freq, start, duration }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + start);

      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.2, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + start);
      osc.stop(now + start + duration);
    });
  } catch (e) {
    // Web Audio pode ser bloqueado antes do primeiro clique do usuário
    console.debug('Som de notificação suprimido por política do navegador');
  }
}

/**
 * Vibra o celular com um padrão rítmico de alerta
 */
export function vibrateDevice(pattern: number[] = [200, 100, 200, 100, 300]) {
  try {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch (e) {
    console.debug('Vibração indisponível no dispositivo');
  }
}

/**
 * Dispara uma notificação nativa no celular/computador e aciona vibração e som
 */
export async function triggerMobileNotification(
  title: string,
  options: {
    body: string;
    icon?: string;
    badge?: string;
    tag?: string;
    data?: unknown;
    vibratePattern?: number[];
  }
): Promise<boolean> {
  // 1. Toca som e vibra o celular
  playNotificationSound();
  vibrateDevice(options.vibratePattern);

  if (!isNotificationSupported()) {
    return false;
  }

  if (Notification.permission !== 'granted') {
    return false;
  }

  try {
    // Tenta primeiro via Service Worker (necessário para PWAs e Android/iOS moderno)
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && reg.showNotification) {
        await reg.showNotification(title, {
          body: options.body,
          icon: options.icon || '/pwa-192x192.png',
          badge: options.badge || '/icon.svg',
          tag: options.tag || 'neo-fatura-alert',
          data: options.data,
          // Padrão de vibração para suporte Web Push
          vibrate: options.vibratePattern || [200, 100, 200, 100, 300],
        } as NotificationOptions);
        return true;
      }
    }

    // Fallback: API de notificação direta do navegador
    new Notification(title, {
      body: options.body,
      icon: options.icon || '/pwa-192x192.png',
      tag: options.tag || 'neo-fatura-alert',
      data: options.data,
    });
    return true;
  } catch (err) {
    console.warn('Erro ao disparar notificação nativa:', err);
    return false;
  }
}

/**
 * Dispara a notificação completa de emissão de fatura para o cliente
 */
export async function notifyInvoiceIssued(
  fatura: Fatura,
  client?: Cliente | null
): Promise<void> {
  const period = formatReferencePeriod(fatura.referenceMonth, fatura.referenceYear);
  const totalStr = formatCurrency(fatura.totalToPay);
  const savingsStr = formatCurrency(fatura.savingsAmount);
  const clientName = client?.name || fatura.clientName || 'Cliente';
  const hasBoleto = !!(fatura.boletoBase64 || fatura.boletoStoragePath);

  const title = '⚡ Nova Fatura Lançada — Neo Energia';
  const body = `Olá ${clientName}! Sua fatura de ${period} no valor de ${totalStr} foi lançada. Economia de ${savingsStr} garantida! ${
    hasBoleto ? 'Boleto bancário disponível para download.' : 'Fatura disponível para visualização.'
  }`;

  // 1. Emite alerta in-app (exibido na tela do portal em tempo real)
  emitInAppNotification({
    id: `notif-${fatura.id}-${Date.now()}`,
    title,
    message: body,
    timestamp: new Date().toISOString(),
    faturaId: fatura.id,
    hasBoleto,
    totalToPay: fatura.totalToPay,
    savingsAmount: fatura.savingsAmount,
    clientName,
  });

  // 2. Dispara notificação nativa no celular (se permissão concedida)
  await triggerMobileNotification(title, {
    body,
    tag: `fatura-${fatura.id}`,
    vibratePattern: [300, 150, 300, 150, 450],
    data: {
      faturaId: fatura.id,
      url: window.location.origin,
    },
  });
}

/**
 * Dispara uma notificação de teste no celular do cliente
 */
export async function triggerTestMobileNotification(clientName?: string): Promise<boolean> {
  const name = clientName || 'Cliente Neo Energia';
  const title = '🔔 Teste de Notificação no Celular';
  const body = `Tudo pronto, ${name}! Seu celular está configurado para receber avisos instantâneos assim que suas faturas forem emitidas.`;

  emitInAppNotification({
    id: `test-${Date.now()}`,
    title,
    message: body,
    timestamp: new Date().toISOString(),
  });

  return triggerMobileNotification(title, {
    body,
    tag: 'test-notification',
    vibratePattern: [200, 100, 200, 100, 200],
  });
}

/**
 * Gera URL de WhatsApp para notificar o cliente diretamente no celular via WhatsApp
 */
export function getWhatsAppNotificationUrl(
  client: Cliente,
  fatura: Fatura,
  customPortalUrl?: string
): string | null {
  const rawPhone = client.whatsapp || client.phone;
  if (!rawPhone) return null;

  // Limpa apenas dígitos
  const digits = rawPhone.replace(/\D/g, '');
  if (!digits) return null;

  // Garante DDI 55 do Brasil se faltar
  const fullPhone = digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`;

  const period = formatReferencePeriod(fatura.referenceMonth, fatura.referenceYear);
  const total = formatCurrency(fatura.totalToPay);
  const savings = formatCurrency(fatura.savingsAmount);
  const hasBoleto = !!(fatura.boletoBase64 || fatura.boletoStoragePath);
  const portalUrl = customPortalUrl || (typeof window !== 'undefined' ? window.location.origin : '');

  const text = `⚡ *Neo Energia — Nova Fatura Disponível* ⚡

Olá, *${client.name}*!
Sua fatura de energia referente a *${period}* já foi lançada e está disponível no seu Portal do Cliente.

💰 *Total a Pagar:* ${total}
🌿 *Sua Economia com a Neo:* ${savings}
📅 *Vencimento:* ${fatura.dueDate.split('-').reverse().join('/')}

${hasBoleto ? '📄 *Boleto Bancário:* Disponível para download no portal.' : '📄 *Fatura Oficial:* Disponível com opções de pagamento via PIX.'}

👉 *Acesse seu Portal do Cliente:*
${portalUrl}`;

  return `https://wa.me/${fullPhone}?text=${encodeURIComponent(text)}`;
}
