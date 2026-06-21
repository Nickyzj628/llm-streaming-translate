export interface StreamTranslateStart {
	type: "START";
	text: string;
	/** 文本节点段数，用于 LLM 分段对齐；为空时退化为普通翻译 */
	segmentCount?: number;
}

export interface StreamTranslateChunk {
	type: "CHUNK";
	chunk: string;
}

export interface StreamTranslateReasoning {
	type: "REASONING";
	reasoning: string;
}

export interface StreamTranslateUsage {
	type: "USAGE";
	usage: {
		promptTokens: number;
		completionTokens: number;
	};
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
	| StreamTranslateReasoning
	| StreamTranslateUsage
	| StreamTranslateDone
	| StreamTranslateError;
