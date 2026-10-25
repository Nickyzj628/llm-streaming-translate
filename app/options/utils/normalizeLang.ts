/**
 * 把用户填的目标语言名称标准化成 `i18n.detectLanguage` 会返回的语言代码。
 *
 * 为什么要借模型：CLD 只认 ISO 代码（zh、zh-CN…），用户填的是“简体中文”这种
 * 自然语言名称，直接比较永远对不上。与其内置一张语言表，不如用用户自己配的
 * 模型做一次名称→代码的映射，冷门语言也能覆盖。
 */

import { nonStream } from "@nickyzj2023/ai";

/** BCP 47 的粗略形态：主语言 + 可选子标签，够挡住模型偶尔冒出来的中文说明 */
const LANGUAGE_CODE_PATTERN = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i;

const NORMALIZE_PROMPT = `你把语言名称转换成 BCP 47 语言代码。
只输出一个 JSON 字符串数组，不要解释，不要 Markdown 代码块。
数组里放该语言的主代码和常见地区/文字变体，例如：
- 简体中文 -> ["zh","zh-CN","zh-Hans"]
- 英语 -> ["en","en-US","en-GB"]
无法识别时输出空数组 []。`;

export interface NormalizeTargetLangOptions {
	baseUrl: string;
	model: string;
	apiKey: string;
	body: Record<string, unknown>;
	targetLang: string;
}

/**
 * 调一次表单里配置的模型，把“简体中文”这类名称换成 "zh, zh-CN, zh-Hans"。
 * 失败直接抛错，由调用方决定是拦下保存还是按原文存。
 */
export async function normalizeTargetLang(
	options: NormalizeTargetLangOptions,
): Promise<string> {
	// 表单 body 进来前已经检查过，这里拷一份再清掉会跟本函数抢控制权的字段
	const body = { ...options.body };
	delete body.stream;
	delete body.model;
	delete body.messages;
	delete body.tools;

	// 一次性拿完整回复即可，不关心逐字输出；nonStream 失败会直接抛错
	const { content } = await nonStream(
		{
			baseUrl: options.baseUrl,
			model: options.model,
			apiKey: options.apiKey,
		},
		[
			{ role: "system", content: NORMALIZE_PROMPT },
			{ role: "user", content: options.targetLang },
		],
		[],
		{ body },
	);

	const codes = parseLanguageCodeList(content);
	if (codes.length === 0) {
		throw new Error("模型没有返回可用的语言代码");
	}
	return codes.join(", ");
}

/**
 * 判断表单里的值是不是已经是逗号分隔的语言代码。
 * 已经是代码就不用再问模型，省一次保存时的网络往返。
 */
export function isLanguageCodeList(value: string): boolean {
	const items = value
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
	return (
		items.length > 0 && items.every((item) => LANGUAGE_CODE_PATTERN.test(item))
	);
}

/**
 * 从模型回复里抠出语言代码数组。
 * 先按 JSON 数组解析；模型偶尔用单引号，退一步从引号里捞再靠正则过滤。
 */
export function parseLanguageCodeList(reply: string): string[] {
	const jsonText = reply.match(/\[[\s\S]*?\]/)?.[0];
	if (jsonText) {
		try {
			const parsed: unknown = JSON.parse(jsonText);
			if (Array.isArray(parsed)) {
				const codes = uniqueLanguageCodes(parsed);
				if (codes.length > 0) return codes;
			}
		} catch {
			// 不是合法 JSON，继续走引号兜底
		}
	}

	const quoted = reply.match(/["'][^"']+["']/g) ?? [];
	return uniqueLanguageCodes(quoted.map((item) => item.slice(1, -1)));
}

/** 去重并只留下长得像语言代码的项 */
function uniqueLanguageCodes(values: unknown[]): string[] {
	const codes = values
		.filter((value): value is string => typeof value === "string")
		.map((value) => value.trim())
		.filter((value) => LANGUAGE_CODE_PATTERN.test(value));
	return [...new Set(codes)];
}

/**
 * 检查并解析用户手填的请求体 JSON，非法就当没有额外字段。
 * 保存前先调一次，把解析结果交给标准化请求。
 */
export function checkCustomBody(body: string): Record<string, unknown> {
	if (!body.trim()) return {};
	try {
		const parsed: unknown = JSON.parse(body);
		return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}
