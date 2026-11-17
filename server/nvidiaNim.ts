import { GoogleGenAI } from '@google/genai';

export const NVIDIA_DEFAULT_BASE_URL = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';
export const NVIDIA_PRIMARY_MODEL = process.env.NVIDIA_MODEL || 'moonshotai/kimi-k3.1-pro';
export const NVIDIA_KEY_ID = process.env.NVIDIA_KEY_ID || 'af669c02-33b0-4149-a0d9-2a89860715e7';

// Fallback chain inside NVIDIA NIM API when preview-only endpoints return 404/503 on the trial gateway
export const NVIDIA_NIM_FALLBACK_MODELS = [
  'nvidia/nemotron-3-ultra-550b-a55b',
  'nvidia/nemotron-3.5-super-vl-120b-a12b',
  'nvidia/nemotron-3.5-bolt-e4b',
  'google/gemma-4-31b-it'
];

export type NimContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface NimChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | NimContentPart[];
}

export interface NimChatOptions {
  messages: NimChatMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  reasoningEffort?: 'low' | 'medium' | 'high' | 'max';
  timeoutMs?: number;
  jsonMode?: boolean;
}

export interface NimChatResult {
  text: string;
  model: string;
  provider: 'nvidia' | 'gemini';
  latencyMs: number;
}

export function getNvidiaApiKey(): string {
  return (process.env.NVIDIA_API_KEY || '').trim();
}

export function isAiConfigured(): boolean {
  return Boolean(getNvidiaApiKey() || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}

export function getActiveAiProvider(): 'nvidia' | 'gemini' {
  if (getNvidiaApiKey()) return 'nvidia';
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) return 'gemini';
  return 'nvidia';
}

export function extractJsonFromText(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

async function pollNvidiaResult(
  baseUrl: string,
  requestId: string,
  apiKey: string,
  deadline: number
): Promise<any> {
  const statusUrl = `${baseUrl.replace(/\/+$/, '')}/status/${encodeURIComponent(requestId)}`;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 1200));
    const res = await fetch(statusUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json'
      },
      signal: AbortSignal.timeout(Math.max(2000, deadline - Date.now()))
    });
    if (res.status === 202) continue;
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      const err: any = new Error(`NVIDIA NIM polling error (${res.status}): ${errBody.slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    return await res.json();
  }
  const timeoutErr: any = new Error('Tempo limite excedido aguardando fila NVCF da NVIDIA.');
  timeoutErr.status = 504;
  throw timeoutErr;
}

async function invokeSingleNvidiaModel(
  model: string,
  options: NimChatOptions,
  apiKey: string,
  timeoutMs: number
): Promise<{ text: string; model: string }> {
  const baseUrl = NVIDIA_DEFAULT_BASE_URL.replace(/\/+$/, '');
  const endpoint = `${baseUrl}/chat/completions`;
  const deadline = Date.now() + timeoutMs;

  const isKimiSchema = model.startsWith('moonshotai/kimi');
  const body: Record<string, any> = {
    model,
    messages: options.messages,
    max_tokens: options.maxTokens ?? 4096,
    stream: false
  };

  if (isKimiSchema) {
    body.reasoning_effort = options.reasoningEffort ?? 'low';
  } else if (typeof options.temperature === 'number') {
    body.temperature = options.temperature;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });

  let data: any;
  if (res.status === 202) {
    const reqId = res.headers.get('NVCF-REQID') || res.headers.get('nvcf-reqid');
    if (!reqId) {
      const err: any = new Error('Resposta 202 da NVIDIA sem cabeçalho NVCF-REQID.');
      err.status = 502;
      throw err;
    }
    data = await pollNvidiaResult(baseUrl, reqId, apiKey, deadline);
  } else if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const err: any = new Error(`NVIDIA NIM HTTP ${res.status}: ${errText.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  } else {
    data = await res.json();
  }

  const choice = data?.choices?.[0];
  if (!choice) {
    throw new Error('NVIDIA NIM retornou resposta sem choices.');
  }
  const content = choice.message?.content ?? '';
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('NVIDIA NIM retornou conteúdo vazio.');
  }

  return {
    text: options.jsonMode ? extractJsonFromText(content) : content.trim(),
    model: data?.model || model
  };
}

export async function callNvidiaNimChat(options: NimChatOptions): Promise<NimChatResult> {
  const t0 = Date.now();
  const timeoutMs = options.timeoutMs ?? 55000;
  const nvidiaKey = getNvidiaApiKey();

  if (nvidiaKey) {
    const hasImage = options.messages.some(
      m => Array.isArray(m.content) && m.content.some(p => p.type === 'image_url')
    );
    const requestedModel = options.model || NVIDIA_PRIMARY_MODEL;
    const candidateModels = [
      requestedModel,
      ...(hasImage
        ? ['nvidia/nemotron-3.5-super-vl-120b-a12b', 'google/gemma-4-31b-it']
        : NVIDIA_NIM_FALLBACK_MODELS)
    ].filter((m, idx, arr) => Boolean(m) && arr.indexOf(m) === idx);

    let lastError: any = null;
    for (const candidate of candidateModels) {
      try {
        const result = await invokeSingleNvidiaModel(candidate, options, nvidiaKey, timeoutMs);
        const reportedModel =
          requestedModel === 'moonshotai/kimi-k3.1-pro' && candidate !== requestedModel
            ? `moonshotai/kimi-k3.1-pro (${result.model})`
            : result.model;
        return {
          text: result.text,
          model: reportedModel,
          provider: 'nvidia',
          latencyMs: Date.now() - t0
        };
      } catch (err: any) {
        lastError = err;
        const status = Number(err?.status) || 0;
        // If unauthorized (401/403), do not retry other models on the same key
        if (status === 401 || status === 403) break;
      }
    }

    if (!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)) {
      throw lastError || new Error('Falha ao consultar a API NVIDIA NIM.');
    }
  }

  // Secondary fallback to Google Gemini if configured
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    const ai = new GoogleGenAI();
    const geminiModel = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
    const systemMsg = options.messages.find(m => m.role === 'system');
    const userMsgs = options.messages.filter(m => m.role !== 'system');
    const promptText = userMsgs
      .map(m => (typeof m.content === 'string' ? m.content : m.content.map(p => ('text' in p ? p.text : '')).join('\n')))
      .join('\n\n');

    const response = await ai.models.generateContent({
      model: geminiModel,
      contents: promptText,
      config: {
        systemInstruction: typeof systemMsg?.content === 'string' ? systemMsg.content : undefined,
        temperature: options.temperature ?? 0.15,
        maxOutputTokens: options.maxTokens ?? 4096,
        ...(options.jsonMode ? { responseMimeType: 'application/json' } : {})
      }
    });

    const rawText = response.text || '';
    if (!rawText.trim()) throw new Error('Resposta vazia do provedor de IA.');
    return {
      text: options.jsonMode ? extractJsonFromText(rawText) : rawText.trim(),
      model: geminiModel,
      provider: 'gemini',
      latencyMs: Date.now() - t0
    };
  }

  const unconfiguredError: any = new Error('Credencial NVIDIA_API_KEY não configurada no servidor.');
  unconfiguredError.status = 503;
  throw unconfiguredError;
}
