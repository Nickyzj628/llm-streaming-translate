/**
 * 配置备份 / 恢复的纯逻辑。
 *
 * 导出：把 storage 内容序列化下载为 JSON；导入：解析 JSON、做 StorageSchema
 * 运行时类型校验（消除原 App.tsx 里 parsed as any 的无类型访问），再写回 storage。
 */

import { defaultStorage } from "../../types/storage";
import { getAllStorage, setStorage } from "../../utils/storage";

/** 与 StorageSchema 一致的可导入字段（targetLang 可选，缺省回退"简体中文"） */
export interface ImportableConfig {
	baseUrl: string;
	model: string;
	apiKey: string;
	body: string;
	targetLang?: string;
}

/**
 * 运行时类型守卫：校验一个未知对象是否满足可导入配置的最小要求。
 * 读取配置文件是外部输入，绝不能直接信任其类型，必须逐字段校验。
 */
export function isImportableConfig(value: unknown): value is ImportableConfig {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	return (
		typeof v.baseUrl === "string" &&
		typeof v.model === "string" &&
		typeof v.apiKey === "string" &&
		typeof v.body === "string" &&
		(v.targetLang === undefined || typeof v.targetLang === "string")
	);
}

/** 导出文件名：llm-translate-config-YYYY-MM-DD.json */
export function exportFileName(): string {
	return `llm-translate-config-${new Date().toISOString().slice(0, 10)}.json`;
}

/**
 * 把当前 storage 配置导出为 JSON 文件下载。
 * @returns 导出的 JSON 字符串（供调用方决定 toast 提示）
 */
export async function exportConfig(): Promise<void> {
	const data = await getAllStorage();
	const blob = new Blob([JSON.stringify(data, null, 2)], {
		type: "application/json",
	});
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = exportFileName();
	// Firefox 对未挂载到文档的 <a> 点击可能不触发下载，先挂载再点
	document.body.appendChild(a);
	a.click();
	a.remove();
	// 延迟 revoke：部分浏览器需要等下载任务真正建立，立即 revoke 会截断下载
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 解析并导入配置文件。
 * @param file 用户选择的 JSON 文件
 * @returns 导入成功后的配置；失败（解析错误或字段不合法）时返回 null
 */
export async function importConfig(
	file: File,
): Promise<ImportableConfig | null> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(await file.text());
	} catch {
		// JSON 解析失败（非合法 JSON）
		return null;
	}

	if (!isImportableConfig(parsed)) {
		return null;
	}

	// targetLang 可选，缺省回退 defaultStorage 的默认语言
	const targetLang = parsed.targetLang ?? defaultStorage.targetLang;

	const config: ImportableConfig = {
		baseUrl: parsed.baseUrl,
		model: parsed.model,
		apiKey: parsed.apiKey,
		body: parsed.body,
		targetLang,
	};

	// 写入 storage 时 targetLang 已用上面的局部常量确定（string 类型）
	await setStorage({
		baseUrl: config.baseUrl,
		model: config.model,
		apiKey: config.apiKey,
		body: config.body,
		targetLang,
	});
	return config;
}
