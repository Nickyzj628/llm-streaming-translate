/**
 * Options 页面专用常量。
 *
 * 与协议相关的常量（段分隔符 {{seg}}、占位符正则）统一放在 `@/utils/protocol.ts`，
 * 这里只放 options 页面自身的业务常量，避免与 content/background 共享的逻辑混淆。
 */

/** 供应商预设：一键填充 baseUrl / model / body / apiKey */
export interface Preset {
	name: string;
	baseUrl: string;
	model: string;
	apiKey?: string;
	body: string;
}

export const PRESETS: Preset[] = [
	{
		name: "DeepSeek",
		baseUrl: "https://api.deepseek.com",
		model: "deepseek-v4-flash",
		body: '{"thinking": {"type": "disabled"}}',
	},
	{
		name: "OpenRouter",
		baseUrl: "https://openrouter.ai/api/v1",
		model: "openai/gpt-5.6-luna",
		body: '{"reasoning_effort": "minimal"}',
	},
	{
		name: "Google AI Studio",
		baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
		model: "gemma-4-26b-a4b-it",
		body: '{"reasoning_effort": "minimal"}',
	},
	{
		name: "llama.cpp",
		baseUrl: "http://127.0.0.1:11434/v1",
		model: "",
		apiKey: "",
		body: '{"chat_template_kwargs": {"enable_thinking": false}}',
	},
];

/**
 * 测试板块的默认文本节点。
 * 与 StreamTranslator.ts 的 system prompt 示例保持一致，覆盖两种协议形态
 *（整段翻译 / 含占位符的不翻译内容）。
 * 每个元素 = 一个文本节点（协议的一段，翻译时逐段写回）。
 */
export const TEST_SAMPLE = ["The quick brown fox jumps over the lazy dog."];
