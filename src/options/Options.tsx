import type { ChangeEvent, FC, FormEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import browser from 'webextension-polyfill';
import Button from '@/components/Button/Button';
import Input from '@/components/Input/Input';
import Toast from '@/components/Toast/Toast';
import { useToast } from '@/hooks/useToast';
import type { StreamTranslatePortMessage } from '@/types/messages';
import { getAllStorage, setStorage } from '@/utils/storage';
import styles from './Options.module.scss';

const Options: FC = () => {
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [body, setBody] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const { toast, showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isTesting, setIsTesting] = useState(false);
  const isTestingRef = useRef(false);
  const testPortRef = useRef<browser.Runtime.Port | null>(null);

  const fetchModels = useCallback(
    async (url: string, key: string, currentModel: string): Promise<void> => {
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
    },
    [showToast],
  );

  useEffect(() => {
    getAllStorage().then((result) => {
      setBaseUrl(result.baseUrl);
      setModel(result.model);
      setApiKey(result.apiKey);
      setBody(result.body);
      if (result.baseUrl && result.apiKey) {
        fetchModels(result.baseUrl, result.apiKey, result.model);
      }
    });

    return () => {
      testPortRef.current?.disconnect();
      testPortRef.current = null;
    };
  }, [fetchModels]);

  const handleRefreshModels = useCallback((): void => {
    if (!baseUrl || !apiKey) {
      showToast('请先填写 API Base URL 和 API Key', 'error');
      return;
    }
    fetchModels(baseUrl, apiKey, model);
  }, [baseUrl, apiKey, model, fetchModels, showToast]);

  const handleTestTranslation = useCallback((): void => {
    if (isTestingRef.current) return;
    if (!baseUrl || !apiKey || !model) {
      showToast('请先填写 API Base URL、API Key 和模型', 'error');
      return;
    }

    isTestingRef.current = true;
    setIsTesting(true);
    testPortRef.current?.disconnect();

    const port = browser.runtime.connect({ name: 'stream-translate' });
    testPortRef.current = port;
    let result = '';

    port.onMessage.addListener((message: unknown) => {
      const msg = message as StreamTranslatePortMessage;
      if (msg.type === 'CHUNK') {
        result += msg.chunk;
      } else if (msg.type === 'DONE') {
        showToast(`翻译结果：${result}`, 'success');
        isTestingRef.current = false;
        setIsTesting(false);
        port.disconnect();
        testPortRef.current = null;
      } else if (msg.type === 'ERROR') {
        showToast(`测试失败：${msg.error}`, 'error');
        isTestingRef.current = false;
        setIsTesting(false);
        port.disconnect();
        testPortRef.current = null;
      }
    });

    port.postMessage({
      type: 'START',
      text: 'The quick brown fox jumps over the lazy dog',
    });
  }, [baseUrl, apiKey, model, showToast]);

  const handleSave = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    await setStorage({ baseUrl, model, apiKey, body });
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
    fileInputRef.current?.click();
  };

  const handleFileChange = async (
    e: ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const file = e.target.files?.[0];
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
        });
        setBaseUrl(parsed.baseUrl);
        setModel(parsed.model);
        setApiKey(parsed.apiKey);
        setBody(parsed.body);
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
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const modelOptions = model ? Array.from(new Set([model, ...models])) : models;

  return (
    <div className={styles.options}>
      <Toast toast={toast} />

      <header className={styles.header}>
        <h1>LLM Streaming Translator</h1>
        <p>配置你的翻译 API 设置</p>
      </header>

      <form onSubmit={handleSave} className={styles.form}>
        <div className={styles.section}>
          <Input
            label="API Base URL"
            id="baseUrl"
            name="baseUrl"
            placeholder="https://api.openai.com"
            spellCheck={false}
            autoComplete="off"
            value={baseUrl}
            onChange={(e): void => setBaseUrl(e.target.value)}
          />
          <p className={styles.hint}>
            OpenAI 兼容的 API 端点，例如 https://api.deepseek.com
          </p>
        </div>

        <div className={styles.section}>
          <Input
            label="API Key"
            id="apiKey"
            name="apiKey"
            type="password"
            placeholder="sk-..."
            spellCheck={false}
            autoComplete="off"
            value={apiKey}
            onChange={(e): void => setApiKey(e.target.value)}
          />
          <p className={styles.hint}>
            你的 API Key 保存在浏览器扩展的本地存储中，仅会发送给你上方配置的
            API 端点。
          </p>
        </div>

        <div className={styles.section}>
          <label htmlFor="model" className={styles.selectLabel}>
            模型
          </label>
          <div className={styles.modelRow}>
            <select
              id="model"
              name="model"
              className={styles.select}
              value={model}
              onChange={(e): void => setModel(e.target.value)}
              disabled={isLoadingModels}
            >
              {modelOptions.length === 0 && (
                <option value="">配置 Base URL 和 API Key 后加载模型</option>
              )}
              {modelOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="secondary"
              size="medium"
              onClick={handleRefreshModels}
              disabled={isLoadingModels}
            >
              {isLoadingModels ? '加载中...' : '刷新'}
            </Button>
          </div>
        </div>

        <div className={styles.section}>
          <label htmlFor="body" className={styles.selectLabel}>
            自定义请求体（JSON）
          </label>
          <textarea
            id="body"
            name="body"
            className={styles.textarea}
            placeholder='{"thinking": {"type": "disabled"}}'
            spellCheck={false}
            autoComplete="off"
            rows={4}
            value={body}
            onChange={(e): void => setBody(e.target.value)}
          />
          <p className={styles.hint}>
            额外的 JSON 字段会合并到 /chat/completions 的请求体中
          </p>
        </div>

        <div className={styles.actions}>
          <Button
            type="button"
            variant="secondary"
            size="large"
            onClick={handleTestTranslation}
            disabled={isTesting}
          >
            {isTesting ? '测试中...' : '测试翻译'}
          </Button>
          <Button type="submit" variant="primary" size="large">
            保存设置
          </Button>
        </div>
      </form>

      <div className={styles.importExport}>
        <h3>备份与恢复</h3>
        <div className={styles.importExportActions}>
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
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={handleFileChange}
            className={styles.hiddenInput}
          />
        </div>
      </div>
    </div>
  );
};

export default Options;
