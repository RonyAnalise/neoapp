import express, { Request, Response } from 'express';
import webpush from 'web-push';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

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

/**
 * Endpoint de Leitura com Inteligência Artificial do Medidor de Energia
 * Utiliza o modelo gemini-3.8-flash com visão computacional para ler o display
 * e identificar o consumo acumulado em kWh do cliente.
 */
app.post('/api/meter/read', async (req: Request, res: Response) => {
  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: 'Nenhuma fotografia do medidor foi informada.' });
    }

    // Proteção contra Denial of Service e Exaustão de Memória: Limite estrito de 10MB
    if (imageBase64.length > 10 * 1024 * 1024) {
      return res.status(413).json({ error: 'A fotografia enviada excede o limite seguro de 10MB.' });
    }

    const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    const cleanMime = mimeType || (imageBase64.includes('image/png') ? 'image/png' : 'image/jpeg');

    // Validação estrita de tipos MIME permitidos
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
    if (!allowedMimes.includes(cleanMime)) {
      return res.status(400).json({ error: 'Formato de imagem inválido. Formatos suportados: JPEG, PNG, WEBP.' });
    }

    // Validação estrutural do Base64 para mitigar ataques de injeção de payload
    if (!/^[A-Za-z0-9+/=]+$/.test(cleanBase64.slice(0, 500))) {
      return res.status(400).json({ error: 'Dados da imagem corrompidos ou em formato inválido.' });
    }

    const specificApiKey = (process.env.CUSTOM_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '').trim();

    if (!specificApiKey) {
      console.warn('[Gemini OCR] GEMINI_API_KEY não encontrada no ambiente de execução.');
      return res.status(503).json({
        success: false,
        isApiKeyMissing: true,
        error: 'Chave da API Gemini não configurada no ambiente.',
        details: 'A chave da API Gemini não foi vinculada nas configurações de segredos (Secrets) do ambiente publicado. Você pode digitar a leitura diretamente no campo manual abaixo para continuar sem interrupção.',
      });
    }

    const { GoogleGenAI, Type } = await import('@google/genai');

    const ai = new GoogleGenAI({
      apiKey: specificApiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const promptText = `Você é um leitor óptico especialista em medidores de energia elétrica residenciais e comerciais (padrão concessionárias brasileiras: Coelba, Neoenergia, Enel, Cemig, CPFL, Equatorial, etc.).
Analise a fotografia do medidor de energia com atenção aos números mostrados no mostrador digital (LCD) ou analógico (ciclômetro com roletes).

Instruções fundamentais:
1. Extraia o valor numérico principal da leitura acumulada em kWh.
   - Em mostradores digitais: leia a sequência de dígitos exibida no visor.
   - Em mostradores analógicos/mecânicos com roletes: leia os números pretos da esquerda para a direita (ignore o último dígito vermelho após a vírgula fracionária, se houver).
2. Se visível no corpo ou na plaqueta do medidor, extraia o número de série/código do medidor (ex: "Nº 1234567"). Se não estiver nítido, retorne null.
3. Avalie a certeza da leitura como "high" (excelente nitidez), "medium" (razoável) ou "low" (muito embaçado/duvidoso).
4. Forneça uma explicação concisa e amigável em português explicando exatamente o que foi visualizado. Se a foto não for de um medidor ou estiver completamente ilegível, informe educadamente o motivo e sugira tirar uma nova foto mais nítida e iluminada.`;

    const modelsToTry = ['gemini-3.8-flash', 'gemini-3.1-flash-lite'];
    let lastError: any = null;
    let response: any = null;

    for (const modelName of modelsToTry) {
      try {
        response = await ai.models.generateContent({
          model: modelName,
          contents: {
            parts: [
              {
                inlineData: {
                  data: cleanBase64,
                  mimeType: cleanMime,
                },
              },
              {
                text: promptText,
              },
            ],
          },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                readingValue: {
                  type: Type.NUMBER,
                  description: 'O valor numérico inteiro acumulado em kWh lido no visor do medidor.',
                },
                meterNumber: {
                  type: Type.STRING,
                  description: 'O número de série/código do medidor, se visível.',
                },
                confidence: {
                  type: Type.STRING,
                  description: 'Grau de confiança da leitura: high, medium ou low.',
                },
                notes: {
                  type: Type.STRING,
                  description: 'Explicação amigável em português indicando onde os dígitos foram identificados.',
                },
              },
              required: ['confidence', 'notes'],
            },
          },
        });
        if (response && response.text) {
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[Gemini OCR] Tentativa com modelo ${modelName} falhou (${err?.message}). Tentando próximo modelo...`);
      }
    }

    if (!response || !response.text) {
      throw lastError || new Error('Não foi possível obter resposta dos modelos de visão.');
    }

    const rawText = response.text || '{}';
    let parsedData: any = {};
    try {
      parsedData = JSON.parse(rawText);
    } catch {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) parsedData = JSON.parse(match[0]);
    }

    return res.json({
      success: true,
      data: parsedData,
    });
  } catch (error: any) {
    console.error('[Gemini Meter OCR] Erro ao ler foto do medidor:', error?.message || 'Erro interno');
    return res.status(500).json({
      error: 'Falha ao analisar a foto do medidor com a Inteligência Artificial. Por favor, tente novamente.',
      details: error?.message || String(error),
    });
  }
});

/**
 * Rotina automática para excluir fotos de medidores após 30 dias de armazenamento.
 * Garante a privacidade do cliente e a otimização do banco de dados Firestore.
 */
async function cleanupExpiredMeterPhotos(): Promise<number> {
  try {
    const { initializeApp, getApps } = await import('firebase/app');
    const { getFirestore, collection, getDocs, updateDoc, doc } = await import('firebase/firestore');
    const fs = await import('fs');
    const cfgPath = path.join(__dirname, 'firebase-applet-config.json');
    if (!fs.existsSync(cfgPath)) return 0;
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    const app = getApps().length === 0 ? initializeApp(cfg) : getApps()[0];
    const db = getFirestore(app, cfg.firestoreDatabaseId);

    const now = new Date();
    let cleanedCount = 0;

    // 1. Limpa fotos expiradas em 'faturas'
    const faturasSnap = await getDocs(collection(db, 'faturas'));
    for (const d of faturasSnap.docs) {
      const data = d.data();
      if (data.meterPhotoBase64) {
        let isExpired = false;
        if (data.meterPhotoExpiresAt) {
          isExpired = new Date(data.meterPhotoExpiresAt) <= now;
        } else if (data.meterPhotoUploadedAt) {
          const uploaded = new Date(data.meterPhotoUploadedAt).getTime();
          isExpired = (now.getTime() - uploaded) >= 30 * 24 * 60 * 60 * 1000;
        }
        if (isExpired) {
          await updateDoc(doc(db, 'faturas', d.id), {
            meterPhotoBase64: null,
            meterPhotoDeletedAt: now.toISOString(),
          }).catch((e: unknown) => {
            console.warn(`[PhotoCleaner] Erro ao remover foto da fatura ${d.id}:`, e);
          });
          cleanedCount++;
        }
      }
    }

    // 2. Limpa fotos expiradas em 'leituras'
    const leiturasSnap = await getDocs(collection(db, 'leituras'));
    for (const d of leiturasSnap.docs) {
      const data = d.data();
      if (data.meterPhotoBase64) {
        let isExpired = false;
        if (data.meterPhotoExpiresAt) {
          isExpired = new Date(data.meterPhotoExpiresAt) <= now;
        } else if (data.meterPhotoUploadedAt) {
          const uploaded = new Date(data.meterPhotoUploadedAt).getTime();
          isExpired = (now.getTime() - uploaded) >= 30 * 24 * 60 * 60 * 1000;
        }
        if (isExpired) {
          await updateDoc(doc(db, 'leituras', d.id), {
            meterPhotoBase64: null,
            meterPhotoDeletedAt: now.toISOString(),
          }).catch((e: unknown) => {
            console.warn(`[PhotoCleaner] Erro ao remover foto da leitura ${d.id}:`, e);
          });
          cleanedCount++;
        }
      }
    }

    if (cleanedCount > 0) {
      console.log(`[PhotoCleaner] ${cleanedCount} foto(s) de medidores com mais de 30 dias foram excluídas.`);
    }
    return cleanedCount;
  } catch (err) {
    console.warn('[PhotoCleaner] Erro ao limpar fotos de medidores expiradas:', err);
    return 0;
  }
}

// Endpoint manual para acionar a limpeza de fotos expiradas
app.all('/api/meter/cleanup-photos', async (_req: Request, res: Response) => {
  const count = await cleanupExpiredMeterPhotos();
  res.json({ success: true, cleanedCount: count });
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
    // Limpa fotos de medidores com mais de 30 dias no boot do servidor
    cleanupExpiredMeterPhotos().catch(() => {});

    // Reexecuta periodicamente a cada 30 minutos a checagem de vencimento
    setInterval(() => {
      checkAndUpdateOverdueInvoices().catch(() => {});
    }, 30 * 60 * 1000);

    // Reexecuta periodicamente a cada 6 horas a limpeza de fotos expiradas
    setInterval(() => {
      cleanupExpiredMeterPhotos().catch(() => {});
    }, 6 * 60 * 60 * 1000);
  });
}

startServer();
