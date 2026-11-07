/**
 * 重试时追加给模型的诊断指导（`<system-reminder>` 包裹的 user 消息）。
 *
 * 为什么单独成文件：它是"模型侧契约"的一部分（告诉模型上一轮错在哪、这次怎么改），
 * 但由 content 端生成——错位检测在 TranslationSession 里，background 只看得到文本。
 * 放 utils 而不是 background/prompt.ts：content 不该反向依赖 background 模块。
 *
 * 为什么用自然语言指认"第 N 个碎片"而**不写** {{segN}} 字面：字面标记进了 user 消息，
 * 模型很容易直接照抄进译文、凭空多出碎片编号（解析器虽有宽容兜底，但没必要给它机会）。
 * 错误证据在 assistant 轮里已经原样可见，这里只需要指路。
 */

/**
 * 一处对齐失误的诊断：
 * - misalign：流式阶段序号错配（模型多编 / 漏编了碎片编号）；
 * - missing：流结束时输出段数不足（末尾吞段）。
 */
export type RetryDiagnosis =
	| {
			kind: "misalign";
			/** 出错碎片的下标（0 起） */
			fromSegment: number;
			/** 这里本该结束的碎片号（fromSegment + 1） */
			expected: number;
			/** 模型实际给出的碎片号 */
			got: number;
	  }
	| {
			kind: "missing";
			/** 续译起点下标（0 起） */
			fromSegment: number;
			/** 本轮输入应有的碎片数 */
			expected: number;
			/** 模型实际输出的碎片数 */
			produced: number;
	  };

/** 1 起的中文序号表述（与 {{segN}} 的数字严格一致） */
function fragment(index: number): string {
	return `第 ${index} 个碎片`;
}

/** 生成一条 `<system-reminder>` 诊断消息（content 端作为独立 user 消息发出） */
export function buildRetryReminder(diagnosis: RetryDiagnosis): string {
	let body: string;
	if (diagnosis.kind === "missing") {
		// 末尾吞段：模型漏抄了最后的碎片分隔标记，把最后几段并成一段
		body = `输入共有 ${diagnosis.expected} 个碎片，你只输出了 ${diagnosis.produced} 个，末尾的碎片被漏掉了`;
	} else {
		// 序号跳变：既是把碎片内部的换行当成了新碎片（多编），也是把相邻碎片并成
		// 一段（少编）——从消费方看都是"本该结束在第 expected 个，却写成了第 got 个"，
		// 所以两个数字都报出来，模型才知道自己对在哪一格上踩空
		body =
			`你在${fragment(diagnosis.expected)}处给出了错误的碎片编号（写成了${fragment(diagnosis.got)}）：` +
			"碎片内部的换行不算新碎片，相邻碎片也不能合并，每个碎片都必须以自己的编号结束";
	}

	return `<system-reminder>上一轮翻译有失误：${body}。请按原碎片编号重新翻译下面的内容。</system-reminder>`;
}
