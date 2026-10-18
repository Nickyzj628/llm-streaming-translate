import browser from "webextension-polyfill";
import { isTargetLanguage, topLanguage } from "@/utils/language";
import { getStorage } from "@/utils/storage";

/**
 * 判断选中的文本是不是已经是目标语言（是的话不用翻，不弹按钮）。
 *
 * detectLanguage 虽然是异步的，但底层是 CLD，开销很小：一句话通常 0.2ms 左右，
 * 大段长文也就 1ms，等它一下完全不拖累弹按钮。
 *
 * 检测或读配置失败都按“不是目标语言”处理：宁可多弹一次按钮，也别把功能挡死。
 */
export async function isAlreadyTargetLanguage(text: string): Promise<boolean> {
	try {
		const result = await browser.i18n.detectLanguage(text);
		const { targetLang } = await getStorage(["targetLang"]);
		return isTargetLanguage(topLanguage(result.languages), targetLang);
	} catch {
		return false;
	}
}
