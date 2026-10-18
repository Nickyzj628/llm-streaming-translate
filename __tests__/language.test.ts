import { describe, expect, it } from "@rstest/core";
import {
	isTargetLanguage,
	parseLanguageCodes,
	topLanguage,
} from "../app/utils/language";

/**
 * 目标语言判定的单测（浮动按钮的显示条件）。
 *
 * 真正调 `browser.i18n.detectLanguage` 的那层在 content/selectionLanguage.ts，
 * 这里钉住“主语言怎么选、和 targetLang 怎么比”，避免匹配规则悄悄变形。
 */

describe("topLanguage", () => {
	it("取占比最高的语言", () => {
		expect(
			topLanguage([
				{ language: "zh", percentage: 70 },
				{ language: "en", percentage: 30 },
			]),
		).toBe("zh");
		expect(
			topLanguage([
				{ language: "en", percentage: 90 },
				{ language: "zh", percentage: 10 },
			]),
		).toBe("en");
	});

	it("不依赖数组顺序，按 percentage 取最大", () => {
		expect(
			topLanguage([
				{ language: "en", percentage: 20 },
				{ language: "zh", percentage: 60 },
				{ language: "ja", percentage: 20 },
			]),
		).toBe("zh");
	});

	it("空结果返回 null", () => {
		expect(topLanguage([])).toBeNull();
	});
});

describe("parseLanguageCodes", () => {
	it("按逗号拆开并统一小写", () => {
		expect(parseLanguageCodes("zh, zh-CN, zh-Hans")).toEqual([
			"zh",
			"zh-cn",
			"zh-hans",
		]);
	});

	it("忽略空项和多余空格", () => {
		expect(parseLanguageCodes(" en , ,en-US ")).toEqual(["en", "en-us"]);
	});

	it("空字符串返回空数组", () => {
		expect(parseLanguageCodes("")).toEqual([]);
	});
});

describe("isTargetLanguage", () => {
	const targetLang = "zh, zh-CN, zh-Hans";

	it("检测语言在 targetLang 里返回 true", () => {
		expect(isTargetLanguage("zh", targetLang)).toBe(true);
		expect(isTargetLanguage("zh-CN", targetLang)).toBe(true);
		expect(isTargetLanguage("zh-Hans", targetLang)).toBe(true);
	});

	it("大小写不敏感", () => {
		expect(isTargetLanguage("ZH-cn", targetLang)).toBe(true);
	});

	it("不在列表里返回 false", () => {
		expect(isTargetLanguage("en", targetLang)).toBe(false);
		expect(isTargetLanguage("zh-TW", targetLang)).toBe(false);
	});

	it("没有检测结果返回 false", () => {
		expect(isTargetLanguage(null, targetLang)).toBe(false);
	});
});
