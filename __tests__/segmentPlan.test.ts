import { describe, expect, it } from "@rstest/core";
import { collapseNewlines, planSegments } from "../app/content/segmentPlan";

/**
 * 段计划（纯逻辑）的单测。
 *
 * 为什么测这些：协议行怎么拼决定了模型看到什么，拼错了不会报错、只会静默变形
 * （占位符漏放会让未选中内容被当译文翻掉），是最容易写漂的部分。这里把规则钉死，
 * 拆分/重构 InlineTranslator 时用它兜底。
 */

describe("collapseNewlines", () => {
	it("连续换行折叠为单个空格", () => {
		expect(collapseNewlines("上\n\n下")).toBe("上 下");
	});

	it("无换行时原样返回", () => {
		expect(collapseNewlines("原样")).toBe("原样");
	});
});

describe("planSegments", () => {
	it("普通段：before/after 各占一个占位符", () => {
		const plans = planSegments([
			{ preserve: false, selected: "译文", before: "前", after: "后" },
		]);
		expect(plans[0].row).toBe("{{var}}译文{{var}}");
		expect(plans[0].originalText).toBe("译文");
	});

	it("before/after 为空时不插占位符（避免噪音）", () => {
		const plans = planSegments([
			{ preserve: false, selected: "x", before: "", after: "" },
		]);
		expect(plans[0].row).toBe("x");
	});

	it("preserve 段整块只占一个占位符", () => {
		const plans = planSegments([
			{ preserve: true, selected: "", before: "", after: "" },
			{ preserve: false, selected: "译文", before: "", after: "" },
		]);
		expect(plans[0].kind).toBe("preserve");
		expect(plans[0].row).toBe("{{var}}");
		expect(plans[1].row).toBe("译文");
	});

	it("preserve 与普通段混合时占位符形态一致", () => {
		const plans = planSegments([
			{ preserve: false, selected: "a", before: "x", after: "" },
			{ preserve: true, selected: "", before: "", after: "" },
			{ preserve: false, selected: "b", before: "", after: "y" },
		]);
		expect(plans.map((p) => p.row)).toEqual(["{{var}}a", "{{var}}", "b{{var}}"]);
	});

	it("协议行折叠换行，但 originalText 保留原始换行", () => {
		const plans = planSegments([
			{ preserve: false, selected: "上\n\n下", before: "", after: "" },
		]);
		expect(plans[0].row).toBe("上 下");
		expect(plans[0].originalText).toBe("上\n\n下");
	});
});
