/**
 * 目标语言判定的纯逻辑：解析 `browser.i18n.detectLanguage` 的返回结果，
 * 再和用户配置的 targetLang 比对。
 *
 * 为什么单独拆出来：结果解析要能单测，而 webextension-polyfill 在 Node 下
 * 一导入就抛错，所以真正调 API 的那层放在 content/selectionLanguage.ts，
 * 这里不碰任何浏览器对象。
 */

/**
 * 取检测结果里占比最高的语言代码，没有结果返回 null。
 * API 返回的数组本来就按 percentage 降序，这里再比一遍只是兜底。
 */
export function topLanguage(
	languages: readonly { language: string; percentage: number }[],
): string | null {
	let top: { language: string; percentage: number } | null = null;
	for (const item of languages) {
		if (top === null || item.percentage > top.percentage) {
			top = item;
		}
	}
	return top?.language ?? null;
}

/**
 * 把 targetLang（如 "zh, zh-CN, zh-Hans"）拆成小写语言代码列表。
 * 统一小写是为了比对时不受 "zh-CN" / "zh-cn" 这种大小写差异影响。
 */
export function parseLanguageCodes(targetLang: string): string[] {
	return targetLang
		.split(",")
		.map((code) => code.trim().toLowerCase())
		.filter(Boolean);
}

/**
 * 检测出的语言是不是就是目标语言。
 * 空检测结果一律算“不是”，让按钮照常弹出来，别把功能挡死。
 */
export function isTargetLanguage(
	detected: string | null,
	targetLang: string,
): boolean {
	if (!detected) return false;
	return parseLanguageCodes(targetLang).includes(detected.toLowerCase());
}
