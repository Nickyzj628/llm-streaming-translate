import { createInlineTranslator } from "@/content/InlineTranslator";
import {
	startTranslationSession,
	type TranslationSession,
} from "@/content/TranslationSession";

/**
 * content 端"划词翻译"会话控制器。
 *
 * 它把入口（index.ts）需要的动作收敛成一组有名字的函数——建翻译器、读选区、
 * 打断会话、回答"是否正在翻译"，入口只负责"事件 → 动作"的声明式转发。
 *
 * 一次会话的生命周期（发起 → 错位重试 → 收尾/放弃）在 TranslationSession.ts，
 * 本控制器只持有"当前活跃会话"这一项状态，不再自己管翻译器与流句柄：
 *   start(range)  → 打断旧会话 → 建 translator → 校验空文本 → 交给会话编排
 *   abort()       → 打断当前会话（销毁 translator + 断开端口）
 *   dispose()     → 同 abort（页面卸载时由调用方触发）
 */
export interface TranslationController {
	/** 开始翻译一个选区 Range（点击浮动按钮触发） */
	start: (range: Range) => void;
	/**
	 * 打断当前进行中的翻译：销毁翻译器 + 断开端口。
	 * 重新划词 / 页面卸载时调用，避免留下浪费的 background 请求。空闲时是幂等空操作。
	 */
	abort: () => void;
	/** 清理并打断当前会话（beforeunload 时由调用方触发） */
	dispose: () => void;
	/** 读取当前选区文本（trim 后），供入口判断是否显示浮动按钮 */
	getSelectedText: () => string;
	/** 是否正在翻译中（供入口在选区变化时决定是否忽略，保持与原行为一致） */
	isTranslating: () => boolean;
}

export function createTranslationController(): TranslationController {
	/** 当前活跃会话（null 表示空闲）；会话结束或被打断后清空 */
	let activeSession: TranslationSession | null = null;

	/**
	 * 读取当前网页的元数据（title + meta description），供 background 注入 system prompt
	 * 帮助模型理解页面主题与语境。description 为空时省略该字段。
	 * 截断保护：避免超长 title/description 塞爆 prompt。
	 */
	function getPageMeta(): { title: string; description: string } {
		const title = document.title.trim().slice(0, 200);
		const descEl = document.querySelector<HTMLMetaElement>(
			'meta[name="description"], meta[property="og:description"]',
		);
		const description = (descEl?.content ?? "").trim().slice(0, 300);
		return { title, description };
	}

	function getSelectedText(): string {
		const selection = window.getSelection();
		return selection ? selection.toString().trim() : "";
	}

	/** 打断当前会话（若有）：回滚 DOM + 断开端口。空闲时是幂等空操作 */
	function abortCurrent(): void {
		const session = activeSession;
		activeSession = null;
		session?.abort();
	}

	function start(range: Range): void {
		// 打断前一个进行中的翻译（重新划词/取消选择都会走到这里）
		abortCurrent();

		// 创建原地翻译器，提取文本节点、建立锚点、得到分段协议文本
		const translator = createInlineTranslator(range);
		const segmentedText = translator.getText();

		// 选区内没有可翻译的文本节点（如选区全部落在被跳过的位置）：
		// 销毁锚点直接放弃，不发无意义的空请求
		if (segmentedText === "") {
			translator.destroy();
			return;
		}

		const session = startTranslationSession({
			translator,
			initialText: segmentedText,
			getPageMeta,
			// 会话自然结束（成功/失败/放弃）时清活跃句柄，且必须确认它仍是当前会话——
			// 旧会话的迟到回调不能把新会话的句柄清掉（闭包版踩过的时序 bug）
			onEnded: () => {
				if (activeSession === session) {
					activeSession = null;
				}
			},
		});
		activeSession = session;
	}

	return {
		start,
		abort: abortCurrent,
		dispose: abortCurrent,
		getSelectedText,
		isTranslating: () => activeSession !== null,
	};
}
