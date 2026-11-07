/**
 * 页级上下文：一次页面生命周期内所有**成功**翻译的对话对 + 冻结的网页元数据。
 *
 * 为什么放 content 的模块单例：content script 的寿命就是页面本身——页面刷新 /
 * 关闭时随 realm 一起销毁，正好是"关闭页面前缓存上下文"要的语义。background
 * 会被 MV3 回收（PortListener 里本就什么都没留），storage.local 是跨页面共享的
 * 持久配置，两者都不能用。
 *
 * 两条策略（见 AGENTS/对话记录）：
 * - **历史只在失败时清空**：不做条数/字符预算，也不按 SPA 路由变化清空，
 *   目的是让每次请求的 messages 前缀逐字节稳定，供应商的 prompt cache 才能命中；
 * - **pageMeta 只在首次翻译时读一次、之后永久冻结**：标题/描述一变（未读数、
 *   播放器曲目、SPA 异步改标题）就会让 system 变、整段历史 cache miss，为前缀
 *   缓存利用率放弃"语境永远最新"。
 *
 * 失败的翻译不写入历史：半截译文/半截原文喂给后续翻译只会带偏术语与语气。
 */
import type { ChatTurn } from "@/types/messages";

/** 已完成的翻译对（user = 当初发给模型的协议全文，assistant = 最终协议输出） */
let turns: ChatTurn[] = [];

/** 冻结的网页元数据（null = 本页还没翻译过） */
let pageMeta: { title: string; description: string } | null = null;

/**
 * 读取网页元数据，但只读一次：首次翻译时快照，之后无论页面怎么变都返回同一份。
 * @param read 真正读 DOM 的函数（便于单测注入，也避免本模块依赖 document）
 */
export function readPageMetaOnce(
	read: () => {
		title: string;
		description: string;
	},
): { title: string; description: string } {
	if (pageMeta === null) {
		pageMeta = read();
	}
	return pageMeta;
}

/** 当前页的历史快照（调用方按需复制，避免中途被追加影响在途请求） */
export function getHistory(): ChatTurn[] {
	return turns;
}

/** 追加一条历史消息（成功翻译时由入口写入 user + assistant 两条） */
export function appendHistory(turn: ChatTurn): void {
	turns.push(turn);
}

/**
 * 清空历史（翻译失败时调用）。
 * 注意不动 pageMeta：system prompt 保持稳定，下一次请求的前缀仍然能命中缓存。
 */
export function clearHistory(): void {
	turns = [];
}
