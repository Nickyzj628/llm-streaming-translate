import { chatCompletions } from '@nickyzj2023/utils';
import type { StreamTranslatePortMessage } from '@/types/messages';
import { getStorage } from '@/utils/storage';

type Port = {
  postMessage(message: StreamTranslatePortMessage): void;
};

export async function streamTranslateOverPort(
  text: string,
  port: Port,
): Promise<void> {
  const {
    baseUrl,
    model: modelName,
    apiKey,
    body: customBody,
    targetLang,
  } = await getStorage(['baseUrl', 'model', 'apiKey', 'body', 'targetLang']);

  try {
    const result = await chatCompletions(
      {
        baseURL: baseUrl.replace(/\/$/, ''),
        apiKey,
        model: modelName,
      },
      [
        {
          role: 'system',
          content: `You are a professional, authentic machine translation engine.\nTranslate the Source Text to ${targetLang}.`,
        },
        {
          role: 'user',
          content: `Source Text: ${text}`,
        },
        {
          role: 'user',
          content: `Translated Text:`,
        },
      ],
      {
        stream: true,
        ...JSON.parse(customBody),
      },
    );

    for await (const { content } of result) {
      if (content) {
        port.postMessage({ type: 'CHUNK', chunk: content });
      }
    }

    port.postMessage({ type: 'DONE' });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[LLM Streaming Translator BG] 翻译失败：', errorMessage);
    port.postMessage({ type: 'ERROR', error: errorMessage });
  }
}
