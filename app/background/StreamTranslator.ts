import { chatCompletions } from '@nickyzj2023/utils';
import type browser from 'webextension-polyfill';
import { getStorage } from '@/utils/storage';

export async function streamTranslateOverPort(
  text: string,
  port: browser.Runtime.Port,
): Promise<void> {
  const {
    baseUrl,
    model: modelName,
    apiKey,
    body: customBody,
    targetLang,
  } = await getStorage(['baseUrl', 'model', 'apiKey', 'body', 'targetLang']);

  if (!baseUrl) {
    port.postMessage({ type: 'ERROR', error: 'API Base URL 未配置，请在选项页面中设置' });
    return;
  }

  if (!modelName) {
    port.postMessage({ type: 'ERROR', error: '模型未配置，请在选项页面中设置' });
    return;
  }

  let extraBody: Record<string, unknown> = {};
  if (customBody) {
    try {
      extraBody = JSON.parse(customBody) as Record<string, unknown>;
    } catch {
      port.postMessage({ type: 'ERROR', error: '自定义请求体 JSON 格式无效' });
      return;
    }
  }

  try {
    const result = await chatCompletions(
      {
        baseUrl: baseUrl.replace(/\/$/, ''),
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
        ...extraBody,
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
