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

// Serve os scripts de Service Worker com cabeçalhos adequados para PWA e Push
app.get(['/sw.js', '/push-sw.js'], (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'push-sw.js'));
});

// Serve o manifesto PWA
app.get(['/manifest.json', '/manifest.webmanifest'], (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'manifest.json'));
});

// Retorna a chave pública VAPID para registro no Service Worker do celular
app.get('/api/push/vapid-public-key', (_req: Request, res: Response) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// Envia notificação Web Push diretamente para o sistema operacional do celular
// Mesmo com o navegador ou app fechado, o FCM (Android) ou APNs (Apple) entrega na barra de notificações
app.post('/api/push/send', async (req: Request, res: Response) => {
  try {
    let { subscriptions, payload, delaySeconds } = req.body;

    // Se nenhuma assinatura foi enviada no payload, busca diretamente do Firestore
    if (!subscriptions || !Array.isArray(subscriptions) || subscriptions.length === 0) {
      try {
        const { initializeApp, getApps } = await import('firebase/app');
        const { getFirestore, collection, getDocs } = await import('firebase/firestore');
        const fs = await import('fs');
        const cfgPath = path.join(__dirname, 'firebase-applet-config.json');
        if (fs.existsSync(cfgPath)) {
          const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
          const app = getApps().length === 0 ? initializeApp(cfg) : getApps()[0];
          const db = getFirestore(app, cfg.firestoreDatabaseId);
          const snap = await getDocs(collection(db, 'push_subscriptions'));
          subscriptions = snap.docs
            .map((d) => d.data())
            .filter((s: any) => s.endpoint && s.keys?.p256dh && s.keys?.auth);
        }
      } catch (errDb) {
        console.warn('[WebPush] Falha ao carregar assinaturas automáticas do Firestore:', errDb);
      }
    }

    if (!subscriptions || !Array.isArray(subscriptions) || subscriptions.length === 0) {
      console.log('[WebPush] Requisição recebida sem assinaturas cadastradas');
      return res.status(400).json({ error: 'Nenhuma assinatura informada para push' });
    }

    console.log(
      `[WebPush] Preparando envio para ${subscriptions.length} dispositivo(s)... Título: "${payload?.title}" (Delay: ${delaySeconds || 0}s)`
    );

    const notificationPayload = JSON.stringify({
      title: payload?.title || '⚡ Nova Fatura Lançada — Neo Energia',
      body: payload?.body || 'Sua fatura foi emitida e está disponível no Portal do Cliente.',
      icon: payload?.icon || '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: payload?.tag || `fatura-${Date.now()}`,
      data: payload?.data || { url: '/?tab=portal_cliente' },
    });

    const dispatch = async () => {
      const results = await Promise.allSettled(
        subscriptions.map(async (sub: any) => {
          try {
            const isAppleEndpoint = typeof sub.endpoint === 'string' && sub.endpoint.includes('apple.com');
            const res = await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: sub.keys,
              },
              notificationPayload,
              {
                TTL: 60 * 60 * 24 * 7, // 7 dias de retenção
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
            console.log(
              `[WebPush] Entregue com sucesso! Status: ${res.statusCode} | Endpoint: ${sub.endpoint.slice(0, 45)}...`
            );
            return res;
          } catch (err: unknown) {
            const status = (err as { statusCode?: number }).statusCode;
            console.warn(
              `[WebPush] Falha ao entregar para ${sub.endpoint.slice(0, 45)}... (Status: ${status})`,
              err
            );
            // Se o token expirou (410) ou não existe (404), remove do Firestore
            if (status === 410 || status === 404) {
              try {
                const { getApps } = await import('firebase/app');
                const { getFirestore, collection, getDocs, deleteDoc, query, where } = await import(
                  'firebase/firestore'
                );
                if (getApps().length > 0) {
                  const db = getFirestore(getApps()[0]);
                  const q = query(collection(db, 'push_subscriptions'), where('endpoint', '==', sub.endpoint));
                  const qSnap = await getDocs(q);
                  for (const d of qSnap.docs) {
                    await deleteDoc(d.ref).catch(() => {});
                  }
                }
              } catch {}
            }
            throw err;
          }
        })
      );

      const sentCount = results.filter((r) => r.status === 'fulfilled').length;
      const failedCount = results.filter((r) => r.status === 'rejected').length;
      console.log(
        `[WebPush Resumo] Enviados: ${sentCount} | Falhas: ${failedCount} | Total: ${subscriptions.length}`
      );
      return { sentCount, failedCount };
    };

    const delay = Number(delaySeconds) || 0;
    if (delay > 0) {
      setTimeout(() => {
        dispatch().catch((e) => console.error('[WebPush Delayed] Erro no disparo:', e));
      }, delay * 1000);

      return res.json({
        success: true,
        scheduled: true,
        delaySeconds: delay,
        total: subscriptions.length,
      });
    }

    const { sentCount, failedCount } = await dispatch();
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

/**
 * Rotina automática para alterar o status para 'vencida' (overdue) quando a data atual
 * for maior que a data de vencimento da fatura.
 */
async function checkAndUpdateOverdueInvoices(): Promise<number> {
  try {
    const { initializeApp, getApps } = await import('firebase/app');
    const { getFirestore, collection, getDocs, updateDoc, doc } = await import('firebase/firestore');
    const fs = await import('fs');
    const cfgPath = path.join(__dirname, 'firebase-applet-config.json');
    if (!fs.existsSync(cfgPath)) return 0;
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    const app = getApps().length === 0 ? initializeApp(cfg) : getApps()[0];
    const db = getFirestore(app, cfg.firestoreDatabaseId);

    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const snap = await getDocs(collection(db, 'faturas'));

    let updatedCount = 0;
    for (const d of snap.docs) {
      const data = d.data();
      // Se a fatura estiver pendente e a data atual for estritamente maior que o vencimento
      if (data.status === 'pending' && data.dueDate && todayStr > data.dueDate) {
        await updateDoc(doc(db, 'faturas', d.id), {
          status: 'overdue',
          updatedAt: new Date().toISOString(),
        }).catch((e: unknown) => {
          console.warn(`[AutoOverdue] Falha ao atualizar fatura ${d.id}:`, e);
        });
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      console.log(
        `[AutoOverdue] ${updatedCount} fatura(s) pendente(s) com vencimento expirado atualizada(s) para 'vencida' (Data de hoje: ${todayStr}).`
      );
    }
    return updatedCount;
  } catch (err) {
    console.warn('[AutoOverdue] Erro na rotina de verificação de faturas vencidas:', err);
    return 0;
  }
}

// Rota manual / webhook para disparar a checagem a qualquer momento
app.all('/api/faturas/check-overdue', async (_req: Request, res: Response) => {
  const count = await checkAndUpdateOverdueInvoices();
  res.json({ success: true, updatedCount: count });
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
    // Executa verificação inicial de faturas vencidas no boot do servidor
    checkAndUpdateOverdueInvoices().catch(() => {});
    // Reexecuta periodicamente a cada 30 minutos
    setInterval(() => {
      checkAndUpdateOverdueInvoices().catch(() => {});
    }, 30 * 60 * 1000);
  });
}

startServer();
