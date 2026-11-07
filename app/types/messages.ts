/**
 * 对话消息（content 端维护的页级历史，原样透传给模型）。
 *
 * 为什么只保留 user / assistant：system 由 background 按当前配置现拼，
 * 把它也塞进 history 会让"前缀稳定"依赖两份不同的拼装逻辑；工具消息本项目不用。
 */
export interface ChatTurn {
	role: "user" | "assistant";
	content: string;
}

/**
 * 重试上下文：上一轮**实际发出去**的输入、模型的原始输出，以及系统诊断。
 *
 * 为什么非带不可：小模型对"抽象描述哪里错了"几乎无感，必须看到自己上一轮逐字
 * 输出的错处才改得动。三者随 START 一起发给 background，由它拼成
 * `[user 上一轮输入] [assistant 上一轮输出] [user <system-reminder>…</system-reminder>]`，
 * 后面紧跟本次要译的子文本。
 */
export interface StreamTranslateRetry {
	/** 上一轮实际发给模型的 user 文本（首次为全文，后续重试为后半段子文本） */
	previousInput: string;
	/** 上一轮模型的原始输出（已剥离半截协议标记尾，见 protocol.stripIncompleteSegmentPrefix） */
	previousOutput: string;
	/** <system-reminder>…</system-reminder> 包裹的诊断指导（见 utils/retryReminder.ts） */
	reminder: string;
}

export interface StreamTranslateStart {
	type: "START";
	/** 本次要翻译的协议文本（首次为全文，重试为从错位碎片起的子文本） */
	text: string;
	/** 网页元数据（标题 + description），由 content 端读取，background 注入 system prompt 帮助理解语境 */
	pageMeta?: { title: string; description: string };
	/** 页级历史（此前成功的翻译对），拼接在 system 之后、本次 user 之前 */
	history?: ChatTurn[];
	/** 重试上下文（首次请求没有） */
	retry?: StreamTranslateRetry;
}

export interface StreamTranslateChunk {
	type: "CHUNK";
	chunk: string;
}

export interface StreamTranslateDone {
	type: "DONE";
}

export interface StreamTranslateError {
	type: "ERROR";
	error: string;
}

export type StreamTranslatePortMessage =
	| StreamTranslateStart
	| StreamTranslateChunk
	| StreamTranslateDone
	| StreamTranslateError;

/**
 * background 端监听的长连接端口名。
 * 定义在共享类型文件里，保证 content / background 两端一致
 *（AGENTS.md 协议约定：端口名改动必须两端同步）。
 */
export const STREAM_TRANSLATE_PORT = "stream-translate";
