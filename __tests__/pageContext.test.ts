import { describe, expect, it } from "@rstest/core";
import {
	appendHistory,
	clearHistory,
	getHistory,
	readPageMetaOnce,
} from "@/content/pageContext";

/**
 * 页级上下文的单测：钉死两条策略——
 * - pageMeta 只读一次（之后页面怎么变都不影响 system，为前缀缓存利用率）；
 * - 历史只在失败时清空，失败不清 pageMeta。
 *
 * 模块是单例，测试按顺序操作同一份状态（先验冻结、再验历史累积/清空）。
 */
describe("pageContext", () => {
	it("pageMeta 只读一次，之后传入的读取函数不会再被调用", () => {
		let reads = 0;
		const first = readPageMetaOnce(() => {
			reads++;
			return { title: "首次标题", description: "首次描述" };
		});

		// 模拟页面标题后来变了：读取函数即使返回新值也不该生效
		const second = readPageMetaOnce(() => {
			reads++;
			return { title: "后来标题", description: "后来描述" };
		});

		expect(reads).toBe(1);
		expect(first).toEqual({ title: "首次标题", description: "首次描述" });
		expect(second).toBe(first);
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
