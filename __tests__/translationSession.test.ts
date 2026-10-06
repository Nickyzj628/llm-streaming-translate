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
import type { StreamTranslateOptions } from "@/utils/streamTranslate";

/**
 * 一次会话的对齐 / 重试 / 收尾单测。
 *
 * 为什么测这些：{{segN}} 序号对齐和"从错位段起重译"是整条链路最容易写漂、
 * 又只有真跑一遍长文才看得出来的部分——重构前它散在 InlineTranslator 与
 * TranslationSession 两边、靠回调互相调用，且零覆盖。这里用假 translator
 * 加假端口流把每条分支钉死：序号校验、段数兜底、重试上限、收尾与回滚。
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

/** 起一次会话，把常用句柄一起交出来 */
function startSession(rows: string[], onEnded: () => void = () => {}) {
	const fake = createFakeTranslator(rows);
	const { transport, streams } = createFakeTransport();

	startTranslationSession({
		translator: fake.translator,
		transport,
		getPageMeta: pageMeta,
		onEnded,
	});

	return { ...fake, streams };
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
		const s = startSession(["甲", "乙"], () => {
			ended++;
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

	it("写回前在会话层删掉 {{varN}} 占位符", () => {
		const s = startSession(["x"]);

		s.streams[0].options.onChunk("译文{{var1}}{{seg1}}");
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
});

describe("断点重试", () => {
	it("序号错位时只重译后半段，子文本保持绝对序号", () => {
		let metaCalls = 0;
		const fake = createFakeTranslator(["甲", "乙", "丙"]);
		const { transport, streams } = createFakeTransport();

		startTranslationSession({
			translator: fake.translator,
			transport,
			getPageMeta: () => {
				metaCalls++;
				return pageMeta();
			},
			onEnded: () => {},
		});

		// 第 1 段对齐
		streams[0].options.onChunk("一{{seg1}}");
		// 第 2 段序号本该是 2，模型给了 3 → 判定从下标 1 起错位
		streams[0].options.onChunk("二{{seg3}}");

		expect(streams[0].aborted).toBe(true);
		expect(fake.restored).toEqual([1, 2]);

		// 重新发起：只发后半段，序号仍是绝对的 2 / 3
		expect(streams.length).toBe(2);
		expect(streams[1].options.text).toBe("乙{{seg2}}丙{{seg3}}");
		// 语境每次发起都重读（页面标题可能变了）
		expect(metaCalls).toBe(2);
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

	it("末尾吞段（输出段数不足）从已对齐处续译", () => {
		const s = startSession(["甲", "乙", "丙"]);

		// 只输出两段就 DONE：序号校验抓不到（尾段没有序号），靠段数兜底
		s.streams[0].options.onChunk("一{{seg1}}二");
		s.streams[0].options.onDone();

		expect(s.streams.length).toBe(2);
		expect(s.restored).toEqual([1, 2]);
		expect(s.streams[1].options.text).toBe("乙{{seg2}}丙{{seg3}}");
		expect(s.destroyed()).toBe(0);
	});

	it("连续错位到上限后放弃并回滚原文", () => {
		let ended = 0;
		const s = startSession(["甲"], () => {
			ended++;
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
	});
});

describe("收尾与回滚", () => {
	it("ERROR 时回滚原文并结束", () => {
		let ended = 0;
		const s = startSession(["甲"], () => {
			ended++;
		});

		s.streams[0].options.onError("boom");
		expect(s.destroyed()).toBe(1);
		expect(s.finished()).toBe(0);
		expect(ended).toBe(1);
	});

	it("端口异常断开时回滚原文并结束", () => {
		let ended = 0;
		const s = startSession(["甲"], () => {
			ended++;
		});

		s.streams[0].options.onDisconnect?.();
		expect(s.destroyed()).toBe(1);
		expect(ended).toBe(1);
	});
});

describe("abort", () => {
	it("回滚原文、中止在途流，重复调用是幂等空操作", () => {
		let ended = 0;
		const fake = createFakeTranslator(["甲"]);
		const { transport, streams } = createFakeTransport();

		const session = startTranslationSession({
			translator: fake.translator,
			transport,
			getPageMeta: pageMeta,
			onEnded: () => {
				ended++;
			},
		});

		session.abort();
		expect(fake.destroyed()).toBe(1);
		expect(streams[0].aborted).toBe(true);
		expect(ended).toBe(1);

		session.abort();
		expect(fake.destroyed()).toBe(1);
		expect(ended).toBe(1);
	});
});
