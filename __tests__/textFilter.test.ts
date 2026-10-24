import { describe, expect, it } from "@rstest/core";
import { hasTranslatableText } from "../app/utils/textFilter";

/**
 * 选区预筛（纯逻辑）的单测。
 *
 * 为什么测这些：这道判定决定按钮弹不弹，写宽松了会为一段 URL 白跑一次请求，
 * 写严格了功能就静默失灵——两边都没报错，只能靠用例把口径钉住。
 */

describe("hasTranslatableText", () => {
	it("普通中英文都算可翻译", () => {
		expect(hasTranslatableText("Hello world")).toBe(true);
		expect(hasTranslatableText("这是一段中文")).toBe(true);
	});

	it("纯 URL 不算可翻译", () => {
		expect(hasTranslatableText("https://example.com/a/b?c=1")).toBe(false);
		expect(hasTranslatableText("www.example.com")).toBe(false);
	});

	it("URL 里夹着文字时仍算可翻译", () => {
		expect(hasTranslatableText("访问 https://example.com 了解详情")).toBe(true);
	});

	it("纯数字与纯符号不算可翻译", () => {
		expect(hasTranslatableText("3.14")).toBe(false);
		expect(hasTranslatableText("→ 42 ——")).toBe(false);
		expect(hasTranslatableText("   ")).toBe(false);
	});

	it("裸域名不排除（保守口径，别误伤正常词汇）", () => {
		expect(hasTranslatableText("example.com")).toBe(true);
		expect(hasTranslatableText("node.js")).toBe(true);
	});
});
