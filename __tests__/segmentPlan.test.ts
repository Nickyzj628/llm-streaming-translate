import { describe, expect, it } from "@rstest/core";
import { collapseNewlines, planSegments } from "../app/content/segmentPlan";

/**
 * 段计划（纯逻辑）的单测。
 *
 * 为什么测这些：占位符编号是模型必须原样照抄的地标，编号顺序错一个就会让译文
 * 静默写错位置——而它跨段全局递增、preserve 段与 before/after 都要参与分配，
 * 是最容易写漂的部分。这里把编号规则钉死，拆分/重构 InlineTranslator 时用它兜底。
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
		expect(plans[0].row).toBe("{{var1}}译文{{var2}}");
		expect(plans[0].originalText).toBe("译文");
	});

	it("before/after 为空时不分配占位符（避免噪音）", () => {
		const plans = planSegments([
			{ preserve: false, selected: "x", before: "", after: "" },
		]);
		expect(plans[0].row).toBe("x");
	});

	it("preserve 段整块只占一个占位符，且编号不重置", () => {
		const plans = planSegments([
			{ preserve: true, selected: "", before: "", after: "" },
			{ preserve: false, selected: "译文", before: "", after: "" },
		]);
		expect(plans[0].kind).toBe("preserve");
		expect(plans[0].row).toBe("{{var1}}");
		expect(plans[1].row).toBe("译文");
	});

	it("preserve 与普通段混合时编号全局连续", () => {
		const plans = planSegments([
			{ preserve: false, selected: "a", before: "x", after: "" },
			{ preserve: true, selected: "", before: "", after: "" },
			{ preserve: false, selected: "b", before: "", after: "y" },
		]);
		expect(plans.map((p) => p.row)).toEqual([
			"{{var1}}a",
			"{{var2}}",
			"b{{var3}}",
		]);
	});

	it("协议行折叠换行，但 originalText 保留原始换行", () => {
		const plans = planSegments([
			{ preserve: false, selected: "上\n\n下", before: "", after: "" },
		]);
		expect(plans[0].row).toBe("上 下");
		expect(plans[0].originalText).toBe("上\n\n下");
	});
});
