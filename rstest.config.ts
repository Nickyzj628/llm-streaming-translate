import { defineConfig } from "@rstest/core";

/**
 * Rstest 单元测试配置（addfox-testing skill 的推荐方案）。
 *
 * 目前只接入纯逻辑单测，覆盖全项目最易写漂、早先零覆盖的三块：
 * - app/utils/protocol.ts：段对齐协议（标记形态、流式拆段、未完成前缀剥离、段数统计）；
 * - app/content/segmentPlan.ts：占位符编号规则；
 * - app/content/TranslationSession.ts：一次会话的序号对齐、断点重试与收尾
 *   （端口客户端由入口注入，测试塞假流即可，不需要 mock 模块）。
 * DOM/组件测试与 E2E 未接入，需要时按 .agents/skills/addfox-testing/reference.md 扩展。
 */
export default defineConfig({
	include: ["__tests__/**/*.test.ts"],
});
