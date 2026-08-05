import type { Component } from "solid-js";
import { createMemo, createSignal, For, onCleanup, onMount } from "solid-js";
import browser from "webextension-polyfill";
import Button from "../components/Button/Button";
import Combobox from "../components/Combobox/Combobox";
import Input from "../components/Input/Input";
import Toast from "../components/Toast/Toast";
import { useToast } from "../hooks/useToast";
import type { StreamTranslatePortMessage } from "../types/messages";
import { stripNoTranslateTags } from "../utils/protocol";
import { getAllStorage, setStorage } from "../utils/storage";
import styles from "./Options.module.css";

interface Preset {
	name: string;
	baseUrl: string;
	model: string;
	apiKey?: string;
	body: string;
}

const PRESETS: Preset[] = [
	{
		name: "DeepSeek",
		baseUrl: "https://api.deepseek.com",
		model: "deepseek-v4-flash",
		body: '{"thinking": {"type": "disabled"}}',
	},
	{
		name: "OpenRouter",
		baseUrl: "https://openrouter.ai/api/v1",
		model: "openai/gpt-5.6-luna",
		body: '{"reasoning_effort": "minimal"}',
	},
	{
		name: "Google AI Studio",
		baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
		model: "gemma-4-26b-a4b-it",
		body: '{"reasoning_effort": "minimal"}',
	},
	{
		name: "llama.cpp",
		baseUrl: "http://127.0.0.1:11434/v1",
		model: "",
		apiKey: "",
		body: '{"chat_template_kwargs": {"enable_thinking": false}}',
	},
];

// 测试板块的默认文本节点：与 StreamTranslator.ts 的 system prompt 示例保持一致，
// 覆盖三种协议形态（整行翻译 / 部分选中 / 全照抄）。
// 每个元素 = 一个文本节点（协议的一行，翻译时逐行写回）
const TEST_SAMPLE = [
	"- From Wikipedia, the free encyclopedia.",
	"- <NO_TRANSLATE>The quick brown fox jumps over the lazy dog</NO_TRANSLATE> is an English-language pangram",
	"- it contains all 26 letters of the English alphabet",
];

const App: Component = () => {
	const [targetLang, setTargetLang] = createSignal("");
	const [baseUrl, setBaseUrl] = createSignal("");
	const [model, setModel] = createSignal("");
	const [apiKey, setApiKey] = createSignal("");
	const [body, setBody] = createSignal("");
	const [models, setModels] = createSignal<string[]>([]);
	const [isLoadingModels, setIsLoadingModels] = createSignal(false);
	const { toast, showToast } = useToast();
	let fileInputRef: HTMLInputElement | undefined;
	const [isTesting, setIsTesting] = createSignal(false);
	// 测试板块的文本节点列表（每个元素 = 一行协议输入），翻译过程中被逐行流式替换为译文
	const [testSource, setTestSource] = createSignal<string[]>(TEST_SAMPLE);
	let testPortRef: browser.Runtime.Port | null = null;
	let testTimeout: ReturnType<typeof setTimeout> | null = null;
	let fetchAbortController: AbortController | null = null;

	const fetchModels = async (
		url: string,
		key: string,
		currentModel: string,
	): Promise<void> => {
		fetchAbortController?.abort();
		fetchAbortController = new AbortController();
		setIsLoadingModels(true);
		try {
			const endpoint = `${url.replace(/\/$/, "")}/models`;
			const response = await fetch(endpoint, {
				headers: { Authorization: `Bearer ${key}` },
				signal: fetchAbortController.signal,
			});
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}
			const data: unknown = await response.json();
			if (
				!data ||
				typeof data !== "object" ||
				!("data" in data) ||
				!Array.isArray((data as Record<string, unknown>).data)
			) {
				throw new Error("Unexpected response format");
			}
			const ids = (data as { data: Array<{ id?: string }> }).data
				.map((m) => m.id)
				.filter((id): id is string => Boolean(id));
			setModels(ids);
			if (ids.length > 0 && !ids.includes(currentModel)) {
				setModel(ids[0] ?? "");
			}
		} catch (err) {
			if (err instanceof DOMException && err.name === "AbortError") return;
			showToast(
				`加载模型失败：${err instanceof Error ? err.message : String(err)}`,
				"error",
			);
		} finally {
			setIsLoadingModels(false);
		}
	};

	// 页面挂载时只回填已保存的配置，不自动拉取模型列表：
	// 部分供应商没有 /models 接口或端点较慢，统一由用户点击"刷新"按钮手动触发
	onMount(() => {
		getAllStorage().then((result) => {
			setTargetLang(result.targetLang);
			setBaseUrl(result.baseUrl);
			setModel(result.model);
			setApiKey(result.apiKey);
			setBody(result.body);
		});
	});

	onCleanup(() => {
		testPortRef?.disconnect();
		testPortRef = null;
		if (testTimeout) {
			clearTimeout(testTimeout);
			testTimeout = null;
		}
		fetchAbortController?.abort();
		fetchAbortController = null;
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
		setApiKey(preset.apiKey ?? "");
		setModels([]);
		target.value = "";
	};

	const handleRefreshModels = (): void => {
		if (!baseUrl()) {
			showToast("请先填写 API Base URL", "error");
			return;
		}
		if (!apiKey()) {
			showToast("请先填写 API Key", "error");
			return;
		}
		fetchModels(baseUrl(), apiKey(), model());
	};

	// 更新指定文本节点的输入内容（Solid 不可变更新：map 出新数组）
	const updateTestLine = (index: number, value: string): void => {
		setTestSource((prev) => prev.map((line, i) => (i === index ? value : line)));
	};

	// 添加一个空的文本节点输入框
	const addTestLine = (): void => {
		setTestSource((prev) => [...prev, ""]);
	};

	// 复原：把测试输入重置为默认示例 TEST_SAMPLE
	const resetTestSource = (): void => {
		setTestSource(TEST_SAMPLE);
	};

	const handleTestTranslation = (): void => {
		if (isTesting()) return;
		if (!baseUrl() || !model()) {
			showToast("请先填写 API Base URL 和模型", "error");
			return;
		}

		// 记住原文行数组：翻译失败/超时时恢复，模拟真实划词翻译失败回滚原文的行为
		const originalLines = testSource();
		if (originalLines.every((line) => line.trim() === "")) {
			showToast("请先输入原文", "error");
			return;
		}

		setIsTesting(true);
		testPortRef?.disconnect();
		if (testTimeout) {
			clearTimeout(testTimeout);
			testTimeout = null;
		}

		const port = browser.runtime.connect({ name: "stream-translate" });
		testPortRef = port;
		let result = "";

		testTimeout = setTimeout(() => {
			showToast("测试翻译超时", "error");
			setTestSource(originalLines);
			setIsTesting(false);
			port.disconnect();
			testPortRef = null;
			testTimeout = null;
		}, 30000);

		port.onMessage.addListener((message: unknown) => {
			const msg = message as StreamTranslatePortMessage;
			if (msg.type === "CHUNK") {
				result += msg.chunk;
				// 流式替换：把累积输出按行去掉标签字符（内容保留）后逐行写回对应输入框，
				// 模拟真实划词页面中"未选中部分保持原文 + 选中部分被译文替换"的整体效果。
				// 注意这里不能用 extractTranslatedContent（它会丢弃标签内容，那是 content 端
				// 写回选中锚点用的；测试板块没有 DOM 原文兜底，需要保留标签内容）。
				const translatedLines = result
					.split("\n")
					.map((line) => stripNoTranslateTags(line));
				setTestSource((prev) =>
					prev.map((original, i) => {
						const translated = translatedLines[i];
						// 模型尚未输出该行（越界）或输出为空行时不写回，保持原文
						return translated !== undefined && translated.trim() !== ""
							? translated
							: original;
					}),
				);
			} else if (msg.type === "DONE") {
				if (testTimeout) {
					clearTimeout(testTimeout);
					testTimeout = null;
				}
				showToast("翻译完成", "success");
				setIsTesting(false);
				port.disconnect();
				testPortRef = null;
			} else if (msg.type === "ERROR") {
				if (testTimeout) {
					clearTimeout(testTimeout);
					testTimeout = null;
				}
				showToast(`测试失败：${msg.error}`, "error");
				// 失败恢复原文行，避免输入框残留半截译文
				setTestSource(originalLines);
				setIsTesting(false);
				port.disconnect();
				testPortRef = null;
			}
		});

		port.postMessage({ type: "START", text: originalLines.join("\n") });
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
		showToast("设置已保存", "success");
	};

	const handleExport = async (): Promise<void> => {
		const data = await getAllStorage();
		const blob = new Blob([JSON.stringify(data, null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `llm-translate-config-${new Date().toISOString().slice(0, 10)}.json`;
		a.click();
		URL.revokeObjectURL(url);
		showToast("配置已导出，文件包含 API Key，请妥善保存勿分享", "success");
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
				typeof parsed.baseUrl === "string" &&
				typeof parsed.model === "string" &&
				typeof parsed.apiKey === "string" &&
				typeof parsed.body === "string"
			) {
				await setStorage({
					baseUrl: parsed.baseUrl,
					model: parsed.model,
					apiKey: parsed.apiKey,
					body: parsed.body,
					targetLang:
						typeof parsed.targetLang === "string" ? parsed.targetLang : "简体中文",
				});
				setBaseUrl(parsed.baseUrl);
				setModel(parsed.model);
				setApiKey(parsed.apiKey);
				setBody(parsed.body);
				setTargetLang(
					typeof parsed.targetLang === "string" ? parsed.targetLang : "简体中文",
				);
				// 导入后不自动拉取模型列表，统一由用户点击"刷新"按钮手动触发
				showToast("设置已保存", "success");
			} else {
				alert("配置文件无效：缺少必要字段");
			}
		} catch {
			alert("导入配置失败：无效的 JSON 文件");
		} finally {
			if (fileInputRef) {
				fileInputRef.value = "";
			}
		}
	};

	const modelOptions = createMemo(() => {
		const current = model();
		const list = models();
		if (!current) return list;
		if (list.includes(current)) return list;
		return [current, ...list];
	});

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
						placeholder="简体中文"
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
						style={{ width: "100%" }}
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
						你的 API Key 保存在浏览器扩展的本地存储中，仅会发送给你上方配置的接口。
					</p>
				</div>

				<div class={styles.section}>
					<label for="model" class={styles.selectLabel}>
						模型
					</label>
					<div class={styles.modelRow}>
						{/* 自定义下拉组件：既可从"刷新"拉取的模型列表中点选，
						    也可直接手动输入模型名，适配没有 /models 接口的供应商。
						    点右侧箭头或聚焦输入框展开全部候选，输入关键字实时过滤 */}
						<Combobox
							class={styles.modelCombobox}
							value={model()}
							options={modelOptions()}
							placeholder="选择或手动输入模型名"
							onChange={setModel}
						/>
						<Button
							type="button"
							variant="secondary"
							size="medium"
							onClick={handleRefreshModels}
							disabled={isLoadingModels()}
						>
							{isLoadingModels() ? "加载中..." : "刷新"}
						</Button>
					</div>
					<p class={styles.hint}>
						点击右侧箭头或聚焦输入框展开模型列表，输入关键字可过滤；也可直接手动输入模型名
					</p>
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
					<Button type="submit" variant="primary" size="large">
						保存设置
					</Button>
				</div>
			</form>

			<div class={styles.testPanel}>
				<h3>测试翻译</h3>
				<p class={styles.hint}>
					每个输入框代表一个文本节点，{"<NO_TRANSLATE>"}标出不翻译的部分。
				</p>
				<ul class={styles.testNodeList}>
					<For each={testSource()}>
						{(line, i) => (
							<li>
								<input
									type="text"
									class={styles.textNodeInput}
									spellcheck={false}
									autocomplete="off"
									value={line}
									onInput={(e) => updateTestLine(i(), e.currentTarget.value)}
								/>
							</li>
						)}
					</For>
				</ul>
				<div class={styles.testActions}>
					<Button
						type="button"
						variant="secondary"
						size="medium"
						onClick={handleTestTranslation}
						disabled={isTesting()}
					>
						{isTesting() ? "翻译中..." : "开始翻译"}
					</Button>
					<Button
						type="button"
						variant="secondary"
						size="medium"
						onClick={addTestLine}
						disabled={isTesting()}
					>
						添加文本节点
					</Button>
					<Button
						type="button"
						variant="secondary"
						size="medium"
						onClick={resetTestSource}
						disabled={isTesting()}
					>
						复原
					</Button>
				</div>
			</div>

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

export default App;
