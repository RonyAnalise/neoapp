// Service Worker para Notificações Web Push com o aplicativo fechado
// Totalmente compatível com Android (Chrome, Edge, Samsung Internet) e iOS 16.4+ (PWA Tela de Início / APNs)

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Evento PUSH: Disparado pelo sistema operacional do celular via FCM/APNs
// Funciona mesmo se o app estiver totalmente FECHADO ou com a tela bloqueada!
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      try {
        data = { body: event.data.text() };
      } catch (err) {
        data = {};
      }
    }
  }

  const title = data.title || '⚡ Nova Fatura Lançada — Neo Energia';
  const body = data.body || 'Sua fatura foi emitida e está disponível no Portal do Cliente.';
  const origin = self.location.origin;

  const iconUrl = data.icon
    ? (data.icon.startsWith('http') ? data.icon : `${origin}${data.icon.startsWith('/') ? '' : '/'}${data.icon}`)
    : `${origin}/pwa-192x192.png`;
  const badgeUrl = `${origin}/pwa-192x192.png`;

  const notificationData = data.data || {
    url: `${origin}/?tab=portal_cliente${data.faturaId ? `&faturaId=${data.faturaId}` : ''}`,
  };

  // Detecção precisa de iOS (iPhone, iPad, macOS WebKit)
  const isApple = (() => {
    try {
      const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
      const platform = (typeof navigator !== 'undefined' && navigator.platform) || '';
      return /iphone|ipad|ipod|macintosh|mac os x/i.test(ua) || /iphone|ipad|ipod|mac/i.test(platform);
    } catch {
      return false;
    }
  })();

  // No iOS (WebKit / APNs): opções devem ser enxutas para exibição imediata na tela de bloqueio
  // iOS não aceita strings de URL em badge nem array de vibração em NotificationOptions
  const options = {
    body,
    tag: data.tag || `neo-fatura-${Date.now()}`,
    data: notificationData,
  };

  // No Android e Desktop (Chrome, Edge, Samsung Internet), adiciona ícone, badge e vibração
  if (!isApple) {
    options.icon = iconUrl;
    options.badge = badgeUrl;
    options.vibrate = [300, 100, 300, 100, 450];
    options.renotify = true;
  }

  // Atualiza o contador de badge do aplicativo na Tela de Início (suportado no iOS 16.4+ e Android)
  const badgePromise =
    self.navigator && typeof self.navigator.setAppBadge === 'function'
      ? self.navigator.setAppBadge(1).catch(() => {})
      : Promise.resolve();

  // Executa showNotification com fallback garantido para a tela do celular acender
  const notificationPromise = self.registration
    .showNotification(title, options)
    .catch((err) => {
      console.warn('[SW Push] Fallback para notificação simplificada:', err);
      return self.registration.showNotification(title, {
        body,
        data: notificationData,
      });
    })
    .catch((err2) => {
      console.warn('[SW Push] Fallback emergencial:', err2);
      return self.registration.showNotification(title, { body });
    });

  event.waitUntil(Promise.all([notificationPromise, badgePromise]));
});

// Evento de clique na notificação da barra do celular
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (self.navigator && typeof self.navigator.clearAppBadge === 'function') {
    self.navigator.clearAppBadge().catch(() => {});
  }

  const origin = self.location.origin;
  const targetUrl =
    (event.notification.data && event.notification.data.url) || `${origin}/?tab=portal_cliente`;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && client.url.includes(origin) && 'focus' in client) {
          if ('navigate' in client) {
            client.navigate(targetUrl).catch(() => {});
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

self.addEventListener('notificationclose', (event) => {
  console.debug('Notificação na barra dispensada:', event.notification.tag);
});
