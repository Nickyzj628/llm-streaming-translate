/**
 * Options 页面表单状态管理。
 *
 * 把 5 个表单字段（targetLang / baseUrl / model / apiKey / body）合并为一个
 * Solid `createStore`（细粒度响应式），替代原先各自独立的 `createSignal`：
 * - 批量更新（预设填充、导入回填）只需一次 setForm，不用逐个 set；
 * - 点路径更新（setForm("baseUrl", v)）只触发该字段的读取方重算，性能更好；
 * - 同时集中"storage 回填 / 保存"逻辑，避免 onMount / handleSave / 导入三处重复。
 *
 * 注意：models / isLoadingModels / isTesting 等"UI 异步状态"不属于表单配置，
 * 它们仍是独立 signal，不塞进本 store。
 */

import type { SetStoreFunction } from "solid-js/store";
import { createStore } from "solid-js/store";
import { getAllStorage, setStorage } from "../../utils/storage";

/** 表单字段：与 StorageSchema 中用户可配置的 5 个键一一对应 */
export interface OptionsForm {
	targetLang: string;
	baseUrl: string;
	model: string;
	apiKey: string;
	body: string;
}

/** 空初始值：挂载时由 loadFromStorage 从 storage 回填 */
const EMPTY_FORM: OptionsForm = {
	targetLang: "",
	baseUrl: "",
	model: "",
	apiKey: "",
	body: "",
};

export interface UseOptionsForm {
	/** 表单 store 本身（Solid store：字段读取直接用 form.xxx 属性访问，自带响应式追踪，无需调用） */
	form: OptionsForm;
	/** store 的 setter：支持 setForm("baseUrl", v) 点路径更新，或 setForm({...}) 批量更新 */
	setForm: SetStoreFunction<OptionsForm>;
	/** 从 browser.storage.local 读取配置并回填表单 */
	loadFromStorage: () => Promise<void>;
	/** 把当前表单内容整体写入 browser.storage.local */
	saveToStorage: () => Promise<void>;
}

export function useOptionsForm(): UseOptionsForm {
	const [form, setForm] = createStore<OptionsForm>(EMPTY_FORM);

	const loadFromStorage = async (): Promise<void> => {
		const result = await getAllStorage();
		setForm({
			targetLang: result.targetLang,
			baseUrl: result.baseUrl,
			model: result.model,
			apiKey: result.apiKey,
			body: result.body,
		});
	};

	const saveToStorage = async (): Promise<void> => {
		await setStorage({
			targetLang: form.targetLang,
			baseUrl: form.baseUrl,
			model: form.model,
			apiKey: form.apiKey,
			body: form.body,
		});
	};

	return { form, setForm, loadFromStorage, saveToStorage };
}
