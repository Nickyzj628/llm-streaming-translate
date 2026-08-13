import type { Component } from "solid-js";
import { createMemo, createSignal, For, onCleanup, onMount } from "solid-js";
import Button from "../components/Button/Button";
import Combobox from "../components/Combobox/Combobox";
import Input from "../components/Input/Input";
import Toast from "../components/Toast/Toast";
import { useToast } from "../hooks/useToast";
import { defaultStorage } from "../types/storage";
import styles from "./App.module.css";
import ImportExportPanel from "./components/ImportExportPanel";
import TestPanel from "./components/TestPanel";
import { useOptionsForm } from "./hooks/useOptionsForm";
import { PRESETS } from "./utils/constants";
import type { ImportableConfig } from "./utils/importExport";
import { fetchModels } from "./utils/model";

const App: Component = () => {
	const { form, setForm, loadFromStorage, saveToStorage } = useOptionsForm();
	const [models, setModels] = createSignal<string[]>([]);
	const [isLoadingModels, setIsLoadingModels] = createSignal(false);
	const { toast, showToast } = useToast();
	let fetchAbortController: AbortController | null = null;

	// 页面挂载时只回填已保存的配置，不自动拉取模型列表：
	// 部分供应商没有 /models 接口或端点较慢，统一由用户点击"刷新"按钮手动触发
	onMount(() => {
		loadFromStorage();
	});

	onCleanup(() => {
		fetchAbortController?.abort();
		fetchAbortController = null;
	});

	const handlePresetChange = (e: Event): void => {
		const target = e.target as HTMLSelectElement;
		const value = target.value;
		if (!value) return;
		const preset = PRESETS.find((p) => p.name === value);
		if (!preset) return;
		setForm({
			baseUrl: preset.baseUrl,
			model: preset.model,
			body: preset.body,
			apiKey: preset.apiKey ?? "",
		});
		setModels([]);
		target.value = "";
	};

	const handleRefreshModels = async (): Promise<void> => {
		if (!form.baseUrl) {
			showToast("请先填写 API Base URL", "error");
			return;
		}
		if (!form.apiKey) {
			showToast("请先填写 API Key", "error");
			return;
		}

		// 取消上一次未完成的请求，避免竞态：快速连续点击时只保留最后一次
		fetchAbortController?.abort();
		const handle = fetchModels(form.baseUrl, form.apiKey);
		fetchAbortController = handle.controller;
		setIsLoadingModels(true);
		try {
			const ids = await handle.promise;
			setModels(ids);
			// 只在模型名为空时自动选用第一个候选。用户手动输入的模型名
			//（供应商可能没有 /models 接口）不应被刷新结果覆盖，
			// 否则会悄悄替换掉用户辛苦敲进去的自定义模型名。
			if (ids.length > 0 && !form.model) {
				setForm({ model: ids[0] ?? "" });
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

	const handleSave = async (e: Event): Promise<void> => {
		e.preventDefault();
		await saveToStorage();
		showToast("设置已保存", "success");
	};

	// 导入成功后回填表单字段（模型列表不自动拉取，由用户点"刷新"触发）
	const handleImport = (config: ImportableConfig): void => {
		setForm({
			baseUrl: config.baseUrl,
			model: config.model,
			apiKey: config.apiKey,
			body: config.body,
			targetLang: config.targetLang ?? defaultStorage.targetLang,
		});
	};

	const modelOptions = createMemo(() => {
		const current = form.model;
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
						value={form.targetLang}
						onInput={(e) => setForm("targetLang", e.currentTarget.value)}
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
						value={form.baseUrl}
						onInput={(e) => setForm("baseUrl", e.currentTarget.value)}
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
						value={form.apiKey}
						onInput={(e) => setForm("apiKey", e.currentTarget.value)}
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
							value={form.model}
							options={modelOptions()}
							placeholder="选择或手动输入模型名"
							onChange={(v) => setForm("model", v)}
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
						value={form.body}
						onInput={(e) => setForm("body", e.currentTarget.value)}
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

			{/* 非核心板块抽成独立组件，保持 App.tsx 只关心核心表单 */}
			<TestPanel getBaseUrl={() => form.baseUrl} getModel={() => form.model} />
			<ImportExportPanel onImport={handleImport} />
		</div>
	);
};

export default App;
