import { parseServerSentEvents } from 'parse-sse';
import type { StreamTranslatePortMessage } from '@/types/messages';
import { getStorage } from '@/utils/storage';

type Port = {
  postMessage(message: StreamTranslatePortMessage): void;
};

export async function streamTranslateOverPort(
  text: string,
  port: Port,
): Promise<void> {
  const { baseUrl, model, apiKey, body, targetLang } = await getStorage([
    'baseUrl',
    'model',
    'apiKey',
    'body',
    'targetLang',
  ]);

  if (!apiKey) {
    port.postMessage({
      type: 'ERROR',
      error: 'API Key 未配置，请在扩展选项中设置。',
    });
    return;
  }

  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

  const requestBody: Record<string, unknown> = {
    model,
    messages: [
      {
        role: 'system',
        content: `你是一个只输出目标语言的翻译器。目标语言：${targetLang}。
        在输出前，你必须先判断输入语言是否等于目标语言。
        然后严格按下面规则输出：
        - 若不等于 → 完整翻译成目标语言，保留所有语气、表情、换行。
        - 若等于 → 提取核心信息，最精简输出。
        严禁输出原文，严禁输出任何非目标语言的内容。`,
      },
      {
        role: 'user',
        content: text,
      },
    ],
    stream: true,
  };

  if (body) {
    try {
      const customBody = JSON.parse(body) as Record<string, unknown>;
      Object.assign(requestBody, customBody);
    } catch {
      port.postMessage({
        type: 'ERROR',
        error: '自定义请求体 JSON 格式无效，请检查 Body 字段。',
      });
      return;
    }
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(
        `API request failed: ${response.status} ${response.statusText}`,
      );
    }

    for await (const event of parseServerSentEvents(response)) {
      if (event.data === '[DONE]') {
        continue;
      }

      try {
        const json = JSON.parse(event.data);
        const content = json.choices?.[0]?.delta?.content as string | undefined;
        if (content) {
          port.postMessage({ type: 'CHUNK', chunk: content });
        }
      } catch {
        // ignore malformed JSON in SSE data
      }
    }

    port.postMessage({ type: 'DONE' });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[LLM Streaming Translator BG] 翻译失败：', errorMessage);
    port.postMessage({ type: 'ERROR', error: errorMessage });
  }
}
