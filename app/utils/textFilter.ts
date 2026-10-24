/**
 * 选区预筛的纯文本判定：这段文字到底值不值得翻译。
 *
 * 为什么单独拆出来：它跑在 `browser.i18n.detectLanguage` 之前，是最廉价的一道
 * 门槛，要能单测又不碰任何浏览器对象（webextension-polyfill 在 Node 下导入就抛错）。
 */

/**
 * URL 形态：带 scheme 的完整链接（http:/ftp:/mailto: 等），或 www. 开头的省略写法。
 *
 * 口径故意保守——只认这两种明确形态，裸域名（如 example.com）不排除：
 * 真划到一个裸域名弹了按钮，代价只是多点一下；而把 node.js 这类正常词汇
 * 当 URL 排掉，按钮就再也不出来了，那种静默失效更难查。
 */
const URL_PATTERN = /(?:[a-z][a-z0-9+.-]*:\/\/|www\.)\S+/gi;

/**
 * 去掉 URL 之后还剩不剩字母（中日韩文字也算字母，Unicode 里都是 \p{L}）。
 *
 * 数字、标点、空白一律不算可翻译内容，所以纯链接、纯数字（3.14）、纯符号（→）
 * 的选区都不该弹按钮。
 */
export function hasTranslatableText(text: string): boolean {
	return /\p{L}/u.test(text.replace(URL_PATTERN, " "));
}
