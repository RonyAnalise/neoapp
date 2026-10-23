import express, { Request, Response } from 'express';
import webpush from 'web-push';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '10mb' }));

// Chaves VAPID estáveis para envio de Web Push (Android, iOS 16.4+ e Desktop)
const VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY ||
  'BBNqn60incWjXa7kC5UJMpQW-T-XiyqevrgIeSXjhEkColAH0WaWouV5Dk84v9yIJMa0Z5hDqYbCj07yOwGUQTw';
const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY || 'PnR0DDi1Bp2is_YVe3V6vR_goM9my_bKhEBtERBOkAc';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:ronycvcsales@gmail.com';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// Retorna a chave pública VAPID para registro no Service Worker do celular
app.get('/api/push/vapid-public-key', (_req: Request, res: Response) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// Envia notificação Web Push diretamente para o sistema operacional do celular
// Mesmo com o navegador ou app fechado, o FCM (Android) ou APNs (Apple) entrega na barra de notificações
app.post('/api/push/send', async (req: Request, res: Response) => {
  try {
    const { subscriptions, payload } = req.body;

    if (!subscriptions || !Array.isArray(subscriptions) || subscriptions.length === 0) {
      return res.status(400).json({ error: 'Nenhuma assinatura informada para push' });
    }

    const notificationPayload = JSON.stringify({
      title: payload?.title || '⚡ Nova Fatura Lançada — Neo Energia',
      body: payload?.body || 'Sua fatura foi emitida e está disponível no Portal do Cliente.',
      icon: payload?.icon || '/pwa-192x192.png',
      badge: payload?.badge || '/icon.svg',
      tag: payload?.tag || `fatura-${Date.now()}`,
      data: payload?.data || { url: '/?tab=portal_cliente' },
    });

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          const res = await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: sub.keys,
            },
            notificationPayload,
            {
              TTL: 60 * 60 * 24 * 7, // 7 dias de retenção
              urgency: 'high',
            }
          );
          console.log(`[WebPush] Entregue com sucesso! Status: ${res.statusCode} | Endpoint: ${sub.endpoint.slice(0, 45)}...`);
          return res;
        } catch (err: unknown) {
          const status = (err as { statusCode?: number }).statusCode;
          console.warn(`[WebPush] Falha ao entregar para ${sub.endpoint.slice(0, 45)}... (Status: ${status})`, err);
          throw err;
        }
      })
    );

    const sentCount = results.filter((r) => r.status === 'fulfilled').length;
    const failedCount = results.filter((r) => r.status === 'rejected').length;

    console.log(`[WebPush Resumo] Enviados: ${sentCount} | Falhas: ${failedCount} | Total: ${subscriptions.length}`);

    return res.json({
      success: true,
      sentCount,
      failedCount,
      total: subscriptions.length,
    });
  } catch (error) {
    console.error('Erro ao processar envio de Web Push:', error);
    return res.status(500).json({ error: 'Falha interna ao despachar notificações push' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

startServer();
