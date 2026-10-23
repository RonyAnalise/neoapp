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

  // Imagens com URLs absolutas garantem que o sistema operacional encontre o ícone mesmo em segundo plano
  const iconUrl = data.icon
    ? (data.icon.startsWith('http') ? data.icon : `${origin}${data.icon.startsWith('/') ? '' : '/'}${data.icon}`)
    : `${origin}/pwa-192x192.png`;
  const badgeUrl = `${origin}/pwa-192x192.png`;

  const notificationData = data.data || {
    url: `${origin}/?tab=portal_cliente${data.faturaId ? `&faturaId=${data.faturaId}` : ''}`,
  };

  // Monta opções seguras compatíveis com Android e iOS (sem propriedades que quebram o WebKit no iOS)
  const isApple = typeof navigator !== 'undefined' && /iphone|ipad|ipod|mac/i.test(navigator.userAgent || '');

  const options = {
    body,
    icon: iconUrl,
    badge: badgeUrl,
    tag: data.tag || `neo-fatura-${Date.now()}`,
    data: notificationData,
  };

  // No Android, adiciona suporte a vibração personalizada
  if (!isApple) {
    options.vibrate = [300, 100, 300, 100, 450];
    options.renotify = true;
  }

  // Executa showNotification com fallback em cascata para garantir que a barra do celular sempre receba o alerta
  event.waitUntil(
    self.registration
      .showNotification(title, options)
      .catch((err) => {
        console.warn('[SW Push] Fallback nível 1 para notificação:', err);
        return self.registration.showNotification(title, {
          body,
          icon: `${origin}/pwa-192x192.png`,
          data: notificationData,
        });
      })
      .catch((err2) => {
        console.warn('[SW Push] Fallback nível 2 com payload básico:', err2);
        return self.registration.showNotification(title, { body });
      })
  );
});

// Evento de clique na notificação da barra do celular
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

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
