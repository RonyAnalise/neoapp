import { GoogleGenAI, Type } from '@google/genai';

export default async function handler(req: any, res: any) {
  // Configuração de CORS para permitir requisições seguras
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

    const { imageBase64, mimeType } = body || {};
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: 'Nenhuma fotografia do medidor foi informada.' });
    }

    // Proteção contra payload excessivo (limite de 10MB)
    if (imageBase64.length > 10 * 1024 * 1024) {
      return res.status(413).json({ error: 'A fotografia enviada excede o limite seguro de 10MB.' });
    }

    const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    const cleanMime = mimeType || (imageBase64.includes('image/png') ? 'image/png' : 'image/jpeg');

    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
    if (!allowedMimes.includes(cleanMime)) {
      return res.status(400).json({ error: 'Formato de imagem inválido. Formatos suportados: JPEG, PNG, WEBP.' });
    }

    const specificApiKey = (process.env.CUSTOM_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '').trim();

    if (!specificApiKey) {
      console.warn('[Vercel Gemini OCR] GEMINI_API_KEY não configurada na Vercel.');
      return res.status(503).json({
        success: false,
        isApiKeyMissing: true,
        error: 'Chave da API Gemini não configurada na Vercel.',
        details:
          'Para ativar a leitura por foto na Vercel: adicione a variável GEMINI_API_KEY no painel da Vercel (Project Settings > Environment Variables). Você pode continuar digitando a leitura manualmente abaixo.',
      });
    }

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
        console.warn(`[Vercel Gemini OCR] Tentativa com ${modelName} falhou (${err?.message}). Tentando próximo...`);
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

    return res.status(200).json({
      success: true,
      data: parsedData,
    });
  } catch (error: any) {
    console.error('[Vercel Meter OCR] Erro:', error?.message || error);
    return res.status(500).json({
      error: 'Falha ao analisar a foto do medidor com a Inteligência Artificial.',
      details: error?.message || String(error),
    });
  }
}
