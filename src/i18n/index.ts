import { moment } from 'obsidian';
import en from './en';
import zh from './zh';

// 所有翻译
const translations = {
    en,
    zh
};

type TranslationDict = {[key: string]: string};

/**
 * 获取翻译文本
 * @param key 翻译键
 * @returns 翻译后的文本，如果没有找到翻译则返回键本身
 */
export function t(key: string): string {
    // 获取 Obsidian 当前语言
    const locale = moment.locale();
    // 如果是中文环境，使用中文翻译，否则使用英文
    const currentTranslations = locale.startsWith('zh') ? translations.zh : translations.en;
    
    // 直接获取翻译
    const translation = (currentTranslations as TranslationDict)[key];
    if (translation) {
        return translation;
    }

    // 如果没有找到翻译，返回键本身
    return key;
}



/**
 * 获取当前语言
 * @returns 当前语言代码 'en' 或 'zh'
 */
export function getLocale(): string {
    const locale = moment.locale();
    return locale.startsWith('zh') ? 'zh' : 'en';
} 