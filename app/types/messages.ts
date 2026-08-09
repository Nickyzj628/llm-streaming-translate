export interface StreamTranslateStart {
	type: "START";
	text: string;
	/** 网页元数据（标题 + description），由 content 端读取，background 注入 system prompt 帮助理解语境 */
	pageMeta?: { title: string; description: string };
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
 * 定义在共享类型文件里，保证 content / options / background 三端一致
 *（AGENTS.md 协议约定：端口名改动必须三端同步）。
 */
export const STREAM_TRANSLATE_PORT = "stream-translate";
