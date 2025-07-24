/**
 * LinkService
 * 处理条目链接生成、复制和导出功能
 */
import { Entry } from "../models/Entry";
import { Notice, Menu, setIcon } from "obsidian";
import BetterNotesPlugin from "../main";
import { extractFilenameFromPath } from "../utils/utils";
import html2canvas from 'html2canvas';
import { t } from '../i18n';
/**
 * 链接变量类型定义
 * 用于生成不同类型条目的链接变量
 */
export interface LinkVariables {
    // 所有条目通用变量
    index: string;     // 索引/链接
    value: string;     // 条目内容
    file?: string;     // 文件名（不含路径）
    
    // PDF特有变量
    page?: string;     // 页码
    
    // 视频特有变量
    timestamp?: string; // 时间戳
    url?: string;      // 视频URL
}

/**
 * 卡片变量类型定义
 * 用于生成条目卡片的变量
 */
export interface CardVariables {
    link: string;       // 条目链接（使用用户自定义的链接模板）
    comment: string;    // 条目批注
    value: string;      // 条目内容
    addTime: string;    // 添加时间
    tag: string;        // 标签（以逗号分隔）
    type: string;       // 条目类型
    proficiency: string; // 熟练度
    set: string;        // 所属集合名称
    color: string;      // 所属集合颜色
}

/**
 * 链接模板配置
 */
export interface LinkTemplates {
    pdfTemplate: string;
    mdTemplate: string;
    videoTemplate: string;
    cardTemplate: string; // 卡片模板
    htmlTemplate: string; // HTML导出模板
}

/**
 * 默认链接模板
 */
export const DEFAULT_LINK_TEMPLATES: LinkTemplates = {
    pdfTemplate: "[[{index}|{value}]]",
    mdTemplate: "[[{index}|{value}]]",
    videoTemplate: "[[{index}|{value}]]",
    cardTemplate: "> [!note]+ {link}\n>> [!quote]+ \n>> {comment}\n",
    htmlTemplate: `<div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 30px; border-radius: 16px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); box-shadow: 0 20px 40px rgba(102, 126, 234, 0.3); max-width: 520px; position: relative; color: white;">
    <div style="position: absolute; top: 15px; right: 20px; background: rgba(255, 255, 255, 0.2); backdrop-filter: blur(10px); padding: 8px 16px; border-radius: 25px; font-size: 12px; font-weight: 600; border: 1px solid rgba(255, 255, 255, 0.3);">
        ✨ {type}
    </div>
    
    <h3 style="margin: 20px 0; color: #FFFFFF; font-size: 28px; font-weight: 300; letter-spacing: 1px;">{value}</h3>
    
    <div style="background: rgba(255, 255, 255, 0.95); padding: 25px; border-radius: 12px; margin: 20px 0; backdrop-filter: blur(15px); border: 1px solid rgba(255, 255, 255, 0.2);">
        <p style="color: #2C3E50; margin: 0; font-size: 20px; font-weight: 500; text-align: center; line-height: 1.5;">{comment}</p>
    </div>
    
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 25px 0;">
        <div style="background: rgba(255, 255, 255, 0.1); padding: 12px; border-radius: 10px; backdrop-filter: blur(5px); border: 1px solid rgba(255, 255, 255, 0.2);">
            <div style="font-size: 11px; opacity: 0.8; margin-bottom: 5px;">COLLECTION</div>
            <div style="font-weight: 600; font-size: 16px;">{set}</div>
        </div>
        <div style="background: rgba(255, 255, 255, 0.1); padding: 12px; border-radius: 10px; backdrop-filter: blur(5px); border: 1px solid rgba(255, 255, 255, 0.2);">
            <div style="font-size: 11px; opacity: 0.8; margin-bottom: 5px;">DATE ADDED</div>
            <div style="font-weight: 600; font-size: 16px;">{addTime}</div>
        </div>
    </div>
</div>`
};

/**
 * 链接服务类
 * 负责处理条目链接的生成、复制和导出
 */
export class LinkService {
    private plugin: BetterNotesPlugin;
    
    /**
     * 构造函数
     * @param plugin BetterNotes插件实例
     */
    constructor(plugin: BetterNotesPlugin) {
        this.plugin = plugin;
    }
    
    /**
     * 显示链接操作菜单
     * @param entry 条目对象
     * @param targetEl 触发菜单的目标元素
     */
    public showLinkMenu(entry: Entry, targetEl: HTMLElement): void {
        const menu = new Menu();
        
        // 添加复制链接选项
        menu.addItem((item) => {
            item.setTitle(t('copy link'))
                .setIcon("link")
                .onClick(async () => {
                    await this.copyEntryLink(entry);
                });
        });
        
        // 添加复制卡片选项
        menu.addItem((item) => {
            item.setTitle(t('copy card'))
                .setIcon("copy")
                .onClick(async () => {
                    await this.copyEntryCard(entry);
                });
        });
        
        // 添加导出图片选项
        menu.addItem((item) => {
            item.setTitle(t('export image'))
                .setIcon("image")
                .onClick(async () => {
                    await this.exportEntryAsImage(entry);
                });
        });
        
        // 显示菜单 - 在目标元素位置显示
        const rect = targetEl.getBoundingClientRect();
        menu.showAtPosition({ x: rect.right, y: rect.top });
    }
    
    /**
     * 复制条目链接到剪贴板
     * 根据条目类型和用户配置的模板生成链接
     * @param entry 条目对象
     * @returns 是否复制成功
     */
    public async copyEntryLink(entry: Entry): Promise<boolean> {
        try {
            // 获取链接变量
            const variables = this.extractLinkVariables(entry);
            
            // 根据条目类型获取相应的链接模板
            let template = "";
            switch (entry.type) {
                case 'pdf':
                    template = this.plugin.settings?.linkTemplates?.pdfTemplate || DEFAULT_LINK_TEMPLATES.pdfTemplate;
                    break;
                case 'md':
                    template = this.plugin.settings?.linkTemplates?.mdTemplate || DEFAULT_LINK_TEMPLATES.mdTemplate;
                    break;
                case 'video':
                    template = this.plugin.settings?.linkTemplates?.videoTemplate || DEFAULT_LINK_TEMPLATES.videoTemplate;
                    break;
                default:
                    template = "[[{index}|{value}]]";
            }
            
            // 替换模板中的变量
            const link = this.replaceTemplateVariables(template, variables);
            
            // 复制到剪贴板
            await navigator.clipboard.writeText(link);
            
            new Notice(t('link copied to clipboard'));
            return true;
        } catch (error) {
            console.error('复制条目链接时出错:', error);
            new Notice(t('copy link failed'));
            return false;
        }
    }
    
    /**
     * 复制条目卡片到剪贴板
     * 根据用户配置的卡片模板生成卡片内容
     * @param entry 条目对象
     * @returns 是否复制成功
     */
    public async copyEntryCard(entry: Entry): Promise<boolean> {
        try {
            // 首先生成链接，作为卡片变量的一部分
            const linkVariables = this.extractLinkVariables(entry);
            
            // 根据条目类型获取相应的链接模板
            let linkTemplate = "";
            switch (entry.type) {
                case 'pdf':
                    linkTemplate = this.plugin.settings?.linkTemplates?.pdfTemplate || DEFAULT_LINK_TEMPLATES.pdfTemplate;
                    break;
                case 'md':
                    linkTemplate = this.plugin.settings?.linkTemplates?.mdTemplate || DEFAULT_LINK_TEMPLATES.mdTemplate;
                    break;
                case 'video':
                    linkTemplate = this.plugin.settings?.linkTemplates?.videoTemplate || DEFAULT_LINK_TEMPLATES.videoTemplate;
                    break;
                default:
                    linkTemplate = "[[{index}|{value}]]";
            }
            
            // 生成链接
            const link = this.replaceTemplateVariables(linkTemplate, linkVariables);
            
            // 提取卡片变量
            const cardVariables = this.extractCardVariables(entry, link);
            
            // 获取卡片模板
            const cardTemplate = this.plugin.settings?.linkTemplates?.cardTemplate || DEFAULT_LINK_TEMPLATES.cardTemplate;
            
            // 替换模板中的变量
            const cardContent = this.replaceCardTemplateVariables(cardTemplate, cardVariables);
            
            // 复制到剪贴板
            await navigator.clipboard.writeText(cardContent);
            
            new Notice(t('copied to clipboard'));
            return true;
        } catch (error) {
            console.error('复制条目卡片时出错:', error);
            new Notice(t('copy failed'));
            return false;
        }
    }
    
    /**
     * 将条目导出为图片
     * 使用html2canvas将HTML模板渲染为图片
     * @param entry 条目对象
     * @returns 是否导出成功
     */
    public async exportEntryAsImage(entry: Entry): Promise<boolean> {
        try {
            // 创建一个临时容器用于渲染HTML
            const container = document.createElement('div');
            container.style.position = 'fixed';
            container.style.left = '-9999px'; // 放在屏幕外
            container.style.top = '0';
            document.body.appendChild(container);
            
            // 获取HTML模板
            const htmlTemplate = this.plugin.settings?.linkTemplates?.htmlTemplate || DEFAULT_LINK_TEMPLATES.htmlTemplate;
            
            // 首先生成链接，作为变量的一部分
            const linkVariables = this.extractLinkVariables(entry);
            
            // 根据条目类型获取相应的链接模板
            let linkTemplate = "";
            switch (entry.type) {
                case 'pdf':
                    linkTemplate = this.plugin.settings?.linkTemplates?.pdfTemplate || DEFAULT_LINK_TEMPLATES.pdfTemplate;
                    break;
                case 'md':
                    linkTemplate = this.plugin.settings?.linkTemplates?.mdTemplate || DEFAULT_LINK_TEMPLATES.mdTemplate;
                    break;
                case 'video':
                    linkTemplate = this.plugin.settings?.linkTemplates?.videoTemplate || DEFAULT_LINK_TEMPLATES.videoTemplate;
                    break;
                default:
                    linkTemplate = "[[{index}|{value}]]";
            }
            
            // 生成链接
            const link = this.replaceTemplateVariables(linkTemplate, linkVariables);
            
            // 提取卡片变量
            const cardVariables = this.extractCardVariables(entry, link);
            
            // 替换模板中的变量
            const htmlContent = this.replaceCardTemplateVariables(htmlTemplate, cardVariables);
            
            // 设置HTML内容
            container.innerHTML = htmlContent;
            
            try {
                // 等待DOM渲染完成
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // 使用html2canvas将HTML转换为canvas
                const canvas = await html2canvas(container, {
                    backgroundColor: null,
                    scale: 5, // 提高清晰度
                    logging: false
                });
                
                // 将canvas转换为图片URL
                const imgUrl = canvas.toDataURL('image/png');
                
                // 创建下载链接
                const downloadLink = document.createElement('a');
                downloadLink.href = imgUrl;
                downloadLink.download = `${entry.hash}-${Date.now()}.png`;
                
                // 触发下载
                document.body.appendChild(downloadLink);
                downloadLink.click();
                document.body.removeChild(downloadLink);
                
                new Notice(t('image exported'));
                return true;
            } finally {
                // 清理临时DOM元素
                document.body.removeChild(container);
            }
        } catch (error) {
            console.error('导出图片时出错:', error);
            new Notice(t('export image failed'));
            return false;
        }
    }
    
    /**
     * 提取链接变量
     * 根据条目类型提取不同的变量
     * @param entry 条目对象
     * @returns 链接变量对象
     */
    private extractLinkVariables(entry: Entry): LinkVariables {
        const variables: LinkVariables = {
            index: "",
            value: entry.value
        };
        
        switch (entry.type) {
            case 'pdf':
                // 生成 index，若有 hash 则补上
                if (entry.index) {
                    variables.index = entry.index;
                    if (entry.hash) {
                        variables.index += `&hash='${entry.hash}'`;
                    }
                }
                // 从index中提取页码和文件名
                if (entry.index) {
                    // 尝试提取页码
                    const pageMatch = entry.index.match(/page=(\d+)/);
                    if (pageMatch && pageMatch[1]) {
                        variables.page = pageMatch[1];
                    }
                    // 提取文件名
                    if (entry.sourceFile) {
                        variables.file = extractFilenameFromPath(entry.sourceFile);
                    }
                }
                break;
                
            case 'md':
                // 构建index为sourcefile#hash='hash'
                if (entry.sourceFile && entry.hash) {
                    variables.index = `${entry.sourceFile}#hash='${entry.hash}'`;
                    variables.file = extractFilenameFromPath(entry.sourceFile);
                }
                break;
                
            case 'video':
                if (entry.sourceFile && entry.index) {
                    // 解析index字符串获取URL和时间戳
                    // 格式：time&line&start&end&url
                    const parts = entry.index.split('&');
                    if (parts.length >= 5) {
                        const timeSeconds = parts[0];  // 时间戳（秒）
                        const videoUrl = parts[4];     // 视频 URL
                        
                        // 构建index为filepath#video='url'&timestamp=time
                        variables.index = `${entry.sourceFile}#video='${videoUrl}'&timestamp=${timeSeconds}`;
                        variables.timestamp = timeSeconds;
                        variables.url = videoUrl;
                        variables.file = extractFilenameFromPath(entry.sourceFile);
                    }
                }
                break;
        }
        
        return variables;
    }
    
    /**
     * 提取卡片变量
     * 从条目中提取用于生成卡片的变量
     * @param entry 条目对象
     * @param link 已生成的链接
     * @returns 卡片变量对象
     */
    private extractCardVariables(entry: Entry, link: string): CardVariables {
        // 获取条目所属集合的颜色
        const collection = this.plugin.dataManager.getCollection(entry.set);
        const collectionColor = collection ? collection.color : "#7F7F7F"; // 默认灰色
        
        return {
            link: link,
            comment: entry.comment || "",
            value: entry.value,
            addTime: entry.addTime,
            tag: entry.tag ? entry.tag.join(", ") : "",
            type: entry.type,
            proficiency: entry.proficiency !== undefined ? entry.proficiency.toString() : "0",
            set: entry.set || "",
            color: collectionColor
        };
    }
    
    /**
     * 替换模板中的变量
     * @param template 模板字符串
     * @param variables 变量对象
     * @returns 替换后的字符串
     */
    private replaceTemplateVariables(template: string, variables: LinkVariables): string {
        let result = template;
        
        // 替换所有变量
        for (const [key, value] of Object.entries(variables)) {
            if (value !== undefined) {
                const regex = new RegExp(`\\{${key}\\}`, 'g');
                result = result.replace(regex, value);
            }
        }
        
        // 处理未被替换的变量（替换为空字符串）
        result = result.replace(/\{[^{}]+\}/g, '');
        
        return result;
    }
    
    /**
     * 替换卡片模板中的变量
     * @param template 卡片模板字符串
     * @param variables 卡片变量对象
     * @returns 替换后的字符串
     */
    private replaceCardTemplateVariables(template: string, variables: CardVariables): string {
        let result = template;
        
        // 替换所有变量
        for (const [key, value] of Object.entries(variables)) {
            if (value !== undefined) {
                const regex = new RegExp(`\\{${key}\\}`, 'g');
                
                // 特殊处理comment变量，将其中的换行符转换为HTML的<br>标签
                if (key === 'comment' && typeof value === 'string') {
                    const htmlValue = value.replace(/\n/g, '<br>');
                    result = result.replace(regex, htmlValue);
                } else {
                    result = result.replace(regex, value);
                }
            }
        }
        
        // 处理未被替换的变量（替换为空字符串）
        result = result.replace(/\{[^{}]+\}/g, '');
        
        return result;
    }
} 