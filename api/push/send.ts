import webpush from 'web-push';

const VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY ||
  'BBNqn60incWjXa7kC5UJMpQW-T-XiyqevrgIeSXjhEkColAH0WaWouV5Dk84v9yIJMa0Z5hDqYbCj07yOwGUQTw';
const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY || 'PnR0DDi1Bp2is_YVe3V6vR_goM9my_bKhEBtERBOkAc';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:ronycvcsales@gmail.com';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Utilize POST.' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: 'JSON inválido no corpo da requisição.' });
      }
    }

    const { subscriptions, payload } = body || {};

    if (!subscriptions || !Array.isArray(subscriptions) || subscriptions.length === 0) {
      return res.status(400).json({ error: 'Nenhuma assinatura informada para push' });
    }

    const notificationPayload = JSON.stringify({
      title: payload?.title || '⚡ Nova Fatura Lançada — Neo Energia',
      body: payload?.body || 'Sua fatura foi emitida e está disponível no Portal do Cliente.',
      icon: payload?.icon || '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: payload?.tag || `fatura-${Date.now()}`,
      data: payload?.data || { url: '/?tab=portal_cliente' },
    });

    const results = await Promise.allSettled(
      subscriptions.map(async (sub: any) => {
        const isAppleEndpoint = typeof sub.endpoint === 'string' && sub.endpoint.includes('apple.com');
        return webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: sub.keys,
          },
          notificationPayload,
          {
            TTL: 60 * 60 * 24 * 7,
            urgency: 'high',
            headers: isAppleEndpoint
              ? {
                  'apns-priority': '10',
                  'apns-push-type': 'alert',
                }
              : {
                  Urgency: 'high',
                },
          }
        );
      })
    );

    const sentCount = results.filter((r) => r.status === 'fulfilled').length;
    const failedCount = results.filter((r) => r.status === 'rejected').length;

    return res.status(200).json({
      success: true,
      sentCount,
      failedCount,
      total: subscriptions.length,
    });
  } catch (error: any) {
    console.error('[Vercel WebPush] Erro:', error);
    return res.status(500).json({ error: 'Falha interna ao despachar notificações push' });
  }
}
