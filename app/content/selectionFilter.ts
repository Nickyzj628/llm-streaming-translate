import { hasTranslatableNode } from "@/content/domAnchor";
import { hasTranslatableText } from "@/utils/textFilter";

/**
 * 阶段一预筛：这段选区值不值得弹按钮、值不值得叫醒语言检测。
 *
 * 两层判断，便宜的在前：
 * - 文本层：去掉 URL 之后连字母都不剩（纯链接、纯数字、纯符号）就不看；
 * - DOM 层：选区里没有任何非代码块的可翻文本（整块选中 pre/code）也不看。
 *
 * 为什么放在 detectLanguage 之前：检测本身不贵，但给一段 URL 或者一个代码块弹
 * 按钮本身就是错的——用户点下去只会换来一次没意义的模型请求。两层都是同步的，
 * 早退比等 CLD 还快。
 */
export function shouldOfferTranslation(range: Range, text: string): boolean {
	if (!hasTranslatableText(text)) return false;
	return hasTranslatableNode(range);
}
