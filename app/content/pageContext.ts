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
 * - **pageMeta 首次翻译时快照，之后只在"标题变了"时重新快照**：标题是"页面身份"
 *   的便宜代理，换页就整份上下文（历史 + system）一起归零，避免拿上一页的语境去
 *   翻这一页的内容。只比标题，不监听 DOM 事件——SPA 很常见地每 tick 重设同一个
 *   标题，按事件清会把上下文清成筛子。
 *
 * 失败的翻译不写入历史：半截译文/半截原文喂给后续翻译只会带偏术语与语气。
 */
import type { ChatTurn } from "@/types/messages";

/** 已完成的翻译对（user = 当初发给模型的协议全文，assistant = 最终协议输出） */
let turns: ChatTurn[] = [];

/** 冻结的网页元数据（null = 本页还没翻译过） */
let pageMeta: { title: string; description: string } | null = null;

/**
 * 取网页元数据：首次翻译时快照；之后每次开新会话先比"页面标题"，变了就当换了页面
 * ——清空历史对话并重新快照（system prompt 同步换成新页面的背景）。
 *
 * 为什么只比标题、且由本函数的返回值提供比较基准：read() 是同一条取值路径，
 * 「判断是否换页」与「写进 prompt 的标题」永远是同一个值，不会出现一边 trim/
 * 截断、一边用原文的比较错位。description 单独变化不重置（异步补全很常见）。
 *
 * 为什么不在换页时只换 system、保留历史：历史里那些 user/assistant 轮属于上一页，
 * 留着既会污染语境，也会让"前缀稳定"变成假的（system 变了，前缀本来就已经 miss）。
 *
 * @param read 真正读 DOM 的函数（便于单测注入，也避免本模块依赖 document）
 */
export function readPageMeta(
	read: () => {
		title: string;
		description: string;
	},
): { title: string; description: string } {
	const next = read();
	if (pageMeta === null) {
		pageMeta = next;
		return pageMeta;
	}
	if (next.title !== pageMeta.title) {
		// 换页：上一页的对话对没有复用价值，留着只会把模型带偏
		clearHistory();
		pageMeta = next;
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
