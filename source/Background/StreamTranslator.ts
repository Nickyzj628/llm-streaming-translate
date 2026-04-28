import type { StreamTranslatePortMessage } from '../types/messages';

const API_URL = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-v4-flash';

type Port = {
  postMessage(message: StreamTranslatePortMessage): void;
};

export async function streamTranslateOverPort(
  text: string,
  port: Port,
): Promise<void> {
  const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY as string | undefined;

  if (!apiKey) {
    port.postMessage({
      type: 'ERROR',
      error: 'API key not found. Please set VITE_DEEPSEEK_API_KEY in .env',
    });
    return;
  }

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: `You are a professional, authentic machine translation engine.\nTranslate the Source Text below to Chinese.\nSource Text: ${text}\nTranslated Text:`,
          },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `API request failed: ${response.status} ${response.statusText}`,
      );
    }

    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.delta?.content as
            | string
            | undefined;
          if (content) {
            port.postMessage({ type: 'CHUNK', chunk: content });
          }
        } catch {
          // ignore malformed SSE lines
        }
      }
    }

    port.postMessage({ type: 'DONE' });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[LLM Translate BG] Translation failed:', errorMessage);
    port.postMessage({ type: 'ERROR', error: errorMessage });
  }
}
