import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	rstest,
} from "@rstest/core";
import type { InlineTranslatorController } from "@/content/InlineTranslator";
import {
	type StreamTransport,
	startTranslationSession,
} from "@/content/TranslationSession";
import type { ChatTurn } from "@/types/messages";
import type { StreamTranslateOptions } from "@/utils/streamTranslate";

/**
 * 一次会话的对齐 / 重试 / 收尾单测。
 *
 * 为什么测这些：{{segN}} 序号对齐和"从错位段起重译"是整条链路最容易写漂、
 * 又只有真跑一遍长文才看得出来的部分。这里用假 translator 加假端口流把每条
 * 分支钉死：序号校验、宽容丢弃重述段、段数兜底、会话式重试的消息内容、
 * 重试上限、成功/失败交给入口的上下文事件。
 *
 * 怎么做到不碰浏览器：会话的端口客户端由入口注入（StreamTransport），
 * 所以这里塞个假流即可——不用 mock 模块，也不会加载 webextension-polyfill。
 */

/** 一条假流的记录：交出来的回调 + 是否被 abort */
interface FakeStream {
	options: StreamTranslateOptions;
	aborted: boolean;
}

/** 假的端口客户端：把回调交出来，由测试手动驱动 */
function createFakeTransport() {
	const streams: FakeStream[] = [];
	const transport: StreamTransport = (options) => {
		const stream: FakeStream = { options, aborted: false };
		streams.push(stream);
		return {
			abort: () => {
				stream.aborted = true;
			},
		};
	};
	return { transport, streams };
}

/** 造一个只记账、不碰 DOM 的 translator */
function createFakeTranslator(rows: string[]) {
	const written: Array<{ index: number; text: string }> = [];
	const restored: number[] = [];
	let finishCount = 0;
	let destroyCount = 0;

	const translator: InlineTranslatorController = {
		segmentCount: rows.length,
		getRows: () => rows,
		writeSegment: (index, text) => {
			// 真实的 InlineTranslator 对空串直接 return，这里照样过滤，
			// 免得记账里混进空写、看不出会话有没有把下标推对
			if (text === "") return;
			written.push({ index, text });
		},
		restoreSegment: (index) => {
			restored.push(index);
		},
		finish: () => {
			finishCount++;
		},
		destroy: () => {
			destroyCount++;
		},
		// 每段最后写入的内容（真实实现取锚点 textContent，这里取最后一次记账）
		getResultRows: () =>
			rows.map((_, i) => {
				for (let k = written.length - 1; k >= 0; k--) {
					if (written[k].index === i) return written[k].text;
				}
				return "";
			}),
	};

	return {
		translator,
		written,
		restored,
		finished: () => finishCount,
		destroyed: () => destroyCount,
	};
}

function pageMeta() {
	return { title: "标题", description: "描述" };
}

interface SessionHooks {
	history?: () => ChatTurn[];
	onTranslated?: (turn: { user: string; assistant: string }) => void;
	onFailed?: (message: string) => void;
	onEnded?: () => void;
	getPageMeta?: () => { title: string; description: string };
}

/** 起一次会话，把常用句柄一起交出来 */
function startSession(rows: string[], hooks: SessionHooks = {}) {
	const fake = createFakeTranslator(rows);
	const { transport, streams } = createFakeTransport();
	const translated: Array<{ user: string; assistant: string }> = [];
	const failures: string[] = [];

	startTranslationSession({
		translator: fake.translator,
		transport,
		getPageMeta: hooks.getPageMeta ?? pageMeta,
		getHistory: hooks.history ?? (() => []),
		onTranslated: (turn) => {
			translated.push(turn);
			hooks.onTranslated?.(turn);
		},
		onFailed: (message) => {
			failures.push(message);
			hooks.onFailed?.(message);
		},
		onEnded: hooks.onEnded ?? (() => {}),
	});

	return { ...fake, streams, translated, failures };
}

beforeEach(() => {
	// onError 分支会 console.error，别把噪声刷进测试输出
	rstest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	rstest.restoreAllMocks();
});

describe("正常流", () => {
	it("按 {{segN}} 序号逐段写回，收到 DONE 后收尾", () => {
		let ended = 0;
		const s = startSession(["甲", "乙"], {
			onEnded: () => {
				ended++;
			},
		});

		expect(s.streams.length).toBe(1);
		expect(s.streams[0].options.text).toBe("甲{{seg1}}乙{{seg2}}");

		// 未完成尾段作流式预览写进当前锚点，不推进段下标
		s.streams[0].options.onChunk("译文");
		expect(s.written).toEqual([{ index: 0, text: "译文" }]);

		// 完整段到达：序号对得上就写回整段（含预览过的部分），并推进下标
		s.streams[0].options.onChunk("A{{seg1}}");
		expect(s.written).toEqual([
			{ index: 0, text: "译文" },
			{ index: 0, text: "译文A" },
		]);

		s.streams[0].options.onChunk("译文B{{seg2}}");
		expect(s.written).toEqual([
			{ index: 0, text: "译文" },
			{ index: 0, text: "译文A" },
			{ index: 1, text: "译文B" },
		]);

		s.streams[0].options.onDone();
		expect(s.finished()).toBe(1);
		expect(s.destroyed()).toBe(0);
		expect(ended).toBe(1);
	});

	it("写回前在会话层删掉 {{var}} 占位符", () => {
		const s = startSession(["x"]);

		s.streams[0].options.onChunk("译文{{var}}{{seg1}}");
		expect(s.written).toEqual([{ index: 0, text: "译文" }]);
	});

	it("空段不写回，但下标照样前进", () => {
		const s = startSession(["甲", "乙"]);

		// 第 1 段是空段（模型给不出内容）：没东西可写
		s.streams[0].options.onChunk("{{seg1}}");
		expect(s.written).toEqual([]);

		// 但下标必须已经前进到第 2 段，否则后面的译文全错位一格
		s.streams[0].options.onChunk("翻译B{{seg2}}");
		expect(s.written).toEqual([{ index: 1, text: "翻译B" }]);
	});

	it("会话结束后的迟到回调不再改动 DOM", () => {
		const s = startSession(["甲"]);

		s.streams[0].options.onChunk("一{{seg1}}");
		s.streams[0].options.onDone();
		expect(s.finished()).toBe(1);

		// 结束标志立起来之后，迟到的 chunk（含错位序号）一律忽略
		s.streams[0].options.onChunk("二{{seg9}}");
		expect(s.written).toEqual([{ index: 0, text: "一" }]);
		expect(s.destroyed()).toBe(0);
	});

	it("模型给段内换行自己编号时，溢出段拼回最后一段而不是丢掉", () => {
		const s = startSession(["整篇推文就是一段"]);

		// 输入只有 1 段，模型却按段内换行自己编号到 seg3
		// （真实场景：推文里每两个段落之间有换行）
		s.streams[0].options.onChunk(
			"第一段。{{seg1}}\n\n第二段。{{seg2}}\n\n第三段。{{seg3}}",
		);

		// 越界下标原先是静默丢弃的，结果页面只剩第一段；现在按空行拼回同一段
		expect(s.written[s.written.length - 1]).toEqual({
			index: 0,
			text: "第一段。\n\n第二段。\n\n第三段。",
		});
		// 不需要重试：内容已经拿全了
		expect(s.streams.length).toBe(1);

		s.streams[0].options.onDone();
		expect(s.finished()).toBe(1);
		expect(s.destroyed()).toBe(0);
	});

	it("溢出段的流式预览也拼在最后一段上，不推进下标", () => {
		const s = startSession(["一段"]);

		s.streams[0].options.onChunk("第一段。{{seg1}}\n\n第二段");

		// 预览临时拼上去，不改已提交的段内容
		expect(s.written[s.written.length - 1]).toEqual({
			index: 0,
			text: "第一段。\n\n第二段",
		});

		// 完整段到达后正式拼，内容不重复
		s.streams[0].options.onChunk("。{{seg2}}");
		expect(s.written[s.written.length - 1]).toEqual({
			index: 0,
			text: "第一段。\n\n第二段。",
		});
	});
});

describe("页级上下文交接", () => {
	it("成功时交出一对干净的对话（原始输入 + 按绝对序号重拼的输出）", () => {
		const s = startSession(["甲", "乙"]);

		s.streams[0].options.onChunk("一{{seg1}}二{{seg2}}");
		s.streams[0].options.onDone();

		expect(s.translated).toEqual([
			{ user: "甲{{seg1}}乙{{seg2}}", assistant: "一{{seg1}}二{{seg2}}" },
		]);
		expect(s.failures).toEqual([]);
	});

	it("历史快照整场会话复用，且随每次请求发出", () => {
		let historyReads = 0;
		const history: ChatTurn[] = [
			{ role: "user", content: "旧{{seg1}}" },
			{ role: "assistant", content: "旧译{{seg1}}" },
		];
		const s = startSession(["甲", "乙"], {
			history: () => {
				historyReads++;
				return history;
			},
		});

		// 重试会再发一次请求，但历史只取一次快照
		s.streams[0].options.onChunk("一{{seg1}}二{{seg3}}");
		expect(historyReads).toBe(1);
		expect(s.streams[0].options.history).toEqual(history);
		expect(s.streams[1].options.history).toEqual(history);
	});

	it("重试请求带上一轮的输入/输出与诊断，并把子文本单独作为 user", () => {
		const s = startSession(["甲", "乙", "丙"]);

		// 第 2 段给了 3 号 → 从下标 1 起错位
		s.streams[0].options.onChunk("一{{seg1}}二{{seg3}}");
		expect(s.streams.length).toBe(2);

		const retry = s.streams[1].options.retry;
		expect(retry).toBeDefined();
		expect(retry?.previousInput).toBe("甲{{seg1}}乙{{seg2}}丙{{seg3}}");
		expect(retry?.previousOutput).toBe("一{{seg1}}二{{seg3}}");
		expect(retry?.reminder).toContain("第 2 个碎片");
		// 本次要译的是后半段子文本，序号仍是绝对的
		expect(s.streams[1].options.text).toBe("乙{{seg2}}丙{{seg3}}");
		// 首次请求没有重试上下文
		expect(s.streams[0].options.retry).toBeUndefined();
	});
});

describe("断点重试", () => {
	it("序号错位时只重译后半段，子文本保持绝对序号", () => {
		let metaCalls = 0;
		const s = startSession(["甲", "乙", "丙"], {
			getPageMeta: () => {
				metaCalls++;
				return pageMeta();
			},
		});

		// 第 1 段对齐
		s.streams[0].options.onChunk("一{{seg1}}");
		// 第 2 段序号本该是 2，模型给了 3 → 判定从下标 1 起错位
		s.streams[0].options.onChunk("二{{seg3}}");

		expect(s.streams[0].aborted).toBe(true);
		expect(s.restored).toEqual([1, 2]);

		// 重新发起：只发后半段，序号仍是绝对的 2 / 3
		expect(s.streams.length).toBe(2);
		expect(s.streams[1].options.text).toBe("乙{{seg2}}丙{{seg3}}");
		// 元数据只在会话开始时取一次：重试（新的一轮流）不重取，
		// 否则标题中途一变，同一次会话的重试就会换 system，前缀稳定性直接破掉
		expect(metaCalls).toBe(1);
	});

	it("重试流按后半段段数收尾，不会被当成漏段再重试", () => {
		const s = startSession(["甲", "乙"]);

		s.streams[0].options.onChunk("一{{seg1}}二{{seg3}}");
		expect(s.streams.length).toBe(2);

		// 重试流只译第 2 段：段数 1 == 期望 1，正常收尾
		s.streams[1].options.onChunk("二{{seg2}}");
		s.streams[1].options.onDone();
		expect(s.finished()).toBe(1);
		expect(s.destroyed()).toBe(0);
	});

	it("模型无视「只译后半段」、从 1 重述全文时，宽容丢弃已译部分", () => {
		const s = startSession(["甲", "乙", "丙"]);

		s.streams[0].options.onChunk("一{{seg1}}二{{seg3}}");
		expect(s.streams.length).toBe(2);

		// 重试流把全文从头重述一遍：1 / 2 段属于已译部分，直接丢弃；
		// 只有 3 号之后的段才写回，且不会被判成又想重试
		s.streams[1].options.onChunk("一{{seg1}}二{{seg2}}三{{seg3}}");
		s.streams[1].options.onDone();

		expect(s.streams.length).toBe(2);
		expect(s.written.slice(-2)).toEqual([
			{ index: 1, text: "二" },
			{ index: 2, text: "三" },
		]);
		expect(s.finished()).toBe(1);
	});

	it("末尾吞段（输出段数不足）从已对齐处续译", () => {
		const s = startSession(["甲", "乙", "丙"]);

		// 只输出两段就 DONE：序号校验抓不到（尾段没有序号），靠段数兜底
		s.streams[0].options.onChunk("一{{seg1}}二");
		s.streams[0].options.onDone();

		expect(s.streams.length).toBe(2);
		expect(s.restored).toEqual([1, 2]);
		expect(s.streams[1].options.text).toBe("乙{{seg2}}丙{{seg3}}");
		expect(s.streams[1].options.retry?.reminder).toContain("输入共有 3 个碎片");
		expect(s.destroyed()).toBe(0);
	});

	it("换流后旧流的迟到回调不影响新流", () => {
		const s = startSession(["甲", "乙", "丙"]);

		// 第 2 段给了 3 号 → 触发断点重试，换到第 2 条流
		s.streams[0].options.onChunk("一{{seg1}}二{{seg3}}");
		expect(s.streams.length).toBe(2);
		const writtenBefore = s.written.length;

		// 旧流的 chunk / DONE 迟到（abort 竞态、端口在途消息）：全部丢弃，
		// 否则会推进新流的解析器，滚出一串连环错位
		s.streams[0].options.onChunk("脏{{seg2}}");
		s.streams[0].options.onDone();

		expect(s.written.length).toBe(writtenBefore);
		expect(s.streams.length).toBe(2);
		expect(s.finished()).toBe(0);
		expect(s.destroyed()).toBe(0);
	});

	it("连续错位到上限后放弃并回滚原文", () => {
		let ended = 0;
		const s = startSession(["甲"], {
			onEnded: () => {
				ended++;
			},
		});

		// 每轮流都喂错误序号（期望 1，给 9），一路撞到 MAX_ATTEMPTS
		for (let guard = 0; guard < 20 && s.destroyed() === 0; guard++) {
			s.streams[s.streams.length - 1].options.onChunk("x{{seg9}}");
		}

		// 首次 + 5 次重试 = 6 轮；第 6 轮错位时到达上限，回滚并结束
		expect(s.streams.length).toBe(6);
		expect(s.streams[5].aborted).toBe(true);
		expect(s.destroyed()).toBe(1);
		expect(ended).toBe(1);
		// 放弃也要交给入口：清历史 + 提示
		expect(s.failures).toHaveLength(1);
		expect(s.failures[0]).toContain("错位");
		expect(s.translated).toEqual([]);
	});
});

describe("收尾与回滚", () => {
	it("ERROR 时回滚原文并结束", () => {
		let ended = 0;
		const s = startSession(["甲"], {
			onEnded: () => {
				ended++;
			},
		});

		s.streams[0].options.onError("boom");
		expect(s.destroyed()).toBe(1);
		expect(s.finished()).toBe(0);
		expect(s.failures).toEqual(["boom"]);
		expect(s.translated).toEqual([]);
		expect(ended).toBe(1);
	});

	it("端口异常断开时回滚原文并结束", () => {
		let ended = 0;
		const s = startSession(["甲"], {
			onEnded: () => {
				ended++;
			},
		});

		s.streams[0].options.onDisconnect?.();
		expect(s.destroyed()).toBe(1);
		expect(s.failures).toHaveLength(1);
		expect(ended).toBe(1);
	});
});

describe("abort", () => {
	it("回滚原文、中止在途流，重复调用是幂等空操作", () => {
		const fake = createFakeTranslator(["甲"]);
		const { transport, streams } = createFakeTransport();
		const handle = startTranslationSession({
			translator: fake.translator,
			transport,
			getPageMeta: pageMeta,
			getHistory: () => [],
			onTranslated: () => {},
			// 主动打断属于用户重新划词：绝不该被当成失败
			onFailed: () => {
				throw new Error("主动打断不应算失败");
			},
			onEnded: () => {},
		});

		handle.abort();
		expect(fake.destroyed()).toBe(1);
		expect(streams[0].aborted).toBe(true);

		handle.abort();
		expect(fake.destroyed()).toBe(1);
	});
});
