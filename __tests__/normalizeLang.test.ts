import { describe, expect, it } from "@rstest/core";
import {
	isLanguageCodeList,
	parseLanguageCodeList,
} from "../app/options/utils/normalizeLang";

/**
 * 目标语言标准化的纯逻辑单测。
 *
 * 模型回复不可控：可能带 Markdown、单引号、解释文字，这里把能兼容的形态钉住，
 * 免得保存设置时因为多一个 ```json 就整段失败。
 */

describe("parseLanguageCodeList", () => {
	it("解析标准 JSON 数组", () => {
		expect(parseLanguageCodeList('["zh","zh-CN","zh-Hans"]')).toEqual([
			"zh",
			"zh-CN",
			"zh-Hans",
		]);
	});

	it("忽略 Markdown 代码块和前后解释", () => {
		expect(
			parseLanguageCodeList(
				'好的，结果如下：\n```json\n["en", "en-US"]\n```\n以上。',
			),
		).toEqual(["en", "en-US"]);
	});

	it("兼容单引号数组", () => {
		expect(parseLanguageCodeList("['zh', 'zh-CN']")).toEqual(["zh", "zh-CN"]);
	});

	it("过滤不像语言代码的内容并去重", () => {
		expect(parseLanguageCodeList('["zh","简体中文","zh","en"]')).toEqual([
			"zh",
			"en",
		]);
	});

	it("没有可用代码时返回空数组", () => {
		expect(parseLanguageCodeList("抱歉，我无法识别")).toEqual([]);
		expect(parseLanguageCodeList("[]")).toEqual([]);
	});
});

describe("isLanguageCodeList", () => {
	it("逗号分隔的语言代码返回 true", () => {
		expect(isLanguageCodeList("zh, zh-CN, zh-Hans")).toBe(true);
		expect(isLanguageCodeList("en")).toBe(true);
	});

	it("语言名称、空串、混入说明都返回 false", () => {
		expect(isLanguageCodeList("简体中文")).toBe(false);
		expect(isLanguageCodeList("")).toBe(false);
		expect(isLanguageCodeList("zh, 简体中文")).toBe(false);
	});
});
