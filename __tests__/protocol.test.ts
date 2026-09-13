import { describe, expect, it } from "@rstest/core";
import {
	extractTranslatedContent,
	joinSegmentRows,
	placeholderMarker,
	SegmentStreamParser,
	segmentSeparator,
} from "../app/utils/protocol";

/**
 * 段对齐协议的单测。
 *
 * 为什么测这些：协议形态与流式拆段逻辑是 content / background / prompt 三处
 * 共同依赖的契约（AGENTS.md"最容易踩的坑"），之前完全没有自动验证——标记形态
 * 一旦漂移，整条翻译链路会静默错位。这里把行为钉死，重构时用它做回归护栏。
 */

describe("协议标记形态", () => {
	it("段分隔标记带绝对序号", () => {
		expect(segmentSeparator(1)).toBe("{{seg1}}");
		expect(segmentSeparator(12)).toBe("{{seg12}}");
	});

	it("占位符与段标记由同一份标记常量派生", () => {
		expect(placeholderMarker(1)).toBe("{{var1}}");
		expect(placeholderMarker(9)).toBe("{{var9}}");
	});
});

describe("joinSegmentRows", () => {
	it("每段（含最后一段）都跟分隔标记，序号从 1 开始", () => {
		expect(joinSegmentRows(["甲", "乙"], 0)).toBe("甲{{seg1}}乙{{seg2}}");
	});

	it("断点重试的子文本保持绝对序号", () => {
		expect(joinSegmentRows(["乙"], 1)).toBe("乙{{seg2}}");
	});
});

describe("extractTranslatedContent", () => {
	it("删除占位符并清理首尾空白", () => {
		expect(extractTranslatedContent("{{var1}}译文 {{var2}}")).toBe("译文");
	});

	it("段内换行保留（{{segN}} 方案允许段内自由换行）", () => {
		expect(extractTranslatedContent("上\n下")).toBe("上\n下");
	});
});

describe("SegmentStreamParser", () => {
	/** 建一个收集回调的 parser，便于断言完整段与尾段预览 */
	function collect() {
		const full: Array<[string, number]> = [];
		const partials: string[] = [];
		const parser = new SegmentStreamParser({
			onSegment: (segment, segmentNumber) => full.push([segment, segmentNumber]),
			onPartial: (partial) => partials.push(partial),
		});
		return { parser, full, partials };
	}

	it("按 {{segN}} 拆出完整段并带序号回调", () => {
		const { parser, full, partials } = collect();
		parser.push("甲{{seg1}}乙{{seg2}}");
		expect(full).toEqual([
			["甲", 1],
			["乙", 2],
		]);
		// 模型输出以分隔符收尾：缓冲为空，无尾段预览
		expect(partials).toEqual([]);
	});

	it("标记被 chunk 切开时不把残缺前缀写进译文", () => {
		const { parser, full, partials } = collect();
		parser.push("甲{{seg");
		// 未完成前缀 {{seg 被剥离，只剩"甲"作为尾段预览
		expect(partials).toEqual(["甲"]);
		parser.push("1}}乙{{seg2}}");
		expect(full).toEqual([
			["甲", 1],
			["乙", 2],
		]);
	});

	it("空段也回调，以消耗段下标保持后续对齐", () => {
		const { parser, full } = collect();
		parser.push("甲{{seg1}}{{seg2}}乙{{seg3}}");
		expect(full).toEqual([
			["甲", 1],
			["", 2],
			["乙", 3],
		]);
	});

	it("漏抄末尾分隔符时 flush 把尾段作为最终段", () => {
		const { parser, full, partials } = collect();
		parser.push("甲{{seg1}}乙");
		expect(full).toEqual([["甲", 1]]);
		parser.flush();
		// 一为流式预览、一为 flush 的最终尾段
		expect(partials).toEqual(["乙", "乙"]);
		expect(parser.segmentCount).toBe(2);
	});

	it("段数统计：完整段 + flush 时的非空尾段", () => {
		const { parser } = collect();
		parser.push("甲{{seg1}}乙{{seg2}}");
		expect(parser.segmentCount).toBe(2);
		parser.flush();
		// 以分隔符收尾：flush 不产生尾段，段数不变
		expect(parser.segmentCount).toBe(2);
	});

	it("空缓冲 flush 不产生尾段", () => {
		const { parser, partials } = collect();
		parser.flush();
		expect(partials).toEqual([]);
		expect(parser.segmentCount).toBe(0);
	});
});
