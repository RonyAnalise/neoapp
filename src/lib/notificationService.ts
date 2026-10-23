import { Fatura, Cliente, PushSubscriptionRecord } from '../types';
import { formatCurrency, formatReferencePeriod } from './calculations';
import { collection, doc, setDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';

export type NotificationPermissionStatus = 'granted' | 'denied' | 'default' | 'unsupported';

export const VAPID_PUBLIC_KEY =
  'BBNqn60incWjXa7kC5UJMpQW-T-XiyqevrgIeSXjhEkColAH0WaWouV5Dk84v9yIJMa0Z5hDqYbCj07yOwGUQTw';

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
 * Converte chave VAPID Base64 URL Safe para Uint8Array exigido pelo pushManager.subscribe
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Identifica se o dispositivo é iOS (iPhone, iPad)
 */
export function isIOSDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const userAgent = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent);
}

/**
 * Identifica se o dispositivo é Android
 */
export function isAndroidDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const userAgent = window.navigator.userAgent.toLowerCase();
  return /android/.test(userAgent);
}

/**
 * Identifica se o aplicativo está instalado na tela de início (PWA standalone)
 * Crucial para iOS: No iOS 16.4+, notificações Web Push com app fechado exigem que o app esteja adicionado à Tela de Início.
 */
export function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false;
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return isStandalone;
}

/**
 * Detecta plataforma do dispositivo
 */
export function getDevicePlatform(): 'android' | 'ios' | 'desktop' {
  if (isAndroidDevice()) return 'android';
  if (isIOSDevice()) return 'ios';
  return 'desktop';
}

/**
 * Verifica se a API de Notificações e Service Worker são suportados pelo navegador
 */
export function isNotificationSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

/**
 * Obtém o status atual de permissão de notificação
 */
export function getNotificationPermission(): NotificationPermissionStatus {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission as NotificationPermissionStatus;
}

/**
 * Solicita permissão do navegador para notificações
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch {
    return false;
  }
}

/**
 * Registra o Service Worker dedicado para Push e obtém a subscription
 */
export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    // Registra o Service Worker dedicado de push
    const reg = await navigator.serviceWorker.register('/push-sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    return reg;
  } catch (err) {
    console.warn('Falha ao registrar push-sw.js, tentando registration existente:', err);
    try {
      return await navigator.serviceWorker.ready;
    } catch {
      return null;
    }
  }
}

/**
 * Solicita permissão e cadastra a assinatura Web Push no navegador do celular e no Firestore
 * Permite que o celular receba avisos na barra de status mesmo com o APP FECHADO
 */
export async function enableAndSubscribeToPush(
  clientId: string,
  clientEmail?: string,
  clientIds?: string[],
  isAdminOrTester?: boolean
): Promise<{ success: boolean; error?: string; subscription?: PushSubscription }> {
  if (!isNotificationSupported()) {
    return {
      success: false,
      error: 'Notificações push não são suportadas neste navegador.',
    };
  }

  // Regra iOS: no iPhone, notificações em segundo plano exigem instalação na Tela de Início
  if (isIOSDevice() && !isStandalonePWA()) {
    console.info('No iOS, para notificações com app fechado adicione à Tela de Início');
  }

  try {
    // 1. Solicita permissão do usuário
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return {
        success: false,
        error: 'Permissão de notificação negada no navegador.',
      };
    }

    // 2. Garante o Service Worker ativo
    const reg = await registerPushServiceWorker();
    if (!reg || !reg.pushManager) {
      return {
        success: false,
        error: 'Service Worker ou PushManager não disponível.',
      };
    }

    // 3. Obtém ou renova a assinatura Push com a chave pública VAPID
    let sub = await reg.pushManager.getSubscription();
    if (sub) {
      // Se já existir, verifica se possui chaves válidas
      const subJson = sub.toJSON();
      if (!subJson.keys?.p256dh || !subJson.keys?.auth) {
        await sub.unsubscribe().catch(() => {});
        sub = null;
      }
    }

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
    }

    // 4. Salva a assinatura no Firestore para envio em segundo plano pelo servidor
    const subJson = sub.toJSON();
    if (subJson.endpoint && subJson.keys?.p256dh && subJson.keys?.auth) {
      const safeClientId = clientId || 'device';
      const endpointHash = btoa(subJson.endpoint).replace(/[/+=]/g, '').slice(-30);
      const subDocId = `sub_${safeClientId}_${endpointHash}`;

      const isRony =
        clientEmail === 'ronycvcsales@gmail.com' ||
        clientEmail === 'rony@gmail.com' ||
        (clientEmail && clientEmail.toLowerCase().includes('rony'));

      const record: PushSubscriptionRecord = {
        id: subDocId,
        clientId: safeClientId,
        clientIds: clientIds && clientIds.length > 0 ? clientIds : [safeClientId],
        clientEmail: clientEmail || '',
        isAdminOrTester: !!isAdminOrTester || !!isRony,
        endpoint: subJson.endpoint,
        keys: {
          p256dh: subJson.keys.p256dh,
          auth: subJson.keys.auth,
        },
        platform: getDevicePlatform(),
        userAgent: navigator.userAgent.slice(0, 200),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'push_subscriptions', subDocId), record, { merge: true });
    }

    try {
      localStorage.setItem('neo_client_notifications_enabled', 'true');
    } catch {}

    return { success: true, subscription: sub };
  } catch (err) {
    console.error('Erro ao subscrever Web Push:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Envia notificação Web Push direta para os celulares cadastrados do cliente
 * (Disparado pelo servidor para a barra de notificações do celular mesmo com o app fechado)
 */
export async function sendWebPushToClient(
  clientId: string,
  payload: {
    title: string;
    body: string;
    faturaId?: string;
    tag?: string;
    data?: unknown;
  },
  clientEmail?: string
): Promise<{ success: boolean; sentCount: number }> {
  try {
    // 1. Busca no Firestore todas as assinaturas push
    const snap = await getDocs(collection(db, 'push_subscriptions'));

    if (snap.empty) {
      console.warn('[WebPush] Nenhum aparelho com push subscription registrado no sistema ainda');
      return { success: false, sentCount: 0 };
    }

    const allSubs = snap.docs.map((d) => d.data() as PushSubscriptionRecord);
    const validSubs = allSubs.filter((s) => s.endpoint && s.keys?.p256dh && s.keys?.auth);

    if (validSubs.length === 0) {
      console.warn('[WebPush] Nenhuma assinatura válida com chaves p256dh/auth encontrada');
      return { success: false, sentCount: 0 };
    }

    // Filtra os aparelhos do cliente ou do administrador/testador (sempre inclui administradores e o aparelho do desenvolvedor/gestor)
    let matched = validSubs.filter((sub) => {
      if (sub.isAdminOrTester) return true;
      if (
        sub.clientEmail &&
        (sub.clientEmail === 'ronycvcsales@gmail.com' ||
          sub.clientEmail === 'rony@gmail.com' ||
          sub.clientEmail.toLowerCase().includes('rony'))
      )
        return true;
      if (sub.clientId === clientId) return true;
      if (sub.clientIds && sub.clientIds.includes(clientId)) return true;
      if (
        clientEmail &&
        sub.clientEmail &&
        sub.clientEmail.toLowerCase() === clientEmail.toLowerCase()
      )
        return true;
      return false;
    });

    // Se nenhum match específico foi encontrado, envia para todos os aparelhos cadastrados (garante entrega no teste)
    if (matched.length === 0) {
      matched = validSubs;
    }

    // Deduplica por endpoint
    const uniqueMap = new Map<string, (typeof validSubs)[0]>();
    matched.forEach((sub) => {
      if (sub.endpoint && !uniqueMap.has(sub.endpoint)) {
        uniqueMap.set(sub.endpoint, sub);
      }
    });

    const subscriptions = Array.from(uniqueMap.values()).map((s) => ({
      endpoint: s.endpoint,
      keys: s.keys,
    }));

    if (subscriptions.length === 0) {
      return { success: false, sentCount: 0 };
    }

    // 2. Chama a rota da API no backend Express para enviar via web-push VAPID
    const res = await fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscriptions,
        payload: {
          title: payload.title,
          body: payload.body,
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          tag: payload.tag || `fatura-${payload.faturaId || Date.now()}`,
          data: payload.data || {
            url: `/?tab=portal_cliente&faturaId=${payload.faturaId || ''}`,
          },
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Servidor retornou erro HTTP ${res.status}`);
    }

    const result = await res.json();
    console.log('[sendWebPushToClient] Resultado do envio:', result);
    return { success: true, sentCount: result.sentCount || 0 };
  } catch (err) {
    console.warn('Erro ao disparar Web Push via API:', err);
    return { success: false, sentCount: 0 };
  }
}

/**
 * Toca um som suave e profissional de notificação via Web Audio API (sem dependência de arquivo externo)
 */
export function playNotificationSound() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
  } catch {
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
  } catch {
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

  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  if (Notification.permission !== 'granted') {
    return false;
  }

  try {
    // Tenta primeiro via Service Worker (necessário para persistência na barra do Android e iOS)
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && reg.showNotification) {
        await reg.showNotification(title, {
          body: options.body,
          icon: options.icon || '/pwa-192x192.png',
          badge: options.badge || '/icon.svg',
          tag: options.tag || 'neo-fatura-alert',
          data: options.data,
          // requireInteraction: true garante que o aviso permaneça na barra até o usuário abrir
          requireInteraction: true,
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
      requireInteraction: true,
    } as NotificationOptions);
    return true;
  } catch (err) {
    console.warn('Erro ao disparar notificação nativa:', err);
    return false;
  }
}

/**
 * Dispara a notificação completa de emissão de fatura para o cliente:
 * 1. Emite evento in-app no portal
 * 2. Aciona notificação local se a tela estiver aberta
 * 3. Envia Web Push para os celulares cadastrados (que toca e fica na barra mesmo com o app FECHADO!)
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
  const body = `Olá ${clientName}! Sua fatura de ${period} no valor de ${totalStr} foi lançada. Economia de ${savingsStr} calculada! ${
    hasBoleto ? 'Boleto disponível para download.' : 'Fatura pronta para visualização.'
  }`;

  // 1. Emite alerta in-app na tela
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

  // 2. Dispara notificação nativa com som e vibração (se permitido neste aparelho)
  await triggerMobileNotification(title, {
    body,
    tag: `fatura-${fatura.id}`,
    vibratePattern: [300, 150, 300, 150, 450],
    data: {
      faturaId: fatura.id,
      url: `${typeof window !== 'undefined' ? window.location.origin : ''}/?tab=portal_cliente`,
    },
  });

  // 3. Envia Web Push para entrega na barra do celular com o APP FECHADO
  await sendWebPushToClient(fatura.clientId, {
    title,
    body,
    faturaId: fatura.id,
    tag: `fatura-${fatura.id}`,
    data: {
      faturaId: fatura.id,
      url: `${typeof window !== 'undefined' ? window.location.origin : ''}/?tab=portal_cliente`,
    },
  }, client?.email);
}

/**
 * Dispara uma notificação de teste no celular do cliente (local e push para barra de status)
 * Se delaySeconds > 0, o servidor aguarda esse tempo antes de disparar o Web Push,
 * permitindo que o usuário feche o aplicativo ou bloqueie a tela do celular para ver o alerta tocar!
 */
export async function triggerTestMobileNotification(
  clientName?: string,
  clientId?: string,
  delaySeconds: number = 0
): Promise<boolean> {
  const name = clientName || 'Cliente Neo Energia';
  const title = '⚡ Nova Fatura Lançada — Neo Energia';
  const body = `Tudo certo, ${name}! Seu celular está conectado para receber avisos com o aplicativo fechado.`;

  emitInAppNotification({
    id: `test-${Date.now()}`,
    title,
    message:
      delaySeconds > 0
        ? `⏳ Notificação de teste agendada para daqui a ${delaySeconds}s! Bloqueie a tela ou feche o app agora para ver o alerta tocar na barra.`
        : body,
    timestamp: new Date().toISOString(),
  });

  if (delaySeconds <= 0) {
    // Dispara no aparelho local imediatamente se não tiver delay
    await triggerMobileNotification(title, {
      body,
      tag: 'test-notification-bar',
      vibratePattern: [300, 100, 300, 100, 300],
    });
  }

  // Dispara o Web Push com delay no backend para permitir fechar o aplicativo
  try {
    const res = await fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        delaySeconds,
        payload: {
          title,
          body,
          icon: '/pwa-192x192.png',
          tag: `test-push-${Date.now()}`,
          data: { url: '/?tab=portal_cliente' },
        },
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn('Erro ao disparar push de teste:', err);
    return false;
  }
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

  const digits = rawPhone.replace(/\D/g, '');
  if (!digits) return null;

  const fullPhone = digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`;

  const period = formatReferencePeriod(fatura.referenceMonth, fatura.referenceYear);
  const total = formatCurrency(fatura.totalToPay);
  const savings = formatCurrency(fatura.savingsAmount);
  const hasBoleto = !!(fatura.boletoBase64 || fatura.boletoStoragePath);
  const portalUrl =
    customPortalUrl || (typeof window !== 'undefined' ? window.location.origin : '');

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
