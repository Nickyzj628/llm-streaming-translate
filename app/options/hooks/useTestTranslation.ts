/**
 * 测试翻译板块的状态机逻辑。
 *
 * 端口生命周期（connect、监听 CHUNK/DONE/ERROR、断开兜底、清理）都收敛在
 * 共享的 utils/streamTranslate.ts 客户端里，本 hook 只负责：
 * - 把测试文本拼成协议串（段间用 SEGMENT_SEPARATOR 分隔）发给 background；
 * - 收到 CHUNK 时按段"删除占位符"流式写回输入框；
 * - 超时（30s）/ 失败 / 异常断开时回滚原文行。
 *
 * 与 content 端真实划词翻译共用同一套消息协议与客户端，行为模拟其一。
 */
import { createSignal, onCleanup } from "solid-js";
import { useToast } from "../../hooks/useToast";
import {
	extractTranslatedContent,
	SEGMENT_SEPARATOR,
	stripIncompleteSegmentPrefix,
} from "../../utils/protocol";
import { streamTranslate } from "../../utils/streamTranslate";
import { TEST_SAMPLE } from "../utils/constants";

interface UseTestTranslationOptions {
	/** 取当前 API Base URL 的 getter（点击"开始翻译"时读取最新值） */
	getBaseUrl: () => string;
	/** 取当前模型名的 getter */
	getModel: () => string;
}

/** 测试翻译超时：与 content 端真实划词一致，避免长时间无响应 */
const TEST_TIMEOUT_MS = 30000;

export function useTestTranslation(options: UseTestTranslationOptions): {
	testSource: () => string[];
	isTesting: () => boolean;
	updateTestLine: (index: number, value: string) => void;
	addTestLine: () => void;
	resetTestSource: () => void;
	start: () => void;
} {
	const { showToast } = useToast();
	const [isTesting, setIsTesting] = createSignal(false);
	// 文本节点列表（每个元素 = 一段协议输入，段间用 SEGMENT_SEPARATOR 分隔），
	// 翻译过程中被逐段流式替换为译文
	const [testSource, setTestSource] = createSignal<string[]>(TEST_SAMPLE);
	/** 当前翻译句柄（streamTranslate 返回值），用于卸载时取消 */
	let currentStream: { abort: () => void } | null = null;

	onCleanup(() => {
		currentStream?.abort();
		currentStream = null;
	});

	// 更新指定文本节点的输入内容（Solid 不可变更新：map 出新数组）
	const updateTestLine = (index: number, value: string): void => {
		setTestSource((prev) => prev.map((line, i) => (i === index ? value : line)));
	};

	// 添加一个空的文本节点输入框
	const addTestLine = (): void => {
		setTestSource((prev) => [...prev, ""]);
	};

	// 复原：把测试输入重置为默认示例 TEST_SAMPLE
	const resetTestSource = (): void => {
		setTestSource(TEST_SAMPLE);
	};

	const start = (): void => {
		if (isTesting()) return;
		if (!options.getBaseUrl() || !options.getModel()) {
			showToast("请先填写 API Base URL 和模型", "error");
			return;
		}

		// 记住原文行数组：翻译失败/超时时恢复，模拟真实划词翻译失败回滚原文的行为
		const originalLines = testSource();
		if (originalLines.every((line) => line.trim() === "")) {
			showToast("请先输入原文", "error");
			return;
		}

		setIsTesting(true);

		// 复位 UI 状态（isTesting 归 false、清掉句柄）
		const finish = (): void => {
			setIsTesting(false);
			currentStream = null;
		};

		// 累积收到的译文：background 流式发 chunk，一个段可能被拆在多个 chunk 里，
		// 必须先把所有 chunk 拼成完整输出，再按段分隔拆解，才能正确对齐段数。
		let result = "";

		currentStream = streamTranslate({
			text: originalLines.join(SEGMENT_SEPARATOR),
			timeoutMs: TEST_TIMEOUT_MS,
			onChunk: (chunk) => {
				result += chunk;
				// 流式替换：把累积输出按段"删除占位符"后逐段写回对应输入框，
				// 模拟真实划词页面中"选中部分被译文替换"的整体效果。
				// 占位符对应未选中/preserve 内容，测试板块没有 DOM 兜底，
				// 这里直接删掉占位符即可（与 content 端写回逻辑一致）。
				// 先剥离段尾"未完成的分隔符前缀"（{{seg / {{se / {{s / {{），
				// 防止流式过程中分隔符被拆 chunk 到达时把前缀当译文写进输入框（见协议注释）。
				const translatedLines = result
					.split(SEGMENT_SEPARATOR)
					.map((line) =>
						extractTranslatedContent(stripIncompleteSegmentPrefix(line)),
					);
				setTestSource((prev) =>
					prev.map((original, i) => {
						const translated = translatedLines[i];
						// 模型尚未输出该行（越界）或输出为空行时不写回，保持原文
						return translated !== undefined && translated.trim() !== ""
							? translated
							: original;
					}),
				);
			},
			onDone: () => {
				showToast("翻译完成", "success");
				finish();
			},
			onError: (error) => {
				showToast(`测试失败：${error}`, "error");
				// 失败恢复原文行，避免输入框残留半截译文
				setTestSource(originalLines);
				finish();
			},
			onDisconnect: () => {
				// 超时或端口异常断开：提示并恢复原文行
				showToast("测试翻译超时", "error");
				setTestSource(originalLines);
				finish();
			},
		});
	};

	return {
		testSource,
		isTesting,
		updateTestLine,
		addTestLine,
		resetTestSource,
		start,
	};
}
