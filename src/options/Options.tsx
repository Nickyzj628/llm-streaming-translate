import type { Component } from 'solid-js';
import { createSignal, For, onMount, Show } from 'solid-js';
import browser from 'webextension-polyfill';
import Button from '@/components/Button/Button';
import Input from '@/components/Input/Input';
import Toast from '@/components/Toast/Toast';
import { useToast } from '@/hooks/useToast';
import type { StreamTranslatePortMessage } from '@/types/messages';
import { getAllStorage, setStorage } from '@/utils/storage';
import styles from './Options.module.scss';

interface Preset {
  name: string;
  baseUrl: string;
  model: string;
  body: string;
}

const PRESETS: Preset[] = [
  {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
    body: '{"thinking": {"type": "disabled"}}',
  },
  {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: '~openai/gpt-mini-latest',
    body: '{"reasoning_effort": "minimal"}',
  },
  {
    name: 'Google AI Studio',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'models/gemma-4-31b-it',
    body: '{"reasoning_effort": "minimal"}',
  },
];

const Options: Component = () => {
  const [targetLang, setTargetLang] = createSignal('');
  const [baseUrl, setBaseUrl] = createSignal('');
  const [model, setModel] = createSignal('');
  const [apiKey, setApiKey] = createSignal('');
  const [body, setBody] = createSignal('');
  const [models, setModels] = createSignal<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = createSignal(false);
  const { toast, showToast } = useToast();
  let fileInputRef: HTMLInputElement | undefined;
  const [isTesting, setIsTesting] = createSignal(false);
  let isTestingRef = false;
  let testPortRef: browser.Runtime.Port | null = null;

  const fetchModels = async (
    url: string,
    key: string,
    currentModel: string,
  ): Promise<void> => {
    setIsLoadingModels(true);
    try {
      const endpoint = `${url.replace(/\/$/, '')}/models`;
      const response = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as unknown;
      if (
        !data ||
        typeof data !== 'object' ||
        !Array.isArray((data as Record<string, unknown>).data)
      ) {
        throw new Error('Unexpected response format');
      }
      const ids = (data as { data: Array<{ id?: string }> }).data
        .map((m) => m.id)
        .filter((id): id is string => Boolean(id));
      setModels(ids);
      if (ids.length > 0 && !ids.includes(currentModel)) {
        setModel(ids[0] ?? '');
      }
    } catch (err) {
      showToast(
        `加载模型失败：${err instanceof Error ? err.message : String(err)}`,
        'error',
      );
    } finally {
      setIsLoadingModels(false);
    }
  };

  onMount(() => {
    getAllStorage().then((result) => {
      setTargetLang(result.targetLang);
      setBaseUrl(result.baseUrl);
      setModel(result.model);
      setApiKey(result.apiKey);
      setBody(result.body);
      if (result.baseUrl && result.apiKey) {
        fetchModels(result.baseUrl, result.apiKey, result.model);
      }
    });
  });

  const handlePresetChange = (e: Event): void => {
    const target = e.target as HTMLSelectElement;
    const value = target.value;
    if (!value) return;
    const preset = PRESETS.find((p) => p.name === value);
    if (!preset) return;
    setBaseUrl(preset.baseUrl);
    setModel(preset.model);
    setBody(preset.body);
    setApiKey('');
    setModels([]);
    target.value = '';
  };

  const handleRefreshModels = (): void => {
    if (!baseUrl() || !apiKey()) {
      showToast('请先填写 API Base URL 和 API Key', 'error');
      return;
    }
    fetchModels(baseUrl(), apiKey(), model());
  };

  const handleTestTranslation = (): void => {
    if (isTestingRef) return;
    if (!baseUrl() || !apiKey() || !model()) {
      showToast('请先填写 API Base URL、API Key 和模型', 'error');
      return;
    }

    isTestingRef = true;
    setIsTesting(true);
    testPortRef?.disconnect();

    const port = browser.runtime.connect({ name: 'stream-translate' });
    testPortRef = port;
    let result = '';

    port.onMessage.addListener((message: unknown) => {
      const msg = message as StreamTranslatePortMessage;
      if (msg.type === 'CHUNK') {
        result += msg.chunk;
      } else if (msg.type === 'DONE') {
        showToast(`翻译结果：${result}`, 'success');
        isTestingRef = false;
        setIsTesting(false);
        port.disconnect();
        testPortRef = null;
      } else if (msg.type === 'ERROR') {
        showToast(`测试失败：${msg.error}`, 'error');
        isTestingRef = false;
        setIsTesting(false);
        port.disconnect();
        testPortRef = null;
      }
    });

    port.postMessage({
      type: 'START',
      text: 'The quick brown fox jumps over the lazy dog',
    });
  };

  const handleSave = async (e: Event): Promise<void> => {
    e.preventDefault();
    await setStorage({
      targetLang: targetLang(),
      baseUrl: baseUrl(),
      model: model(),
      apiKey: apiKey(),
      body: body(),
    });
    showToast('设置已保存', 'success');
  };

  const handleExport = async (): Promise<void> => {
    const data = await getAllStorage();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `llm-translate-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportClick = (): void => {
    fileInputRef?.click();
  };

  const handleFileChange = async (e: Event): Promise<void> => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (
        typeof parsed.baseUrl === 'string' &&
        typeof parsed.model === 'string' &&
        typeof parsed.apiKey === 'string' &&
        typeof parsed.body === 'string'
      ) {
        await setStorage({
          baseUrl: parsed.baseUrl,
          model: parsed.model,
          apiKey: parsed.apiKey,
          body: parsed.body,
          targetLang:
            typeof parsed.targetLang === 'string'
              ? parsed.targetLang
              : 'Chinese',
        });
        setBaseUrl(parsed.baseUrl);
        setModel(parsed.model);
        setApiKey(parsed.apiKey);
        setBody(parsed.body);
        setTargetLang(
          typeof parsed.targetLang === 'string' ? parsed.targetLang : 'Chinese',
        );
        if (parsed.baseUrl && parsed.apiKey) {
          fetchModels(parsed.baseUrl, parsed.apiKey, parsed.model);
        }
        showToast('设置已保存', 'success');
      } else {
        alert('配置文件无效：缺少必要字段');
      }
    } catch {
      alert('导入配置失败：无效的 JSON 文件');
    } finally {
      if (fileInputRef) {
        fileInputRef.value = '';
      }
    }
  };

  const modelOptions = () =>
    model() ? Array.from(new Set([model(), ...models()])) : models();

  return (
    <div class={styles.options}>
      <Toast toast={toast()} />

      <header class={styles.header}>
        <h1>LLM Streaming Translator</h1>
        <p>配置你的翻译 API 设置</p>
      </header>

      <form onSubmit={handleSave} class={styles.form}>
        <div class={styles.section}>
          <Input
            label="目标语言"
            id="targetLang"
            name="targetLang"
            placeholder="Chinese"
            spellcheck={false}
            autocomplete="off"
            value={targetLang()}
            onInput={(e) => setTargetLang(e.currentTarget.value)}
          />
          <p class={styles.hint}>可以任意输入语言名称，只要模型能够识别即可</p>
        </div>

        <div class={styles.section}>
          <label for="preset" class={styles.selectLabel}>
            预设
          </label>
          <select
            id="preset"
            name="preset"
            class={styles.select}
            style={{ width: '100%' }}
            onChange={handlePresetChange}
          >
            <option value="">请选择预设</option>
            <For each={PRESETS}>
              {(preset) => <option value={preset.name}>{preset.name}</option>}
            </For>
          </select>
        </div>

        <div class={styles.section}>
          <Input
            label="API Base URL"
            id="baseUrl"
            name="baseUrl"
            placeholder="https://api.openai.com"
            spellcheck={false}
            autocomplete="off"
            value={baseUrl()}
            onInput={(e) => setBaseUrl(e.currentTarget.value)}
          />
          <p class={styles.hint}>
            OpenAI 兼容的 API 端点，例如 https://api.deepseek.com
          </p>
        </div>

        <div class={styles.section}>
          <Input
            label="API Key"
            id="apiKey"
            name="apiKey"
            type="password"
            placeholder="sk-..."
            spellcheck={false}
            autocomplete="off"
            value={apiKey()}
            onInput={(e) => setApiKey(e.currentTarget.value)}
          />
          <p class={styles.hint}>
            你的 API Key 保存在浏览器扩展的本地存储中，仅会发送给你上方配置的
            API 端点。
          </p>
        </div>

        <div class={styles.section}>
          <label for="model" class={styles.selectLabel}>
            模型
          </label>
          <div class={styles.modelRow}>
            <select
              id="model"
              name="model"
              class={styles.select}
              value={model()}
              onChange={(e) => setModel(e.currentTarget.value)}
              disabled={isLoadingModels()}
            >
              <Show when={modelOptions().length === 0}>
                <option value="">配置 Base URL 和 API Key 后加载模型</option>
              </Show>
              <For each={modelOptions()}>
                {(m) => <option value={m}>{m}</option>}
              </For>
            </select>
            <Button
              type="button"
              variant="secondary"
              size="medium"
              onClick={handleRefreshModels}
              disabled={isLoadingModels()}
            >
              {isLoadingModels() ? '加载中...' : '刷新'}
            </Button>
          </div>
        </div>

        <div class={styles.section}>
          <label for="body" class={styles.selectLabel}>
            自定义请求体（JSON）
          </label>
          <textarea
            id="body"
            name="body"
            class={styles.textarea}
            spellcheck={false}
            autocomplete="off"
            rows={4}
            value={body()}
            onInput={(e) => setBody(e.currentTarget.value)}
          />
          <p class={styles.hint}>
            额外的 JSON 字段会合并到 /chat/completions 的请求体中
          </p>
        </div>

        <div class={styles.actions}>
          <Button
            type="button"
            variant="secondary"
            size="large"
            onClick={handleTestTranslation}
            disabled={isTesting()}
          >
            {isTesting() ? '测试中...' : '测试翻译'}
          </Button>
          <Button type="submit" variant="primary" size="large">
            保存设置
          </Button>
        </div>
      </form>

      <div class={styles.importExport}>
        <h3>备份与恢复</h3>
        <div class={styles.importExportActions}>
          <Button
            type="button"
            variant="secondary"
            size="medium"
            onClick={handleExport}
          >
            导出配置
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="medium"
            onClick={handleImportClick}
          >
            导入配置
          </Button>
          <input
            ref={(el) => {
              fileInputRef = el;
            }}
            type="file"
            accept="application/json"
            onChange={handleFileChange}
            class={styles.hiddenInput}
          />
        </div>
      </div>
    </div>
  );
};

export default Options;
