/**
 * 模型列表拉取逻辑。
 *
 * 从 {baseUrl}/models 拉取可用模型 ID，供 Combobox 展开候选。
 * 原 App.tsx 里这段逻辑 + fetchAbortController 生命周期是耦合在组件里的，
 * 抽到独立函数后：abort controller 随返回值暴露给调用方，组件卸载时可 abort；
 * 将来 content 端或其他地方也要拉模型时可直接复用。
 */

/** /models 接口返回的响应结构（只取 id 字段） */
interface ModelListResponse {
	data: Array<{ id?: string }>;
}

export interface FetchModelsHandle {
	/** 拉取结果：成功时 resolve 模型 ID 数组（可能为空） */
	promise: Promise<string[]>;
	/** abort controller：调用方可持有，用于卸载时取消请求 */
	controller: AbortController;
}

/**
 * 拉取模型列表。
 * @param url     API Base URL（如 https://api.deepseek.com）
 * @param apiKey  鉴权 Key
 */
export function fetchModels(url: string, apiKey: string): FetchModelsHandle {
	const controller = new AbortController();
	const endpoint = `${url.replace(/\/$/, "")}/models`;

	const promise = fetch(endpoint, {
		headers: { Authorization: `Bearer ${apiKey}` },
		signal: controller.signal,
	})
		.then((response) => {
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}
			return response.json() as Promise<unknown>;
		})
		.then((data) => {
			if (
				!data ||
				typeof data !== "object" ||
				!("data" in data) ||
				!Array.isArray((data as Record<string, unknown>).data)
			) {
				throw new Error("Unexpected response format");
			}
			return (data as ModelListResponse).data
				.map((m) => m.id)
				.filter((id): id is string => Boolean(id));
		});

	return { promise, controller };
}
