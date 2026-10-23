// Service Worker para Notificações Web Push com o aplicativo fechado
// Suporta Android (Chrome, Edge, Samsung Internet) e iOS 16.4+ (PWA Tela de Início)

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
      data = {
        title: '⚡ Nova Fatura Lançada — Neo Energia',
        body: event.data.text() || 'Sua fatura de energia já está disponível.',
      };
    }
  }

  const title = data.title || '⚡ Nova Fatura Lançada — Neo Energia';
  const options = {
    body: data.body || 'Sua fatura foi emitida e está disponível no Portal do Cliente.',
    icon: data.icon || '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: data.tag || `fatura-alert-${Date.now()}`,
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: [300, 100, 300, 100, 450],
    data: data.data || { url: '/?tab=portal_cliente' },
    actions: [
      { action: 'open_invoice', title: '📄 Ver Fatura' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options).catch((err) => {
      console.warn('showNotification fallback:', err);
      return self.registration.showNotification(title, {
        body: data.body || 'Sua fatura de energia já está disponível no Portal do Cliente.',
        icon: '/pwa-192x192.png',
      });
    })
  );
});

// Evento de clique na notificação da barra do celular
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl =
    (event.notification.data && event.notification.data.url) || '/?tab=portal_cliente';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          if ('navigate' in client && targetUrl) {
            client.navigate(targetUrl);
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
