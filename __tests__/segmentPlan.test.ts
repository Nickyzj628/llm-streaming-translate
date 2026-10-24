import { describe, expect, it } from "@rstest/core";
import {
	keepsNewlines,
	normalizeNewlines,
	planSegments,
} from "../app/content/segmentPlan";

/**
 * 段计划（纯逻辑）的单测。
 *
 * 为什么测这些：协议行怎么拼决定了模型看到什么，拼错了不会报错、只会静默变形
 * （占位符漏放会让未选中内容被当译文翻掉），是最容易写漂的部分。这里把规则钉死，
 * 拆分/重构 InlineTranslator 时用它兜底。
 */

describe("keepsNewlines", () => {
	it("会渲染换行的 white-space 取值", () => {
		expect(keepsNewlines("pre")).toBe(true);
		expect(keepsNewlines("pre-wrap")).toBe(true);
		expect(keepsNewlines("pre-line")).toBe(true);
		expect(keepsNewlines("break-spaces")).toBe(true);
	});

	it("不渲染换行的取值（含 getComputedStyle 返回的空格/大小写差异）", () => {
		expect(keepsNewlines("normal")).toBe(false);
		expect(keepsNewlines("nowrap")).toBe(false);
		expect(keepsNewlines(" PRE-WRAP ")).toBe(true);
	});
});

describe("normalizeNewlines", () => {
	it("不保留时连续换行折叠为单个空格", () => {
		expect(normalizeNewlines("上\n\n下", false)).toBe("上 下");
	});

	it("保留时原样返回（pre-wrap 容器的段落分隔不能被吃掉）", () => {
		expect(normalizeNewlines("上\n\n下", true)).toBe("上\n\n下");
	});

	it("无换行时原样返回", () => {
		expect(normalizeNewlines("原样", false)).toBe("原样");
		expect(normalizeNewlines("原样", true)).toBe("原样");
	});
});

describe("planSegments", () => {
	it("普通段：before/after 各占一个占位符", () => {
		const plans = planSegments([
			{
				preserve: false,
				selected: "译文",
				before: "前",
				after: "后",
				keepNewlines: false,
			},
		]);
		expect(plans[0].row).toBe("{{var}}译文{{var}}");
		expect(plans[0].originalText).toBe("译文");
	});

	it("before/after 为空时不插占位符（避免噪音）", () => {
		const plans = planSegments([
			{
				preserve: false,
				selected: "x",
				before: "",
				after: "",
				keepNewlines: false,
			},
		]);
		expect(plans[0].row).toBe("x");
	});

	it("preserve 段整块只占一个占位符", () => {
		const plans = planSegments([
			{ preserve: true, selected: "", before: "", after: "", keepNewlines: false },
			{
				preserve: false,
				selected: "译文",
				before: "",
				after: "",
				keepNewlines: false,
			},
		]);
		expect(plans[0].kind).toBe("preserve");
		expect(plans[0].row).toBe("{{var}}");
		expect(plans[1].row).toBe("译文");
	});

	it("preserve 与普通段混合时占位符形态一致", () => {
		const plans = planSegments([
			{
				preserve: false,
				selected: "a",
				before: "x",
				after: "",
				keepNewlines: false,
			},
			{ preserve: true, selected: "", before: "", after: "", keepNewlines: false },
			{
				preserve: false,
				selected: "b",
				before: "",
				after: "y",
				keepNewlines: false,
			},
		]);
		expect(plans.map((p) => p.row)).toEqual(["{{var}}a", "{{var}}", "b{{var}}"]);
	});

	it("不保留换行的段：协议行折叠换行，但 originalText 保留原始换行", () => {
		const plans = planSegments([
			{
				preserve: false,
				selected: "上\n\n下",
				before: "",
				after: "",
				keepNewlines: false,
			},
		]);
		expect(plans[0].row).toBe("上 下");
		expect(plans[0].originalText).toBe("上\n\n下");
	});

	it("保留换行的段：协议行带着原始换行发给模型，originalText 同样原样", () => {
		const plans = planSegments([
			{
				preserve: false,
				selected: "第一段\n\n第二段",
				before: "",
				after: "",
				keepNewlines: true,
			},
		]);
		expect(plans[0].row).toBe("第一段\n\n第二段");
		expect(plans[0].originalText).toBe("第一段\n\n第二段");
	});
});
