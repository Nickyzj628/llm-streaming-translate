import { defineConfig } from "@rstest/core";

/**
 * Rstest 单元测试配置（addfox-testing skill 的推荐方案）。
 *
 * 目前只接入纯逻辑单测：覆盖 app/utils/protocol.ts 的段对齐协议（标记形态、
 * 流式拆段、未完成前缀剥离、段数统计）——这是全项目最易写漂、之前零覆盖的部分。
 * DOM/组件测试与 E2E 未接入，需要时按 .agents/skills/addfox-testing/reference.md 扩展。
 */
export default defineConfig({
	include: ["__tests__/**/*.test.ts"],
});
