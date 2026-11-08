import { describe, expect, it } from "@rstest/core";
import {
	appendHistory,
	clearHistory,
	getHistory,
	readPageMeta,
} from "@/content/pageContext";

/**
 * 页级上下文的单测：钉死两条策略——
 * - pageMeta 首次快照后不再变，**除非标题变了**（换页：历史与 system 一起归零）；
 * - 历史只在失败时清空，失败不清 pageMeta。
 *
 * 模块是单例，测试按顺序操作同一份状态（先验元数据策略、再验历史累积/清空）。
 */
describe("pageContext", () => {
	it("首次调用建立快照", () => {
		const meta = readPageMeta(() => ({
			title: "页面 A",
			description: "描述 A",
		}));

		expect(meta).toEqual({ title: "页面 A", description: "描述 A" });
	});

	it("标题不变时返回同一份快照，description 变化被忽略", () => {
		const first = readPageMeta(() => ({
			title: "页面 A",
			description: "描述 A",
		}));
		// 同一标题（比如 SPA 把描述异步补全了）：不该换 system
		const second = readPageMeta(() => ({
			title: "页面 A",
			description: "补全后的描述",
		}));

		expect(second).toBe(first);
		expect(second.description).toBe("描述 A");
	});

	it("标题变了当换页：历史和元数据一起清空重读", () => {
		clearHistory();
		appendHistory({ role: "user", content: "甲{{seg1}}" });
		appendHistory({ role: "assistant", content: "A{{seg1}}" });

		const meta = readPageMeta(() => ({
			title: "页面 B",
			description: "描述 B",
		}));

		expect(meta).toEqual({ title: "页面 B", description: "描述 B" });
		expect(getHistory()).toEqual([]);
	});

	it("标题变回原值不算换页（抗抖动：A→B→A 只清一次）", () => {
		readPageMeta(() => ({ title: "页面 B", description: "描述 B" }));
		clearHistory();
		appendHistory({ role: "user", content: "乙{{seg1}}" });

		// 标题从 B 变回 A：又是一次换页 → 清空
		const back = readPageMeta(() => ({ title: "页面 A", description: "描述 A" }));
		expect(back.title).toBe("页面 A");
		expect(getHistory()).toEqual([]);

		// 再调一次（标题仍是 A）：不再清，历史能正常累积
		appendHistory({ role: "user", content: "丙{{seg1}}" });
		readPageMeta(() => ({ title: "页面 A", description: "描述 A2" }));
		expect(getHistory()).toHaveLength(1);
	});

	it("历史按对累积，clearHistory 清空", () => {
		clearHistory();
		appendHistory({ role: "user", content: "甲{{seg1}}" });
		appendHistory({ role: "assistant", content: "A{{seg1}}" });
		expect(getHistory()).toHaveLength(2);

		clearHistory();
		expect(getHistory()).toEqual([]);
	});
});
