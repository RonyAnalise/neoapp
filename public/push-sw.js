// Service Worker para Notificações Web Push com o aplicativo fechado
// Suporta Android (Chrome, Edge, Samsung Internet) e iOS 16.4+ (PWA Tela de Início)

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Evento PUSH: Disparado pelo sistema operacional do celular quando o servidor envia uma notificação
// Funciona mesmo se o app estiver totalmente FECHADO ou o celular estiver com a tela bloqueada!
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
    body: data.body || 'Sua fatura foi emitida e está disponível para download e visualização.',
    icon: data.icon || '/pwa-192x192.png',
    badge: data.badge || '/icon.svg',
    image: data.image || undefined,
    tag: data.tag || `fatura-alert-${Date.now()}`,
    // renotify: true garante alerta sonoro/vibração mesmo se houver outra notificação anterior
    renotify: true,
    // requireInteraction: true garante que a notificação PERMANEÇA na barra de notificações do celular
    // tanto no Android quanto na tela de bloqueio e central de notificações do iOS até ser tocada!
    requireInteraction: true,
    vibrate: [300, 100, 300, 100, 450],
    data: data.data || { url: '/?tab=portal_cliente' },
    actions: [
      { action: 'open_fatura', title: '📄 Abrir Fatura' },
      { action: 'dismiss', title: 'Dispensar' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Evento de clique na notificação da barra do celular
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const targetUrl =
    (event.notification.data && event.notification.data.url) || '/?tab=portal_cliente';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Se houver uma aba do portal já aberta, foca nela e navega
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          if ('navigate' in client && targetUrl) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      // Se o app estava fechado, abre uma nova janela/PWA na tela certa
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

self.addEventListener('notificationclose', (event) => {
  console.debug('Notificação na barra dispensada:', event.notification.tag);
});
