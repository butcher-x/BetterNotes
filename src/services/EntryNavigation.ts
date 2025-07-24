/**
 * EntryNavigation 服务
 * 负责处理条目的导航和高亮显示功能
 */
import { App, Editor, MarkdownView, Notice } from 'obsidian';
import { Entry } from '../models/Entry';
import BetterNotesPlugin from '../main';
import { t } from '../i18n';

export class EntryNavigation {
    private app: App;
    private plugin: BetterNotesPlugin;
    private highlightClass = 'BetterNotes-flash-highlight';
    private highlightDuration = 2000; // 高亮持续时间（毫秒）

    /** 用于 PDF 矩形条目的临时填充高亮持续时间（毫秒） */
    private pdfRectFlashDuration = 1000;

    /**
     * 构造函数
     * @param app Obsidian应用实例
     * @param plugin BetterNotes插件实例
     */
    constructor(app: App, plugin: BetterNotesPlugin) {
        this.app = app;
        this.plugin = plugin;
        
        // 添加高亮样式
        this.addHighlightStyle();
    }

    /**
     * 添加高亮样式到文档
     * 创建一个用于闪烁高亮效果的CSS类
     */
    private addHighlightStyle(): void {
        // 创建样式元素
        const styleEl = document.createElement('style');
        styleEl.id = 'BetterNotes-highlight-style';
        
        // 定义闪烁高亮动画
        const css = `
            @keyframes BetterNotes-flash {
                0% { background-color: rgba(255, 255, 0, 0.7); }
                100% { background-color: rgba(255, 255, 0, 0); }
            }
            
            .${this.highlightClass} {
                background-color: rgba(255, 255, 0, 0);
                animation: BetterNotes-flash ${this.highlightDuration}ms ease-out;
            }
        `;
        
        styleEl.textContent = css;
        document.head.appendChild(styleEl);
    }

    /**
     * 跳转到指定条目并高亮显示
     * @param entry 要跳转到的条目
     * @returns Promise - 成功时返回true，失败时返回false
     */
    public async navigateToEntry(entry: Entry): Promise<boolean> {
        try {
            //console.log('navigateToEntry: entry', entry);
            if (entry.type === 'pdf') {
                if (entry.index) {
                    
                    // PDF 视图加载后会自动应用补丁后的 applySubpath 方法处理 rect 参数
                    // 链接格式为：filepath#page=page&rect=rect&hash='hash'，补上&hash='hash'
                    // 加hash是为了高亮元素
                    const hashLink = `${entry.index}&hash='${entry.hash}'`;
                    await this.app.workspace.openLinkText(hashLink, '', false);
                    return true;
                }
                return false; // 如果没有 index，返回 false
            }
            else if(entry.type === 'md')
            {
                // 检查条目是否有源文件
                if (!entry.sourceFile) {
                    new Notice(t('cannot locate') + ': ' + t('entry is not associated with a source file'));
                    return false;
                }
                
                // 获取文件对象
                const file = this.app.vault.getAbstractFileByPath(entry.sourceFile);
                if (!file) {
                    new Notice(t('source file not found') + ': ' + entry.sourceFile);
                    return false;
                }
                
                // 构建链接格式: filepath#hash='xxx'
                const hashLink = `${entry.sourceFile}#hash='${entry.hash}'`;
                
                // 使用OpenLinkService处理链接
                await this.app.workspace.openLinkText(hashLink, '', false);
                return true;
            }
            else{
                // 处理视频类型条目
                if (entry.type === 'video' && entry.index) {
                    try {
                        //console.log('navigateToEntry: video', entry.index);
                        // 解析 index 字符串（格式：time&line&start&end&url）
                        const parts = entry.index.split('&');
                        if (parts.length >= 5) {
                            const timeSeconds = parts[0];  // 时间戳（秒）
                            const videoUrl = parts[4];     // 视频 URL
                            
                            // 构造链接：#video='url'&timestamp=time
                            const processedLink = `#video='${videoUrl}'&timestamp=${timeSeconds}`;
                            //console.log(`[BetterNotes] 已构造视频链接: ${processedLink}`);
                            
                            await this.app.workspace.openLinkText(processedLink, '', false);
                            return true;
                        } else {
                            console.error('视频条目 index 格式不正确:', entry.index);
                            new Notice(t('cannot navigate') + ': ' + t('video entry format is incorrect'));
                        }
                    } catch (error) {
                        console.error('处理视频条目导航时出错:', error);
                        new Notice(t('cannot navigate') + ': ' + t('video entry format is incorrect'));
                    }
                } else {
                    new Notice(t('cannot navigate') + ': ' + t('unsupported entry type or missing necessary information'));
                }
                
                return false;
            }
            
        } catch (error) {
            console.error('导航到条目失败:', error);
            new Notice(t('cannot navigate') + ': ' + t('unsupported entry type or missing necessary information'));
            return false;
        }
    }
    

    /**
     * 高亮 PDF 矩形截取条目对应的所有 selection 矩形 DOM，支持跨行 selection。
     * @param hash 条目 hash，唯一标识 selection
     *
     * 工程实践：
     * - 支持同一 hash 关联的多个 .rect-capture-highlight 元素（跨行 selection）
     * - 高亮持续一段时间后自动恢复原背景色
     * - 代码高复用、低耦合，便于后续维护
     */
    public highlightPdfRect(hash: string): void {
        const maxAttempts = 50; // 最大尝试次数
        const interval = 50;    // 每次尝试间隔（ms）
        let attempts = 0;
        let timer: number | undefined;

        // 工具函数：批量高亮所有相关 DOM
        const highlightRects = (rects: NodeListOf<HTMLElement>, highlightColor: string, duration: number) => {
            const originalStyles: string[] = [];
            rects.forEach(rect => {
                originalStyles.push(rect.style.background);
                rect.style.background = highlightColor;
            });
            if (duration > 0) {
                setTimeout(() => {
                    rects.forEach((rect, i) => {
                        rect.style.background = originalStyles[i] || '';
                    });
                }, duration);
            }
        };

        timer = window.setInterval(() => {
            // 查询所有与 hash 关联的 selection 矩形 DOM（支持跨行 selection）
            const rects = document.querySelectorAll<HTMLElement>(`.rect-capture-highlight[data-hash="${hash}"]`);
            if (rects.length > 0) {
                clearInterval(timer);
                highlightRects(rects, 'rgba(255, 255, 0, 0.7)', this.pdfRectFlashDuration);
            }
            attempts++;
            if (attempts >= maxAttempts) {
                clearInterval(timer);
            }
        }, interval);
    }
} 