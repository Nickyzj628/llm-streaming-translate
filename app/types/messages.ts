export interface StreamTranslateStart {
	type: "START";
	text: string;
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
