import { describe, expect, it } from "@rstest/core";
import { buildRetryReminder } from "@/utils/retryReminder";

/**
 * 重试诊断文案的单测：它是模型的"纠错提示"，措辞漂了模型就改不动。
 * 关键约束只有两条：用自然语言指认"第 N 个碎片"（不写 {{segN}} 字面），
 * 并且数字与绝对碎片序号严格一致。
 */
describe("buildRetryReminder", () => {
	it("多编碎片编号（段内换行被当成新碎片）时报出两个序号", () => {
		const text = buildRetryReminder({
			kind: "misalign",
			fromSegment: 7,
			expected: 8,
			got: 9,
		});

		expect(text).toContain("<system-reminder>");
		expect(text).toContain("第 8 个碎片处给出了错误的碎片编号");
		expect(text).toContain("第 9 个碎片");
		expect(text).toContain("换行不算新碎片");
		// 不能出现协议标记字面，否则模型容易照抄进译文
		expect(text).not.toContain("{{seg");
	});

	it("少编碎片编号（相邻碎片被并成一段）", () => {
		const text = buildRetryReminder({
			kind: "misalign",
			fromSegment: 2,
			expected: 3,
			got: 5,
		});
		expect(text).toContain("第 3 个碎片处给出了错误的碎片编号");
		expect(text).toContain("相邻碎片也不能合并");
	});

	it("末尾吞段（输出段数不足）", () => {
		const text = buildRetryReminder({
			kind: "missing",
			fromSegment: 3,
			expected: 5,
			produced: 2,
		});
		expect(text).toContain("输入共有 5 个碎片");
		expect(text).toContain("只输出了 2 个");
		expect(text).not.toContain("{{seg");
	});
});
